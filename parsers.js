// Analytics Payload Parsers
// Supports Segment, Google Analytics, GraphQL, and custom formats

export class AnalyticsParser {
  /**
   * Main parsing function - detects format and extracts events
   * @param {string} url - Request URL
   * @param {object} requestBody - Request body
   * @param {string} initiator - Request initiator
   * @param {SourceConfig} source - Source configuration (optional)
   */
  static parseRequest(url, requestBody, initiator, source = null) {
    const events = [];

    // Use source-specific parser if available
    if (source && source.parser) {
      switch (source.parser) {
        case 'segment':
          events.push(...this.parseSegment(requestBody));
          break;
        case 'google-analytics':
          events.push(...this.parseGoogleAnalytics(requestBody));
          break;
        case 'reddit':
          events.push(...this.parseReddit(requestBody));
          break;
        case 'graphql':
          events.push(...this.parseGraphQL(requestBody));
          break;
        case 'generic':
          events.push(...this.parseGenericJSON(requestBody, source));
          break;
        default:
          // Unknown parser, fall back to generic
          events.push(...this.parseGenericJSON(requestBody, source));
      }
    } else {
      // Legacy behavior - auto-detect based on URL
      if (url.includes('segment.') || url.includes('/v1/batch') || url.includes('/v1/track')) {
        events.push(...this.parseSegment(requestBody));
      } else if (url.includes('google-analytics.com') || url.includes('/collect')) {
        events.push(...this.parseGoogleAnalytics(requestBody));
      } else if (url.includes('reddit.com') && (url.includes('/events') || url.includes('/svc/shreddit'))) {
        events.push(...this.parseReddit(requestBody));
      } else if (url.includes('graphql') || this.looksLikeGraphQL(requestBody)) {
        events.push(...this.parseGraphQL(requestBody));
      } else {
        events.push(...this.parseGenericJSON(requestBody, source));
      }
    }

    // Add metadata to all events
    return events.map(event => ({
      ...event,
      _metadata: {
        capturedAt: new Date().toISOString(),
        url: url,
        initiator: initiator,
        parser: event._parser || (source ? source.parser : 'unknown')
      }
    }));
  }

  /**
   * Parse Segment analytics format
   * Handles /v1/track, /v1/batch endpoints
   */
  static parseSegment(requestBody) {
    try {
      const data = this.decodeRequestBody(requestBody);
      const events = [];

      if (data.batch && Array.isArray(data.batch)) {
        // Batch format
        data.batch.forEach(item => {
          events.push({
            id: this.generateId(),
            timestamp: item.timestamp || item.sentAt || new Date().toISOString(),
            type: item.type || 'track',
            event: item.event || item.type,
            properties: item.properties || {},
            context: item.context || {},
            userId: item.userId,
            anonymousId: item.anonymousId,
            messageId: item.messageId,
            integrations: item.integrations,
            _parser: 'segment-batch'
          });
        });
      } else if (data.event) {
        // Single track event
        events.push({
          id: this.generateId(),
          timestamp: data.timestamp || data.sentAt || new Date().toISOString(),
          type: data.type || 'track',
          event: data.event,
          properties: data.properties || {},
          context: data.context || {},
          userId: data.userId,
          anonymousId: data.anonymousId,
          messageId: data.messageId,
          integrations: data.integrations,
          _parser: 'segment-track'
        });
      }

      return events;
    } catch (err) {
      console.error('Error parsing Segment data:', err);
      return [];
    }
  }

