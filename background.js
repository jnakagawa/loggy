// Background Service Worker
// Intercepts network requests and captures analytics events

import { AnalyticsParser } from './parsers.js';
import { EventStorage } from './storage.js';
import { ConfigManager } from './config/config-manager.js';
import { SourceConfig } from './config/source-config.js';
import { looksLikeAnalyticsEndpoint } from './config/default-sources.js';

// Initialize storage
const storage = new EventStorage(1000);

// Initialize configuration manager
const configManager = new ConfigManager();

// Settings
let settings = {
  enabled: true,
  captureSegment: true,
  captureGA: true,
  captureGraphQL: true,
  captureCustom: true,
  persistEvents: false,
  maxEvents: 1000,
  useProxy: false,      // Poll local proxy server for events
  autoPauseHours: 3,    // Auto-pause after X hours of inactivity (0 = disabled)
  detectNewSources: true // Auto-detect new analytics sources
};

// Track last event activity time (in-memory, resets on extension reload)
let lastEventTime = Date.now();
let autoPaused = false; // Track if we auto-paused (vs manual pause)

// Track sources with Chrome API body-read failures (need proxy for full capture)
const sourcesNeedingProxy = new Map(); // sourceId -> { sourceName, domain, failureCount, lastSeen }

/**
 * Detect Chrome API body-read failures
 * Chrome returns {error: "..."} when it can't read POST bodies for:
 * - GZIP-compressed request bodies
 * - fetch() with keepalive: true
 * - navigator.sendBeacon()
 * - Large payloads
 */
function isBodyReadFailure(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  return keys.length === 1 && keys[0] === 'error';
}

// Load settings on startup and then register listener
async function initialize() {
  console.log('[Analytics Logger] Initializing...');

  // Load configuration manager (sources)
  await configManager.load();
  const configStats = configManager.getStats();
  console.log('[Analytics Logger] Loaded', configStats.totalSources, 'analytics sources');

  // Load settings first
  const result = await chrome.storage.local.get(['settings', 'autoPaused']);
  if (result.settings) {
    settings = { ...settings, ...result.settings };
    console.log('[Analytics Logger] Loaded settings:', settings);
  } else {
    console.log('[Analytics Logger] Using default settings:', settings);
  }

  // Restore auto-pause state (survives service worker restarts)
  if (result.autoPaused !== undefined) {
    autoPaused = result.autoPaused;
  }

  // Load persisted events if enabled
  if (settings.persistEvents) {
    await storage.loadFromStorage();
  }

  console.log('[Analytics Logger] ✅ Initialization complete');
  console.log('[Analytics Logger] 📋 Extension enabled:', settings.enabled);
  console.log('[Analytics Logger] 📋 Active sources:', configStats.enabledSources);
  console.log('[Analytics Logger] 📋 Proxy mode:', settings.useProxy);

  // Start proxy polling if enabled
  if (settings.useProxy) {
    startProxyPolling();
  }
}

// Proxy Mode - Poll local proxy server for captured events
let proxyPollingInterval = null;
const PROXY_URL = 'http://localhost:8889/events';
const PROXY_POLL_INTERVAL = 5000; // 5 seconds

