// Panel UI Logic
// Handles event display, filtering, real-time updates, and exports

import { SourceManager } from './source-manager.js';

class AnalyticsLoggerUI {
  constructor() {
    this.events = [];
    this.filteredEvents = [];
    this.filters = {
      search: '',
      parser: '',
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
      emptyState: document.getElementById('emptyState'),
      searchInput: document.getElementById('searchInput'),
      parserFilter: document.getElementById('parserFilter'),
      eventTypeFilter: document.getElementById('eventTypeFilter'),
      clearFiltersBtn: document.getElementById('clearFiltersBtn'),
      clearBtn: document.getElementById('clearBtn'),
      refreshBtn: document.getElementById('refreshBtn'),
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
      exampleUrlInput: document.getElementById('exampleUrlInput'),
      addUrlPatternBtn: document.getElementById('addUrlPatternBtn'),
      patternsList: document.getElementById('patternsList'),
      toggleDebuggerBtn: document.getElementById('toggleDebuggerBtn'),
      debuggerStatusText: document.getElementById('debuggerStatusText'),
      startProxyBtn: document.getElementById('startProxyBtn'),
      stopProxyBtn: document.getElementById('stopProxyBtn'),
      proxyStatus: document.getElementById('proxyStatus')
    };

    // URL patterns array
    this.urlPatterns = [];

    // Debugger state
    this.debuggerEnabled = false;

    // Proxy state
    this.proxyRunning = false;

    // Pause/Play state
    this.isPaused = false;

    // Set up event listeners
    this.setupEventListeners();

    // Connect to background for real-time updates
    this.connectToBackground();

    // Load initial events
    await this.loadEvents();

    console.log('[Panel] Initialized');
  }

