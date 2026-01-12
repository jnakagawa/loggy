/**
 * Source Manager UI
 * Handles source configuration UI with domain-based matching
 */

export class SourceManager {
  constructor() {
    this.sources = [];
    this.currentSource = null;
    this.editingSourceId = null;
    this.samplePayload = null;  // Sample payload for field detection
    this.availableFields = [];  // Flattened fields from sample payload
    this.activeFieldPicker = null;  // Currently open field picker
    this.init();
  }

  init() {
    console.log('[SourceManager] Initializing...');

    // Get DOM elements
    this.elements = {
      // Tabs
      tabBtns: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('.tab-content'),

      // Pending sources section
      pendingSourcesSection: document.getElementById('pendingSourcesSection'),
      pendingSourcesList: document.getElementById('pendingSourcesList'),

      // Sources tab
      sourcesList: document.getElementById('sourcesList'),
      addSourceBtn: document.getElementById('addSourceBtn'),
      importSourcesBtn: document.getElementById('importSourcesBtn'),
      exportSourcesBtn: document.getElementById('exportSourcesBtn'),

      // Source editor modal
      sourceEditorModal: document.getElementById('sourceEditorModal'),
      sourceEditorTitle: document.getElementById('sourceEditorTitle'),
      closeSourceEditorBtn: document.getElementById('closeSourceEditorBtn'),
      saveSourceBtn: document.getElementById('saveSourceBtn'),
      cancelSourceBtn: document.getElementById('cancelSourceBtn'),
      deleteSourceBtn: document.getElementById('deleteSourceBtn'),

      // Source editor fields
      sourceName: document.getElementById('sourceName'),
      sourceDomain: document.getElementById('sourceDomain'),
      sourceUrlPattern: document.getElementById('sourceUrlPattern'),
      sourceColor: document.getElementById('sourceColor'),
      sourceEnabled: document.getElementById('sourceEnabled'),
      fieldEventName: document.getElementById('fieldEventName'),
      fieldTimestamp: document.getElementById('fieldTimestamp'),
      fieldUserId: document.getElementById('fieldUserId'),
      fieldPropertyContainer: document.getElementById('fieldPropertyContainer'),

      // Field pickers
      fieldPickerEventName: document.getElementById('fieldPickerEventName'),
      fieldPickerTimestamp: document.getElementById('fieldPickerTimestamp'),
      fieldPickerUserId: document.getElementById('fieldPickerUserId'),
      fieldPickerPropertyContainer: document.getElementById('fieldPickerPropertyContainer'),
      fieldOptionsDropdown: document.getElementById('fieldOptionsDropdown'),

      // Stats
      sourceStats: document.getElementById('sourceStats'),
      statsEventsCapture: document.getElementById('statsEventsCapture'),
      statsLastCaptured: document.getElementById('statsLastCaptured'),

      // URL Pattern Builder (slider mode)
      urlPatternManual: document.getElementById('urlPatternManual'),
      urlPatternBuilder: document.getElementById('urlPatternBuilder'),
      urlSegments: document.getElementById('urlSegments'),
      patternSlider: document.getElementById('patternSlider'),
      patternResult: document.getElementById('patternResult'),
      patternExamples: document.getElementById('patternExamples')
    };

    // Endpoint configuration state
    this.endpointConfigMode = false;
    this.endpointUrl = null;
    this.endpointHostname = null;
    this.endpointParentName = null;
    this.urlSegments = [];

    this.setupEventListeners();
    this.loadSources();

    console.log('[SourceManager] Initialized');
  }

