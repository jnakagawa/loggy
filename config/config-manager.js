/**
 * ConfigManager - Manages all analytics source configurations
 *
 * Responsibilities:
 * - Load default and user-created source configs
 * - Match URLs to sources
 * - Auto-detect field mappings from sample payloads
 * - Import/export configurations
 * - Persist to chrome.storage
 */

import { SourceConfig } from './source-config.js';
import { DEFAULT_SOURCES, FALLBACK_CONFIG } from './default-sources.js';

export class ConfigManager {
  constructor() {
    this.sources = new Map();
    this.fallback = null;
    this.loaded = false;
  }

  /**
   * Load configurations from storage and defaults
   * @returns {Promise<void>}
   */
  async load() {
    if (this.loaded) return;

    // Load default sources first
    for (const [id, config] of Object.entries(DEFAULT_SOURCES)) {
      this.sources.set(id, new SourceConfig(id, config));
    }

    // Load fallback config
    this.fallback = new SourceConfig('fallback', FALLBACK_CONFIG);

    // Overlay user configurations
    try {
      const result = await chrome.storage.local.get('sourceConfig');
      if (result.sourceConfig) {
        for (const [id, config] of Object.entries(result.sourceConfig)) {
          this.sources.set(id, SourceConfig.fromJSON(config));
        }
        console.log('[ConfigManager] Loaded', this.sources.size, 'sources from storage');
      }
    } catch (err) {
      console.error('[ConfigManager] Error loading from storage:', err);
    }

    this.loaded = true;
  }

  /**
   * Save all user-created sources to storage
   * @returns {Promise<void>}
   */
  async save() {
    const userSources = {};

    for (const [id, source] of this.sources) {
      // Only save user-created sources (defaults are always loaded fresh)
      if (source.createdBy === 'user') {
        userSources[id] = source.toJSON();
      }
      // Also save modified default sources
      else if (this.isModified(id, source)) {
        userSources[id] = source.toJSON();
      }
    }

    try {
      await chrome.storage.local.set({ sourceConfig: userSources });
      console.log('[ConfigManager] Saved', Object.keys(userSources).length, 'user sources');
    } catch (err) {
      console.error('[ConfigManager] Error saving to storage:', err);
    }
  }

  /**
   * Check if a source has been modified from its default
   * @param {string} id - Source ID
   * @param {SourceConfig} source - Current source
   * @returns {boolean} - True if modified
   */
  isModified(id, source) {
    const defaultSource = DEFAULT_SOURCES[id];
    if (!defaultSource) return false;

    // Simple check: compare JSON strings
    return JSON.stringify(source.toJSON()) !== JSON.stringify(defaultSource);
  }

  /**
   * Find the best matching source for a URL
   * @param {string} url - URL to match
   * @returns {SourceConfig|null} - Matching source, or null for fallback
   */
  findSourceForUrl(url) {
    // Try enabled sources first
    for (const [id, source] of this.sources) {
      if (source.enabled && source.matches(url)) {
        return source;
      }
    }

    // Try fallback
    if (this.fallback && this.fallback.enabled && this.fallback.matches(url)) {
      return this.fallback;
    }

    return null;
  }

  /**
   * Get a source by ID
   * @param {string} id - Source ID
   * @returns {SourceConfig|undefined} - Source config
   */
  getSource(id) {
    return this.sources.get(id);
  }

  /**
   * Get all sources
   * @returns {Array<SourceConfig>} - All sources
   */
  getAllSources() {
    return Array.from(this.sources.values());
  }

  /**
   * Add or update a source
   * @param {SourceConfig} source - Source to add
   * @returns {Promise<void>}
   */
  async addSource(source) {
    this.sources.set(source.id, source);
    await this.save();
  }

  /**
   * Remove a source
   * @param {string} id - Source ID to remove
   * @returns {Promise<boolean>} - True if removed
   */
  async removeSource(id) {
    const existed = this.sources.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }

  /**
   * Create a source from a sample event
   * Auto-detects field mappings from the payload
   *
   * @param {string} url - URL the event came from
   * @param {object} payload - Event payload
   * @returns {SourceConfig} - New source config
   */
  createFromSample(url, payload) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const id = domain.replace(/\./g, '-');

      const fieldMappings = this.guessFieldMappings(payload);
      const name = this.humanizeDomain(domain);
      const icon = this.selectIcon(domain);
      const color = new SourceConfig(id).generateDefaultColor();

      return new SourceConfig(id, {
        name,
        color,
        icon,
        urlPatterns: [
          { pattern: domain, type: 'contains' }
        ],
        fieldMappings,
        parser: 'generic',
        createdBy: 'user',
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[ConfigManager] Error creating from sample:', err);
      return null;
    }
  }

