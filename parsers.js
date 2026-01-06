// Smart Universal Analytics Parser
// Auto-detects event structure without hardcoded parser types
// Uses intelligent field detection with optional overrides

export class AnalyticsParser {
  // Field detection order - checked in sequence until found
  static FIELD_DETECTION = {
    eventName: ['event', 'eventName', 'event_name', 'code', 'action', 'name', 'type', 'eventType'],
    timestamp: ['timestamp', 'client_ts', 'client_timestamp', 'time', 'ts', 'sentAt', 'sent_at', 'created_at'],
    userId: ['userId', 'user_id', 'uid', 'anonymousId', 'anonymous_id', 'anonId'],
    properties: ['properties', 'props', 'data', 'payload', 'params', 'attributes']
  };

  // Array field detection - where events might be stored
  static EVENT_ARRAY_FIELDS = ['batch', 'events', 'data', 'items', 'records'];

  /**
   * Main parsing function - smart auto-detection
   * @param {string} url - Request URL
   * @param {object} requestBody - Request body
   * @param {string} initiator - Request initiator
   * @param {SourceConfig} source - Source configuration (optional, for field overrides)
   */
  static parseRequest(url, requestBody, initiator, source = null) {
    try {
      const data = this.decodeRequestBody(requestBody);
      if (!data || typeof data !== 'object') {
        return [];
      }

      const events = this.parsePayload(data, source?.fieldMappings || {});

      // Add metadata and source info to all events
      return events.map(event => ({
        ...event,
        _source: source?.id || 'unknown',
        _sourceName: source?.name || 'Unknown',
        _sourceIcon: source?.icon || '📊',
        _sourceColor: source?.color || '#6366F1',
        _metadata: {
          capturedAt: new Date().toISOString(),
          url: url,
          initiator: initiator
        }
      }));
    } catch (err) {
      console.error('[Parser] Error parsing request:', err);
      return [];
    }
  }