function startProxyPolling() {
  if (proxyPollingInterval) return;

  console.log('[Analytics Logger] ✅ Starting proxy polling...');
  console.log('[Analytics Logger] Proxy URL:', PROXY_URL);
  console.log('[Analytics Logger] Poll interval:', PROXY_POLL_INTERVAL, 'ms');

  let pollCount = 0;

  proxyPollingInterval = setInterval(async () => {
    // Only poll if there's at least one panel connected
    if (connectedPanels.size === 0) {
      return;
    }

    pollCount++;

    try {
      const response = await fetch(PROXY_URL);

      if (!response.ok) {
        if (pollCount % 30 === 0) { // Log every minute (30 * 2 seconds)
          console.log('[Analytics Logger] [Proxy] Polling... (status:', response.status, ')');
        }
        return;
      }

      const data = await response.json();

      if (pollCount % 30 === 0) { // Log every minute
        console.log(`[Analytics Logger] [Proxy] Poll #${pollCount}: ${data.count || 0} total events in proxy`);
      }

      if (data.events && data.events.length > 0) {
        // Get events we haven't seen yet
        const newEvents = data.events.filter(event => {
          return !storage.events.some(existing => existing.id === event.id);
        });

        if (newEvents.length > 0) {
          console.log(`[Analytics Logger] [Proxy] ✓ Received ${newEvents.length} new events from proxy`);
          newEvents.forEach(e => console.log(`[Analytics Logger] [Proxy]   - ${e.event} (${e._parser})`));
          storage.addEvents(newEvents);
          notifyPanels('eventsAdded', newEvents);

          // Update last event time for auto-pause feature
          lastEventTime = Date.now();
          if (autoPaused) {
            autoPaused = false;
            console.log('[Analytics Logger] Auto-resumed due to new proxy activity');
          }
        }
      }

      // Merge proxy's unmatched domains into extension's configManager
      if (data.unmatchedDomains && data.unmatchedDomains.length > 0) {
        data.unmatchedDomains.forEach(unmatched => {
          configManager.mergeUnmatchedDomain(unmatched);
        });
        notifyPanels('unmatchedDomainsUpdated', {});
      }
    } catch (err) {
      if (pollCount === 1) { // Only log on first attempt
        console.log('[Analytics Logger] [Proxy] Cannot connect to proxy server (this is normal if proxy is not running)');
      }
    }
  }, PROXY_POLL_INTERVAL);
}

function stopProxyPolling() {
  if (proxyPollingInterval) {
    clearInterval(proxyPollingInterval);
    proxyPollingInterval = null;
    console.log('[Analytics Logger] Stopped proxy polling');
  }
}

// Initialize immediately
initialize();

// Network request interceptor
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Skip if disabled
    if (!settings.enabled) {
      return;
    }

    // Skip if not a POST request (most analytics use POST)
    if (details.method !== 'POST') {
      return;
    }

    // Find matching source using ConfigManager
    const source = configManager.findSourceForUrl(details.url);

    if (!source) {
      // Track unmatched analytics requests for suggestions (if enabled)
      if (settings.detectNewSources && looksLikeAnalyticsEndpoint(details.url) && details.requestBody) {
        AnalyticsParser.decodeRequestBodyAsync(details.requestBody).then(payload => {
          if (payload) {
            configManager.trackUnmatchedRequest(details.url, payload);
            notifyPanels('unmatchedDomainsUpdated', {});
          }
        }).catch(() => {
          // Ignore parsing errors
        });
      }
      return;
    }

    console.log(`[Analytics Logger] ✅ Matched source "${source.name}" for:`, details.url);

    // First decode the raw payload to check for Chrome API body-read failures
    AnalyticsParser.decodeRequestBodyAsync(details.requestBody).then(rawPayload => {
      // Check for Chrome API body-read failure
      if (isBodyReadFailure(rawPayload)) {
        console.log(`[Analytics Logger] ⚠️ Chrome API body-read failure for ${source.name} - payload:`, rawPayload);

        // Track this source as needing proxy
        const existing = sourcesNeedingProxy.get(source.id);
        sourcesNeedingProxy.set(source.id, {
          sourceName: source.name,
          domain: source.domain,
          failureCount: (existing?.failureCount || 0) + 1,
          lastSeen: Date.now()
        });

        // Notify panels about this source needing proxy
        notifyPanels('sourceNeedsProxy', {
          sourceId: source.id,
          sourceName: source.name,
          domain: source.domain
        });

        // Don't create junk events - just return
        return;
      }

      // Normal parsing flow - payload is readable
      return AnalyticsParser.parseRequest(
        details.url,
        details.requestBody,
        details.initiator,
        source
      );
    }).then(events => {
      if (!events || events.length === 0) {
        return;
      }

      console.log(`[Analytics Logger] ✓ Captured ${events.length} event(s) from ${source.name}`);

      // Add source metadata to events
      events.forEach(event => {
        event._source = source.id;
        event._sourceName = source.name;
        event._sourceIcon = source.icon;
        event._sourceColor = source.color;
      });

      storage.addEvents(events);

      // Update last event time for auto-pause feature
      lastEventTime = Date.now();
      if (autoPaused) {
        // Auto-resume if we were auto-paused and new events arrived
        autoPaused = false;
        console.log('[Analytics Logger] Auto-resumed due to new activity');
      }

      // Update source statistics
      source.recordCapture();
      configManager.save();

      // Persist if enabled
      if (settings.persistEvents) {
        storage.saveToStorage();
      }

      // Notify open panels
      notifyPanels('eventsAdded', events);
    }).catch(err => {
      console.error('[Analytics Logger] Error parsing request:', err);
      console.error('[Analytics Logger] Request details:', {
        url: details.url,
        source: source.name
      });
    });
  },
  {
    urls: ['<all_urls>']
  },
  ['requestBody', 'extraHeaders']
);

