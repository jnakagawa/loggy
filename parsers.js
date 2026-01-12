// Smart Universal Analytics Parser
// Auto-detects event structure with user-configurable field mappings
// Supports nested paths and propertyContainer for envelope-style payloads

export class AnalyticsParser {
  // Field paths to search for auto-detection (supports nested paths)
  // Ordered by priority: most common/standard patterns first
  static FIELD_PATHS = {
    eventName: [
      // Direct fields (most common)
      'event',
      'eventName',
      'event_name',
      'name',
      'action',
      'code',
      'type',
      'eventType',
      // Nested in common wrapper fields
      'event_data.event',
      'event_data.eventName',
      'event_data.event_name',
      'data.event',
      'data.eventName'
    ],
    timestamp: [
      // Direct fields
      'timestamp',
      'time',
      'ts',
      'sentAt',
      'sent_at',
      'created_at',
      'client_ts',
      'client_timestamp',
      // Nested in context
      'context.timestamp',
      'context.time',
      // Nested in wrappers
      'event_data.context.timestamp',
      'event_data.timestamp',
      'data.timestamp',
      'data.context.timestamp'
    ],
    userId: [
      // Direct fields
      'userId',
      'user_id',
      'uid',
      'anonymousId',
      'anonymous_id',
      'anonId',
      // Nested in context
      'context.userId',
      'context.user_id',
      // Nested in wrappers
      'event_data.context.user_id',
      'event_data.user_id',
      'data.user_id'
    ]
  };

  // Property containers - where event payload might live
  static PROPERTY_CONTAINERS = ['properties', 'props', 'event_data', 'data', 'payload', 'params', 'attributes'];

  // Array field detection - where batched events might be stored
  static EVENT_ARRAY_FIELDS = ['batch', 'events', 'data', 'items', 'records', 'messages'];

