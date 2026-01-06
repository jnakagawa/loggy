/**
 * MITM Proxy for Analytics (like Charles Proxy)
 *
 * This proxy intercepts HTTPS traffic (including from extension service workers)
 * and captures analytics events using domain-based matching and smart parsing.
 */

import { Proxy as MitmProxy } from 'http-mitm-proxy';
import http from 'http';
import zlib from 'zlib';
import { AnalyticsParser } from './parsers.js';
import { ConfigManagerNode, SourceConfig, looksLikeAnalyticsEndpoint } from './config/config-manager-node.js';

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

/**
 * Parse events using shared AnalyticsParser and enrich with source metadata
 */
function parseEventFromSource(source, data, fullUrl) {
  // Use shared AnalyticsParser for parsing
  const events = AnalyticsParser.parsePayload(data, source.fieldMappings || {});

  // Enrich events with source metadata
  return events.map(event => ({
    ...event,
    _source: source.id,
    _sourceName: source.name,
    _sourceIcon: source.icon,
    _sourceColor: source.color,
    _metadata: {
      url: fullUrl,
      capturedAt: new Date().toISOString()
    }
  }));
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