// Message handler for communication with UI and external extensions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Analytics Logger] Received message:', message.action || 'event');

  // Handle direct event logging from other extensions
  if (!message.action && message.event) {
    console.log('[Analytics Logger] Direct event from extension:', sender.id);

    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: message.timestamp || new Date().toISOString(),
      event: message.event,
      properties: message.properties || {},
      type: message.type || 'track',
      userId: message.userId,
      anonymousId: message.anonymousId,
      context: message.context || {},
      _parser: 'direct-message',
      _metadata: {
        capturedAt: new Date().toISOString(),
        source: message.source || sender.id,
        initiator: sender.id
      }
    };

    storage.addEvents([event]);
    notifyPanels('eventsAdded', [event]);

    // Update last event time for auto-pause feature
    lastEventTime = Date.now();
    if (autoPaused) {
      autoPaused = false;
      console.log('[Analytics Logger] Auto-resumed due to new direct message activity');
    }

    sendResponse({ success: true });
    return false;
  }

  switch (message.action) {
    case 'getEvents':
      sendResponse({
        success: true,
        events: storage.getEvents(message.filters)
      });
      break;

    case 'getAllEvents':
      sendResponse({
        success: true,
        events: storage.getAllEvents()
      });
      break;

    case 'getStats':
      sendResponse({
        success: true,
        stats: storage.getStats()
      });
      break;

    case 'clearEvents':
      storage.clearAll().then(async (success) => {
        // Also clear proxy server events if proxy mode is active
        if (settings.useProxy) {
          try {
            await fetch('http://localhost:8889/clear', { method: 'POST' });
            console.log('[Analytics Logger] Cleared proxy server events');
          } catch (err) {
            console.log('[Analytics Logger] Could not clear proxy events (proxy may not be running)');
          }
        }

        // Notify panels that events were cleared
        notifyPanels('eventsCleared', {});
        sendResponse({ success });
      }).catch(err => {
        console.error('[Analytics Logger] Error clearing events:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep channel open for async response

    case 'exportJSON':
      sendResponse({
        success: true,
        data: storage.exportJSON(message.filters)
      });
      break;

    case 'exportCSV':
      sendResponse({
        success: true,
        data: storage.exportCSV(message.filters)
      });
      break;

    case 'getSettings':
      sendResponse({
        success: true,
        settings: settings,
        autoPaused: autoPaused,
        lastEventTime: lastEventTime
      });
      break;

    case 'pingNativeHost':
      console.log('[Analytics Logger] Attempting native host connection...');
      try {
        const port = chrome.runtime.connectNative('com.analytics_logger.proxy');
        let responded = false;

        port.onMessage.addListener((response) => {
          console.log('[Analytics Logger] Native host responded:', response);
          responded = true;
          sendResponse({ success: true, response });
          try { port.disconnect(); } catch (e) {}
        });

        port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          console.log('[Analytics Logger] Native host disconnected. Error:', error?.message);
          if (!responded) {
            sendResponse({ success: false, error: error?.message || 'Disconnected' });
          }
        });

        port.postMessage({ action: 'ping' });
        console.log('[Analytics Logger] Sent ping to native host');

        setTimeout(() => {
          if (!responded) {
            console.log('[Analytics Logger] Native host timeout');
            sendResponse({ success: false, error: 'Timeout' });
            try { port.disconnect(); } catch (e) {}
          }
        }, 2000);
      } catch (err) {
        console.error('[Analytics Logger] Native host error:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;

    case 'updateSettings':
      const oldUseProxy = settings.useProxy;
      settings = { ...settings, ...message.settings };
      chrome.storage.local.set({ settings });
      storage.setMaxSize(settings.maxEvents);

      // Reset auto-pause state if user manually re-enables capture
      if (message.settings.enabled === true && autoPaused) {
        autoPaused = false;
        lastEventTime = Date.now(); // Reset the inactivity timer
        console.log('[Analytics Logger] Manual resume - reset auto-pause state');
      }

      // Handle proxy mode changes
      if (settings.useProxy && !oldUseProxy) {
        startProxyPolling();
      } else if (!settings.useProxy && oldUseProxy) {
        stopProxyPolling();
      }

      sendResponse({ success: true });
      break;

    case 'getCurrentTab':
      chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        sendResponse({ success: true, tabId: tabs[0]?.id });
      });
      return true; // Keep channel open

    case 'saveEvents':
      storage.saveToStorage().then(success => {
        sendResponse({ success });
      });
      return true; // Keep channel open for async response

    case 'loadEvents':
      storage.loadFromStorage().then(success => {
        sendResponse({ success });
      });
      return true; // Keep channel open for async response

    // Source configuration management
    case 'getSources':
      sendResponse({
        success: true,
        sources: configManager.getAllSources().map(s => s.toJSON()),
        stats: configManager.getStats()
      });
      break;

    case 'getSource':
      const source = configManager.getSource(message.id);
      sendResponse({
        success: !!source,
        source: source ? source.toJSON() : null
      });
      break;

    case 'addSource':
      configManager.addSource(SourceConfig.fromJSON(message.source)).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'updateSource':
      configManager.addSource(SourceConfig.fromJSON(message.source)).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'removeSource':
      configManager.removeSource(message.id).then(success => {
        sendResponse({ success });
      });
      return true;

    case 'exportSources':
      sendResponse({
        success: true,
        data: configManager.export()
      });
      break;

    case 'importSources':
      configManager.import(message.data).then(count => {
        sendResponse({ success: true, count });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'resetSources':
      configManager.resetToDefaults().then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'createSourceFromDomain':
      const newSource = configManager.createFromDomain(message.domain, message.payload);
      if (newSource) {
        sendResponse({ success: true, source: newSource.toJSON() });
      } else {
        sendResponse({ success: false, error: 'Failed to create source from domain' });
      }
      break;

    case 'getUnmatchedDomains':
      sendResponse({
        success: true,
        domains: configManager.getUnmatchedDomains()
      });
      break;

    case 'clearUnmatchedDomain':
      configManager.clearUnmatchedDomain(message.domain);
      sendResponse({ success: true });
      break;

    case 'getSourcesNeedingProxy':
      // Return sources that have Chrome API body-read failures
      sendResponse({
        success: true,
        sources: Array.from(sourcesNeedingProxy.entries()).map(([id, info]) => ({
          sourceId: id,
          ...info
        }))
      });
      break;

    case 'clearSourceNeedingProxy':
      sourcesNeedingProxy.delete(message.sourceId);
      sendResponse({ success: true });
      break;

    case 'detectFields':
      // Use parser to detect fields from payload
      const detection = AnalyticsParser.detectFields(message.payload);
      sendResponse({
        success: detection.success,
        ...detection
      });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return false;
});

// Connection handler for long-lived connections (real-time updates)
const connectedPanels = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'analytics-logger-panel') {
    console.log('[Analytics Logger] Panel connected');
    connectedPanels.add(port);

    // Auto-resume if we were auto-paused (user opening panel = intent to use)
    if (autoPaused && !settings.enabled) {
      autoPaused = false;
      settings.enabled = true;
      lastEventTime = Date.now();
      chrome.storage.local.set({ settings, autoPaused });
      console.log('[Analytics Logger] Auto-resumed on panel open (was auto-paused)');
      // Notify the panel so it can update UI
      port.postMessage({ action: 'autoResumed', data: {} });
    }

    port.onDisconnect.addListener(() => {
      console.log('[Analytics Logger] Panel disconnected');
      connectedPanels.delete(port);

      // Auto-pause when no panels are open
      if (connectedPanels.size === 0 && settings.enabled) {
        settings.enabled = false;
        autoPaused = true;
        chrome.storage.local.set({ settings, autoPaused });
        console.log('[Analytics Logger] Auto-paused (panel closed)');
      }
    });
  }
});

