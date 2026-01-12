// Panel UI Logic
// Handles event display, filtering, real-time updates, and exports

import { SourceManager } from './source-manager.js';

class AnalyticsLoggerUI {
  constructor() {
    this.events = [];
    this.filteredEvents = [];
    this.filters = {
      search: '',
      source: '',
      eventType: ''
    };
    this.port = null;
    this.eventTypeSet = new Set();

    this.init();
  }

  async init() {
    console.log('[Panel] Initializing...');

    // Initialize Source Manager
    this.sourceManager = new SourceManager();

    // Get DOM elements
    this.elements = {
      eventsList: document.getElementById('eventsList'),
      eventsContainer: document.querySelector('.events-container'),
      emptyState: document.getElementById('emptyState'),
      searchInput: document.getElementById('searchInput'),
      sourceFilter: document.getElementById('sourceFilter'),
      eventTypeFilter: document.getElementById('eventTypeFilter'),
      clearFiltersBtn: document.getElementById('clearFiltersBtn'),
      // Pending sources notification
      pendingNotification: document.getElementById('pendingNotification'),
      pendingCount: document.getElementById('pendingCount'),
      viewPendingBtn: document.getElementById('viewPendingBtn'),
      clearBtn: document.getElementById('clearBtn'),
      exportJSONBtn: document.getElementById('exportJSONBtn'),
      exportCSVBtn: document.getElementById('exportCSVBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      totalEvents: document.getElementById('totalEvents'),
      filteredEvents: document.getElementById('filteredEvents'),
      storageUsage: document.getElementById('storageUsage'),
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
      // Main view proxy controls
      proxyStatusMain: document.getElementById('proxyStatusMain'),
      proxyActionBtn: document.getElementById('proxyActionBtn'),
      // Proxy suggestion banner (shown when Chrome API can't read request bodies)
      proxySuggestionBanner: document.getElementById('proxySuggestionBanner'),
      proxyNeededSource: document.getElementById('proxyNeededSource'),
      startProxyFromBanner: document.getElementById('startProxyFromBanner'),
      dismissProxyBanner: document.getElementById('dismissProxyBanner'),
      // Confirm modal
      confirmModal: document.getElementById('confirmModal'),
      confirmTitle: document.getElementById('confirmTitle'),
      confirmMessage: document.getElementById('confirmMessage'),
      confirmDontAsk: document.getElementById('confirmDontAsk'),
      confirmDontAskLabel: document.getElementById('confirmDontAskLabel'),
      confirmOkBtn: document.getElementById('confirmOkBtn'),
      confirmCancelBtn: document.getElementById('confirmCancelBtn')
    };

    // Confirmation preferences (stored in chrome.storage)
    this.confirmPrefs = {};

    // Proxy state
    this.proxyRunning = false;
    this.nativeHostAvailable = null; // null = checking, true/false after check

    // Pause/Play state
    this.isPaused = false;
    this.isAutoPaused = false; // Track if paused due to inactivity

    // UI state preservation (survives re-renders)
    this.viewModeState = new Map(); // eventId -> 'raw' | 'structured'

    // Set up event listeners
    this.setupEventListeners();

    // Connect to background for real-time updates
    this.connectToBackground();

    // Load initial events
    await this.loadEvents();

    // Load confirmation preferences
    await this.loadConfirmPrefs();

    // Check if native messaging host is available
    this.checkNativeHost();

    // Check if proxy server is actually running (ping it)
    await this.checkProxyRunning();

    // Load sources for filter dropdown
    await this.loadSourcesFilter();

    // Check if we're in auto-paused state
    await this.checkAutoPauseState();

    // Check for unmatched domain suggestions periodically
    this.checkForSuggestions();
    setInterval(() => this.checkForSuggestions(), 10000);

    console.log('[Panel] Initialized');
  }

  async checkAutoPauseState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (response.success) {
        // Sync panel state with actual extension enabled state
        if (!response.settings.enabled) {
          if (response.autoPaused) {
            // Was auto-paused - will be auto-resumed by background on connect
            this.isPaused = true;
            this.isAutoPaused = true;
            console.log('[Panel] Extension was auto-paused');
          } else {
            // Extension is disabled but not auto-paused (manual or stale state)
            // Auto-enable since user opened the panel (intent to use)
            console.log('[Panel] Extension disabled, auto-enabling on panel open');
            await chrome.runtime.sendMessage({
              action: 'updateSettings',
              settings: { enabled: true }
            });
            this.isPaused = false;
            this.isAutoPaused = false;
          }
          this.updatePauseButton();
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  async loadConfirmPrefs() {
    try {
      const result = await chrome.storage.local.get('confirmPrefs');
      this.confirmPrefs = result.confirmPrefs || {};
    } catch (e) {
      this.confirmPrefs = {};
    }
  }

  async saveConfirmPrefs() {
    await chrome.storage.local.set({ confirmPrefs: this.confirmPrefs });
  }

  showConfirm(key, title, message, showDontAsk = true) {
    return new Promise((resolve) => {
      // Check if user said "don't ask again"
      if (this.confirmPrefs[key]) {
        resolve(true);
        return;
      }

      // Show the modal
      this.elements.confirmTitle.textContent = title;
      this.elements.confirmMessage.textContent = message;
      this.elements.confirmDontAsk.checked = false;
      this.elements.confirmDontAskLabel.style.display = showDontAsk ? 'flex' : 'none';
      this.elements.confirmModal.style.display = 'flex';

      const cleanup = () => {
        this.elements.confirmModal.style.display = 'none';
        this.elements.confirmOkBtn.removeEventListener('click', onOk);
        this.elements.confirmCancelBtn.removeEventListener('click', onCancel);
      };

      const onOk = async () => {
        if (this.elements.confirmDontAsk.checked) {
          this.confirmPrefs[key] = true;
          await this.saveConfirmPrefs();
        }
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      this.elements.confirmOkBtn.addEventListener('click', onOk);
      this.elements.confirmCancelBtn.addEventListener('click', onCancel);
    });
  }

  setupEventListeners() {
    // Search and filter
    this.elements.searchInput.addEventListener('input', (e) => {
      this.filters.search = e.target.value.toLowerCase();
      this.applyFilters();
    });

    this.elements.sourceFilter.addEventListener('change', (e) => {
      this.filters.source = e.target.value;
      this.applyFilters();
    });

    // Pending sources notification - click to open Sources tab
    this.elements.viewPendingBtn?.addEventListener('click', () => {
      this.sourceManager.switchTab('sources');
      this.openSettings(); // Opens the settings modal which contains Sources tab
    });

    // Proxy suggestion banner - start proxy button
    this.elements.startProxyFromBanner?.addEventListener('click', () => {
      this.startProxy();
      this.hideProxySuggestionBanner();
    });

    // Proxy suggestion banner - dismiss button
    this.elements.dismissProxyBanner?.addEventListener('click', () => {
      this.hideProxySuggestionBanner();
    });

    this.elements.eventTypeFilter.addEventListener('change', (e) => {
      this.filters.eventType = e.target.value;
      this.applyFilters();
    });

    this.elements.clearFiltersBtn.addEventListener('click', () => {
      this.clearFilters();
    });

    // Actions
    this.elements.clearBtn.addEventListener('click', () => {
      this.clearEvents();
    });

    this.elements.exportJSONBtn.addEventListener('click', () => {
      this.exportJSON();
    });

    this.elements.exportCSVBtn.addEventListener('click', () => {
      this.exportCSV();
    });

    // Settings
    this.elements.settingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    // Pause/Play
    this.elements.pauseBtn.addEventListener('click', () => {
      this.togglePause();
    });

    this.elements.closeSettingsBtn.addEventListener('click', () => {
      this.closeSettings();
    });

    this.elements.cancelSettingsBtn.addEventListener('click', () => {
      this.closeSettings();
    });

    this.elements.saveSettingsBtn.addEventListener('click', () => {
      this.saveSettings();
    });

    // Close modal on background click
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) {
        this.closeSettings();
      }
    });

    // Proxy control (main view)
    this.elements.proxyActionBtn.addEventListener('click', () => {
      if (!this.nativeHostAvailable) {
        this.openSetupAssistant();
      } else if (this.proxyRunning) {
        this.stopProxy();
      } else {
        this.startProxy();
      }
    });

    // Set up event delegation for JSON expandable sections (once during init)
    this.elements.eventsList.addEventListener('click', (e) => {
      const header = e.target.closest('.json-expand-header');
      if (!header) return;

      const expandable = header.parentElement;
      if (!expandable || !expandable.classList.contains('json-expandable')) {
        return;
      }

      e.stopPropagation();
      expandable.classList.toggle('expanded');
    }, true); // Use capture phase

    // Set up click-to-copy for JSON primitive values
    this.elements.eventsList.addEventListener('click', (e) => {
      const primitive = e.target.closest('.json-primitive');
      if (!primitive || !primitive.dataset.value) return;

      const value = primitive.dataset.value;

      // Copy to clipboard
      navigator.clipboard.writeText(value).then(() => {
        // Show "Copied!" popup
        this.showCopiedPopup(e.clientX, e.clientY);
      }).catch(err => {
        console.error('[Panel] Failed to copy:', err);
      });

      e.stopPropagation();
    });
  }

  openSetupAssistant() {
    // Open the setup instructions page with extension ID pre-filled
    const extensionId = chrome.runtime.id;
    const setupUrl = chrome.runtime.getURL('SETUP-INSTRUCTIONS.html') + '?id=' + extensionId;
    chrome.tabs.create({ url: setupUrl });
  }

  async checkNativeHost() {
    return new Promise((resolve) => {
      try {
        const port = chrome.runtime.connectNative('com.analytics_logger.proxy');

        port.onDisconnect.addListener(() => {
          if (chrome.runtime.lastError) {
            // Native host not available
            this.nativeHostAvailable = false;
          } else {
            this.nativeHostAvailable = true;
          }
          this.updateProxyMainUI();
          resolve(this.nativeHostAvailable);
        });

        // Send a ping to check if host responds
        port.postMessage({ action: 'ping' });

        // Give it a moment, then disconnect
        setTimeout(() => {
          if (this.nativeHostAvailable === null) {
            this.nativeHostAvailable = true;
            this.updateProxyMainUI();
            resolve(true);
          }
          try { port.disconnect(); } catch (e) {}
        }, 500);

      } catch (err) {
        this.nativeHostAvailable = false;
        this.updateProxyMainUI();
        resolve(false);
      }
    });
  }

  async checkProxyRunning() {
    try {
      // Ping the proxy server to see if it's actually running
      const response = await fetch('http://localhost:8889/events', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        // Proxy is running
        this.proxyRunning = true;
        console.log('[Panel] Proxy server is running');
      } else {
        this.proxyRunning = false;
      }
    } catch (err) {
      // Proxy not reachable - make sure useProxy setting is false
      this.proxyRunning = false;

      // If settings say proxy is enabled but it's not running, disable it
      const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (settingsResponse.success && settingsResponse.settings.useProxy) {
        console.log('[Panel] Proxy not running but useProxy was true - disabling');
        await chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { useProxy: false }
        });
      }
    }

