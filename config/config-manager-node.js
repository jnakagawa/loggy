/**
 * ConfigManager for Node.js (Proxy Server)
 *
 * This is a simplified version of ConfigManager that works in Node.js
 * environment, using file system for storage instead of chrome.storage.
 * Uses domain-based matching like the browser version.
 */

const fs = require('fs');
const path = require('path');

/**
 * SourceConfig - Domain-based source configuration
 */
class SourceConfig {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.enabled = config.enabled ?? true;
    this.color = config.color || '#6366F1';
    this.icon = config.icon || '📊';
    this.domain = config.domain || ''; // Base domain to match
    this.fieldMappings = this.sanitizeFieldMappings(config.fieldMappings); // Optional overrides
    this.createdBy = config.createdBy || 'system';
    this.stats = config.stats || { eventsCapture: 0 };

    // Migration: Convert old urlPatterns to domain
    if (config.urlPatterns && config.urlPatterns.length > 0 && !config.domain) {
      this.domain = this.migrateToDomain(config.urlPatterns);
    }
  }

  /**
   * Sanitize fieldMappings - ensure all values are strings, not arrays
   * Prevents corrupted data from breaking event parsing
   */
  sanitizeFieldMappings(mappings) {
    if (!mappings || typeof mappings !== 'object') return {};

    const sanitized = {};
    for (const [key, value] of Object.entries(mappings)) {
      // Only keep string values - arrays are invalid
      if (typeof value === 'string' && value.trim()) {
        sanitized[key] = value.trim();
      }
      // Skip arrays, objects, or empty values
    }
    return sanitized;
  }

  /**
   * Migrate old urlPatterns to a single domain
   */
  migrateToDomain(urlPatterns) {
    const firstPattern = urlPatterns[0];
    if (!firstPattern) return '';

    const pattern = firstPattern.pattern || firstPattern;

    try {
      if (pattern.includes('://')) {
        const url = new URL(pattern);
        return SourceConfig.extractBaseDomain(url.hostname);
      }
      // Handle domain-like strings (e.g., "s.joinhoney.com" or "s.joinhoney.com/evs")
      if (pattern.includes('.')) {
        const domainPart = pattern.split('/')[0];
        return SourceConfig.extractBaseDomain(domainPart);
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extract base domain from hostname (removes subdomains)
   */
  static extractBaseDomain(hostname) {
    if (!hostname) return '';

    hostname = hostname.split(':')[0];

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname;
    }

    const parts = hostname.toLowerCase().split('.');
    const specialTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br'];
    const lastTwo = parts.slice(-2).join('.');

    if (specialTLDs.includes(lastTwo) && parts.length > 2) {
      return parts.slice(-3).join('.');
    }

    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }

    return hostname;
  }

  /**
   * Extract base domain from a full URL
   */
  static extractBaseDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return SourceConfig.extractBaseDomain(urlObj.hostname);
    } catch {
      return '';
    }
  }

  /**
   * Check if this source matches a URL (domain-based)
   */
  matches(url) {
    if (!this.enabled || !this.domain) return false;
    const urlDomain = SourceConfig.extractBaseDomainFromUrl(url);
    return urlDomain === this.domain.toLowerCase();
  }

  recordCapture() {
    this.stats.eventsCapture++;
    this.stats.lastCaptured = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      color: this.color,
      icon: this.icon,
      domain: this.domain,
      fieldMappings: this.fieldMappings,
      createdBy: this.createdBy,
      stats: this.stats
    };
  }
}

/**
 * Default sources with domain-based matching
 */
const DEFAULT_SOURCES = {
  'reddit': {
    name: 'Reddit',
    color: '#FF4500',
    icon: '🔵',
    enabled: true,
    domain: 'reddit.com',
    createdBy: 'system'
  },
  'pie': {
    name: 'Pie',
    color: '#FF6B6B',
    icon: '🥧',
    enabled: true,
    domain: 'pie.org',
    createdBy: 'system'
  },
  'honey': {
    name: 'Honey',
    color: '#FF6B00',
    icon: '🍯',
    enabled: true,
    domain: 'joinhoney.com',
    fieldMappings: {
      eventName: 'code',
      timestamp: 'client_ts'
    },
    createdBy: 'system'
  },
  'chatgpt': {
    name: 'ChatGPT',
    color: '#10A37F',
    icon: '🤖',
    enabled: true,
    domain: 'openai.com',
    createdBy: 'system'
  },
  'grammarly': {
    name: 'Grammarly',
    color: '#15C39A',
    icon: '✍️',
    enabled: true,
    domain: 'grammarly.com',
    createdBy: 'system'
  }
};

/**
 * Analytics-like endpoint patterns for detecting potential sources
 */
const ANALYTICS_ENDPOINT_PATTERNS = [
  '/analytics',
  '/events',
  '/track',
  '/collect',
  '/log',
  '/beacon',
  '/v1/batch',
  '/v1/track',
  '/evs',
  '/telemetry',
  '/metrics'
];

/**
 * Check if a URL looks like an analytics endpoint
 */
function looksLikeAnalyticsEndpoint(url) {
  try {
    const urlObj = new URL(url);
    const pathLower = urlObj.pathname.toLowerCase();
    return ANALYTICS_ENDPOINT_PATTERNS.some(pattern => pathLower.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * ConfigManager for Node.js environment
 */
class ConfigManagerNode {
  constructor(configPath = null) {
    this.sources = new Map();
    this.configPath = configPath || path.join(__dirname, 'proxy-sources.json');
    this.loaded = false;
    this.unmatchedDomains = new Map();
  }

  load() {
    if (this.loaded) return;

    // Load default sources
    for (const [id, config] of Object.entries(DEFAULT_SOURCES)) {
      this.sources.set(id, new SourceConfig(id, config));
    }

    // Load user config from file if it exists
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(data);

        for (const [id, config] of Object.entries(userConfig)) {
          this.sources.set(id, new SourceConfig(id, config));
        }

        console.log('[ConfigManager] Loaded', this.sources.size, 'sources from file');
      }
    } catch (err) {
      console.error('[ConfigManager] Error loading from file:', err.message);
    }

    this.loaded = true;
  }

  save() {
    const userSources = {};

    for (const [id, source] of this.sources) {
      if (source.createdBy === 'user') {
        userSources[id] = source.toJSON();
      }
    }

    try {
      fs.writeFileSync(this.configPath, JSON.stringify(userSources, null, 2));
    } catch (err) {
      console.error('[ConfigManager] Error saving to file:', err.message);
    }
  }

  /**
   * Find source for URL using domain matching
   */
  findSourceForUrl(url) {
    for (const [id, source] of this.sources) {
      if (source.enabled && source.matches(url)) {
        return source;
      }
    }
    return null;
  }

  /**
   * Find source by domain
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
   * Track unmatched analytics request
   */
  trackUnmatchedRequest(url, payload) {
    if (!looksLikeAnalyticsEndpoint(url)) return;

    const domain = SourceConfig.extractBaseDomainFromUrl(url);
    if (!domain || this.findSourceByDomain(domain)) return;

    const existing = this.unmatchedDomains.get(domain);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
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

  getUnmatchedDomains() {
    return Array.from(this.unmatchedDomains.values())
      .sort((a, b) => b.count - a.count);
  }

  getAllSources() {
    return Array.from(this.sources.values());
  }

  addSource(source) {
    this.sources.set(source.id, source);
    if (source.domain) {
      this.unmatchedDomains.delete(source.domain);
    }
    this.save();
  }
}

module.exports = { ConfigManagerNode, SourceConfig, looksLikeAnalyticsEndpoint };
