/**
 * ConfigManager for Node.js (Proxy Server)
 *
 * This is a simplified version of ConfigManager that works in Node.js
 * environment, using file system for storage instead of chrome.storage.
 * Uses domain-based matching like the browser version.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SourceConfig } from './source-config.js';
import { DEFAULT_SOURCES, looksLikeAnalyticsEndpoint } from './default-sources.js';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ConfigManager for Node.js environment
 */
export class ConfigManagerNode {
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

// Re-export for convenience
export { SourceConfig, looksLikeAnalyticsEndpoint };