// Notify all connected panels of new events
function notifyPanels(action, data) {
  connectedPanels.forEach(port => {
    try {
      port.postMessage({ action, data });
    } catch (err) {
      console.error('[Analytics Logger] Error notifying panel:', err);
      connectedPanels.delete(port);
    }
  });
}

// Extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Periodic auto-save (if persistence enabled)
setInterval(() => {
  if (settings.persistEvents && storage.events.length > 0) {
    storage.saveToStorage();
  }
}, 60000); // Every minute

// Stop proxy server via native messaging
function stopProxyServer() {
  try {
    const port = chrome.runtime.connectNative('com.analytics_logger.proxy');

    port.postMessage({ action: 'stopProxy' });

    port.onMessage.addListener((response) => {
      if (response.success) {
        console.log('[Analytics Logger] Proxy server stopped');
        settings.useProxy = false;
        chrome.storage.local.set({ settings });
        stopProxyPolling();
      } else {
        console.log('[Analytics Logger] Failed to stop proxy:', response.error);
      }
      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      // Native host not available - just disable polling
      if (chrome.runtime.lastError) {
        console.log('[Analytics Logger] Native host not available, disabling proxy polling');
        settings.useProxy = false;
        chrome.storage.local.set({ settings });
        stopProxyPolling();
      }
    });
  } catch (err) {
    console.log('[Analytics Logger] Error stopping proxy:', err.message);
    settings.useProxy = false;
    chrome.storage.local.set({ settings });
    stopProxyPolling();
  }
}

// Periodic auto-pause check (every 5 minutes)
setInterval(() => {
  if (settings.autoPauseHours > 0 && settings.enabled && !autoPaused) {
    const hoursSinceLastEvent = (Date.now() - lastEventTime) / (1000 * 60 * 60);

    if (hoursSinceLastEvent >= settings.autoPauseHours) {
      autoPaused = true;
      settings.enabled = false;
      chrome.storage.local.set({ settings, autoPaused });

      console.log(`[Analytics Logger] Auto-paused after ${settings.autoPauseHours} hour(s) of inactivity`);

      // Stop proxy server if it was running
      if (settings.useProxy) {
        console.log('[Analytics Logger] Stopping proxy server due to auto-pause');
        stopProxyServer();
      }

      // Notify open panels
      notifyPanels('autoPaused', {
        hours: settings.autoPauseHours,
        lastEventTime: lastEventTime
      });
    }
  }
}, 300000); // Every 5 minutes

console.log('[Analytics Logger] Background service worker initialized');