  setupEventListeners() {
    // Search and filter
    this.elements.searchInput.addEventListener('input', (e) => {
      this.filters.search = e.target.value.toLowerCase();
      this.applyFilters();
    });

    this.elements.parserFilter.addEventListener('change', (e) => {
      this.filters.parser = e.target.value;
      this.applyFilters();
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

    this.elements.refreshBtn.addEventListener('click', () => {
      this.loadEvents();
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

    // URL Pattern Manager
    this.elements.addUrlPatternBtn.addEventListener('click', () => {
      this.addUrlPattern();
    });

    this.elements.exampleUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addUrlPattern();
      }
    });

    // Debugger toggle
    this.elements.toggleDebuggerBtn.addEventListener('click', () => {
      this.toggleDebugger();
    });

    // Proxy control
    this.elements.startProxyBtn.addEventListener('click', () => {
      this.startProxy();
    });

    this.elements.stopProxyBtn.addEventListener('click', () => {
      this.stopProxy();
    });

    // Setup assistant
    const openSetupBtn = document.getElementById('openSetupBtn');
    if (openSetupBtn) {
      openSetupBtn.addEventListener('click', () => {
        this.openSetupAssistant();
      });
    }
  }

  openSetupAssistant() {
    // Open the setup instructions page with extension ID pre-filled
    const extensionId = chrome.runtime.id;
    const setupUrl = chrome.runtime.getURL('SETUP-INSTRUCTIONS.html') + '?id=' + extensionId;
    chrome.tabs.create({ url: setupUrl });
  }

  async startProxy() {
    try {
      const port = chrome.runtime.connectNative('com.analytics_logger.proxy');

      port.postMessage({ action: 'startProxy' });

      port.onMessage.addListener(async (response) => {
        console.log('[Panel] Proxy response:', response);

        if (response.success) {
          this.proxyRunning = true;
          this.updateProxyUI();

          // Enable proxy mode automatically
          const settings = {
            useProxy: true
          };
          await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
          });

          // Show success message
          if (response.autoLaunched) {
            alert('✅ MITM Proxy Started (Like Charles Proxy)!\n\n' +
                  'A new Chrome window opened with HTTPS interception enabled.\n\n' +
                  'This proxy can now capture analytics from extension service workers!\n\n' +
                  'Use your extensions (like Pie) in the new window and events will appear here.\n\n' +
                  'Tip: Look for the yellow "controlled by automated test software" banner.');
          } else {
            alert(response.message || 'Proxy started successfully!');
          }
        } else {
          alert('Failed to start proxy: ' + (response.error || 'Unknown error'));
        }

        port.disconnect();
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          console.error('[Panel] Native messaging error:', chrome.runtime.lastError);
          alert('Native messaging host not installed.\n\nClick "Open Setup Assistant" button above.');
        }
      });

    } catch (err) {
      console.error('[Panel] Error starting proxy:', err);
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
    if (this.proxyRunning) {
      this.elements.proxyStatus.textContent = 'Running ✓';
      this.elements.proxyStatus.style.color = '#4caf50';
      this.elements.startProxyBtn.style.display = 'none';
      this.elements.stopProxyBtn.style.display = 'inline-block';
    } else {
      this.elements.proxyStatus.textContent = 'Stopped';
      this.elements.proxyStatus.style.color = '#999';
      this.elements.startProxyBtn.style.display = 'inline-block';
      this.elements.stopProxyBtn.style.display = 'none';
    }
  }

  async toggleDebugger() {
    if (this.debuggerEnabled) {
      // Disable
      try {
        const response = await chrome.runtime.sendMessage({ action: 'disableDebugger' });
        if (response.success) {
          this.debuggerEnabled = false;
          this.updateDebuggerUI();
          console.log('[Panel] Debugger disabled');
        }
      } catch (err) {
        console.error('[Panel] Error disabling debugger:', err);
        alert('Error disabling debugger: ' + err.message);
      }
    } else {
      // Enable - get current tab
      try {
        const tabResponse = await chrome.runtime.sendMessage({ action: 'getCurrentTab' });

        if (!tabResponse.success || !tabResponse.tabId) {
          alert('Could not get current tab. Please open a tab and try again.');
          return;
        }

        const response = await chrome.runtime.sendMessage({
          action: 'enableDebugger',
          tabId: tabResponse.tabId
        });

        if (response.success) {
          this.debuggerEnabled = true;
          this.updateDebuggerUI();
          console.log('[Panel] Debugger enabled');
          alert('Deep Inspection Mode enabled! You\'ll see a "Debugger attached" banner on the current tab. This is normal and allows us to capture all requests.');
        }
      } catch (err) {
        console.error('[Panel] Error enabling debugger:', err);
        alert('Error enabling debugger: ' + err.message);
      }
    }
  }

  updateDebuggerUI() {
    if (this.debuggerEnabled) {
      this.elements.debuggerStatusText.textContent = 'Attached ✓';
      this.elements.debuggerStatusText.style.color = '#4caf50';
      this.elements.toggleDebuggerBtn.textContent = 'Disable Deep Inspection';
      this.elements.toggleDebuggerBtn.classList.remove('btn-primary');
      this.elements.toggleDebuggerBtn.classList.add('btn-danger');
    } else {
      this.elements.debuggerStatusText.textContent = 'Not attached';
      this.elements.debuggerStatusText.style.color = '#666';
      this.elements.toggleDebuggerBtn.textContent = 'Enable Deep Inspection';
      this.elements.toggleDebuggerBtn.classList.remove('btn-danger');
      this.elements.toggleDebuggerBtn.classList.add('btn-primary');
    }
  }

  /**
   * Extract patterns from a URL
   * Example: https://s.pie-staging.org/v1/batch
   * Returns: ['pie-staging', '/v1/batch', 's.pie-staging.org']
   */
  extractPatternsFromUrl(url) {
    const patterns = [];

    try {
      const urlObj = new URL(url);

      // Add domain-based patterns
      const hostname = urlObj.hostname;
      patterns.push(hostname); // Full domain

      // Add main domain part (e.g., "pie-staging" from "s.pie-staging.org")
      const domainParts = hostname.split('.');
      if (domainParts.length >= 2) {
        patterns.push(domainParts[domainParts.length - 2]); // Main part
      }

      // Add path-based patterns
      const pathname = urlObj.pathname;
      if (pathname && pathname !== '/') {
        patterns.push(pathname); // Full path

        // Add significant path segments
        const pathSegments = pathname.split('/').filter(s => s);
        if (pathSegments.length > 0) {
          // Add first segment
          patterns.push(`/${pathSegments[0]}`);

          // Add first two segments if available
          if (pathSegments.length > 1) {
            patterns.push(`/${pathSegments[0]}/${pathSegments[1]}`);
          }
        }
      }

    } catch (err) {
      console.error('[Panel] Invalid URL:', err);
    }

    return patterns;
  }

  /**
   * Add URL pattern from example URL input
   */
  addUrlPattern() {
    const url = this.elements.exampleUrlInput.value.trim();

    if (!url) {
      alert('Please enter a URL');
      return;
    }

    const extractedPatterns = this.extractPatternsFromUrl(url);

    if (extractedPatterns.length === 0) {
      alert('Could not extract patterns from URL. Please check the format.');
      return;
    }

    // Show selection dialog
    const selectedPattern = this.selectPatternDialog(url, extractedPatterns);

    if (selectedPattern) {
      // Add to patterns if not already present
      if (!this.urlPatterns.includes(selectedPattern)) {
        this.urlPatterns.push(selectedPattern);
        this.renderPatterns();

        // Clear input
        this.elements.exampleUrlInput.value = '';

        // Show success message
        console.log('[Panel] Added pattern:', selectedPattern);
      } else {
        alert('This pattern already exists!');
      }
    }
  }

  /**
   * Show dialog to select which pattern to use
   */
  selectPatternDialog(url, patterns) {
    const message = `Found ${patterns.length} possible pattern(s) from:\n${url}\n\n` +
                   patterns.map((p, i) => `${i + 1}. "${p}"`).join('\n') +
                   '\n\nEnter the number of the pattern to use (or cancel):';

    const choice = prompt(message, '1');

    if (choice === null) return null; // Cancelled

    const index = parseInt(choice) - 1;

    if (index >= 0 && index < patterns.length) {
      return patterns[index];
    }

    // Default to first pattern if invalid choice
    return patterns[0];
  }

  /**
   * Render pattern tags
   */
  renderPatterns() {
    this.elements.patternsList.innerHTML = this.urlPatterns
      .map(pattern => `
        <div class="pattern-tag">
          <span>${this.escapeHtml(pattern)}</span>
          <button class="pattern-tag-remove" data-pattern="${this.escapeHtml(pattern)}" title="Remove">×</button>
        </div>
      `)
      .join('');

    // Sync the textarea with the current patterns
    const textareaElement = document.getElementById('urlPatternsSetting');
    if (textareaElement) {
      textareaElement.value = this.urlPatterns.join(', ');
    }

    // Add click listeners to remove buttons
    this.elements.patternsList.querySelectorAll('.pattern-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pattern = btn.dataset.pattern;
        this.removePattern(pattern);
      });
    });
  }

  /**
   * Remove a pattern
   */
  removePattern(pattern) {
    const index = this.urlPatterns.indexOf(pattern);
    if (index > -1) {
      this.urlPatterns.splice(index, 1);
      this.renderPatterns();
      console.log('[Panel] Removed pattern:', pattern);
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

        // New events added
        this.events.unshift(...message.data);
        this.updateEventTypeFilter();
        this.applyFilters();
      } else if (message.action === 'eventsCleared') {
        // Events were cleared (possibly by another panel or external action)
        this.events = [];
        this.filteredEvents = [];
        this.updateEventTypeFilter();
        this.applyFilters();
        this.updateStats();
        console.log('[Panel] Events cleared by background');
      }
    });

    this.port.onDisconnect.addListener(() => {
      console.log('[Panel] Disconnected from background');
      // Attempt to reconnect after a delay
      setTimeout(() => this.connectToBackground(), 1000);
    });
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.updatePauseButton();
    console.log('[Panel] Event collection', this.isPaused ? 'paused' : 'resumed');
  }

  updatePauseButton() {
    if (this.isPaused) {
      this.elements.pauseBtn.innerHTML = '▶️ Resume';
      this.elements.pauseBtn.classList.add('paused');
      this.elements.pauseBtn.title = 'Resume event collection';
    } else {
      this.elements.pauseBtn.innerHTML = '⏸️ Pause';
      this.elements.pauseBtn.classList.remove('paused');
      this.elements.pauseBtn.title = 'Pause event collection';
    }
  }

  async loadEvents() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllEvents' });

      if (response.success) {
        this.events = response.events;
        this.updateEventTypeFilter();
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
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });

      if (response.success) {
        const stats = response.stats;
        this.elements.totalEvents.textContent = stats.total;

        // Calculate storage usage (rough estimate)
        const storageUsage = (stats.total / 1000) * 100;
        this.elements.storageUsage.textContent = `${Math.min(100, storageUsage).toFixed(0)}%`;
      }
    } catch (err) {
      console.error('[Panel] Error updating stats:', err);
    }
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

      // Parser filter
      if (this.filters.parser && event._parser !== this.filters.parser) {
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
    this.filters = { search: '', parser: '', eventType: '' };
    this.elements.searchInput.value = '';
    this.elements.parserFilter.value = '';
    this.elements.eventTypeFilter.value = '';
    this.applyFilters();
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

    // Render event cards
    this.elements.eventsList.innerHTML = this.filteredEvents
      .map(event => this.renderEventCard(event))
      .join('');

    // Add click listeners to toggle expansion
    this.elements.eventsList.querySelectorAll('.event-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't toggle expansion if clicking on the toggle button, expandable sections, or collapsible sections
        if (!e.target.closest('.view-toggle-btn') &&
            !e.target.closest('.json-expandable') &&
            !e.target.closest('.collapsible-section')) {
          card.classList.toggle('expanded');
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
          } else {
            // Switch to structured view
            structuredView.style.display = 'block';
            rawView.style.display = 'none';
            btn.textContent = 'Show Raw JSON';
          }
        }
      });
    });

    // Add click listeners for expandable JSON sections
    this.elements.eventsList.querySelectorAll('.json-expandable').forEach((expandable) => {
      const header = expandable.querySelector('.json-expand-header');
      if (header) {
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          expandable.classList.toggle('expanded');
        });
      }
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
  }

  renderEventCard(event) {
    const timestamp = new Date(event.timestamp).toLocaleString();
    const parser = event._parser || 'unknown';
    const eventId = event.id || `event-${Math.random().toString(36).substr(2, 9)}`;

    return `
      <div class="event-card" data-id="${eventId}">
        <div class="event-header">
          <div class="event-name">${this.escapeHtml(event.event || 'Unknown Event')}</div>
          <span class="event-badge ${parser}">${parser}</span>
          <span class="event-expand-icon">▼</span>
        </div>
        <div class="event-meta">
          <div class="event-meta-item">
            <span>🕒</span>
            <span>${timestamp}</span>
          </div>
          ${event.userId ? `
            <div class="event-meta-item">
              <span>👤</span>
              <span>${this.escapeHtml(event.userId)}</span>
            </div>
          ` : ''}
          ${event.type ? `
            <div class="event-meta-item">
              <span>📝</span>
              <span>${this.escapeHtml(event.type)}</span>
            </div>
          ` : ''}
        </div>
        ${event._metadata?.url ? `
          <div class="event-url">${this.escapeHtml(event._metadata.url)}</div>
        ` : ''}
        <div class="event-details">
          <button class="view-toggle-btn" data-event-id="${eventId}">Show Raw JSON</button>

          <!-- Structured View (default) -->
          <div class="structured-view" data-event-id="${eventId}">
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
            <div class="event-section collapsible-section">
              <div class="event-section-header">
                <span class="section-expand-icon">▶</span>
                <div class="event-section-title">Full Event Data</div>
              </div>
              <div class="event-section-content">
                <div class="structured-json">${this.renderStructuredJSON(event)}</div>
              </div>
            </div>
          </div>

          <!-- Raw JSON View (hidden by default) -->
          <div class="raw-view" data-event-id="${eventId}" style="display: none;">
            ${event.properties && Object.keys(event.properties).length > 0 ? `
              <div class="event-section">
                <div class="event-section-title">Properties</div>
                <div class="event-json">${this.formatJSON(event.properties)}</div>
              </div>
            ` : ''}
            ${event.context && Object.keys(event.context).length > 0 ? `
              <div class="event-section">
                <div class="event-section-title">Context</div>
                <div class="event-json">${this.formatJSON(event.context)}</div>
              </div>
            ` : ''}
            <div class="event-section collapsible-section">
              <div class="event-section-header">
                <span class="section-expand-icon">▶</span>
                <div class="event-section-title">Full Event Data</div>
              </div>
              <div class="event-section-content">
                <div class="event-json">${this.formatJSON(event)}</div>
              </div>
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
   * Render a primitive value with type indicator and icon
   */
  renderPrimitive(value, type) {
    const icons = {
      string: '📝',
      number: '🔢',
      boolean: value ? '✅' : '❌',
      null: '∅'
    };

    const icon = icons[type] || '?';
    const displayValue = type === 'string' ? `"${this.escapeHtml(value)}"` : this.escapeHtml(String(value));
    const cssClass = `json-${type}-value`;

    return `
      <span class="json-primitive">
        <span class="json-icon">${icon}</span>
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

      return `
        <div class="json-item">
          <div class="json-key-value">
            <div class="json-key">${this.escapeHtml(key)}:</div>
            <div class="json-value">${renderedValue}</div>
          </div>
        </div>
      `;
    }).join('');

    // Auto-expand if this is inside the Properties section
    const expandedClass = parentSection === 'properties' ? 'expanded' : '';

    return `
      <div class="json-expandable ${expandedClass}" data-id="${uniqueId}">
        <div class="json-expand-header">
          <span class="json-expand-icon">▶</span>
          <span class="json-expand-label">📦 ${this.escapeHtml(label)}</span>
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

      return `
        <div class="json-item">
          <div class="json-key-value">
            <div class="json-key">[${index}]:</div>
            <div class="json-value">${renderedValue}</div>
          </div>
        </div>
      `;
    }).join('');

    // Auto-expand if this is inside the Properties section
    const expandedClass = parentSection === 'properties' ? 'expanded' : '';

    return `
      <div class="json-expandable ${expandedClass}" data-id="${uniqueId}">
        <div class="json-expand-header">
          <span class="json-expand-icon">▶</span>
          <span class="json-expand-label">📋 ${this.escapeHtml(label)}</span>
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
    if (!confirm('Clear all captured events? This cannot be undone.')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearEvents' });

      if (response.success) {
        this.events = [];
        this.filteredEvents = [];
        this.updateEventTypeFilter(); // Clear the event type dropdown
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
    if (this.filters.parser) filters.parser = this.filters.parser;
    if (this.filters.eventType) filters.event = this.filters.eventType;

    return filters;
  }

  async openSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

      if (response.success) {
        const settings = response.settings;

        // Populate settings form
        document.getElementById('enabledSetting').checked = settings.enabled;
        document.getElementById('persistSetting').checked = settings.persistEvents;
        document.getElementById('maxEventsSetting').value = settings.maxEvents;
        // useProxySetting is now automatic - handled by Start/Stop Proxy buttons
        document.getElementById('captureSegmentSetting').checked = settings.captureSegment;
        document.getElementById('captureGASetting').checked = settings.captureGA;
        document.getElementById('captureGraphQLSetting').checked = settings.captureGraphQL;
        document.getElementById('captureCustomSetting').checked = settings.captureCustom;

        // Load patterns into array and render as tags
        this.urlPatterns = settings.urlPatterns || [];
        this.renderPatterns();

        // Also populate advanced textarea
        document.getElementById('urlPatternsSetting').value = this.urlPatterns.join(', ');

        // Update debugger UI
        this.debuggerEnabled = settings.useDebugger && settings.debuggerTabId;
        this.updateDebuggerUI();

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
    // Check if user manually edited the advanced textarea
    const manualPatterns = document.getElementById('urlPatternsSetting').value
      .split(',')
      .map(s => s.trim())
      .filter(s => s);

    // Use manual patterns if different from rendered patterns, otherwise use array
    const finalPatterns = (manualPatterns.join(',') !== this.urlPatterns.join(','))
      ? manualPatterns
      : this.urlPatterns;

    const settings = {
      enabled: document.getElementById('enabledSetting').checked,
      persistEvents: document.getElementById('persistSetting').checked,
      maxEvents: parseInt(document.getElementById('maxEventsSetting').value),
      // useProxy is now controlled by Start/Stop Proxy buttons - don't override it here
      urlPatterns: finalPatterns,
      captureSegment: document.getElementById('captureSegmentSetting').checked,
      captureGA: document.getElementById('captureGASetting').checked,
      captureGraphQL: document.getElementById('captureGraphQLSetting').checked,
      captureCustom: document.getElementById('captureCustomSetting').checked
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: settings
      });

      if (response.success) {
        console.log('[Panel] Settings saved');
        this.closeSettings();
        alert('Settings saved successfully! Reload the extension for changes to take effect.');
      }
    } catch (err) {
      console.error('[Panel] Error saving settings:', err);
      alert('Error saving settings. Please try again.');
    }
  }
}

// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AnalyticsLoggerUI());
} else {
  new AnalyticsLoggerUI();
}
