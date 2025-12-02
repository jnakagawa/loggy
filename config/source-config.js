/**
 * SourceConfig - Represents an analytics source configuration
 *
 * Each source (e.g., Reddit, Segment, custom apps) has:
 * - URL patterns to match
 * - Field mappings for extracting event data
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
    this.urlPatterns = config.urlPatterns || [];
    this.fieldMappings = config.fieldMappings || {};
    this.parser = config.parser || 'generic';
    this.createdBy = config.createdBy || 'system';
    this.createdAt = config.createdAt || new Date().toISOString();
    this.stats = config.stats || {
      eventsCapture: 0,
      lastCaptured: null
    };
  }

  /**
   * Check if this source matches a URL
   * @param {string} url - URL to test
   * @returns {boolean} - True if URL matches any pattern
   */
  matches(url) {
    if (!this.enabled) return false;
    return this.urlPatterns.some(p => this.matchPattern(url, p));
  }

  /**
   * Match a single pattern against a URL
   * @param {string} url - URL to test
   * @param {object} pattern - Pattern object with { pattern, type }
   * @returns {boolean} - True if pattern matches
   */
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
          console.warn(`Unknown pattern type: ${pattern.type}`);
          return false;
      }
    } catch (err) {
      console.error(`Error matching pattern ${pattern.pattern}:`, err);
      return false;
    }
  }

  /**
   * Extract fields from a payload based on field mappings
   * @param {object} payload - Raw event payload
   * @returns {object} - Extracted fields
   */
  extractFields(payload) {
    const extracted = {};

    for (const [field, paths] of Object.entries(this.fieldMappings)) {
      if (field === 'properties' && paths === 'all') {
        // Include all fields as properties
        extracted.properties = { ...payload };
        continue;
      }

      if (Array.isArray(paths)) {
        // Try each path in order until we find a value
        for (const path of paths) {
          const value = this.getNestedValue(payload, path);
          if (value !== undefined && value !== null) {
            extracted[field] = value;
            break;
          }
        }
      } else if (typeof paths === 'string') {
        // Single path
        const value = this.getNestedValue(payload, paths);
        if (value !== undefined && value !== null) {
          extracted[field] = value;
        }
      }
    }

    return extracted;
  }

  /**
   * Get a nested value from an object using dot notation
   * @param {object} obj - Object to query
   * @param {string} path - Dot-separated path (e.g., 'user.id')
   * @returns {*} - Value at path, or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
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
      urlPatterns: this.urlPatterns,
      fieldMappings: this.fieldMappings,
      parser: this.parser,
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
