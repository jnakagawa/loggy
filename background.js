// Background Service Worker
// Intercepts network requests and captures analytics events

import { AnalyticsParser } from './parsers.js';
import { EventStorage } from './storage.js';
import { ConfigManager } from './config/config-manager.js';
import { SourceConfig } from './config/source-config.js';

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
  useProxy: false      // Poll local proxy server for events
};

// Load settings on startup and then register listener
async function initialize() {
  console.log('[Analytics Logger] Initializing...');

  // Load configuration manager (sources)
  await configManager.load();
  const configStats = configManager.getStats();
  console.log('[Analytics Logger] Loaded', configStats.totalSources, 'analytics sources');

  // Load settings first
  const result = await chrome.storage.local.get('settings');
  if (result.settings) {
    settings = { ...settings, ...result.settings };
    console.log('[Analytics Logger] Loaded settings:', settings);
  } else {
    console.log('[Analytics Logger] Using default settings:', settings);
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
const PROXY_POLL_INTERVAL = 2000; // 2 seconds

function startProxyPolling() {
  if (proxyPollingInterval) return;

  console.log('[Analytics Logger] ✅ Starting proxy polling...');
  console.log('[Analytics Logger] Proxy URL:', PROXY_URL);
  console.log('[Analytics Logger] Poll interval:', PROXY_POLL_INTERVAL, 'ms');

  let pollCount = 0;

  proxyPollingInterval = setInterval(async () => {
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
        }
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
      // No source matched, skip silently
      return;
    }

    console.log(`[Analytics Logger] ✅ Matched source "${source.name}" for:`, details.url);

    // Parse the request using the source's parser
    try {
      const events = AnalyticsParser.parseRequest(
        details.url,
        details.requestBody,
        details.initiator,
        source
      );

      if (events.length > 0) {
        console.log(`[Analytics Logger] ✓ Captured ${events.length} event(s) from ${source.name}`);

        // Add source metadata to events
        events.forEach(event => {
          event._source = source.id;
          event._sourceName = source.name;
          event._sourceIcon = source.icon;
          event._sourceColor = source.color;
        });

        storage.addEvents(events);

        // Update source statistics
        source.recordCapture();
        configManager.save();

        // Persist if enabled
        if (settings.persistEvents) {
          storage.saveToStorage();
        }

        // Notify open panels
        notifyPanels('eventsAdded', events);
      } else {
        console.log('[Analytics Logger] No events extracted from request');
      }
    } catch (err) {
      console.error('[Analytics Logger] Error parsing request:', err);
      console.error('[Analytics Logger] Request details:', {
        url: details.url,
        source: source.name
      });
    }
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
        settings: settings
      });
      break;

    case 'updateSettings':
      const oldUseProxy = settings.useProxy;
      settings = { ...settings, ...message.settings };
      chrome.storage.local.set({ settings });
      storage.setMaxSize(settings.maxEvents);

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

    case 'createSourceFromSample':
      const newSource = configManager.createFromSample(message.url, message.payload);
      if (newSource) {
        sendResponse({ success: true, source: newSource.toJSON() });
      } else {
        sendResponse({ success: false, error: 'Failed to create source from sample' });
      }
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

    port.onDisconnect.addListener(() => {
      console.log('[Analytics Logger] Panel disconnected');
      connectedPanels.delete(port);
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

console.log('[Analytics Logger] Background service worker initialized');