  /**
   * Parse Google Analytics format
   * Handles Measurement Protocol and GA4
   */
  static parseGoogleAnalytics(requestBody) {
    try {
      const data = this.decodeRequestBody(requestBody);
      const events = [];

      // GA4 format (JSON)
      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(event => {
          events.push({
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            type: 'ga4',
            event: event.name,
            properties: event.params || {},
            userId: data.user_id,
            clientId: data.client_id,
            _parser: 'google-analytics-4'
          });
        });
      }
      // Universal Analytics (URL-encoded)
      else if (typeof data === 'string' && data.includes('&')) {
        const params = new URLSearchParams(data);
        events.push({
          id: this.generateId(),
          timestamp: new Date().toISOString(),
          type: 'ua',
          event: params.get('ea') || params.get('t'),
          properties: {
            category: params.get('ec'),
            action: params.get('ea'),
            label: params.get('el'),
            value: params.get('ev')
          },
          clientId: params.get('cid'),
          _parser: 'google-analytics-ua'
        });
      }

      return events;
    } catch (err) {
      console.error('Error parsing Google Analytics data:', err);
      return [];
    }
  }

  /**
   * Parse Reddit analytics format
   * Handles /events and /svc/shreddit/events endpoints
   */
  static parseReddit(requestBody) {
    try {
      const data = this.decodeRequestBody(requestBody);
      const events = [];

      // Skip if not an object
      if (typeof data !== 'object' || data === null) {
        return [];
      }

      // Reddit can send individual events or arrays
      const redditEvents = Array.isArray(data) ? data : [data];

      redditEvents.forEach(item => {
        // Reddit event structure
        const event = {
          id: this.generateId(),
          timestamp: item.client_timestamp || item.timestamp || new Date().toISOString(),
          type: 'track',
          event: item.action || item.event || item.noun || 'reddit_event',
          properties: {
            action: item.action,
            action_info: item.action_info,
            source: item.source,
            noun: item.noun,
            ...item
          },
          context: {
            user_agent: item.user_agent,
            screen: item.screen,
            viewport: item.viewport
          },
          _parser: 'reddit'
        };

        events.push(event);
      });

      return events;
    } catch (err) {
      console.error('Error parsing Reddit data:', err);
      return [];
    }
  }

  /**
   * Parse GraphQL requests that contain analytics data
   */
  static parseGraphQL(requestBody) {
    try {
      const data = this.decodeRequestBody(requestBody);
      const events = [];

      if (data.query && data.variables) {
        // Look for common analytics patterns in variables
        const variables = data.variables;

        // Extract event data from variables
        if (variables.event || variables.eventName) {
          events.push({
            id: this.generateId(),
            timestamp: variables.timestamp || new Date().toISOString(),
            type: 'graphql',
            event: variables.event || variables.eventName,
            properties: variables.properties || variables.data || {},
            query: data.query.substring(0, 100) + '...',
            _parser: 'graphql'
          });
        }

        // Check for batch operations
        if (data.batch && Array.isArray(data.batch)) {
          data.batch.forEach(op => {
            if (op.variables && (op.variables.event || op.variables.eventName)) {
              events.push({
                id: this.generateId(),
                timestamp: op.variables.timestamp || new Date().toISOString(),
                type: 'graphql-batch',
                event: op.variables.event || op.variables.eventName,
                properties: op.variables.properties || op.variables.data || {},
                _parser: 'graphql-batch'
              });
            }
          });
        }
      }

      return events;
    } catch (err) {
      console.error('Error parsing GraphQL data:', err);
      return [];
    }
  }

  /**
   * Generic JSON parser for custom analytics
   * Looks for common event patterns
   * @param {object} requestBody - Request body
   * @param {SourceConfig} source - Source configuration (optional)
   */
  static parseGenericJSON(requestBody, source = null) {
    try {
      const data = this.decodeRequestBody(requestBody);
      const events = [];

      // Skip if not an object
      if (typeof data !== 'object' || data === null) {
        return [];
      }

      // If source has field mappings, use them
      if (source && source.fieldMappings) {
        const extracted = source.extractFields(data);

        // Only create event if we found an event name
        if (extracted.eventName) {
          events.push({
            id: this.generateId(),
            timestamp: extracted.timestamp || new Date().toISOString(),
            type: 'custom',
            event: extracted.eventName,
            properties: extracted.properties || data,
            userId: extracted.userId,
            _parser: 'generic-config'
          });
        }
      } else {
        // Legacy behavior - look for common event field names
        const eventFields = ['event', 'eventName', 'event_name', 'type', 'action', 'eventType'];
        const eventField = eventFields.find(field => data[field]);

        if (eventField) {
          events.push({
            id: this.generateId(),
            timestamp: data.timestamp || data.time || data.sentAt || new Date().toISOString(),
            type: 'custom',
            event: data[eventField],
            properties: this.extractProperties(data, [eventField, 'timestamp', 'time', 'sentAt']),
            _parser: 'generic-json'
          });
        }
      }

      return events;
    } catch (err) {
      console.error('Error parsing generic JSON:', err);
      return [];
    }
  }

  /**
   * Helper: Decode request body from various formats
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
   * Helper: Check if request body looks like GraphQL
   */
  static looksLikeGraphQL(requestBody) {
    try {
      const data = this.decodeRequestBody(requestBody);
      return data && (data.query || data.operationName);
    } catch {
      return false;
    }
  }

  /**
   * Helper: Extract properties from object, excluding specified keys
   */
  static extractProperties(obj, excludeKeys = []) {
    const props = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!excludeKeys.includes(key) && key !== '_metadata' && key !== '_parser') {
        props[key] = value;
      }
    }
    return props;
  }

  /**
   * Helper: Generate unique ID
   */
  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
