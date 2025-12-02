/**
 * Local Intercepting Proxy for Analytics
 *
 * This proxy intercepts ALL requests (including from extensions) and logs analytics events.
 *
 * Setup:
 * 1. Run: node proxy-server.js
 * 2. Configure Chrome to use proxy: --proxy-server="localhost:8888"
 * 3. Analytics Logger can read events from this proxy via HTTP
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = 8888;
const API_PORT = 8889; // For Analytics Logger to fetch events

// Store captured events
const capturedEvents = [];
const MAX_EVENTS = 1000;

// Patterns to intercept
const INTERCEPT_PATTERNS = [
  'pie.org/v1/batch',
  'pie-staging.org/v1/batch',
  'segment.io/v1/batch',
  'segment.io/v1/track',
  'segment.com/v1/batch',
  'reddit.com/events',
  'reddit.com/svc/shreddit/events',
  '/log?format=json'
];

function shouldIntercept(requestUrl) {
  return INTERCEPT_PATTERNS.some(pattern => requestUrl.includes(pattern));
}

function parseBody(chunks) {
  try {
    const body = Buffer.concat(chunks).toString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// Proxy server
const proxyServer = http.createServer((clientReq, clientRes) => {
  const parsedUrl = url.parse(clientReq.url);

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 80,
    path: parsedUrl.path,
    method: clientReq.method,
    headers: clientReq.headers
  };

  // Collect request body
  const requestChunks = [];
  clientReq.on('data', chunk => requestChunks.push(chunk));

  clientReq.on('end', () => {
    // Check if we should intercept
    const shouldLog = shouldIntercept(clientReq.url) && clientReq.method === 'POST';

    if (shouldLog) {
      const body = parseBody(requestChunks);
      if (body) {
        console.log(`[Proxy] Intercepted analytics request to: ${clientReq.url}`);

        let eventsToCapture = [];

        // Parse Segment batch format
        if (body.batch && Array.isArray(body.batch)) {
          eventsToCapture = body.batch.map(event => ({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: event.timestamp || event.sentAt || new Date().toISOString(),
            event: event.event || event.type,
            properties: event.properties || {},
            context: event.context || {},
            type: event.type || 'track',
            userId: event.userId,
            anonymousId: event.anonymousId,
            _metadata: {
              url: clientReq.url,
              capturedAt: new Date().toISOString()
            },
            _parser: 'proxy-segment'
          }));
        }
        // Parse Reddit events format
        else if (clientReq.url.includes('reddit.com')) {
          // Reddit sends individual events or arrays
          const events = Array.isArray(body) ? body : [body];

          eventsToCapture = events.map(event => ({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: event.client_timestamp || new Date().toISOString(),
            event: event.action || event.event || 'reddit_event',
            properties: {
              action_info: event.action_info,
              source: event.source,
              ...event
            },
            context: {},
            type: 'track',
            _metadata: {
              url: clientReq.url,
              capturedAt: new Date().toISOString()
            },
            _parser: 'proxy-reddit'
          }));
        }
        // Generic JSON format
        else {
          eventsToCapture = [{
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date().toISOString(),
            event: body.event || 'custom_event',
            properties: body,
            context: {},
            type: 'track',
            _metadata: {
              url: clientReq.url,
              capturedAt: new Date().toISOString()
            },
            _parser: 'proxy-generic'
          }];
        }

        // Add captured events
        eventsToCapture.forEach(captured => {
          capturedEvents.unshift(captured);

          // Maintain max size
          if (capturedEvents.length > MAX_EVENTS) {
            capturedEvents.length = MAX_EVENTS;
          }

          console.log(`[Proxy] Captured event: ${captured.event}`);
        });
      }
    }

    // Forward the request
    const proxyReq = http.request(options, (proxyRes) => {
      // Forward response headers
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Forward response body
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
      console.error(`[Proxy] Error: ${err.message}`);
      clientRes.writeHead(502);
      clientRes.end();
    });

    // Forward request body
    if (requestChunks.length > 0) {
      proxyReq.write(Buffer.concat(requestChunks));
    }
    proxyReq.end();
  });
});

// Handle HTTPS CONNECT method for SSL tunneling
proxyServer.on('connect', (req, clientSocket, head) => {
  const { port, hostname } = url.parse(`//${req.url}`, false, true);

  // Log HTTPS connections for debugging
  if (hostname.includes('reddit')) {
    console.log(`[Proxy] HTTPS CONNECT to Reddit: ${hostname}`);
    console.log(`[Proxy] ⚠️  Cannot intercept HTTPS POST bodies without MITM proxy`);
  }

  const serverSocket = require('net').connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error(`[Proxy] CONNECT error: ${err.message}`);
    clientSocket.end();
  });
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
    console.log('[Proxy API] Cleared all captured events');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Events cleared' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Start servers
proxyServer.listen(PROXY_PORT, () => {
  console.log(`\n🔌 Proxy server running on port ${PROXY_PORT}`);
  console.log(`📊 API server running on port ${API_PORT}`);
  console.log(`\n📝 To use:`);
  console.log(`   1. Start Chrome with: --proxy-server="localhost:${PROXY_PORT}"`);
  console.log(`   2. Or set system proxy to localhost:${PROXY_PORT}`);
  console.log(`   3. Analytics Logger will fetch events from http://localhost:${API_PORT}/events`);
  console.log(`\n⚡ Ready to intercept analytics events!\n`);
});

apiServer.listen(API_PORT);