    this.updateProxyMainUI();
  }

  updateProxyMainUI() {
    const statusEl = this.elements.proxyStatusMain;
    const btnEl = this.elements.proxyActionBtn;

    // Remove all status classes
    statusEl.classList.remove('running', 'stopped', 'setup-required');

    if (this.nativeHostAvailable === null) {
      // Still checking
      statusEl.textContent = 'Checking...';
      statusEl.classList.add('stopped');
      btnEl.textContent = '...';
      btnEl.disabled = true;
    } else if (!this.nativeHostAvailable) {
      // Native host not set up
      statusEl.textContent = 'Not Configured';
      statusEl.classList.add('setup-required');
      btnEl.textContent = 'Setup';
      btnEl.disabled = false;
    } else if (this.proxyRunning) {
      // Proxy running
      statusEl.textContent = 'Running';
      statusEl.classList.add('running');
      btnEl.textContent = 'Stop';
      btnEl.disabled = false;
    } else {
      // Proxy stopped
      statusEl.textContent = 'Stopped';
      statusEl.classList.add('stopped');
      btnEl.textContent = 'Start';
      btnEl.disabled = false;
    }
  }

  async startProxy() {
    try {
      // Show initializing state
      const statusEl = document.getElementById('proxyStatusMain');
      const btnEl = document.getElementById('proxyActionBtn');
      statusEl.textContent = 'Initializing...';
      statusEl.className = 'stat-value initializing';
      btnEl.disabled = true;

      const port = chrome.runtime.connectNative('com.analytics_logger.proxy');

      port.postMessage({ action: 'startProxy' });

      port.onMessage.addListener(async (response) => {
        console.log('[Panel] Proxy response:', response);

        if (response.success) {
          this.proxyRunning = true;
          this.updateProxyUI();
          this.hideProxySuggestionBanner(); // Hide banner since proxy is now running

          // Enable proxy mode automatically
          const settings = {
            useProxy: true
          };
          await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
          });

          // Sync sources to proxy after a short delay (give proxy time to start API)
          setTimeout(() => this.syncSourcesToProxy(), 1000);

          // Show success message
          if (response.autoLaunched) {
            alert('✅ Proxy Started!\n\n' +
              'A new Chrome window opened with HTTPS interception.\n\n' +
              'Use your extensions in that window - events will appear here.\n\n' +
              'Note: You may see security warnings about the proxy certificate.');
          } else {
            alert(response.message || 'Proxy started successfully!');
          }
        } else {
          this.updateProxyUI(); // Reset UI on failure
          alert('Failed to start proxy: ' + (response.error || 'Unknown error'));
        }

        port.disconnect();
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          console.error('[Panel] Native messaging error:', chrome.runtime.lastError);
          this.updateProxyUI(); // Reset UI
          alert('Native messaging host not installed.\n\nClick "Open Setup Assistant" button above.');
        }
      });

    } catch (err) {
      console.error('[Panel] Error starting proxy:', err);
      this.updateProxyUI(); // Reset UI
      alert('Error: ' + err.message + '\n\nClick "Open Setup Assistant" button to complete setup.');
    }
  }

  async stopProxy() {
    try {
      const port = chrome.runtime.connectNative('com.analytics_logger.proxy');

      port.postMessage({ action: 'stopProxy' });

      port.onMessage.addListener(async (response) => {
        console.log('[Panel] Proxy response:', response);

        if (response.success) {
          this.proxyRunning = false;
          this.updateProxyUI();

          // Disable proxy mode
          const settings = {
            useProxy: false
          };
          await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
          });

          alert('✅ Proxy server stopped.\n\nYou can close the Chrome window that was launched with the proxy.');
        } else {
          alert('Failed to stop proxy: ' + (response.error || 'Unknown error'));
        }

        port.disconnect();
      });

    } catch (err) {
      console.error('[Panel] Error stopping proxy:', err);
      alert('Error: ' + err.message);
    }
  }

  updateProxyUI() {
    // Update main view UI
    this.updateProxyMainUI();
  }

  async syncSourcesToProxy() {
    try {
      // Get all sources from the extension
      const response = await chrome.runtime.sendMessage({ action: 'getSources' });

      if (!response.success) {
        console.error('[Panel] Failed to get sources for sync');
        return;
      }

      // Send sources to proxy
      const syncResponse = await fetch('http://localhost:8889/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response.sources)
      });

      if (syncResponse.ok) {
        const result = await syncResponse.json();
        console.log(`[Panel] ✅ Synced ${result.synced} sources to proxy`);
      } else {
        console.error('[Panel] Failed to sync sources to proxy:', syncResponse.status);
      }
    } catch (err) {
      console.log('[Panel] Could not sync sources to proxy (proxy may not be running):', err.message);
    }
  }

  connectToBackground() {
    // Create long-lived connection for real-time updates
    this.port = chrome.runtime.connect({ name: 'analytics-logger-panel' });

    this.port.onMessage.addListener((message) => {
      console.log('[Panel] Received message:', message.action);

      if (message.action === 'eventsAdded' && message.data) {
        // Check if paused - if so, discard events
        if (this.isPaused) {
          console.log('[Panel] Discarded', message.data.length, 'events (paused)');
          return;
        }

        // Add to events array
        this.events.unshift(...message.data);
        this.updateEventTypeFilter();
        this.updateSourcesFilter();

        // Check if we can do incremental update (no filters active)
        if (!this.hasActiveFilters()) {
          // Incremental update: prepend new cards without full re-render
          // prependEventCards handles scroll position compensation internally
          this.prependEventCards(message.data);
        } else {
          // Filters active - do full re-render
          this.applyFilters();
        }

        this.updateStats();
      } else if (message.action === 'eventsCleared') {
        // Events were cleared (possibly by another panel or external action)
        this.events = [];
        this.filteredEvents = [];
        this.updateEventTypeFilter();
        this.updateSourcesFilter();
        this.applyFilters();
        this.updateStats();
        console.log('[Panel] Events cleared by background');
      } else if (message.action === 'autoPaused') {
        // Auto-paused due to inactivity
        console.log('[Panel] Auto-paused after', message.data.hours, 'hour(s) of inactivity');
        this.isPaused = true;
        this.isAutoPaused = true;
        this.updatePauseButton();
      } else if (message.action === 'unmatchedDomainsUpdated') {
        // Refresh pending sources in real-time
        if (this.sourceManager) {
          this.sourceManager.loadPendingSources();
        }
        this.checkForSuggestions();
      } else if (message.action === 'autoResumed') {
        // Background auto-resumed on panel open
        console.log('[Panel] Auto-resumed by background on panel open');
        this.isPaused = false;
        this.isAutoPaused = false;
        this.updatePauseButton();
      } else if (message.action === 'sourceNeedsProxy') {
        // Show proxy suggestion banner when Chrome API can't read request bodies
        console.log('[Panel] Source needs proxy:', message.data);
        this.showProxySuggestionBanner(message.data);
      }
    });

    this.port.onDisconnect.addListener(() => {
      console.log('[Panel] Disconnected from background');
      // Attempt to reconnect after a delay
      setTimeout(() => this.connectToBackground(), 1000);
    });
  }

  async togglePause() {
    this.isPaused = !this.isPaused;

    // If resuming from auto-pause, re-enable event capture in background
    if (!this.isPaused && this.isAutoPaused) {
      this.isAutoPaused = false;
      try {
        await chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: { enabled: true }
        });
        console.log('[Panel] Resumed from auto-pause, re-enabled event capture');
      } catch (err) {
        console.error('[Panel] Error re-enabling capture:', err);
      }
    }

    this.updatePauseButton();
    console.log('[Panel] Event collection', this.isPaused ? 'paused' : 'resumed');
  }

  updatePauseButton() {
    if (this.isPaused) {
      if (this.isAutoPaused) {
        this.elements.pauseBtn.innerHTML = '▶️ Auto-Paused';
        this.elements.pauseBtn.title = 'Auto-paused due to inactivity. Click to resume.';
      } else {
        this.elements.pauseBtn.innerHTML = '▶️ Resume';
        this.elements.pauseBtn.title = 'Resume event collection';
      }
      this.elements.pauseBtn.classList.add('paused');
    } else {
      this.elements.pauseBtn.innerHTML = '⏸️ Pause';
      this.elements.pauseBtn.classList.remove('paused');
      this.elements.pauseBtn.title = 'Pause event collection';
    }
  }

  /**
   * Show the proxy suggestion banner when Chrome API can't read request bodies
   * @param {object} data - { sourceId, sourceName, domain }
   */
  showProxySuggestionBanner(data) {
    // Don't show if proxy is already running
    if (this.proxyRunning) {
      console.log('[Panel] Proxy already running, not showing banner');
      return;
    }

    const banner = this.elements.proxySuggestionBanner;
    const sourceNameEl = this.elements.proxyNeededSource;

    if (banner && sourceNameEl) {
      sourceNameEl.textContent = data.sourceName || 'Some sources';
      banner.style.display = 'flex';
      console.log('[Panel] Showing proxy suggestion banner for:', data.sourceName);
    }
  }

  /**
   * Hide the proxy suggestion banner
   */
  hideProxySuggestionBanner() {
    const banner = this.elements.proxySuggestionBanner;
    if (banner) {
      banner.style.display = 'none';
    }
  }

  async loadEvents() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllEvents' });

      if (response.success) {
        this.events = response.events;
        this.updateEventTypeFilter();
        this.updateSourcesFilter();
        this.applyFilters();
        console.log('[Panel] Loaded events:', this.events.length);
      }
    } catch (err) {
      console.error('[Panel] Error loading events:', err);
    }

    // Load stats
    this.updateStats();
  }

  async updateStats() {
    // Use the actual loaded events count instead of background stats
    // This ensures the UI always shows the correct count for what's actually displayed
    this.elements.totalEvents.textContent = this.events.length;

    // Calculate storage usage (rough estimate based on actual events)
    const storageUsage = (this.events.length / 1000) * 100;
    this.elements.storageUsage.textContent = `${Math.min(100, storageUsage).toFixed(0)}%`;

    // Enable/disable export buttons based on events count
    const hasEvents = this.events.length > 0;
    this.elements.exportJSONBtn.disabled = !hasEvents;
    this.elements.exportCSVBtn.disabled = !hasEvents;
  }

  updateEventTypeFilter() {
    // Collect unique event types
    this.eventTypeSet.clear();
    this.events.forEach(event => {
      if (event.event) {
        this.eventTypeSet.add(event.event);
      }
    });

    // Update dropdown
    const currentValue = this.elements.eventTypeFilter.value;
    this.elements.eventTypeFilter.innerHTML = '<option value="">All Events</option>';

    Array.from(this.eventTypeSet).sort().forEach(eventType => {
      const option = document.createElement('option');
      option.value = eventType;
      option.textContent = eventType;
      this.elements.eventTypeFilter.appendChild(option);
    });

    // Restore selected value if it still exists
    if (this.eventTypeSet.has(currentValue)) {
      this.elements.eventTypeFilter.value = currentValue;
    }
  }

  applyFilters() {
    this.filteredEvents = this.events.filter(event => {
      // Search filter
      if (this.filters.search) {
        const searchString = JSON.stringify({
          event: event.event,
          properties: event.properties,
          url: event._metadata?.url
        }).toLowerCase();

        if (!searchString.includes(this.filters.search)) {
          return false;
        }
      }

      // Source filter
      if (this.filters.source && event._source !== this.filters.source) {
        return false;
      }

      // Event type filter
      if (this.filters.eventType && event.event !== this.filters.eventType) {
        return false;
      }

      return true;
    });

    this.renderEvents();
  }

  clearFilters() {
    this.filters = { search: '', source: '', eventType: '' };
    this.elements.searchInput.value = '';
    this.elements.sourceFilter.value = '';
    this.elements.eventTypeFilter.value = '';
    this.applyFilters();
  }

  /**
   * Check if any filters are currently active
   */
  hasActiveFilters() {
    return !!(this.filters.search || this.filters.source || this.filters.eventType);
  }

  /**
   * Prepend new event cards without full re-render
   * This preserves existing UI state (expanded cards, view modes, etc.)
   */
  prependEventCards(events) {
    // Hide empty state if visible
    this.elements.emptyState.style.display = 'none';
    this.elements.eventsList.style.display = 'flex';

    // Capture scroll state BEFORE insertion to compensate afterward
    const container = this.elements.eventsContainer;
    const scrollTop = container.scrollTop;
    const oldScrollHeight = container.scrollHeight;

    // Generate HTML for new events only
    const newHtml = events.map(event => this.renderEventCard(event)).join('');

    // Prepend to existing list (no clearing)
    this.elements.eventsList.insertAdjacentHTML('afterbegin', newHtml);

    // Compensate scroll position to keep viewport stable
    // Only adjust if user was NOT at the very top (scrollTop > 0)
    if (scrollTop > 0) {
      const newScrollHeight = container.scrollHeight;
      const heightAdded = newScrollHeight - oldScrollHeight;
      container.scrollTop = scrollTop + heightAdded;
    }

    // Update filtered events array
    this.filteredEvents = [...events, ...this.filteredEvents];
    this.elements.filteredEvents.textContent = this.filteredEvents.length;

    // Add event listeners only to new cards (first N cards)
    const allCards = this.elements.eventsList.querySelectorAll('.event-card');
    const newCards = Array.from(allCards).slice(0, events.length);

    newCards.forEach((card) => {
      // Expand/collapse
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.view-toggle-btn') &&
          !e.target.closest('.json-expandable') &&
          !e.target.closest('.collapsible-section') &&
          !e.target.closest('.json-primitive') &&
          !e.target.closest('.btn-configure-endpoint') &&
          !e.target.closest('.btn-copy-json')) {

          const wasExpanded = card.classList.contains('expanded');
          card.classList.toggle('expanded');

          if (!wasExpanded && card.classList.contains('expanded')) {
            card.querySelectorAll('.json-expandable').forEach(expandable => {
              expandable.classList.add('expanded');
            });
          }
        }
      });
    });

    // View toggle buttons
    newCards.forEach((card) => {
      const btn = card.querySelector('.view-toggle-btn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const eventId = btn.dataset.eventId;
          const structuredView = card.querySelector('.structured-view');
          const rawView = card.querySelector('.raw-view');

          if (structuredView && rawView) {
            const isShowingStructured = structuredView.style.display !== 'none';

            if (isShowingStructured) {
              structuredView.style.display = 'none';
              rawView.style.display = 'block';
              btn.textContent = 'Show Structured View';
              this.viewModeState.set(eventId, 'raw');
            } else {
              structuredView.style.display = 'block';
              rawView.style.display = 'none';
              btn.textContent = 'Show Raw JSON';
              this.viewModeState.set(eventId, 'structured');
            }
          }
        });
      }
    });

    // Configure endpoint buttons
    newCards.forEach((card) => {
      const btn = card.querySelector('.btn-configure-endpoint');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const eventId = btn.dataset.eventId;
          this.openEndpointConfigurator(eventId);
        });
      }
    });

    // Copy JSON buttons
    newCards.forEach((card) => {
      const btn = card.querySelector('.btn-copy-json');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const eventId = btn.dataset.eventId;
          this.copyEventJson(eventId, btn);
        });
      }
    });
  }

  renderEvents() {
    // Update filtered count
    this.elements.filteredEvents.textContent = this.filteredEvents.length;

    // Show/hide empty state
    if (this.filteredEvents.length === 0) {
      this.elements.emptyState.style.display = 'block';
      this.elements.eventsList.style.display = 'none';
      return;
    }

    this.elements.emptyState.style.display = 'none';
    this.elements.eventsList.style.display = 'flex';

    // Preserve expanded state before re-rendering
    const expandedEventIds = new Set();
    const expandedCollapsibleSections = new Map(); // Map of eventId -> Set of section indices
    const expandedJsonSections = new Map(); // Map of eventId -> Set of JSON paths

    this.elements.eventsList.querySelectorAll('.event-card.expanded').forEach((card) => {
      const eventId = card.dataset.id;
      if (eventId) {
        expandedEventIds.add(eventId);
      }
    });

    // Preserve view mode state (raw/structured) before re-rendering
    this.elements.eventsList.querySelectorAll('.event-card').forEach((card) => {
      const eventId = card.dataset.id;
      if (!eventId) return;
      const rawView = card.querySelector('.raw-view');
      if (rawView && rawView.style.display !== 'none') {
        this.viewModeState.set(eventId, 'raw');
      }
    });

    this.elements.eventsList.querySelectorAll('.event-card').forEach((card) => {
      const eventId = card.dataset.id;
      if (!eventId) return;

      // Track expanded collapsible sections (Full Event Data sections)
      const collapsibleSections = card.querySelectorAll('.collapsible-section.expanded');
      if (collapsibleSections.length > 0) {
        const sectionIndices = new Set();
        collapsibleSections.forEach((section, index) => {
          sectionIndices.add(index);
        });
        expandedCollapsibleSections.set(eventId, sectionIndices);
      }

      // Track expanded JSON sections
      const jsonExpandables = card.querySelectorAll('.json-expandable.expanded');
      if (jsonExpandables.length > 0) {
        const jsonPaths = new Set();
        jsonExpandables.forEach((expandable) => {
          // Use the data-path attribute if available, or construct from parent hierarchy
          const path = expandable.dataset.path || expandable.querySelector('.json-key')?.textContent || '';
          if (path) {
            jsonPaths.add(path);
          }
        });
        if (jsonPaths.size > 0) {
          expandedJsonSections.set(eventId, jsonPaths);
        }
      }
    });

    // Render event cards
    this.elements.eventsList.innerHTML = this.filteredEvents
      .map(event => this.renderEventCard(event))
      .join('');

    // Restore expanded state after re-rendering
    this.elements.eventsList.querySelectorAll('.event-card').forEach((card) => {
      const eventId = card.dataset.id;
      if (eventId && expandedEventIds.has(eventId)) {
        card.classList.add('expanded');
      }

      // Restore expanded collapsible sections
      if (eventId && expandedCollapsibleSections.has(eventId)) {
        const sectionIndices = expandedCollapsibleSections.get(eventId);
        const collapsibleSections = card.querySelectorAll('.collapsible-section');
        collapsibleSections.forEach((section, index) => {
          if (sectionIndices.has(index)) {
            section.classList.add('expanded');
          }
        });
      }

      // Restore expanded JSON sections
      if (eventId && expandedJsonSections.has(eventId)) {
        const jsonPaths = expandedJsonSections.get(eventId);
        const jsonExpandables = card.querySelectorAll('.json-expandable');
        jsonExpandables.forEach((expandable) => {
          const path = expandable.dataset.path || expandable.querySelector('.json-key')?.textContent || '';
          if (path && jsonPaths.has(path)) {
            expandable.classList.add('expanded');
          }
        });
      }
    });

    // Add click listeners to toggle expansion
    this.elements.eventsList.querySelectorAll('.event-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't toggle expansion if clicking on the toggle button, expandable sections, or collapsible sections
        if (!e.target.closest('.view-toggle-btn') &&
          !e.target.closest('.json-expandable') &&
          !e.target.closest('.collapsible-section') &&
          !e.target.closest('.json-primitive')) {

          const wasExpanded = card.classList.contains('expanded');
          card.classList.toggle('expanded');

          // If we just expanded the card, auto-expand all nested JSON sections
          if (!wasExpanded && card.classList.contains('expanded')) {
            card.querySelectorAll('.json-expandable').forEach(expandable => {
              expandable.classList.add('expanded');
            });
          }
        }
      });
    });

    // Add click listeners for view toggle buttons
    this.elements.eventsList.querySelectorAll('.view-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = btn.dataset.eventId;
        const structuredView = document.querySelector(`.structured-view[data-event-id="${eventId}"]`);
        const rawView = document.querySelector(`.raw-view[data-event-id="${eventId}"]`);

        if (structuredView && rawView) {
          const isShowingStructured = structuredView.style.display !== 'none';

          if (isShowingStructured) {
            // Switch to raw view
            structuredView.style.display = 'none';
            rawView.style.display = 'block';
            btn.textContent = 'Show Structured View';
            this.viewModeState.set(eventId, 'raw');
          } else {
            // Switch to structured view
            structuredView.style.display = 'block';
            rawView.style.display = 'none';
            btn.textContent = 'Show Raw JSON';
            this.viewModeState.set(eventId, 'structured');
          }
        }
      });
    });

    // Add click listeners for collapsible sections (Full Event Data)
    this.elements.eventsList.querySelectorAll('.collapsible-section').forEach((section) => {
      const header = section.querySelector('.event-section-header');
      if (header) {
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          section.classList.toggle('expanded');
        });
      }
    });

    // Add click listeners for Configure Endpoint buttons
    this.elements.eventsList.querySelectorAll('.btn-configure-endpoint').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = btn.dataset.eventId;
        this.openEndpointConfigurator(eventId);
      });
    });

    // Add click listeners for Copy JSON buttons
    this.elements.eventsList.querySelectorAll('.btn-copy-json').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = btn.dataset.eventId;
        this.copyEventJson(eventId, btn);
      });
    });
  }

  /**
   * Copy event raw JSON to clipboard
   * @param {string} eventId - Event ID
   * @param {HTMLElement} btn - Button element for feedback
   */
  copyEventJson(eventId, btn) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;

    const payload = event._rawPayload || event.properties || {};
    const json = JSON.stringify(payload, null, 2);

    navigator.clipboard.writeText(json).then(() => {
      // Show feedback
      btn.classList.add('copied');
      btn.title = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.title = 'Copy to clipboard';
      }, 1500);
    }).catch(err => {
      console.error('[Panel] Failed to copy:', err);
    });
  }

  /**
   * Open the endpoint configurator for a specific event
   * @param {string} eventId - Event ID
   */
  openEndpointConfigurator(eventId) {
    // Find the event in our events array
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      console.error('[Panel] Event not found:', eventId);
      return;
    }

    // Build context for the source manager
    const context = {
      url: event._metadata?.url,
      rawPayload: event._rawPayload,
      parentSourceId: event._source,
      parentSourceName: event._sourceName
    };

    console.log('[Panel] Opening endpoint configurator with context:', context);

    // Open the configurator via source manager
    if (this.sourceManager) {
      this.sourceManager.openEndpointConfigurator(context);
    }
  }

  renderEventCard(event) {
    const timestamp = new Date(event.timestamp).toLocaleString();
    const sourceName = event._sourceName || 'Unknown';
    const sourceColor = event._sourceColor || '#6366F1';
    const eventId = event.id || `event-${Math.random().toString(36).substr(2, 9)}`;

    // Check saved view mode for this event
    const savedViewMode = this.viewModeState.get(eventId) || 'structured';
    const structuredDisplay = savedViewMode === 'structured' ? '' : 'display: none;';
    const rawDisplay = savedViewMode === 'raw' ? '' : 'display: none;';
    const toggleBtnText = savedViewMode === 'raw' ? 'Show Structured View' : 'Show Raw JSON';

    return `
      <div class="event-card" data-id="${eventId}">
        <div class="event-header">
          <div class="event-name">${this.escapeHtml(event.event || 'Unknown Event')}</div>
          <span class="event-badge" style="background: ${sourceColor}20; color: ${sourceColor}; border: 1px solid ${sourceColor}40;">
            ${this.escapeHtml(sourceName)}
          </span>
          <span class="event-expand-icon">▼</span>
        </div>
        <div class="event-meta">
          <div class="event-meta-item">
            <span class="event-time">${timestamp}</span>
          </div>
          ${event.userId ? `
            <div class="event-meta-item">
              <span class="event-user">${this.escapeHtml(event.userId)}</span>
            </div>
          ` : ''}
        </div>
        ${event._metadata?.url ? `
          <div class="event-url">${this.escapeHtml(event._metadata.url)}</div>
        ` : ''}
        <div class="event-details">
          <div class="event-actions">
            <button class="view-toggle-btn" data-event-id="${eventId}">${toggleBtnText}</button>
            ${event._metadata?.url ? `
              <button class="btn-configure-endpoint btn btn-secondary btn-small" data-event-id="${eventId}" title="Configure field mappings for this endpoint">⚙️ Configure</button>
            ` : ''}
          </div>

          <!-- Structured View -->
          <div class="structured-view" data-event-id="${eventId}" style="${structuredDisplay}">
            ${event.properties && Object.keys(event.properties).length > 0 ? `
              <div class="event-section">
                <div class="event-section-title">Properties</div>
                <div class="structured-json">${this.renderStructuredJSON(event.properties, 0, '', 'properties')}</div>
              </div>
            ` : ''}
            ${event.context && Object.keys(event.context).length > 0 ? `
              <div class="event-section">
                <div class="event-section-title">Context</div>
                <div class="structured-json">${this.renderStructuredJSON(event.context)}</div>
              </div>
            ` : ''}
          </div>

          <!-- Raw JSON View -->
          <div class="raw-view" data-event-id="${eventId}" style="${rawDisplay}">
            <div class="event-section">
              <div class="event-section-title">
                Raw Payload
                <button class="btn-copy-json" data-event-id="${eventId}" title="Copy to clipboard">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="event-json">${this.formatJSON(event._rawPayload || event.properties || {})}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  formatJSON(obj) {
    return this.escapeHtml(JSON.stringify(obj, null, 2));
  }

  /**
   * Render structured, interactive JSON view with collapsible sections and tables
   */
  renderStructuredJSON(obj, depth = 0, parentKey = '', parentSection = '') {
    if (obj === null) {
      return this.renderPrimitive(null, 'null');
    }

    const type = Array.isArray(obj) ? 'array' : typeof obj;

    switch (type) {
      case 'object':
        return this.renderObject(obj, depth, parentKey, parentSection);
      case 'array':
        return this.renderArray(obj, depth, parentKey, parentSection);
      case 'string':
      case 'number':
      case 'boolean':
        return this.renderPrimitive(obj, type);
      default:
        return this.renderPrimitive(obj, 'unknown');
    }
  }

  /**
   * Render a primitive value (without icons, with copy support)
   */
  renderPrimitive(value, type) {
    const displayValue = type === 'string' ? `"${this.escapeHtml(value)}"` : this.escapeHtml(String(value));
    const cssClass = `json-${type}-value`;
    const rawValue = this.escapeHtml(String(value));

    return `
      <span class="json-primitive" data-value="${rawValue}" title="Click to copy">
        <span class="${cssClass}">${displayValue}</span>
      </span>
    `;
  }

  /**
   * Render an object as a table or expandable section
   */
  renderObject(obj, depth, parentKey, parentSection = '') {
    const keys = Object.keys(obj);

    if (keys.length === 0) {
      return '<div class="json-empty-message">Empty object</div>';
    }

    // Use table format for simple key-value pairs at depth 0
    if (depth === 0) {
      return this.renderObjectAsTable(obj, depth, parentSection);
    }

    // Use expandable section for nested objects
    return this.renderObjectAsExpandable(obj, depth, parentKey, parentSection);
  }

  /**
   * Render object as a table
   */
  renderObjectAsTable(obj, depth, parentSection = '') {
    const keys = Object.keys(obj);
    const rows = keys.map(key => {
      const value = obj[key];
      const valueType = this.getValueType(value);
      const renderedValue = this.renderStructuredJSON(value, depth + 1, key, parentSection);

      return `
        <tr>
          <td>
            <div class="json-key">${this.escapeHtml(key)}</div>
          </td>
          <td>
            <div class="json-value">${renderedValue}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <table class="json-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * Render object as expandable section
   */
  renderObjectAsExpandable(obj, depth, parentKey, parentSection = '') {
    const keys = Object.keys(obj);
    const uniqueId = `json-${Math.random().toString(36).substr(2, 9)}`;
    const label = parentKey || 'Object';
    const count = `${keys.length} ${keys.length === 1 ? 'property' : 'properties'}`;

    const content = keys.map(key => {
      const value = obj[key];
      const renderedValue = this.renderStructuredJSON(value, depth + 1, key, parentSection);

      // Check if value is an object or array (will render as expandable)
      const valueType = value === null ? 'null' : (Array.isArray(value) ? 'array' : typeof value);
      const isExpandable = valueType === 'object' || valueType === 'array';

      // If expandable (object/array), render directly without key-value wrapper
      // since the expandable header already shows the key
      if (isExpandable) {
        return `<div class="json-item">${renderedValue}</div>`;
      }

      // For primitives, show key-value pair
      return `
        <div class="json-item">
          <div class="json-key-value">
            <div class="json-key">${this.escapeHtml(key)}:</div>
            <div class="json-value">${renderedValue}</div>
          </div>
        </div>
      `;
    }).join('');

    // Don't auto-expand - let user control expansion
    const expandedClass = '';

    return `
      <div class="json-expandable ${expandedClass}" data-id="${uniqueId}">
        <div class="json-expand-header">
          <span class="json-expand-icon">▶</span>
          <span class="json-expand-label">${this.escapeHtml(label)}</span>
          <span class="json-expand-count">${count}</span>
        </div>
        <div class="json-expand-content">
          ${content}
        </div>
      </div>
    `;
  }

  /**
   * Render an array
   */
  renderArray(arr, depth, parentKey, parentSection = '') {
    if (arr.length === 0) {
      return '<div class="json-empty-message">Empty array</div>';
    }

    // Check if array contains only primitives
    const allPrimitives = arr.every(item => {
      const type = typeof item;
      return item === null || type === 'string' || type === 'number' || type === 'boolean';
    });

    if (allPrimitives) {
      return this.renderArrayAsList(arr, depth);
    }

    // Otherwise, render as expandable section
    return this.renderArrayAsExpandable(arr, depth, parentKey, parentSection);
  }

  /**
   * Render array as a simple list
   */
  renderArrayAsList(arr, depth) {
    const items = arr.map((item, index) => {
      const type = item === null ? 'null' : typeof item;
      const renderedValue = this.renderPrimitive(item, type);

      return `
        <div class="json-item">
          <div class="json-key-value">
            <div class="json-key">[${index}]:</div>
            <div class="json-value">${renderedValue}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="json-array">
        ${items}
      </div>
    `;
  }

  /**
   * Render array as expandable section
   */
  renderArrayAsExpandable(arr, depth, parentKey, parentSection = '') {
    const uniqueId = `json-${Math.random().toString(36).substr(2, 9)}`;
    const label = parentKey || 'Array';
    const count = `${arr.length} ${arr.length === 1 ? 'item' : 'items'}`;

    const content = arr.map((item, index) => {
      const renderedValue = this.renderStructuredJSON(item, depth + 1, `[${index}]`, parentSection);

      // Check if item is an object or array (will render as expandable)
      const valueType = item === null ? 'null' : (Array.isArray(item) ? 'array' : typeof item);
      const isExpandable = valueType === 'object' || valueType === 'array';

      // If expandable (object/array), render directly without key-value wrapper
      if (isExpandable) {
        return `<div class="json-item">${renderedValue}</div>`;
      }

      // For primitives, show key-value pair with index
      return `
        <div class="json-item">
          <div class="json-key-value">
            <div class="json-key">[${index}]:</div>
            <div class="json-value">${renderedValue}</div>
          </div>
        </div>
      `;
    }).join('');

    // Don't auto-expand - let user control expansion
    const expandedClass = '';

    return `
      <div class="json-expandable ${expandedClass}" data-id="${uniqueId}">
        <div class="json-expand-header">
          <span class="json-expand-icon">▶</span>
          <span class="json-expand-label">${this.escapeHtml(label)}</span>
          <span class="json-expand-count">${count}</span>
        </div>
        <div class="json-expand-content">
          ${content}
        </div>
      </div>
    `;
  }

  /**
   * Get value type for display
   */
  getValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async clearEvents() {
    const confirmed = await this.showConfirm(
      'clearEvents',
      'Clear Events',
      'Clear all captured events? This cannot be undone.'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearEvents' });

      if (response.success) {
        this.events = [];
        this.filteredEvents = [];
        this.updateEventTypeFilter(); // Clear the event type dropdown
        this.updateSourcesFilter(); // Clear the source dropdown
        this.applyFilters();
        this.updateStats();
        console.log('[Panel] Events cleared');
      }
    } catch (err) {
      console.error('[Panel] Error clearing events:', err);
      alert('Error clearing events: ' + err.message);
    }
  }

  async exportJSON() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportJSON',
        filters: this.getActiveFilters()
      });

      if (response.success) {
        this.downloadFile(response.data, 'analytics-events.json', 'application/json');
        console.log('[Panel] Exported JSON');
      }
    } catch (err) {
      console.error('[Panel] Error exporting JSON:', err);
    }
  }

  async exportCSV() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportCSV',
        filters: this.getActiveFilters()
      });

      if (response.success) {
        this.downloadFile(response.data, 'analytics-events.csv', 'text/csv');
        console.log('[Panel] Exported CSV');
      }
    } catch (err) {
      console.error('[Panel] Error exporting CSV:', err);
    }
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  getActiveFilters() {
    const filters = {};

    if (this.filters.search) filters.search = this.filters.search;
    if (this.filters.source) filters.source = this.filters.source;
    if (this.filters.eventType) filters.event = this.filters.eventType;

    return filters;
  }

  async openSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

      if (response.success) {
        const settings = response.settings;

        // Populate settings form
        document.getElementById('persistSetting').checked = settings.persistEvents;
        document.getElementById('maxEventsSetting').value = settings.maxEvents;
        document.getElementById('autoPauseHoursSetting').value = settings.autoPauseHours || 3;
        document.getElementById('detectNewSourcesSetting').checked = settings.detectNewSources !== false;

        // Initialize proxy UI
        this.updateProxyUI();

        // Show modal
        this.elements.settingsModal.style.display = 'flex';
      }
    } catch (err) {
      console.error('[Panel] Error loading settings:', err);
    }
  }

  closeSettings() {
    this.elements.settingsModal.style.display = 'none';
  }

  async saveSettings() {
    const settings = {
      persistEvents: document.getElementById('persistSetting').checked,
      maxEvents: parseInt(document.getElementById('maxEventsSetting').value),
      autoPauseHours: parseInt(document.getElementById('autoPauseHoursSetting').value),
      detectNewSources: document.getElementById('detectNewSourcesSetting').checked
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: settings
      });

      if (response.success) {
        console.log('[Panel] Settings saved');
        this.closeSettings();
        // Settings are applied immediately - no reload needed
      }
    } catch (err) {
      console.error('[Panel] Error saving settings:', err);
      alert('Error saving settings. Please try again.');
    }
  }

  /**
   * Show a temporary "Copied!" popup at the specified coordinates
   */
  showCopiedPopup(x, y) {
    const popup = document.createElement('div');
    popup.className = 'copied-popup';
    popup.textContent = 'Copied!';
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;

    document.body.appendChild(popup);

    // Remove after animation
    setTimeout(() => {
      popup.classList.add('fading-out');
      setTimeout(() => {
        document.body.removeChild(popup);
      }, 300);
    }, 1000);
  }

  /**
   * Update source filter dropdown based on sources present in current events
   */
  updateSourcesFilter() {
    if (!this.elements.sourceFilter) return;

    // Collect unique sources from current events
    const sourcesInEvents = new Map();
    this.events.forEach(event => {
      if (event._source && !sourcesInEvents.has(event._source)) {
        sourcesInEvents.set(event._source, {
          id: event._source,
          name: event._sourceName || event._source
        });
      }
    });

    const currentValue = this.elements.sourceFilter.value;
    this.elements.sourceFilter.innerHTML = '<option value="">All Sources</option>';

    // Sort by name and add to dropdown
    Array.from(sourcesInEvents.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(source => {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.name;
        this.elements.sourceFilter.appendChild(option);
      });

    // Restore selected value if it still exists in the new list
    if (currentValue && sourcesInEvents.has(currentValue)) {
      this.elements.sourceFilter.value = currentValue;
    } else if (currentValue) {
      // Selected source no longer has events, clear the filter
      this.filters.source = '';
    }
  }

  /**
   * Load sources for the filter dropdown (kept for backwards compatibility)
   */
  async loadSourcesFilter() {
    this.updateSourcesFilter();
  }

  /**
   * Check for pending sources and show notification
   */
  async checkForSuggestions() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUnmatchedDomains' });

      if (response.success && response.domains.length > 0) {
        this.showPendingNotification(response.domains.length);
      } else {
        this.hidePendingNotification();
      }
    } catch (err) {
      // Silently fail
    }
  }

  /**
   * Show the pending sources notification with count
   */
  showPendingNotification(count) {
    if (this.elements.pendingNotification && this.elements.pendingCount) {
      this.elements.pendingCount.textContent = count;
      this.elements.pendingNotification.style.display = 'flex';
    }
  }

  /**
   * Hide the pending sources notification
   */
  hidePendingNotification() {
    if (this.elements.pendingNotification) {
      this.elements.pendingNotification.style.display = 'none';
    }
  }
}

// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AnalyticsLoggerUI());
} else {
  new AnalyticsLoggerUI();
}
