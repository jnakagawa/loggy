/**
 * Source Manager UI
 * Handles source configuration UI, editing, and management
 */

export class SourceManager {
  constructor() {
    this.sources = [];
    this.currentSource = null;
    this.editingSourceId = null;
    this.init();
  }

  init() {
    console.log('[SourceManager] Initializing...');

    // Get DOM elements
    this.elements = {
      // Tabs
      tabBtns: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('.tab-content'),

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
      testSourceBtn: document.getElementById('testSourceBtn'),

      // Source editor fields
      sourceName: document.getElementById('sourceName'),
      sourceIcon: document.getElementById('sourceIcon'),
      sourceColor: document.getElementById('sourceColor'),
      sourceEnabled: document.getElementById('sourceEnabled'),
      sourceParser: document.getElementById('sourceParser'),
      urlPatternsList: document.getElementById('urlPatternsList'),
      addPatternBtn: document.getElementById('addPatternBtn'),
      fieldEventName: document.getElementById('fieldEventName'),
      fieldTimestamp: document.getElementById('fieldTimestamp'),
      fieldUserId: document.getElementById('fieldUserId'),

      // Stats
      sourceStats: document.getElementById('sourceStats'),
      statsEventsCapture: document.getElementById('statsEventsCapture'),
      statsLastCaptured: document.getElementById('statsLastCaptured')
    };

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
    this.elements.testSourceBtn?.addEventListener('click', () => this.testSource());
    this.elements.addPatternBtn?.addEventListener('click', () => this.addPattern());

    // Close modal on background click
    this.elements.sourceEditorModal?.addEventListener('click', (e) => {
      if (e.target === this.elements.sourceEditorModal) {
        this.closeSourceEditor();
      }
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
      card.addEventListener('click', () => {
        const sourceId = card.dataset.sourceId;
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
          this.openSourceEditor(source);
        }
      });
    });
  }

  renderSourceCard(source) {
    const isEnabled = source.enabled;
    const lastCaptured = source.stats?.lastCaptured
      ? new Date(source.stats.lastCaptured).toLocaleString()
      : 'Never';
    const eventsCount = source.stats?.eventsCapture || 0;

    return `
      <div class="source-card ${!isEnabled ? 'disabled' : ''}" data-source-id="${source.id}">
        <div class="source-icon" style="background-color: ${source.color}20; color: ${source.color};">
          ${source.icon}
        </div>
        <div class="source-info">
          <div class="source-name">${source.name}</div>
          <div class="source-meta">
            <span class="source-badge ${source.createdBy}">${source.createdBy}</span>
            <span>${source.parser}</span>
            <span>${source.urlPatterns.length} pattern${source.urlPatterns.length !== 1 ? 's' : ''}</span>
            <span style="color: ${isEnabled ? '#4caf50' : '#999'}">${isEnabled ? '✓ Enabled' : '✗ Disabled'}</span>
          </div>
          <div class="source-stats">
            ${eventsCount.toLocaleString()} events captured • Last: ${lastCaptured}
          </div>
        </div>
      </div>
    `;
  }

  openSourceEditor(source = null) {
    this.editingSourceId = source ? source.id : null;
    this.currentSource = source;

    if (source) {
      // Editing existing source
      this.elements.sourceEditorTitle.textContent = `Edit Source: ${source.name}`;
      this.elements.sourceName.value = source.name;
      this.elements.sourceIcon.value = source.icon;
      this.elements.sourceColor.value = source.color;
      this.elements.sourceEnabled.checked = source.enabled;
      this.elements.sourceParser.value = source.parser;

      // Field mappings
      this.elements.fieldEventName.value = source.fieldMappings?.eventName?.join(', ') || '';
      this.elements.fieldTimestamp.value = source.fieldMappings?.timestamp?.join(', ') || '';
      this.elements.fieldUserId.value = source.fieldMappings?.userId?.join(', ') || '';

      // URL patterns
      this.renderPatterns(source.urlPatterns || []);

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
      this.elements.sourceIcon.value = '📊';
      this.elements.sourceColor.value = '#6366F1';
      this.elements.sourceEnabled.checked = true;
      this.elements.sourceParser.value = 'generic';
      this.elements.fieldEventName.value = 'event, eventName, event_name, action';
      this.elements.fieldTimestamp.value = 'timestamp, time, ts';
      this.elements.fieldUserId.value = 'user_id, userId, uid';
      this.renderPatterns([]);
      this.elements.sourceStats.style.display = 'none';
      this.elements.deleteSourceBtn.style.display = 'none';
    }

    this.elements.sourceEditorModal.style.display = 'flex';
  }

  closeSourceEditor() {
    this.elements.sourceEditorModal.style.display = 'none';
    this.editingSourceId = null;
    this.currentSource = null;
  }

  renderPatterns(patterns) {
    this.elements.urlPatternsList.innerHTML = '';

    patterns.forEach((pattern, index) => {
      this.addPatternToDOM(pattern.pattern, pattern.type, index);
    });
  }

  addPattern() {
    const patternsCount = this.elements.urlPatternsList.children.length;
    this.addPatternToDOM('', 'contains', patternsCount);
  }

  addPatternToDOM(pattern, type, index) {
    const patternItem = document.createElement('div');
    patternItem.className = 'pattern-item';
    patternItem.dataset.index = index;

    patternItem.innerHTML = `
      <input type="text" class="pattern-value" placeholder="e.g., reddit.com/events" value="${pattern}">
      <select class="pattern-type">
        <option value="contains" ${type === 'contains' ? 'selected' : ''}>Contains</option>
        <option value="regex" ${type === 'regex' ? 'selected' : ''}>Regex</option>
        <option value="exact" ${type === 'exact' ? 'selected' : ''}>Exact</option>
      </select>
      <button type="button" class="remove-pattern-btn">✕</button>
    `;

    const removeBtn = patternItem.querySelector('.remove-pattern-btn');
    removeBtn.addEventListener('click', () => {
      patternItem.remove();
    });

    this.elements.urlPatternsList.appendChild(patternItem);
  }

  async saveSource() {
    // Collect pattern data
    const patterns = [];
    this.elements.urlPatternsList.querySelectorAll('.pattern-item').forEach(item => {
      const pattern = item.querySelector('.pattern-value').value.trim();
      const type = item.querySelector('.pattern-type').value;
      if (pattern) {
        patterns.push({ pattern, type });
      }
    });

    if (patterns.length === 0) {
      alert('Please add at least one URL pattern');
      return;
    }

    // Parse field mappings
    const parseFieldMapping = (value) => {
      return value.split(',').map(v => v.trim()).filter(v => v);
    };

    const sourceData = {
      id: this.editingSourceId || this.elements.sourceName.value.toLowerCase().replace(/\s+/g, '-'),
      name: this.elements.sourceName.value,
      icon: this.elements.sourceIcon.value || '📊',
      color: this.elements.sourceColor.value,
      enabled: this.elements.sourceEnabled.checked,
      parser: this.elements.sourceParser.value,
      urlPatterns: patterns,
      fieldMappings: {
        eventName: parseFieldMapping(this.elements.fieldEventName.value),
        timestamp: parseFieldMapping(this.elements.fieldTimestamp.value),
        userId: parseFieldMapping(this.elements.fieldUserId.value),
        properties: 'all'
      },
      createdBy: this.currentSource?.createdBy || 'user',
      createdAt: this.currentSource?.createdAt || new Date().toISOString(),
      stats: this.currentSource?.stats || { eventsCapture: 0, lastCaptured: null }
    };

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

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'removeSource',
        id: this.editingSourceId
      });

      if (response.success) {
        console.log('[SourceManager] Source deleted:', this.editingSourceId);
        this.closeSourceEditor();
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

  async testSource() {
    // Collect current pattern data
    const patterns = [];
    this.elements.urlPatternsList.querySelectorAll('.pattern-item').forEach(item => {
      const pattern = item.querySelector('.pattern-value').value.trim();
      const type = item.querySelector('.pattern-type').value;
      if (pattern) {
        patterns.push({ pattern, type });
      }
    });

    if (patterns.length === 0) {
      alert('Please add at least one URL pattern to test');
      return;
    }

    // Prompt for test URL
    const testUrl = prompt('Enter a URL to test against these patterns:');
    if (!testUrl) return;

    // Test locally
    const matches = patterns.some(p => {
      try {
        switch (p.type) {
          case 'contains':
            return testUrl.toLowerCase().includes(p.pattern.toLowerCase());
          case 'regex':
            return new RegExp(p.pattern, 'i').test(testUrl);
          case 'exact':
            return testUrl === p.pattern;
          default:
            return false;
        }
      } catch (err) {
        console.error('Error testing pattern:', err);
        return false;
      }
    });

    if (matches) {
      alert('✅ URL matches!\n\nThe URL matches one or more of your patterns.');
    } else {
      alert('❌ No match\n\nThe URL does not match any of your patterns.');
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
          alert(`✅ Successfully imported ${response.count} source(s)`);
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
        console.log(`[SourceManager] ✅ Synced ${result.synced} sources to proxy`);
      }
    } catch (err) {
      // Silently fail if proxy not running
      console.log('[SourceManager] Could not sync sources to proxy:', err.message);
    }
  }
}
