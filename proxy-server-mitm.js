/**
 * MITM Proxy for Analytics (like Charles Proxy)
 *
 * This proxy intercepts HTTPS traffic (including from extension service workers)
 * and captures analytics events using ConfigManager for universal source matching.
 */

const MitmProxy = require('http-mitm-proxy').Proxy;
const http = require('http');
const { ConfigManagerNode } = require('./config/config-manager-node.js');

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

// Helper function to parse events based on source configuration
function parseEventFromSource(source, data, fullUrl) {
  const events = [];

  // Handle Segment/Pie batch format
  if (source.parser === 'segment' && data.batch && Array.isArray(data.batch)) {
    data.batch.forEach(event => {
      events.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: event.timestamp || event.sentAt || new Date().toISOString(),
        event: event.event || event.type,
        properties: event.properties || {},
        context: event.context || {},
        type: event.type || 'track',
        userId: event.userId,
        anonymousId: event.anonymousId,
        _source: source.id,
        _sourceName: source.name,
        _sourceIcon: source.icon,
        _sourceColor: source.color,
        _metadata: {
          url: fullUrl,
          capturedAt: new Date().toISOString(),
          parser: source.parser
        }
      });
    });
  }
  // Handle Reddit format
  else if (source.parser === 'reddit') {
    const redditEvents = Array.isArray(data) ? data : [data];

    redditEvents.forEach(item => {
      const extracted = source.extractFields(item);
      events.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: extracted.timestamp || new Date().toISOString(),
        event: extracted.eventName || 'reddit_event',
        properties: extracted.properties || item,
        userId: extracted.userId,
        _source: source.id,
        _sourceName: source.name,
        _sourceIcon: source.icon,
        _sourceColor: source.color,
        _metadata: {
          url: fullUrl,
          capturedAt: new Date().toISOString(),
          parser: source.parser
        }
      });
    });
  }
  // Generic parser using field mappings
  else {
    // Check if data has an events array (common pattern)
    const eventArray = data.events || data.batch || (Array.isArray(data) ? data : null);

    if (eventArray && Array.isArray(eventArray)) {
      // Process each event in the array
      eventArray.forEach(item => {
        const eventName = item.event || item.code || item.action || item.name || item.type || 'unknown';
        events.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          timestamp: item.timestamp || item.client_ts || item.sentAt || new Date().toISOString(),
          event: eventName,
          properties: item,
          userId: item.userId || item.user_id || data.userId,
          _source: source.id,
          _sourceName: source.name,
          _sourceIcon: source.icon,
          _sourceColor: source.color,
          _metadata: {
            url: fullUrl,
            capturedAt: new Date().toISOString(),
            parser: source.parser
          }
        });
      });
    } else {
      // Single event - try to extract or use whole payload
      const extracted = source.extractFields(data);
      const eventName = extracted.eventName || data.event || data.code || data.action || data.name || data.type || 'unknown';

      events.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: extracted.timestamp || data.timestamp || new Date().toISOString(),
        event: eventName,
        properties: extracted.properties || data,
        userId: extracted.userId || data.userId || data.user_id,
        _source: source.id,
        _sourceName: source.name,
        _sourceIcon: source.icon,
        _sourceColor: source.color,
        _metadata: {
          url: fullUrl,
          capturedAt: new Date().toISOString(),
          parser: source.parser
        }
      });
    }
  }

  return events;
}

// Intercept HTTPS requests
proxy.onRequest((ctx, callback) => {
  const url = ctx.clientToProxyRequest.url;
  const fullUrl = `${ctx.isSSL ? 'https' : 'http'}://${ctx.clientToProxyRequest.headers.host}${url}`;

  // Find matching source using ConfigManager
  const source = configManager.findSourceForUrl(fullUrl);

  if (source && ctx.clientToProxyRequest.method === 'POST') {
    console.log(`[MITM Proxy] Matched source "${source.name}" for: ${fullUrl}`);

    // Collect request body
    let body = '';
    ctx.onRequestData((ctx, chunk, callback) => {
      body += chunk.toString();
      return callback(null, chunk);
    });

    ctx.onRequestEnd((ctx, callback) => {
      // Parse and store the analytics event
      try {
        const data = JSON.parse(body);
        const events = parseEventFromSource(source, data, fullUrl);

        events.forEach(captured => {
          capturedEvents.unshift(captured);

          // Maintain max size
          if (capturedEvents.length > MAX_EVENTS) {
            capturedEvents.length = MAX_EVENTS;
          }

          console.log(`[MITM Proxy] ✅ Captured event: ${captured.event} from ${source.name}`);
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
  }

  return callback();
});

// Start MITM proxy
proxy.listen({
  port: PROXY_PORT,
  host: '0.0.0.0'  // Listen on all interfaces (IPv4 and IPv6)
}, () => {
  console.log(`\n🔌 MITM Proxy running on 0.0.0.0:${PROXY_PORT}`);
  console.log(`📊 API server running on port ${API_PORT}`);
  console.log(`\n📝 Certificate location: ~/.http-mitm-proxy/certs/ca.pem`);
  console.log(`\n⚠️  IMPORTANT: You must trust the CA certificate for HTTPS interception to work.`);
  console.log(`   Run: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/.http-mitm-proxy/certs/ca.pem`);
  console.log(`\n⚡ Ready to intercept analytics events!\n`);
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
      count: capturedEvents.length
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
          const source = new (require('./config/config-manager-node.js').SourceConfig)(
            sourceData.id,
            sourceData
          );
          configManager.sources.set(sourceData.id, source);
          added++;
        });

        console.log(`[MITM Proxy] ✅ Synced ${added} sources from extension`);
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
  } else {
    res.writeHead(404);
    res.end();
  }
});

apiServer.listen(API_PORT);
