/**
 * Zero-dependency local development & browser runner for ClientLedger Pro
 * Run: node server.js (or double-click start.bat)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'database.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8',
  '.sql': 'text/plain; charset=UTF-8',
  '.md': 'text/markdown; charset=UTF-8',
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const action = parsedUrl.searchParams.get('action') || '';

  // ==================== DATABASE API ENDPOINTS ====================
  // Emulates api.php / BigRock API directly in Node.js for instant local database sync
  if (pathname === '/api.php' || pathname === '/api' || pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 1. PING / STATUS TEST
    if (action === 'ping' || pathname === '/api/ping') {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Successfully connected to Local Server Database (database.json)!',
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // 2. LOAD DATA
    if (action === 'load' || pathname === '/api/load' || (req.method === 'GET' && !action)) {
      try {
        if (fs.existsSync(DB_FILE)) {
          const content = fs.readFileSync(DB_FILE, 'utf8');
          const parsed = JSON.parse(content || '{}');
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            source: 'local_server_db',
            data: parsed,
          }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            source: 'empty',
            data: null,
          }));
        }
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({
          success: false,
          error: 'Error reading database file: ' + err.message,
        }));
      }
      return;
    }

    // 3. SAVE DATA
    if (action === 'save' || pathname === '/api/save' || req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50 * 1024 * 1024) { // 50MB limit
          res.writeHead(413);
          res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
          req.destroy();
        }
      });

      req.on('end', () => {
        try {
          if (!body || !body.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'Empty payload' }));
            return;
          }

          const parsed = JSON.parse(body);
          // Atomic write to database.json
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: 'Data successfully synced and saved to server database (database.json)',
            savedAt: new Date().toISOString(),
          }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Invalid JSON or write error: ' + err.message,
          }));
        }
      });
      return;
    }

    res.writeHead(400);
    res.end(JSON.stringify({ success: false, error: 'Unknown action: ' + action }));
    return;
  }

  // ==================== STATIC FILE SERVING ====================
  let reqPath = '/index.html';
  try {
    reqPath = decodeURI(pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, reqPath));

  // Security check: ensure path is within ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

let currentPort = PORT;

function getNetworkIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function startServer(portToTry) {
  currentPort = portToTry;
  server.listen(portToTry, '0.0.0.0', () => {
    const localUrl = `http://localhost:${portToTry}`;
    const networkIp = getNetworkIp();
    console.log('====================================================');
    console.log(` ClientLedger Pro server running successfully!`);
    console.log(` > Local:   ${localUrl}`);
    if (networkIp) {
      console.log(` > Network: http://${networkIp}:${portToTry}`);
    }
    console.log(` Press Ctrl + C to stop the server.`);
    console.log('====================================================');

    // Automatically open browser on Windows
    exec(`start "" "${localUrl}"`, (err) => {
      if (err) {
        console.log(`Please open ${localUrl} in your browser.`);
      }
    });
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(currentPort) + 1;
    console.warn(`Port ${currentPort} is currently in use. Trying port ${nextPort}...`);
    startServer(nextPort);
  } else {
    console.error('Server error:', err.message);
  }
});

startServer(PORT);
