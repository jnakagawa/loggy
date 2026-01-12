/**
 * ConfigManager - Manages all analytics source configurations
 *
 * Responsibilities:
 * - Load default and user-created source configs
 * - Match URLs to sources by domain
 * - Track unmatched analytics requests for auto-add suggestions
 * - Auto-detect field mappings from sample payloads
 * - Import/export configurations
 * - Persist to chrome.storage
 */

import { SourceConfig } from './source-config.js';
import { DEFAULT_SOURCES, looksLikeAnalyticsEndpoint } from './default-sources.js';

export class ConfigManager {
  constructor() {
    this.sources = new Map();
    this.loaded = false;
    // Track unmatched analytics requests for suggestions
    this.unmatchedDomains = new Map(); // domain -> { url, payload, count, lastSeen }
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

    // Overlay user configurations
    try {
      const result = await chrome.storage.local.get('sourceConfig');
      if (result.sourceConfig) {
        for (const [id, config] of Object.entries(result.sourceConfig)) {
          // For system sources, ensure domain is preserved from defaults
          if (DEFAULT_SOURCES[id] && !config.domain) {
            config.domain = DEFAULT_SOURCES[id].domain;
          }
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
   * Find the best matching source for a URL using priority matching
   * More specific matches (domain + URL pattern) win over generic domain-only matches
   * @param {string} url - URL to match
   * @returns {SourceConfig|null} - Best matching source, or null if no match
   */
  findSourceForUrl(url) {
    const urlDomain = SourceConfig.extractBaseDomainFromUrl(url);
    if (!urlDomain) return null;

    let bestMatch = null;
    let bestScore = 0;

    // Find source with highest match score
    for (const [id, source] of this.sources) {
      if (!source.enabled) continue;

      const score = source.getMatchScore(url);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = source;
      }
    }

    return bestMatch;
  }

  /**
   * Find source by domain
   * @param {string} domain - Base domain to find
   * @returns {SourceConfig|null} - Matching source
   */
  findSourceByDomain(domain) {
    const normalizedDomain = domain.toLowerCase();
    for (const [id, source] of this.sources) {
      if (source.domain.toLowerCase() === normalizedDomain) {
        return source;
      }
    }
    return null;
  }

  /**
   * Track an unmatched analytics request (for auto-add suggestions)
   * @param {string} url - Request URL
   * @param {object} payload - Request payload
   */
  trackUnmatchedRequest(url, payload) {
    // Only track if it looks like an analytics endpoint
    if (!looksLikeAnalyticsEndpoint(url)) {
      return;
    }

    const domain = SourceConfig.extractBaseDomainFromUrl(url);
    if (!domain) return;

    // Don't track if we have a source for this domain
    if (this.findSourceByDomain(domain)) {
      return;
    }

    const existing = this.unmatchedDomains.get(domain);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      // Keep the most recent payload
      if (payload) existing.payload = payload;
    } else {
      this.unmatchedDomains.set(domain, {
        domain,
        url,
        payload,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }
  }

  /**
   * Get unmatched domains (for suggestion UI)
   * @returns {Array<object>} - Unmatched domain info
   */
  getUnmatchedDomains() {
    // Return sorted by count (most frequent first)
    return Array.from(this.unmatchedDomains.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Clear unmatched domain tracking
   * @param {string} domain - Optional specific domain to clear
   */
  clearUnmatchedDomain(domain = null) {
    if (domain) {
      this.unmatchedDomains.delete(domain);
    } else {
      this.unmatchedDomains.clear();
    }
  }

  /**
   * Merge unmatched domain from proxy server
   * @param {object} unmatched - Unmatched domain info from proxy
   */
  mergeUnmatchedDomain(unmatched) {
    const domain = unmatched.domain;
    if (!domain) return;

    // Skip if we already have a source for this domain
    if (this.findSourceByDomain(domain)) return;

    const existing = this.unmatchedDomains.get(domain);
    if (existing) {
      // Merge counts and update timestamps
      existing.count = Math.max(existing.count, unmatched.count || 1);
      existing.lastSeen = Math.max(existing.lastSeen, unmatched.lastSeen || Date.now());
      if (unmatched.payload) existing.payload = unmatched.payload;
    } else {
      // Add new unmatched domain
      this.unmatchedDomains.set(domain, {
        domain: unmatched.domain,
        url: unmatched.url,
        payload: unmatched.payload,
        count: unmatched.count || 1,
        firstSeen: unmatched.firstSeen || Date.now(),
        lastSeen: unmatched.lastSeen || Date.now()
      });
    }
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
    // Clear from unmatched if we're adding a source for this domain
    this.clearUnmatchedDomain(source.domain);
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
   * Create a source from a domain and optional sample payload
   * Auto-detects field mappings from the payload using the parser
   *
   * @param {string} domain - Base domain (e.g., "joinhoney.com")
   * @param {object} payload - Optional sample payload for field detection
   * @returns {SourceConfig} - New source config
   */
  createFromDomain(domain, payload = null) {
    const id = domain.replace(/\./g, '-');
    const name = this.humanizeDomain(domain);
    const icon = this.selectIcon(domain);
    const color = new SourceConfig(id).generateDefaultColor();

    // Field mappings are optional - parser auto-detects
    // Only add if user explicitly selects fields
    const fieldMappings = {};

    return new SourceConfig(id, {
      name,
      color,
      icon,
      domain,
      fieldMappings,
      createdBy: 'user',
      createdAt: new Date().toISOString()
    });
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
      'honey': '🍯',
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
