/**
 * SourceConfig - Represents an analytics source configuration
 *
 * Each source (e.g., Reddit, Segment, Honey) has:
 * - A domain to match (e.g., "joinhoney.com" matches all subdomains)
 * - Optional field mappings to override auto-detection
 * - Visual identity (icon, color)
 * - Statistics tracking
 */

export class SourceConfig {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.enabled = config.enabled ?? true;
    this.color = config.color || this.generateDefaultColor();
    this.icon = config.icon || '📊';
    this.domain = config.domain || ''; // Base domain to match (e.g., "joinhoney.com")
    this.fieldMappings = config.fieldMappings || {}; // Optional overrides only
    this.createdBy = config.createdBy || 'system';
    this.createdAt = config.createdAt || new Date().toISOString();
    this.stats = config.stats || {
      eventsCapture: 0,
      lastCaptured: null
    };

    // Migration: Convert old urlPatterns to domain
    if (config.urlPatterns && config.urlPatterns.length > 0 && !config.domain) {
      this.domain = this.migrateToDomain(config.urlPatterns);
    }
  }

  /**
   * Migrate old urlPatterns to a single domain
   * @param {Array} urlPatterns - Old URL patterns array
   * @returns {string} - Extracted domain
   */
  migrateToDomain(urlPatterns) {
    // Try to extract domain from first pattern
    const firstPattern = urlPatterns[0];
    if (!firstPattern) return '';

    const pattern = firstPattern.pattern || firstPattern;

    // If it looks like a URL or domain, extract base domain
    try {
      // Handle full URLs
      if (pattern.includes('://')) {
        const url = new URL(pattern);
        return SourceConfig.extractBaseDomain(url.hostname);
      }
      // Handle domain-like strings (e.g., "s.joinhoney.com" or "s.joinhoney.com/evs")
      if (pattern.includes('.')) {
        // Extract just the domain part (before any path)
        const domainPart = pattern.split('/')[0];
        return SourceConfig.extractBaseDomain(domainPart);
      }
      // Handle patterns like "/v1/batch" - can't extract domain
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extract base domain from hostname (removes subdomains)
   * e.g., "s.joinhoney.com" -> "joinhoney.com"
   * e.g., "api.segment.io" -> "segment.io"
   * @param {string} hostname - Full hostname
   * @returns {string} - Base domain
   */
  static extractBaseDomain(hostname) {
    if (!hostname) return '';

    // Remove port if present
    hostname = hostname.split(':')[0];

    // Handle IP addresses
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname;
    }

    // Split into parts
    const parts = hostname.toLowerCase().split('.');

    // Handle special cases (co.uk, com.au, etc.)
    const specialTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br'];
    const lastTwo = parts.slice(-2).join('.');

    if (specialTLDs.includes(lastTwo) && parts.length > 2) {
      // Return last 3 parts for special TLDs
      return parts.slice(-3).join('.');
    }

    // Standard case: return last 2 parts
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }

    return hostname;
  }

  /**
   * Extract base domain from a full URL
   * @param {string} url - Full URL
   * @returns {string} - Base domain
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
   * Check if this source matches a URL
   * @param {string} url - URL to test
   * @returns {boolean} - True if URL's base domain matches this source's domain
   */
  matches(url) {
    if (!this.enabled || !this.domain) return false;

    const urlDomain = SourceConfig.extractBaseDomainFromUrl(url);
    return urlDomain === this.domain.toLowerCase();
  }

  /**
   * Update statistics after capturing an event
   */
  recordCapture() {
    this.stats.eventsCapture++;
    this.stats.lastCaptured = new Date().toISOString();
  }

  /**
   * Generate a default color based on the source ID
   */
  generateDefaultColor() {
    const colors = [
      '#6366F1', // Indigo
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#F59E0B', // Amber
      '#10B981', // Emerald
      '#3B82F6', // Blue
      '#EF4444', // Red
      '#14B8A6'  // Teal
    ];
    // Simple hash to consistently select a color
    const hash = this.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * Convert to JSON for storage
   * @returns {object} - JSON representation
   */
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
      createdAt: this.createdAt,
      stats: this.stats
    };
  }

  /**
   * Create a SourceConfig from JSON
   * @param {object} json - JSON representation
   * @returns {SourceConfig} - New SourceConfig instance
   */
  static fromJSON(json) {
    return new SourceConfig(json.id, json);
  }
}
