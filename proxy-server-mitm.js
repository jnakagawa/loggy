/**
 * MITM Proxy for Analytics (like Charles Proxy)
 *
 * This proxy intercepts HTTPS traffic (including from extension service workers)
 * and captures analytics events using domain-based matching and smart parsing.
 */

const MitmProxy = require('http-mitm-proxy').Proxy;
const http = require('http');
const zlib = require('zlib');
const { ConfigManagerNode, SourceConfig, looksLikeAnalyticsEndpoint } = require('./config/config-manager-node.js');

/**
 * Decompress body if needed based on Content-Encoding
 */
function decompressBody(bodyBuffer, encoding) {
  if (!encoding) return bodyBuffer.toString('utf-8');

  try {
    if (encoding === 'gzip') {
      return zlib.gunzipSync(bodyBuffer).toString('utf-8');
    } else if (encoding === 'deflate') {
      return zlib.inflateSync(bodyBuffer).toString('utf-8');
    } else if (encoding === 'br') {
      return zlib.brotliDecompressSync(bodyBuffer).toString('utf-8');
    }
  } catch (err) {
    console.error('[MITM Proxy] Decompression failed:', err.message);
  }
  return bodyBuffer.toString('utf-8');
}

const PROXY_PORT = 8888;
const API_PORT = 8889;

// Store captured events
const capturedEvents = [];
const MAX_EVENTS = 1000;

// Initialize configuration manager
const configManager = new ConfigManagerNode();
configManager.load();

console.log('[MITM Proxy] Loaded', configManager.getAllSources().length, 'analytics sources');

// Create MITM proxy
const proxy = new MitmProxy();

proxy.onError((ctx, err) => {
  console.error('[MITM Proxy] Error:', err.message);
});

// Field detection order (same as parsers.js)
const FIELD_DETECTION = {
  eventName: ['event', 'eventName', 'event_name', 'code', 'action', 'name', 'type', 'eventType'],
  timestamp: ['timestamp', 'client_ts', 'client_timestamp', 'time', 'ts', 'sentAt', 'sent_at', 'created_at'],
  userId: ['userId', 'user_id', 'uid', 'anonymousId', 'anonymous_id', 'anonId']
};

const EVENT_ARRAY_FIELDS = ['batch', 'events', 'data', 'items', 'records'];

/**
 * Smart parsing function - auto-detects event structure
 */
function parseEventFromSource(source, data, fullUrl) {
  const events = [];
  const fieldMappings = source.fieldMappings || {};

  // Find events array
  let eventArray = null;
  for (const field of EVENT_ARRAY_FIELDS) {
    if (data[field] && Array.isArray(data[field])) {
      eventArray = data[field];
      break;
    }
  }
  if (!eventArray && Array.isArray(data)) {
    eventArray = data;
  }

  if (eventArray) {
    // Process each event in the array
    eventArray.forEach(item => {
      const event = extractEvent(item, fieldMappings, data, source, fullUrl);
      if (event) events.push(event);
    });
  } else {
    // Single event
    const event = extractEvent(data, fieldMappings, null, source, fullUrl);
    if (event) events.push(event);
  }

  return events;
}

/**
 * Extract a single event from data
 */
function extractEvent(item, fieldMappings, parentData, source, fullUrl) {
  if (!item || typeof item !== 'object') return null;

  // Extract fields using mappings or auto-detection
  const eventName = extractField(item, 'eventName', fieldMappings) || 'unknown';
  const timestamp = normalizeTimestamp(extractField(item, 'timestamp', fieldMappings));
  const userId = extractField(item, 'userId', fieldMappings) ||
                 (parentData ? extractField(parentData, 'userId', fieldMappings) : null);

  // Get properties
  const properties = extractProperties(item);

  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: timestamp,
    event: eventName,
    properties: properties,
    context: item.context || parentData?.context || {},
    userId: userId,
    anonymousId: item.anonymousId || parentData?.anonymousId,
    type: item.type || 'track',
    _source: source.id,
    _sourceName: source.name,
    _sourceIcon: source.icon,
    _sourceColor: source.color,
    _metadata: {
      url: fullUrl,
      capturedAt: new Date().toISOString()
    }
  };
}

/**
 * Extract a field using mapping override or auto-detection
 */
function extractField(data, fieldType, fieldMappings) {
  // Check for override mapping first
  if (fieldMappings[fieldType]) {
    const mappedField = fieldMappings[fieldType];
    const value = getNestedValue(data, mappedField);
    if (value !== undefined) return value;
  }

  // Fall back to auto-detection
  const detectionFields = FIELD_DETECTION[fieldType] || [];
  for (const field of detectionFields) {
    const value = getNestedValue(data, field);
    if (value !== undefined && value !== null) return value;
  }

  return null;
}

/**
 * Get nested value from object
 */