  /**
   * Main parsing function - smart auto-detection (async for decompression)
   * @param {string} url - Request URL
   * @param {object} requestBody - Request body
   * @param {string} initiator - Request initiator
   * @param {SourceConfig} source - Source configuration (optional, for field overrides)
   */
  static async parseRequest(url, requestBody, initiator, source = null) {
    try {
      const data = await this.decodeRequestBodyAsync(requestBody);

      if (!data || typeof data !== 'object') {
        return [];
      }

      const events = this.parsePayload(data, source?.fieldMappings || {});

      // Add metadata, source info, and raw payload to all events
      return events.map(event => ({
        ...event,
        _source: source?.id || 'unknown',
        _sourceName: source?.name || 'Unknown',
        _sourceIcon: source?.icon || '📊',
        _sourceColor: source?.color || '#6366F1',
        _rawPayload: data,  // Store original payload for "show raw" and field pickers
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
   * Uses fieldMappings paths if configured, otherwise auto-detects
   * @param {object} item - Event data
   * @param {object} fieldMappings - Field path overrides (eventName, timestamp, userId, propertyContainer)
   * @param {object} parentData - Parent data for context extraction
   */
  static extractEvent(item, fieldMappings = {}, parentData = null) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    // Extract event name using configured path or auto-detect
    const eventName = this.extractField(item, 'eventName', fieldMappings);

    // Extract timestamp using configured path or auto-detect
    const timestamp = this.extractField(item, 'timestamp', fieldMappings) || new Date().toISOString();

    // Extract userId using configured path or auto-detect
    const userId = this.extractField(item, 'userId', fieldMappings) ||
                   (parentData ? this.extractField(parentData, 'userId', fieldMappings) : null);

    // Get properties from configured container path or auto-detect
    let properties;
    let context = {};

    if (fieldMappings.propertyContainer) {
      // User specified where properties live - use that path
      const container = this.getNestedValue(item, fieldMappings.propertyContainer);
      if (container && typeof container === 'object') {
        // Extract context separately if it exists in the container
        context = container.context || {};
        properties = this.extractProperties(container, ['context']);
      } else {
        properties = {};
      }
    } else {
      // Auto-detect: look for known property container fields
      const containerField = this.findField(item, this.PROPERTY_CONTAINERS);
      if (containerField) {
        const container = item[containerField];
        if (container && typeof container === 'object') {
          context = container.context || item.context || {};
          properties = this.extractProperties(container, ['context']);
        } else {
          properties = this.extractProperties(item);
        }
      } else {
        // No container found - use item itself as properties
        context = item.context || parentData?.context || {};
        properties = this.extractProperties(item);
      }
    }

    // Merge parent context if available
    if (parentData?.context && Object.keys(context).length === 0) {
      context = parentData.context;
    }

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
   * @param {object} fieldMappings - Optional overrides with exact paths
   */
  static extractField(data, fieldType, fieldMappings = {}) {
    // Check for configured path first (user-specified)
    if (fieldMappings[fieldType]) {
      const mappedPath = fieldMappings[fieldType];
      const value = this.getNestedValue(data, mappedPath);
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    // Fall back to auto-detection using known paths
    const detectionPaths = this.FIELD_PATHS[fieldType] || [];
    return this.findFieldValue(data, detectionPaths);
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
   * @param {object} obj - Object to extract properties from
   * @param {Array<string>} additionalExclude - Additional keys to exclude
   */
  static extractProperties(obj, additionalExclude = []) {
    const excludeKeys = [
      'id', 'timestamp', 'time', 'ts', 'sentAt', 'sent_at', 'created_at',
      'userId', 'user_id', 'anonymousId', 'anonymous_id',
      'context', '_metadata', '_parser', '_source',
      ...additionalExclude
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
   * Detect compression type from bytes
   */
  static detectCompression(bytes) {
    if (bytes.length < 2) return null;

    // Gzip: 0x1f 0x8b
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return 'gzip';
    }

    // Deflate: 0x78 (0x01, 0x5e, 0x9c, 0xda)
    if (bytes[0] === 0x78 && (bytes[1] === 0x01 || bytes[1] === 0x5e || bytes[1] === 0x9c || bytes[1] === 0xda)) {
      return 'deflate';
    }

    return null;
  }

  /**
   * Decompress bytes using DecompressionStream API
   */
  static async decompressBytes(bytes, format) {
    try {
      const stream = new Response(bytes).body.pipeThrough(new DecompressionStream(format));
      const decompressed = await new Response(stream).arrayBuffer();
      return new Uint8Array(decompressed);
    } catch (e) {
      console.log('[AnalyticsParser] [DEBUG] Decompression failed:', e.message);
      return null;
    }
  }

  /**
   * Decode request body from various formats (async for decompression support)
   */
  static async decodeRequestBodyAsync(requestBody) {
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

    // Handle raw data - concatenate ALL chunks (Chrome splits large payloads)
    if (requestBody.raw && requestBody.raw.length > 0) {
      // Calculate total size and allocate buffer
      let totalLength = 0;
      const chunks = [];
      for (const chunk of requestBody.raw) {
        if (chunk.bytes) {
          const arr = new Uint8Array(chunk.bytes);
          chunks.push(arr);
          totalLength += arr.length;
        }
      }

      // Concatenate all chunks into single buffer
      let allBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }

      // Check for compression and decompress if needed
      const compression = this.detectCompression(allBytes);
      if (compression) {
        console.log('[AnalyticsParser] [DEBUG] Detected compression:', compression);
        const decompressed = await this.decompressBytes(allBytes, compression);
        if (decompressed) {
          allBytes = decompressed;
          console.log('[AnalyticsParser] [DEBUG] Decompressed:', totalLength, '->', allBytes.length, 'bytes');
        }
      }

      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(allBytes);

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
   * Decode request body from various formats (sync version, no decompression)
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

    // Handle raw data - concatenate ALL chunks (Chrome splits large payloads)
    if (requestBody.raw && requestBody.raw.length > 0) {
      // Calculate total size and allocate buffer
      let totalLength = 0;
      const chunks = [];
      for (const chunk of requestBody.raw) {
        if (chunk.bytes) {
          const arr = new Uint8Array(chunk.bytes);
          chunks.push(arr);
          totalLength += arr.length;
        }
      }

      // Concatenate all chunks into single buffer
      const allBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(allBytes);

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

    for (const [fieldType, detectionPaths] of Object.entries(this.FIELD_PATHS)) {
      // Find first path that has a value
      for (const path of detectionPaths) {
        const value = this.getNestedValue(sample, path);
        if (value !== undefined && value !== null) {
          result.fields[fieldType] = {
            detected: path,
            value: value
          };
          break;
        }
      }
    }

    // Also detect property container
    const containerField = this.findField(sample, this.PROPERTY_CONTAINERS);
    if (containerField) {
      result.fields.propertyContainer = {
        detected: containerField,
        value: `[${typeof sample[containerField]}]`
      };
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