  setupEventListeners() {
    // Tab switching
    this.elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Sources tab buttons
    this.elements.addSourceBtn?.addEventListener('click', () => this.openSourceEditor());
    this.elements.importSourcesBtn?.addEventListener('click', () => this.importSources());
    this.elements.exportSourcesBtn?.addEventListener('click', () => this.exportSources());

    // Source editor buttons
    this.elements.closeSourceEditorBtn?.addEventListener('click', () => this.closeSourceEditor());
    this.elements.cancelSourceBtn?.addEventListener('click', () => this.closeSourceEditor());
    this.elements.saveSourceBtn?.addEventListener('click', () => this.saveSource());
    this.elements.deleteSourceBtn?.addEventListener('click', () => this.deleteSource());

    // Close modal on background click
    this.elements.sourceEditorModal?.addEventListener('click', (e) => {
      if (e.target === this.elements.sourceEditorModal) {
        this.closeSourceEditor();
      }
    });

    // Field picker click handlers
    this.elements.fieldPickerEventName?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFieldPicker('eventName', this.elements.fieldPickerEventName);
    });
    this.elements.fieldPickerTimestamp?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFieldPicker('timestamp', this.elements.fieldPickerTimestamp);
    });
    this.elements.fieldPickerUserId?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFieldPicker('userId', this.elements.fieldPickerUserId);
    });
    this.elements.fieldPickerPropertyContainer?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFieldPicker('propertyContainer', this.elements.fieldPickerPropertyContainer);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.activeFieldPicker && !e.target.closest('.field-options-dropdown')) {
        this.closeFieldPicker();
      }
    });

    // URL Pattern slider
    this.elements.patternSlider?.addEventListener('input', () => {
      this.updatePatternFromSlider();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    this.elements.tabBtns.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab contents
    this.elements.tabContents.forEach(content => {
      if (content.id === `${tabName}Tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Load sources when switching to sources tab
    if (tabName === 'sources') {
      this.loadSources();
    }
  }

  async loadSources() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSources' });

      if (response.success) {
        this.sources = response.sources;
        this.renderSources();
        console.log('[SourceManager] Loaded', this.sources.length, 'sources');
      }
    } catch (err) {
      console.error('[SourceManager] Error loading sources:', err);
    }

    // Also load pending sources
    await this.loadPendingSources();
  }

  async loadPendingSources() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUnmatchedDomains' });

      if (response.success && response.domains.length > 0) {
        this.renderPendingSources(response.domains);
      } else {
        this.hidePendingSources();
      }
    } catch (err) {
      console.error('[SourceManager] Error loading pending sources:', err);
      this.hidePendingSources();
    }
  }

  renderPendingSources(pendingSources) {
    if (!this.elements.pendingSourcesSection || !this.elements.pendingSourcesList) return;

    const html = pendingSources.map(pending => this.renderPendingCard(pending)).join('');
    this.elements.pendingSourcesList.innerHTML = html;
    this.elements.pendingSourcesSection.style.display = 'block';

    // Add click listeners to pending source buttons
    this.elements.pendingSourcesList.querySelectorAll('.pending-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const domain = btn.closest('.pending-source-card').dataset.domain;
        this.openSourceEditorForDomain(domain);
      });
    });

    this.elements.pendingSourcesList.querySelectorAll('.pending-dismiss-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const domain = btn.closest('.pending-source-card').dataset.domain;
        await this.dismissPendingSource(domain);
      });
    });
  }

  hidePendingSources() {
    if (this.elements.pendingSourcesSection) {
      this.elements.pendingSourcesSection.style.display = 'none';
    }
  }

  renderPendingCard(pending) {
    const timeAgo = this.formatTimeAgo(pending.firstSeen);

    return `
      <div class="pending-source-card" data-domain="${pending.domain}">
        <div class="pending-color-dot"></div>
        <div class="pending-info">
          <div class="pending-domain">${pending.domain}</div>
          <div class="pending-meta">${pending.count} event${pending.count !== 1 ? 's' : ''} • ${timeAgo}</div>
        </div>
        <button class="btn btn-primary btn-small pending-add-btn">Add</button>
        <button class="pending-dismiss-btn" title="Dismiss">×</button>
      </div>
    `;
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async dismissPendingSource(domain) {
    try {
      await chrome.runtime.sendMessage({
        action: 'clearUnmatchedDomain',
        domain: domain
      });
      // Reload pending sources
      await this.loadPendingSources();
    } catch (err) {
      console.error('[SourceManager] Error dismissing pending source:', err);
    }
  }

  renderSources() {
    if (!this.elements.sourcesList) return;

    if (this.sources.length === 0) {
      this.elements.sourcesList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #999;">
          <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
          <p>No custom sources configured yet.</p>
          <p style="font-size: 12px;">Default sources are always active.</p>
        </div>
      `;
      return;
    }

    // Group sources by type
    const systemSources = this.sources.filter(s => s.createdBy === 'system');
    const userSources = this.sources.filter(s => s.createdBy === 'user');

    let html = '';

    if (systemSources.length > 0) {
      html += '<div style="margin-bottom: 20px;">';
      html += '<h4 style="font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 12px;">Default Sources</h4>';
      systemSources.forEach(source => {
        html += this.renderSourceCard(source);
      });
      html += '</div>';
    }

    if (userSources.length > 0) {
      html += '<div>';
      html += '<h4 style="font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 12px;">Custom Sources</h4>';
      userSources.forEach(source => {
        html += this.renderSourceCard(source);
      });
      html += '</div>';
    }

    this.elements.sourcesList.innerHTML = html;

    // Add click listeners to source cards
    document.querySelectorAll('.source-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't open editor if clicking delete button
        if (e.target.closest('.source-delete-btn')) return;

        const sourceId = card.dataset.sourceId;
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
          this.openSourceEditor(source);
        }
      });
    });

    // Add click listeners to delete buttons
    document.querySelectorAll('.source-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sourceId = btn.dataset.sourceId;
        const source = this.sources.find(s => s.id === sourceId);
        if (source && confirm(`Delete "${source.name}"?`)) {
          await this.deleteSourceById(sourceId);
        }
      });
    });

    // Add click listeners to toggle switches
    document.querySelectorAll('.source-toggle-switch').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sourceId = btn.dataset.sourceId;
        await this.toggleSourceEnabled(sourceId);
      });
    });
  }

  /**
   * Toggle a source's enabled state
   */
  async toggleSourceEnabled(sourceId) {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) return;

    const newEnabled = !source.enabled;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateSource',
        source: { ...source, enabled: newEnabled }
      });

      if (response.success) {
        console.log('[SourceManager] Toggled source:', sourceId, 'enabled:', newEnabled);
        await this.loadSources();
      }
    } catch (err) {
      console.error('[SourceManager] Error toggling source:', err);
    }
  }

  renderSourceCard(source) {
    const isEnabled = source.enabled;
    const lastCaptured = source.stats?.lastCaptured
      ? new Date(source.stats.lastCaptured).toLocaleString()
      : 'Never';
    const eventsCount = source.stats?.eventsCapture || 0;

    return `
      <div class="source-card ${!isEnabled ? 'disabled' : ''}" data-source-id="${source.id}">
        <button class="source-toggle-switch ${isEnabled ? 'enabled' : ''}" data-source-id="${source.id}" title="Click to ${isEnabled ? 'disable' : 'enable'}">
          <span class="toggle-knob"></span>
        </button>
        <div class="source-color-dot" style="background-color: ${source.color};"></div>
        <div class="source-info">
          <div class="source-name">${source.name}</div>
          <div class="source-meta">
            <span class="source-badge ${source.createdBy}">${source.createdBy}</span>
            <span class="source-domain">${source.domain || 'No domain'}</span>
          </div>
          <div class="source-stats">
            ${eventsCount.toLocaleString()} events captured
          </div>
        </div>
        <button class="source-delete-btn" data-source-id="${source.id}" title="Delete source">×</button>
      </div>
    `;
  }

  async openSourceEditor(source = null) {
    this.editingSourceId = source ? source.id : null;
    this.currentSource = source;

    if (source) {
      // Editing existing source
      this.elements.sourceEditorTitle.textContent = `Edit Source: ${source.name}`;
      this.elements.sourceName.value = source.name;
      this.elements.sourceDomain.value = source.domain || '';
      this.elements.sourceUrlPattern.value = source.urlPattern || '';
      this.elements.sourceColor.value = source.color;
      this.elements.sourceEnabled.checked = source.enabled;

      // Load sample payload for field pickers
      // First try stored sample, then fall back to captured events
      if (source.samplePayload) {
        this.initFieldPickers(source.samplePayload);
      } else {
        await this.loadSampleEventForSource(source.id);
      }

      // Set field mappings if they exist (after loading sample so picker shows value)
      if (source.fieldMappings?.eventName) {
        this.elements.fieldEventName.value = source.fieldMappings.eventName;
        this.updateFieldPickerDisplay('eventName', source.fieldMappings.eventName);
      }
      if (source.fieldMappings?.timestamp) {
        this.elements.fieldTimestamp.value = source.fieldMappings.timestamp;
        this.updateFieldPickerDisplay('timestamp', source.fieldMappings.timestamp);
      }
      if (source.fieldMappings?.userId) {
        this.elements.fieldUserId.value = source.fieldMappings.userId;
        this.updateFieldPickerDisplay('userId', source.fieldMappings.userId);
      }
      if (source.fieldMappings?.propertyContainer) {
        this.elements.fieldPropertyContainer.value = source.fieldMappings.propertyContainer;
        this.updateFieldPickerDisplay('propertyContainer', source.fieldMappings.propertyContainer);
      }

      // Show stats
      this.elements.sourceStats.style.display = 'block';
      this.elements.statsEventsCapture.textContent = source.stats?.eventsCapture || 0;
      this.elements.statsLastCaptured.textContent = source.stats?.lastCaptured
        ? new Date(source.stats.lastCaptured).toLocaleString()
        : 'Never';

      // Show delete button for user sources
      this.elements.deleteSourceBtn.style.display = source.createdBy === 'user' ? 'block' : 'none';
    } else {
      // Creating new source
      this.elements.sourceEditorTitle.textContent = 'Add New Source';
      this.elements.sourceName.value = '';
      this.elements.sourceDomain.value = '';
      this.elements.sourceUrlPattern.value = '';
      this.elements.sourceColor.value = '#6366F1';
      this.elements.sourceEnabled.checked = true;
      this.resetFieldPickers();
      this.elements.sourceStats.style.display = 'none';
      this.elements.deleteSourceBtn.style.display = 'none';
    }

    this.elements.sourceEditorModal.style.display = 'flex';
  }

  /**
   * Load a sample event from the buffer to populate field pickers
   */
  async loadSampleEventForSource(sourceId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllEvents' });
      if (response.success && response.events.length > 0) {
        // Find an event from this source
        const sampleEvent = response.events.find(e => e._source === sourceId);
        if (sampleEvent) {
          // Use the raw payload if available (preserves original structure)
          // Fall back to reconstructed payload if no raw payload
          const samplePayload = sampleEvent._rawPayload || {
            ...sampleEvent.properties,
            event: sampleEvent.event,
            timestamp: sampleEvent.timestamp,
            userId: sampleEvent.userId,
            anonymousId: sampleEvent.anonymousId,
            type: sampleEvent.type,
            context: sampleEvent.context
          };
          console.log('[SourceManager] Loaded sample payload for source:', sourceId, sampleEvent._rawPayload ? '(raw)' : '(reconstructed)');
          this.initFieldPickers(samplePayload);
          return;
        }
      }
      // No events found for this source
      console.log('[SourceManager] No events found for source:', sourceId);
      this.resetFieldPickers();
    } catch (err) {
      console.error('[SourceManager] Error loading sample event:', err);
      this.resetFieldPickers();
    }
  }

  /**
   * Open editor pre-filled with a domain (for suggestions flow)
   */
  async openSourceEditorForDomain(domain) {
    this.editingSourceId = null;
    this.currentSource = null;

    this.elements.sourceEditorTitle.textContent = 'Add New Source';
    this.elements.sourceName.value = this.humanizeDomain(domain);
    this.elements.sourceDomain.value = domain;
    this.elements.sourceUrlPattern.value = '';
    this.elements.sourceColor.value = this.generateColor(domain);
    this.elements.sourceEnabled.checked = true;
    this.elements.sourceStats.style.display = 'none';
    this.elements.deleteSourceBtn.style.display = 'none';

    // Try to get sample payload from unmatched domains
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUnmatchedDomains' });
      console.log('[SourceManager] Unmatched domains response:', response);
      if (response.success) {
        const pending = response.domains.find(d => d.domain === domain);
        console.log('[SourceManager] Found pending for domain:', domain, pending);
        if (pending?.payload) {
          console.log('[SourceManager] Payload:', pending.payload);
          this.initFieldPickers(pending.payload);
        } else {
          console.log('[SourceManager] No payload found');
          this.resetFieldPickers();
        }
      } else {
        this.resetFieldPickers();
      }
    } catch (err) {
      console.error('[SourceManager] Error loading pending source payload:', err);
      this.resetFieldPickers();
    }

    this.elements.sourceEditorModal.style.display = 'flex';
  }

  closeSourceEditor() {
    this.elements.sourceEditorModal.style.display = 'none';
    this.editingSourceId = null;
    this.currentSource = null;

    // Reset endpoint config mode
    this.endpointConfigMode = false;
    this.endpointUrl = null;
    this.endpointHostname = null;
    this.endpointParentName = null;
    this.urlSegments = [];

    // Reset URL pattern inputs to default state
    if (this.elements.urlPatternManual) {
      this.elements.urlPatternManual.style.display = 'block';
    }
    if (this.elements.urlPatternBuilder) {
      this.elements.urlPatternBuilder.style.display = 'none';
    }
  }

  async saveSource() {
    const domain = this.elements.sourceDomain.value.trim().toLowerCase();

    if (!domain) {
      alert('Please enter a domain');
      return;
    }

    // Build field mappings (only include non-empty overrides)
    const fieldMappings = {};
    const eventName = this.elements.fieldEventName.value.trim();
    const timestamp = this.elements.fieldTimestamp.value.trim();
    const userId = this.elements.fieldUserId.value.trim();
    const propertyContainer = this.elements.fieldPropertyContainer.value.trim();

    if (eventName) fieldMappings.eventName = eventName;
    if (timestamp) fieldMappings.timestamp = timestamp;
    if (userId) fieldMappings.userId = userId;
    if (propertyContainer) fieldMappings.propertyContainer = propertyContainer;

    // Get URL pattern (optional)
    const urlPattern = this.elements.sourceUrlPattern.value.trim();

    // Generate unique ID for endpoint configurations to avoid collisions
    let sourceId;
    if (this.editingSourceId) {
      sourceId = this.editingSourceId;
    } else if (this.endpointConfigMode && urlPattern) {
      // For endpoint configs, use domain + pattern hash to ensure uniqueness
      const patternHash = urlPattern.replace(/[\/\*]/g, '-').replace(/^-+|-+$/g, '');
      sourceId = `${domain.replace(/\./g, '-')}-${patternHash}`;
    } else {
      sourceId = domain.replace(/\./g, '-');
    }

    const sourceData = {
      id: sourceId,
      name: this.elements.sourceName.value || this.humanizeDomain(domain),
      icon: this.currentSource?.icon || '📊',
      color: this.elements.sourceColor.value,
      enabled: this.elements.sourceEnabled.checked,
      domain: domain,
      fieldMappings: fieldMappings,
      createdBy: this.currentSource?.createdBy || 'user',
      createdAt: this.currentSource?.createdAt || new Date().toISOString(),
      stats: this.currentSource?.stats || { eventsCapture: 0, lastCaptured: null }
    };

    // Only include urlPattern if set
    if (urlPattern) {
      sourceData.urlPattern = urlPattern;
    }

    try {
      const action = this.editingSourceId ? 'updateSource' : 'addSource';
      const response = await chrome.runtime.sendMessage({
        action,
        source: sourceData
      });

      if (response.success) {
        console.log('[SourceManager] Source saved:', sourceData.id);
        this.closeSourceEditor();
        await this.loadSources();

        // Sync sources to proxy if running
        this.syncSourcesToProxy();
      } else {
        alert('Failed to save source: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[SourceManager] Error saving source:', err);
      alert('Failed to save source: ' + err.message);
    }
  }

  async deleteSource() {
    if (!this.editingSourceId) return;

    if (!confirm(`Are you sure you want to delete "${this.currentSource.name}"?`)) {
      return;
    }

    await this.deleteSourceById(this.editingSourceId);
    this.closeSourceEditor();
  }

  async deleteSourceById(sourceId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'removeSource',
        id: sourceId
      });

      if (response.success) {
        console.log('[SourceManager] Source deleted:', sourceId);
        await this.loadSources();

        // Sync sources to proxy if running
        this.syncSourcesToProxy();
      } else {
        alert('Failed to delete source');
      }
    } catch (err) {
      console.error('[SourceManager] Error deleting source:', err);
      alert('Failed to delete source: ' + err.message);
    }
  }

  async exportSources() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportSources' });

      if (response.success) {
        const blob = new Blob([response.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-sources-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('[SourceManager] Sources exported');
      }
    } catch (err) {
      console.error('[SourceManager] Error exporting sources:', err);
      alert('Failed to export sources: ' + err.message);
    }
  }

  async importSources() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const response = await chrome.runtime.sendMessage({
          action: 'importSources',
          data: text
        });

        if (response.success) {
          alert(`Successfully imported ${response.count} source(s)`);
          await this.loadSources();

          // Sync sources to proxy if running
          this.syncSourcesToProxy();
        } else {
          alert('Failed to import sources: ' + (response.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('[SourceManager] Error importing sources:', err);
        alert('Failed to import sources: ' + err.message);
      }
    });

    input.click();
  }

  async syncSourcesToProxy() {
    try {
      // Get all sources from the extension
      const response = await chrome.runtime.sendMessage({ action: 'getSources' });

      if (!response.success) {
        console.error('[SourceManager] Failed to get sources for sync');
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
        console.log(`[SourceManager] Synced ${result.synced} sources to proxy`);
      }
    } catch (err) {
      // Silently fail if proxy not running
      console.log('[SourceManager] Could not sync sources to proxy:', err.message);
    }
  }

  // Helper functions for auto-generating source info
  humanizeDomain(domain) {
    let name = domain.replace(/\.(com|org|io|co|net)$/, '');
    name = name.split(/[.-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return name;
  }

  selectIcon(domain) {
    const iconMap = {
      'reddit': '🔵',
      'segment': '📊',
      'google': '📈',
      'mixpanel': '🔮',
      'amplitude': '📡',
      'facebook': '📘',
      'twitter': '🐦',
      'honey': '🍯',
      'api': '⚡'
    };

    for (const [keyword, icon] of Object.entries(iconMap)) {
      if (domain.toLowerCase().includes(keyword)) {
        return icon;
      }
    }

    return '📊';
  }

  generateColor(domain) {
    const colors = [
      '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
      '#10B981', '#3B82F6', '#EF4444', '#14B8A6'
    ];
    const hash = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  // ============================================
  // Endpoint Configurator Methods
  // ============================================

  /**
   * Open the endpoint configurator from an event
   * @param {object} context - { url, rawPayload, parentSourceId, parentSourceName }
   */
  openEndpointConfigurator(context) {
    console.log('[SourceManager] Opening endpoint configurator:', context);

    this.endpointConfigMode = true;
    this.endpointUrl = context.url;
    this.editingSourceId = null;
    this.currentSource = null;

    // Parse URL segments
    this.urlSegments = this.parseUrlSegments(context.url);
    console.log('[SourceManager] URL segments:', this.urlSegments);

    // Extract domain from URL (keep full hostname for display)
    let domain = '';
    let fullHostname = '';
    try {
      const urlObj = new URL(context.url);
      fullHostname = urlObj.hostname.replace(/^www\./, '');
      domain = fullHostname;
      // Extract base domain for matching (remove subdomains)
      const parts = fullHostname.split('.');
      if (parts.length > 2) {
        domain = parts.slice(-2).join('.');
      }
    } catch (e) {
      console.error('[SourceManager] Error parsing URL:', e);
    }

    // Store full hostname for slider display
    this.endpointHostname = fullHostname;
    this.endpointParentName = context.parentSourceName;

    // Set up the modal
    this.elements.sourceEditorTitle.textContent = `Add Endpoint: ${context.parentSourceName || 'New'}`;

    this.elements.sourceDomain.value = domain;
    this.elements.sourceColor.value = this.generateColor(domain + context.url);
    this.elements.sourceEnabled.checked = true;

    // Show slider builder, hide manual input
    if (this.elements.urlPatternManual) {
      this.elements.urlPatternManual.style.display = 'none';
    }
    if (this.elements.urlPatternBuilder) {
      this.elements.urlPatternBuilder.style.display = 'block';
    }

    // Initialize slider (this will also set the suggested name based on default slider position)
    this.initPatternSlider();

    // Initialize field pickers with the raw payload
    if (context.rawPayload) {
      this.initFieldPickers(context.rawPayload);
    } else {
      this.resetFieldPickers();
    }

    // Hide stats and delete button for new source
    this.elements.sourceStats.style.display = 'none';
    this.elements.deleteSourceBtn.style.display = 'none';

    // Show modal
    this.elements.sourceEditorModal.style.display = 'flex';
  }

  /**
   * Parse URL into segments
   * @param {string} url - Full URL
   * @returns {string[]} - Array of path segments
   */
  parseUrlSegments(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.split('/').filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /**
   * Initialize the pattern slider
   */
  initPatternSlider() {
    const slider = this.elements.patternSlider;
    const segmentsContainer = this.elements.urlSegments;

    if (!slider || !segmentsContainer || this.urlSegments.length === 0) {
      return;
    }

    // Set slider range: 0 = domain only, 1+ = path segments
    slider.min = 0;
    slider.max = this.urlSegments.length;
    slider.value = Math.max(1, this.urlSegments.length - 1); // Default to second-to-last segment

    // Render segments and update pattern
    this.renderUrlSegments();
    this.updatePatternFromSlider();
  }

  /**
   * Render URL segments with highlighting based on slider position
   */
  renderUrlSegments() {
    const container = this.elements.urlSegments;
    const sliderValue = parseInt(this.elements.patternSlider?.value || 0);

    if (!container) return;

    let html = '';

    // Always show domain first (position 0 = domain only)
    const domainClass = 'url-segment static domain';
    html += `<span class="${domainClass}">${this.endpointHostname || 'domain'}</span>`;

    // Show path segments
    this.urlSegments.forEach((segment, index) => {
      // Position 0 = domain only (all paths wildcard)
      // Position 1 = first segment static, rest wildcard
      // etc.
      const isStatic = index < sliderValue;
      const className = isStatic ? 'url-segment static' : 'url-segment wildcard';
      html += `<span class="${className}">/${segment}</span>`;
    });

    // Add wildcard indicator if not at max
    if (sliderValue < this.urlSegments.length) {
      html += `<span class="url-segment wildcard-star">/*</span>`;
    }

    container.innerHTML = html;
  }

  /**
   * Update pattern based on slider position
   */
  updatePatternFromSlider() {
    const sliderValue = parseInt(this.elements.patternSlider?.value || 0);

    // Update segment highlighting
    this.renderUrlSegments();

    // Build pattern
    const pattern = this.buildPatternFromSlider(sliderValue);

    // Update pattern display
    if (this.elements.patternResult) {
      if (pattern) {
        this.elements.patternResult.textContent = pattern;
      } else {
        this.elements.patternResult.innerHTML = '<em>(domain only - no URL pattern)</em>';
      }
    }

    // Update hidden input for saving
    if (this.elements.sourceUrlPattern) {
      this.elements.sourceUrlPattern.value = pattern;
    }

    // Update suggested name based on slider position
    if (this.endpointConfigMode) {
      const suggestedName = this.suggestEndpointName(
        this.endpointParentName,
        this.urlSegments,
        sliderValue
      );
      this.elements.sourceName.value = suggestedName;
    }

    // Update match examples
    this.updatePatternExamples(pattern);
  }

  /**
   * Build URL pattern from slider position
   * @param {number} position - Slider position (0 = domain only, 1+ = path segments)
   * @returns {string} - URL pattern (empty string for domain only)
   */
  buildPatternFromSlider(position) {
    // Position 0 = domain only, no URL pattern needed
    if (position === 0) {
      return '';
    }
    if (position >= this.urlSegments.length) {
      // Exact match (no wildcard)
      return '/' + this.urlSegments.join('/');
    }
    // Partial match with wildcard
    const staticParts = this.urlSegments.slice(0, position);
    return '/' + staticParts.join('/') + '/*';
  }

  /**
   * Update pattern match examples
   * @param {string} pattern - Current pattern (empty string for domain only)
   */
  updatePatternExamples(pattern) {
    const container = this.elements.patternExamples;
    if (!container) return;

    const hostname = this.endpointHostname || 'domain';
    const originalPath = '/' + this.urlSegments.join('/');
    const examples = [];

    // Domain-only case (position 0)
    if (!pattern) {
      examples.push({
        path: `${hostname}${originalPath}`,
        matches: true,
        note: 'this event'
      });
      examples.push({
        path: `${hostname}/any/other/path`,
        matches: true,
        note: 'any path on domain'
      });
      examples.push({
        path: `other.${hostname.split('.').slice(-1)[0]}.com/path`,
        matches: false,
        note: 'different domain'
      });
    } else {
      // Original URL always matches
      examples.push({
        path: originalPath,
        matches: true
      });

      // Generate a "would match" example if using wildcard
      if (pattern.endsWith('/*')) {
        const basePath = pattern.slice(0, -2);
        examples.push({
          path: basePath + '/otherEndpoint',
          matches: true
        });
      }

      // Generate a "would not match" example
      if (this.urlSegments.length > 1) {
        const differentPath = '/' + this.urlSegments[0] + '/differentApi/something';
        examples.push({
          path: differentPath,
          matches: false
        });
      }
    }

    // Render examples
    let html = '';
    examples.forEach(ex => {
      const className = ex.matches ? 'pattern-example match' : 'pattern-example no-match';
      const icon = ex.matches ? '✓' : '✗';
      const note = ex.note ? ` <span class="pattern-example-note">(${ex.note})</span>` : '';
      html += `
        <div class="${className}">
          <span class="pattern-example-icon">${icon}</span>
          <span>${ex.path}${note}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Suggest a name for the endpoint based on the pattern's last static segment
   * @param {string} parentName - Parent source name
   * @param {string[]} segments - URL segments
   * @param {number} sliderPosition - Current slider position (determines which segments are static)
   * @returns {string} - Suggested name
   */
  suggestEndpointName(parentName, segments, sliderPosition) {
    if (segments.length === 0 || sliderPosition === 0) {
      return parentName || 'New Endpoint';
    }

    // Use the last STATIC segment (the one right before the wildcard)
    // sliderPosition tells us how many segments are static
    const lastStaticIndex = Math.min(sliderPosition, segments.length) - 1;
    const lastStaticSegment = segments[lastStaticIndex];

    // Skip cryptic/hash-like segments (mostly random characters)
    // A segment is "meaningful" if it has mostly letters and common separators
    const isMeaningful = (seg) => {
      const letterCount = (seg.match(/[a-zA-Z]/g) || []).length;
      const totalCount = seg.length;
      // At least 70% letters and not too short
      return letterCount / totalCount > 0.7 && seg.length > 2;
    };

    // Find the best segment to use for the name (last meaningful static segment)
    let nameSegment = lastStaticSegment;
    for (let i = lastStaticIndex; i >= 0; i--) {
      if (isMeaningful(segments[i])) {
        nameSegment = segments[i];
        break;
      }
    }

    // Convert camelCase or snake_case to Title Case
    const formatted = nameSegment
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    if (parentName) {
      return `${parentName} - ${formatted}`;
    }
    return formatted;
  }

  // ============================================
  // Field Picker Methods
  // ============================================

  /**
   * Toggle field picker dropdown
   */
  toggleFieldPicker(fieldType, pickerElement) {
    if (this.activeFieldPicker === fieldType) {
      this.closeFieldPicker();
      return;
    }

    // Close any open picker first
    this.closeFieldPicker();

    // Open this picker
    this.activeFieldPicker = fieldType;
    pickerElement.classList.add('open');

    // Position and show dropdown
    const dropdown = this.elements.fieldOptionsDropdown;
    const rect = pickerElement.getBoundingClientRect();
    const modalContent = this.elements.sourceEditorModal.querySelector('.modal-content');
    const modalRect = modalContent.getBoundingClientRect();

    // Populate options first so we can measure dropdown height
    this.populateFieldOptions(fieldType);

    dropdown.style.left = `${rect.left - modalRect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.display = 'block';

    // Check if dropdown would overflow the modal bottom
    const dropdownHeight = dropdown.offsetHeight;
    const spaceBelow = modalRect.bottom - rect.bottom - 20; // 20px buffer
    const spaceAbove = rect.top - modalRect.top - 20;

    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      // Position above the picker
      dropdown.style.top = 'auto';
      dropdown.style.bottom = `${modalRect.bottom - rect.top + 4}px`;
      dropdown.classList.add('dropdown-above');
    } else {
      // Position below the picker (default)
      dropdown.style.top = `${rect.bottom - modalRect.top + 4}px`;
      dropdown.style.bottom = 'auto';
      dropdown.classList.remove('dropdown-above');
    }
  }

  /**
   * Close field picker dropdown
   */
  closeFieldPicker() {
    if (!this.activeFieldPicker) return;

    // Remove open class from all pickers
    this.elements.fieldPickerEventName?.classList.remove('open');
    this.elements.fieldPickerTimestamp?.classList.remove('open');
    this.elements.fieldPickerUserId?.classList.remove('open');
    this.elements.fieldPickerPropertyContainer?.classList.remove('open');

    // Hide dropdown and reset position classes
    this.elements.fieldOptionsDropdown.style.display = 'none';
    this.elements.fieldOptionsDropdown.classList.remove('dropdown-above');
    this.activeFieldPicker = null;
  }

  /**
   * Populate field options dropdown
   */
  populateFieldOptions(fieldType) {
    const listEl = this.elements.fieldOptionsDropdown.querySelector('.field-options-list');
    const currentValue = this.getFieldValue(fieldType);

    // Get auto-detected value for this field type
    const autoDetected = this.getAutoDetectedField(fieldType);

    // Show auto-detected field with its sample value
    let autoDetectLabel = 'Best match';
    if (autoDetected) {
      const sampleValue = this.formatFieldValue(autoDetected.value);
      autoDetectLabel = `→ ${autoDetected.key}: ${sampleValue}`;
    }

    let html = `
      <div class="field-option auto-detect ${!currentValue ? 'selected' : ''}" data-value="">
        <span class="field-option-key">Auto-detect</span>
        <span class="field-option-value">${autoDetectLabel}</span>
        ${!currentValue ? '<span class="field-option-check">✓</span>' : ''}
      </div>
    `;

    // Add all available fields
    for (const field of this.availableFields) {
      const isSelected = currentValue === field.path;
      const valueClass = typeof field.value === 'string' ? 'string' :
                        typeof field.value === 'number' ? 'number' : '';
      const displayValue = this.formatFieldValue(field.value);

      html += `
        <div class="field-option ${isSelected ? 'selected' : ''}" data-value="${field.path}">
          <span class="field-option-key">${field.path}</span>
          <span class="field-option-value ${valueClass}">${displayValue}</span>
          ${isSelected ? '<span class="field-option-check">✓</span>' : ''}
        </div>
      `;
    }

    listEl.innerHTML = html;

    // Add click handlers
    listEl.querySelectorAll('.field-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectField(fieldType, option.dataset.value);
      });
    });
  }

  /**
   * Select a field for a field type
   */
  selectField(fieldType, value) {
    // Update hidden input
    const inputMap = {
      eventName: this.elements.fieldEventName,
      timestamp: this.elements.fieldTimestamp,
      userId: this.elements.fieldUserId,
      propertyContainer: this.elements.fieldPropertyContainer
    };
    inputMap[fieldType].value = value;

    // Update picker display
    this.updateFieldPickerDisplay(fieldType, value);

    // Close dropdown
    this.closeFieldPicker();
  }

  /**
   * Update field picker display
   * @param {string} fieldType - Type of field
   * @param {string} value - Field path value
   * @param {boolean} isAutoDetected - Whether the value was auto-detected (shows hint)
   */
  updateFieldPickerDisplay(fieldType, value, isAutoDetected = false) {
    const pickerMap = {
      eventName: this.elements.fieldPickerEventName,
      timestamp: this.elements.fieldPickerTimestamp,
      userId: this.elements.fieldPickerUserId,
      propertyContainer: this.elements.fieldPickerPropertyContainer
    };
    const picker = pickerMap[fieldType];
    if (!picker) return;
    const valueSpan = picker.querySelector('.field-picker-value');

    if (!value) {
      // No field detected or available
      valueSpan.textContent = 'not detected';
      valueSpan.classList.add('empty');
      valueSpan.classList.remove('auto');
      picker.classList.remove('selected');
    } else {
      // Show the field path with sample value
      const field = this.availableFields.find(f => f.path === value);
      const sample = field ? `: ${this.formatFieldValue(field.value)}` : '';
      const autoHint = isAutoDetected ? '<span class="auto-hint">(detected)</span> ' : '';
      valueSpan.innerHTML = `${autoHint}<strong>${value}</strong><span class="field-sample">${sample}</span>`;
      valueSpan.classList.remove('empty');
      valueSpan.classList.remove('auto');
      picker.classList.add('selected');
    }
  }

  /**
   * Get current value for a field type
   */
  getFieldValue(fieldType) {
    const inputMap = {
      eventName: this.elements.fieldEventName,
      timestamp: this.elements.fieldTimestamp,
      userId: this.elements.fieldUserId,
      propertyContainer: this.elements.fieldPropertyContainer
    };
    return inputMap[fieldType]?.value || '';
  }

  /**
   * Get auto-detected field for a field type
   */
  getAutoDetectedField(fieldType) {
    const detectionOrder = {
      eventName: ['event', 'eventName', 'event_name', 'action', 'name', 'type', 'noun'],
      timestamp: ['timestamp', 'client_timestamp', 'time', 'ts', 'sentAt', 'created_at'],
      userId: ['userId', 'user_id', 'uid', 'anonymousId', 'anonymous_id'],
      propertyContainer: ['properties', 'props', 'event_data', 'data', 'payload', 'params', 'attributes']
    };

    const fields = detectionOrder[fieldType] || [];
    for (const key of fields) {
      const match = this.availableFields.find(f => f.path === key || f.path.endsWith('.' + key));
      if (match) return match;
    }
    return null;
  }

  /**
   * Format field value for display
   */
  formatFieldValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return value.length > 30 ? `"${value.slice(0, 30)}..."` : `"${value}"`;
    }
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
  }

  /**
   * Extract all fields from a payload object (flattened)
   */
  extractFieldsFromPayload(payload, prefix = '') {
    const fields = [];

    if (!payload || typeof payload !== 'object') return fields;

    // Handle arrays - look for the first item
    if (Array.isArray(payload)) {
      if (payload.length > 0 && typeof payload[0] === 'object') {
        return this.extractFieldsFromPayload(payload[0], prefix);
      }
      return fields;
    }

    for (const [key, value] of Object.entries(payload)) {
      const path = prefix ? `${prefix}.${key}` : key;

      // Add this field if it's a primitive
      if (value === null || typeof value !== 'object') {
        fields.push({ path, key, value, type: typeof value });
      } else if (Array.isArray(value)) {
        // For arrays, show the array itself
        fields.push({ path, key, value, type: 'array' });
        // And recurse into first element if it's an object
        if (value.length > 0 && typeof value[0] === 'object') {
          fields.push(...this.extractFieldsFromPayload(value[0], `${path}[0]`));
        }
      } else {
        // For objects, add the object itself (useful for propertyContainer selection)
        // then recurse into its children
        fields.push({ path, key, value, type: 'object' });
        fields.push(...this.extractFieldsFromPayload(value, path));
      }
    }

    return fields;
  }

  /**
   * Initialize field pickers with sample payload
   * Auto-detects fields and SAVES them concretely (not left empty)
   */
  initFieldPickers(payload) {
    console.log('[SourceManager] initFieldPickers called with:', payload);
    this.samplePayload = payload;
    this.availableFields = payload ? this.extractFieldsFromPayload(payload) : [];
    console.log('[SourceManager] Extracted fields:', this.availableFields);

    // Auto-detect and SET concrete values (not empty)
    const fieldTypes = ['eventName', 'timestamp', 'userId', 'propertyContainer'];
    const inputMap = {
      eventName: this.elements.fieldEventName,
      timestamp: this.elements.fieldTimestamp,
      userId: this.elements.fieldUserId,
      propertyContainer: this.elements.fieldPropertyContainer
    };

    for (const fieldType of fieldTypes) {
      const detected = this.getAutoDetectedField(fieldType);
      const value = detected ? detected.path : '';
      inputMap[fieldType].value = value;
      this.updateFieldPickerDisplay(fieldType, value, detected !== null);
    }

    console.log('[SourceManager] Initialized field pickers with', this.availableFields.length, 'fields');
  }

  /**
   * Reset field pickers (no sample payload available)
   */
  resetFieldPickers() {
    this.samplePayload = null;
    this.availableFields = [];

    this.elements.fieldEventName.value = '';
    this.elements.fieldTimestamp.value = '';
    this.elements.fieldUserId.value = '';
    this.elements.fieldPropertyContainer.value = '';

    this.updateFieldPickerDisplay('eventName', '', false);
    this.updateFieldPickerDisplay('timestamp', '', false);
    this.updateFieldPickerDisplay('userId', '', false);
    this.updateFieldPickerDisplay('propertyContainer', '', false);
  }
}