  /**
   * Parse payload with smart auto-detection
   * @param {object} data - Decoded request body
   * @param {object} fieldMappings - Optional field overrides { eventName: 'code', timestamp: 'client_ts' }
   */
  static parsePayload(data, fieldMappings = {}) {
    const events = [];

    // Step 1: Find events array (batch, events, or root)
    const eventArray = this.findEventArray(data);

    if (eventArray && Array.isArray(eventArray)) {
      // Process each event in the array
      eventArray.forEach(item => {
        const event = this.extractEvent(item, fieldMappings, data);
        if (event) {
          events.push(event);
        }
      });
    } else {
      // Single event - process the root object
      const event = this.extractEvent(data, fieldMappings);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Find the events array in a payload
   */
  static findEventArray(data) {
    for (const field of this.EVENT_ARRAY_FIELDS) {
      if (data[field] && Array.isArray(data[field])) {
        return data[field];
      }
    }
    // Check if data itself is an array
    if (Array.isArray(data)) {
      return data;
    }
    return null;
  }

  /**
   * Extract a single event from data
   * @param {object} item - Event data
   * @param {object} fieldMappings - Optional field overrides
   * @param {object} parentData - Parent data for context extraction
   */
  static extractEvent(item, fieldMappings = {}, parentData = null) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    // Extract fields using mappings (overrides) or auto-detection
    const eventName = this.extractField(item, 'eventName', fieldMappings);
    const timestamp = this.extractField(item, 'timestamp', fieldMappings) || new Date().toISOString();
    const userId = this.extractField(item, 'userId', fieldMappings) ||
                   (parentData ? this.extractField(parentData, 'userId', fieldMappings) : null);

    // Get properties - either from a nested properties field or the item itself
    const propertiesField = this.findField(item, this.FIELD_DETECTION.properties);
    const properties = propertiesField ? item[propertiesField] : this.extractProperties(item);

    // Extract context if present (common in Segment-style events)
    const context = item.context || parentData?.context || {};

    return {
      id: this.generateId(),
      timestamp: this.normalizeTimestamp(timestamp),
      event: eventName || 'unknown',
      properties: properties,
      context: context,
      userId: userId,
      anonymousId: item.anonymousId || parentData?.anonymousId,
      type: item.type || 'track'
    };
  }

  /**
   * Extract a field using mapping override or auto-detection
   * @param {object} data - Data to extract from
   * @param {string} fieldType - Type of field ('eventName', 'timestamp', 'userId')
   * @param {object} fieldMappings - Optional overrides
   */
  static extractField(data, fieldType, fieldMappings = {}) {
    // Check for override mapping first
    if (fieldMappings[fieldType]) {
      const mappedField = fieldMappings[fieldType];
      const value = this.getNestedValue(data, mappedField);
      if (value !== undefined) {
        return value;
      }
    }

    // Fall back to auto-detection
    const detectionFields = this.FIELD_DETECTION[fieldType] || [];
    return this.findFieldValue(data, detectionFields);
  }

  /**
   * Find first matching field name in data
   */
  static findField(data, fields) {
    for (const field of fields) {
      if (data[field] !== undefined) {
        return field;
      }
    }
    return null;
  }

  /**
   * Find first matching field value in data
   */
  static findFieldValue(data, fields) {
    for (const field of fields) {
      const value = this.getNestedValue(data, field);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return null;
  }

  /**
   * Get a potentially nested value from data (supports dot notation and array indexing)
   * Examples: "event", "info.action", "info[0].action", "data[0].items[1].name"
   */
  static getNestedValue(data, path) {
    if (!path || !data) return undefined;

    // Ensure path is a string
    if (typeof path !== 'string') return undefined;

    // Parse path into segments, handling both dot notation and array indexing
    // "info[0].action" -> ["info", "0", "action"]
    const parts = path.split(/\.|\[|\]/).filter(p => p !== '');
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      // Try as array index if it's a number
      const index = parseInt(part, 10);
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Normalize timestamp to ISO string
   */
  static normalizeTimestamp(timestamp) {
    if (!timestamp) return new Date().toISOString();

    // Already ISO string
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
      return timestamp;
    }

    // Unix timestamp (seconds or milliseconds)
    if (typeof timestamp === 'number') {
      // If less than a reasonable year (2000), assume it's in seconds
      const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
      return new Date(ms).toISOString();
    }

    // Try to parse as date
    try {
      return new Date(timestamp).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Extract properties from object, excluding metadata fields
   */
  static extractProperties(obj) {
    const excludeKeys = [
      'id', 'timestamp', 'time', 'ts', 'sentAt', 'sent_at', 'created_at',
      'userId', 'user_id', 'anonymousId', 'anonymous_id',
      'context', '_metadata', '_parser', '_source'
    ];

    const props = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!excludeKeys.includes(key)) {
        props[key] = value;
      }
    }
    return props;
  }

  /**
   * Decode request body from various formats
   */
  static decodeRequestBody(requestBody) {
    if (!requestBody) return null;

    // If already an object, return it
    if (typeof requestBody === 'object' && !requestBody.raw) {
      return requestBody;
    }

    // Handle FormData
    if (requestBody.formData) {
      const formData = {};
      for (const [key, values] of Object.entries(requestBody.formData)) {
        formData[key] = values[0];
      }
      return formData;
    }

    // Handle raw data
    if (requestBody.raw && requestBody.raw[0] && requestBody.raw[0].bytes) {
      const bytes = requestBody.raw[0].bytes;
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(new Uint8Array(bytes));

      // Try to parse as JSON
      try {
        return JSON.parse(text);
      } catch {
        // Return as string if not JSON
        return text;
      }
    }

    return null;
  }

  /**
   * Generate unique ID
   */
  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // ============================================
  // Field Detection Helpers (for auto-add source flow)
  // ============================================

  /**
   * Analyze a payload and detect which fields map to what
   * Returns detected fields and confidence
   * @param {object} data - Payload to analyze
   * @returns {object} Detection results with field mappings
   */
  static detectFields(data) {
    const decoded = this.decodeRequestBody(data);
    if (!decoded || typeof decoded !== 'object') {
      return { success: false, error: 'Invalid payload' };
    }

    const result = {
      success: true,
      eventArray: null,
      fields: {
        eventName: { detected: null, value: null },
        timestamp: { detected: null, value: null },
        userId: { detected: null, value: null }
      },
      sampleEvent: null
    };

    // Find event array
    const arrayField = this.EVENT_ARRAY_FIELDS.find(f => decoded[f] && Array.isArray(decoded[f]));
    if (arrayField) {
      result.eventArray = arrayField;
      result.sampleEvent = decoded[arrayField][0];
    } else if (Array.isArray(decoded)) {
      result.eventArray = 'root';
      result.sampleEvent = decoded[0];
    } else {
      result.sampleEvent = decoded;
    }

    // Detect fields from sample event
    const sample = result.sampleEvent || decoded;

    for (const [fieldType, detectionFields] of Object.entries(this.FIELD_DETECTION)) {
      if (fieldType === 'properties') continue; // Skip properties detection

      const foundField = this.findField(sample, detectionFields);
      if (foundField) {
        result.fields[fieldType] = {
          detected: foundField,
          value: sample[foundField]
        };
      }
    }

    return result;
  }

  /**
   * Get a flat list of all fields in an object (for field picker UI)
   * @param {object} data - Object to flatten
   * @param {string} prefix - Current path prefix
   * @returns {Array<{path: string, value: any, type: string}>}
   */
  static flattenObject(data, prefix = '') {
    const fields = [];

    for (const [key, value] of Object.entries(data || {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      const type = Array.isArray(value) ? 'array' : typeof value;

      fields.push({ path, value, type });

      // Recurse into objects (but not arrays)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        fields.push(...this.flattenObject(value, path));
      }
    }

    return fields;
  }
}