function getNestedValue(data, path) {
  if (!path || !data) return undefined;
  const parts = path.split('.');
  let current = data;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Normalize timestamp to ISO string
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return new Date().toISOString();

  if (typeof timestamp === 'string' && timestamp.includes('T')) {
    return timestamp;
  }

  if (typeof timestamp === 'number') {
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    return new Date(ms).toISOString();
  }

  try {
    return new Date(timestamp).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Extract properties from object
 */
function extractProperties(obj) {
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

// Intercept HTTPS requests
proxy.onRequest((ctx, callback) => {
  const url = ctx.clientToProxyRequest.url;
  const host = ctx.clientToProxyRequest.headers.host;
  const fullUrl = `${ctx.isSSL ? 'https' : 'http'}://${host}${url}`;

  // Find matching source using domain matching
  const source = configManager.findSourceForUrl(fullUrl);

  // Debug: Log all POST requests to see what's coming through
  if (ctx.clientToProxyRequest.method === 'POST') {
    const domain = SourceConfig.extractBaseDomainFromUrl(fullUrl);
    console.log(`[MITM Proxy] POST to ${domain}: ${fullUrl.slice(0, 80)}...`);
    if (source) {
      console.log(`[MITM Proxy]   → Matched source: ${source.name} (enabled: ${source.enabled})`);
    } else {
      console.log(`[MITM Proxy]   → No source match. Sources: ${configManager.getAllSources().map(s => `${s.domain}(${s.enabled})`).join(', ')}`);
    }
  }

  if (source && ctx.clientToProxyRequest.method === 'POST') {
    console.log(`[MITM Proxy] Capturing event from "${source.name}" for: ${fullUrl}`);

    // Collect request body as buffer (to handle compression)
    const chunks = [];
    ctx.onRequestData((_, chunk, callback) => {
      chunks.push(chunk);
      return callback(null, chunk);
    });

    ctx.onRequestEnd((_, callback) => {
      // Parse and store the analytics event
      try {
        const bodyBuffer = Buffer.concat(chunks);
        const encoding = ctx.clientToProxyRequest.headers['content-encoding'];
        const body = decompressBody(bodyBuffer, encoding);
        const data = JSON.parse(body);
        const events = parseEventFromSource(source, data, fullUrl);

        events.forEach(captured => {
          capturedEvents.unshift(captured);

          // Maintain max size
          if (capturedEvents.length > MAX_EVENTS) {
            capturedEvents.length = MAX_EVENTS;
          }

          console.log(`[MITM Proxy] Captured event: ${captured.event} from ${source.name}`);
        });

        // Update source statistics
        if (events.length > 0) {
          source.recordCapture();
          configManager.save();
        }
      } catch (err) {
        console.error('[MITM Proxy] Error parsing body:', err.message);
      }

      return callback();
    });
  } else if (ctx.clientToProxyRequest.method === 'POST' && looksLikeAnalyticsEndpoint(fullUrl)) {
    // Track unmatched analytics request for suggestions
    const chunks = [];
    ctx.onRequestData((_, chunk, callback) => {
      chunks.push(chunk);
      return callback(null, chunk);
    });

    ctx.onRequestEnd((_, callback) => {
      try {
        const bodyBuffer = Buffer.concat(chunks);
        const encoding = ctx.clientToProxyRequest.headers['content-encoding'];
        const body = decompressBody(bodyBuffer, encoding);
        const data = JSON.parse(body);
        configManager.trackUnmatchedRequest(fullUrl, data);
        const domain = SourceConfig.extractBaseDomainFromUrl(fullUrl);
        console.log(`[MITM Proxy] Unmatched analytics from: ${domain}`);
      } catch {
        // Not JSON, ignore
      }
      return callback();
    });
  }

  return callback();
});

// Start MITM proxy
proxy.listen({
  port: PROXY_PORT,
  host: '0.0.0.0'
}, () => {
  console.log(`\n MITM Proxy running on 0.0.0.0:${PROXY_PORT}`);
  console.log(` API server running on port ${API_PORT}`);
  console.log(`\n Certificate location: ~/.http-mitm-proxy/certs/ca.pem`);
  console.log(`\n IMPORTANT: You must trust the CA certificate for HTTPS interception to work.`);
  console.log(`   Run: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/.http-mitm-proxy/certs/ca.pem`);
  console.log(`\n Ready to intercept analytics events!\n`);
});

// API server for Analytics Logger to fetch events
const apiServer = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      events: capturedEvents,
      count: capturedEvents.length,
      unmatchedDomains: configManager.getUnmatchedDomains()
    }));
  } else if (req.url === '/clear' && req.method === 'POST') {
    capturedEvents.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } else if (req.url === '/sources' && req.method === 'POST') {
    // Receive sources from the extension
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const sources = JSON.parse(body);
        let added = 0;

        // Add/update sources from extension
        sources.forEach(sourceData => {
          const source = new SourceConfig(sourceData.id, sourceData);
          configManager.sources.set(sourceData.id, source);
          added++;
        });

        console.log(`[MITM Proxy] Synced ${added} sources from extension`);
        console.log(`[MITM Proxy] Total sources: ${configManager.getAllSources().length}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, synced: added }));
      } catch (err) {
        console.error('[MITM Proxy] Error syncing sources:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else if (req.url === '/sources' && req.method === 'GET') {
    // Return current sources
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sources: configManager.getAllSources().map(s => s.toJSON()),
      count: configManager.getAllSources().length
    }));
  } else if (req.url === '/unmatched' && req.method === 'GET') {
    // Return unmatched domains (for suggestions)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      domains: configManager.getUnmatchedDomains()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

apiServer.listen(API_PORT);
