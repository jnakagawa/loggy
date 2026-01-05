/**
 * ConfigManager for Node.js (Proxy Server)
 *
 * This is a simplified version of ConfigManager that works in Node.js
 * environment, using file system for storage instead of chrome.storage.
 */

const fs = require('fs');
const path = require('path');

// Import source config and defaults (need to convert to CommonJS)
// For now, we'll inline the necessary parts
class SourceConfig {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.enabled = config.enabled ?? true;
    this.color = config.color || '#6366F1';
    this.icon = config.icon || '📊';
    this.urlPatterns = config.urlPatterns || [];
    this.fieldMappings = config.fieldMappings || {};
    this.parser = config.parser || 'generic';
    this.stats = config.stats || { eventsCapture: 0 };
  }

  matches(url) {
    if (!this.enabled) return false;
    return this.urlPatterns.some(p => this.matchPattern(url, p));
  }

  matchPattern(url, pattern) {
    try {
      switch (pattern.type) {
        case 'contains':
          return url.toLowerCase().includes(pattern.pattern.toLowerCase());
        case 'regex':
          return new RegExp(pattern.pattern, 'i').test(url);
        case 'exact':
          return url === pattern.pattern;
        default:
          return false;
      }
    } catch (err) {
      return false;
    }
  }

  extractFields(payload) {
    const extracted = {};

    for (const [field, paths] of Object.entries(this.fieldMappings)) {
      if (field === 'properties' && paths === 'all') {
        extracted.properties = { ...payload };
        continue;
      }

      if (Array.isArray(paths)) {
        for (const pathStr of paths) {
          const value = this.getNestedValue(payload, pathStr);
          if (value !== undefined && value !== null) {
            extracted[field] = value;
            break;
          }
        }
      } else if (typeof paths === 'string') {
        const value = this.getNestedValue(payload, paths);
        if (value !== undefined && value !== null) {
          extracted[field] = value;
        }
      }
    }

    return extracted;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
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
      urlPatterns: this.urlPatterns,
      fieldMappings: this.fieldMappings,
      parser: this.parser,
      stats: this.stats
    };
  }
}

// Default sources (same as default-sources.js but in CommonJS)
const DEFAULT_SOURCES = {
  'reddit': {
    name: 'Reddit',
    color: '#FF4500',
    icon: '🔵',
    enabled: true,
    urlPatterns: [
      { pattern: 'reddit.com/events', type: 'contains' },
      { pattern: 'reddit.com/svc/shreddit/events', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['action', 'event', 'noun'],
      timestamp: ['client_timestamp', 'timestamp'],
      userId: ['user_id'],
      properties: 'all'
    },
    parser: 'reddit'
  },
  'segment': {
    name: 'Segment',
    color: '#52BD95',
    icon: '📊',
    enabled: true,
    urlPatterns: [
      { pattern: 'segment.io/v1/', type: 'contains' },
      { pattern: 'segment.com/v1/', type: 'contains' },
      { pattern: '/v1/batch', type: 'contains' }
    ],
    parser: 'segment'
  },
  'pie': {
    name: 'Pie',
    color: '#FF6B6B',
    icon: '🥧',
    enabled: true,
    urlPatterns: [
      { pattern: 'pie.org/v1/batch', type: 'contains' },
      { pattern: 'pie-staging.org/v1/batch', type: 'contains' }
    ],
    parser: 'segment'
  }
};

const FALLBACK_CONFIG = {
  name: 'Generic Analytics',
  enabled: true,
  urlPatterns: [
    { pattern: '/analytics', type: 'contains' },
    { pattern: '/events', type: 'contains' },
    { pattern: '/evs', type: 'contains' },
    { pattern: '/track', type: 'contains' },
    { pattern: '/collect', type: 'contains' }
  ],
  parser: 'generic'
};

class ConfigManagerNode {
  constructor(configPath = null) {
    this.sources = new Map();
    this.fallback = null;
    this.configPath = configPath || path.join(__dirname, 'proxy-sources.json');
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;

    // Load default sources
    for (const [id, config] of Object.entries(DEFAULT_SOURCES)) {
      this.sources.set(id, new SourceConfig(id, config));
    }

    this.fallback = new SourceConfig('fallback', FALLBACK_CONFIG);

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

  findSourceForUrl(url) {
    for (const [id, source] of this.sources) {
      if (source.enabled && source.matches(url)) {
        return source;
      }
    }

    if (this.fallback && this.fallback.enabled && this.fallback.matches(url)) {
      return this.fallback;
    }

    return null;
  }

  getAllSources() {
    return Array.from(this.sources.values());
  }
}

module.exports = { ConfigManagerNode, SourceConfig };