  /**
   * Guess field mappings from a sample payload using heuristics
   * @param {object} payload - Sample payload
   * @returns {object} - Field mappings
   */
  guessFieldMappings(payload) {
    const mappings = {};

    // Common field names for event name
    const eventNameFields = [
      'event', 'eventName', 'event_name', 'name',
      'type', 'action', 'eventType', 'event_type'
    ];

    // Common field names for timestamp
    const timestampFields = [
      'timestamp', 'time', 'ts', 'sentAt', 'sent_at',
      'client_timestamp', 'event_timestamp', 'created_at'
    ];

    // Common field names for user ID
    const userIdFields = [
      'user_id', 'userId', 'uid', 'user.id', 'user_id',
      'anonymous_id', 'anonymousId', 'distinct_id'
    ];

    // Find matching fields
    mappings.eventName = this.findMatchingFields(payload, eventNameFields);
    mappings.timestamp = this.findMatchingFields(payload, timestampFields);
    mappings.userId = this.findMatchingFields(payload, userIdFields);

    // Include all other fields as properties
    mappings.properties = 'all';

    return mappings;
  }

  /**
   * Find which field names exist in the payload
   * @param {object} payload - Payload to search
   * @param {Array<string>} candidateFields - Field names to try
   * @returns {Array<string>} - Fields that exist
   */
  findMatchingFields(payload, candidateFields) {
    const found = [];

    for (const field of candidateFields) {
      if (this.hasField(payload, field)) {
        found.push(field);
      }
    }

    return found;
  }

  /**
   * Check if a field exists in a payload (supports dot notation)
   * @param {object} payload - Payload to search
   * @param {string} field - Field path (e.g., 'user.id')
   * @returns {boolean} - True if field exists
   */
  hasField(payload, field) {
    const keys = field.split('.');
    let current = payload;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert domain to human-readable name
   * @param {string} domain - Domain name
   * @returns {string} - Human-readable name
   */
  humanizeDomain(domain) {
    // Remove common TLDs
    let name = domain.replace(/\.(com|org|io|co|net)$/, '');

    // Split on dots and hyphens, capitalize each word
    name = name.split(/[.-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return name;
  }

  /**
   * Select an appropriate icon for a domain
   * @param {string} domain - Domain name
   * @returns {string} - Emoji icon
   */
  selectIcon(domain) {
    const iconMap = {
      'reddit': '🔵',
      'segment': '📊',
      'google': '📈',
      'mixpanel': '🔮',
      'amplitude': '📡',
      'facebook': '📘',
      'twitter': '🐦',
      'linkedin': '💼',
      'github': '🐙',
      'analytics': '📊',
      'track': '📍',
      'api': '⚡'
    };

    for (const [keyword, icon] of Object.entries(iconMap)) {
      if (domain.toLowerCase().includes(keyword)) {
        return icon;
      }
    }

    return '📊'; // Default icon
  }

  /**
   * Export all user-created sources as JSON
   * @returns {string} - JSON string
   */
  export() {
    const userSources = [];

    for (const [id, source] of this.sources) {
      if (source.createdBy === 'user') {
        userSources.push(source.toJSON());
      }
    }

    return JSON.stringify(userSources, null, 2);
  }

  /**
   * Import sources from JSON
   * @param {string} json - JSON string with source configs
   * @returns {Promise<number>} - Number of sources imported
   */
  async import(json) {
    try {
      const configs = JSON.parse(json);
      let imported = 0;

      for (const config of configs) {
        const source = SourceConfig.fromJSON(config);
        this.sources.set(source.id, source);
        imported++;
      }

      await this.save();
      return imported;
    } catch (err) {
      console.error('[ConfigManager] Error importing:', err);
      throw new Error(`Import failed: ${err.message}`);
    }
  }

  /**
   * Reset all sources to defaults
   * @returns {Promise<void>}
   */
  async resetToDefaults() {
    this.sources.clear();

    for (const [id, config] of Object.entries(DEFAULT_SOURCES)) {
      this.sources.set(id, new SourceConfig(id, config));
    }

    await chrome.storage.local.remove('sourceConfig');
    console.log('[ConfigManager] Reset to default sources');
  }

  /**
   * Get statistics about all sources
   * @returns {object} - Statistics
   */
  getStats() {
    const stats = {
      totalSources: this.sources.size,
      enabledSources: 0,
      userSources: 0,
      totalEvents: 0
    };

    for (const [id, source] of this.sources) {
      if (source.enabled) stats.enabledSources++;
      if (source.createdBy === 'user') stats.userSources++;
      stats.totalEvents += source.stats.eventsCapture;
    }

    return stats;
  }
}
