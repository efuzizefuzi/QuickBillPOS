/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              QuickBill — Local Server + Tally Proxy          ║
 * ║                                                              ║
 * ║  Serves QuickBill on port 8080  →  open on mobile via IP     ║
 * ║  Proxies Tally XML on port 3000 →  adds CORS headers         ║
 * ║                                                              ║
 * ║  Run:  node server.js                                        ║
 * ║  Open: http://<YOUR-PC-IP>:8080  on mobile Chrome            ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── CONFIG ────────────────────────────────────────────────────
const QUICKBILL_FILE = path.join(__dirname, 'quickbill_UI_3 transc-v3-tax-pos.html');
const APP_PORT       = 8080;   // QuickBill UI (will try 8081, 8082… if taken)
const PROXY_PORT     = 3000;   // Tally proxy
const TALLY_HOST     = 'localhost';
const TALLY_PORT     = 9000;
// ─────────────────────────────────────────────────────────────

// ── Helper: get local WiFi IP ─────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ── CORS headers helper ───────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

// ═══════════════════════════════════════════════════════════
// SERVER 1 — QuickBill HTML (port 8080)
// ═══════════════════════════════════════════════════════════
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const appServer = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  const filePath = (urlPath === '/' || urlPath === '')
    ? QUICKBILL_FILE
    : path.join(__dirname, urlPath);

  // Security: prevent directory traversal
  const safeBase = __dirname;
  if (!filePath.startsWith(safeBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback: serve the main HTML for unknown routes (SPA behaviour)
      fs.readFile(QUICKBILL_FILE, (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`File not found: ${urlPath}`);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(data2);
      });
      return;
    }
    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

appServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = err.port + 1;
    console.warn(`[App]  Port ${err.port} in use — trying ${next}…`);
    appServer.listen(next, '0.0.0.0');
  } else {
    console.error('[App] ', err);
    process.exit(1);
  }
});

appServer.on('listening', () => {
  const { port } = appServer.address();
  const ip = getLocalIP();
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│           QuickBill Server Running           │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  Open on mobile:  http://${ip}:${port}  │`);
  console.log(`│  Tally proxy:     http://${ip}:${PROXY_PORT}         │`);
  console.log('├─────────────────────────────────────────────┤');
  console.log('│  Make sure both devices are on same WiFi    │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
});

appServer.listen(APP_PORT, '0.0.0.0');

// ═══════════════════════════════════════════════════════════
// SERVER 2 — Tally Proxy (port 3000)
// ═══════════════════════════════════════════════════════════
const proxyServer = http.createServer((req, res) => {

  setCORS(res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check — used by QuickBill "Test" button
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    });
    res.end('QuickBill Tally Proxy OK');
    return;
  }

  // Tally status check — used by QuickBill status dot
// Tally status check — used by QuickBill status dot
  if (req.method === 'GET' && req.url === '/tally-status') {
    
    // Send an empty GET request to Tally
    const tallyReq = http.request({
      hostname: TALLY_HOST,
      port:     TALLY_PORT,
      path:     '/',
      method:   'GET' 
    }, tallyRes => {
      let data = '';
      tallyRes.on('data', chunk => data += chunk);
      tallyRes.on('end', () => {
        
        // Look for Tally's exact default response
        const isRunning = data.includes('<RESPONSE>TallyPrime Server is Running</RESPONSE>');
        const online = tallyRes.statusCode === 200 && isRunning;
        
        console.log(`[Status] Tally ping → ${online ? 'online' : 'offline or missing marker'}`);
        
        // Return JSON to the QuickBill frontend
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept'
        });
        res.end(JSON.stringify({ status: online ? 'online' : 'offline' }));
      });
    });

    tallyReq.on('error', err => {
      console.log(`[Status] Tally unreachable — ${err.message}`);
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      });
      res.end(JSON.stringify({ status: 'offline' }));
    });

    tallyReq.setTimeout(3000, () => {
      tallyReq.destroy();
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      });
      res.end(JSON.stringify({ status: 'offline' }));
    });

    tallyReq.end(); // Send the empty request
    return;
  }

  // Collect request body for generic XML proxy transactions
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {

    const bodyBytes = Buffer.from(body, 'utf8');

    const options = {
      hostname: TALLY_HOST,
      port:     TALLY_PORT,
      path:     '/',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/xml',
        'Content-Length': bodyBytes.length,
      },
    };

    const tallyReq = http.request(options, tallyRes => {
      let data = '';
      tallyRes.on('data', chunk => data += chunk);
      tallyRes.on('end', () => {
        res.writeHead(200, { 
          'Content-Type': 'text/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept'
        });
        res.end(data);
        const preview = data.replace(/\s+/g, ' ').substring(0, 80);
        console.log(`[Tally] ← ${tallyRes.statusCode} | ${preview}...`);
      });
    });

    tallyReq.on('error', err => {
      console.error(`[Tally] ✗ ${err.message}`);
      res.writeHead(502, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      });
      res.end(`Tally unreachable on port ${TALLY_PORT}.\nIs TallyPrime running?\n\n${err.message}`);
    });

    tallyReq.setTimeout(10000, () => {
      tallyReq.destroy();
      res.writeHead(504, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      });
      res.end('Tally request timed out after 10s.');
    });

    tallyReq.write(bodyBytes);
    tallyReq.end();

    const preview = body.replace(/\s+/g, ' ').substring(0, 80);
    console.log(`[Tally] → POST | ${preview}...`);
  });
});

proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[Proxy]  Tally proxy listening on port ${PROXY_PORT}`);
  console.log(`[Proxy]  Forwarding to Tally at ${TALLY_HOST}:${TALLY_PORT}`);
  console.log('');
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  appServer.close();
  proxyServer.close();
  process.exit(0);
});