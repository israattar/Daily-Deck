// Serves the whole Daily Deck UI to her iPhone (or any device) over the local
// network / Tailscale, so "Add to Home Screen" gives a real app icon while the
// laptop stays the single source of truth — same JSON store, same MT4 sync.
//
// Two surfaces:
//   static  — the built UI from dist/. Open, because it is only app code.
//   /api/*  — the data. Token-gated, because it is her whole life in JSON.
//
// The token is a short, typeable key rather than a long hex string: it is
// entered once on the phone and then kept in that device's localStorage.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./../store');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

// Unambiguous alphabet — no O/0, I/1 — so it can be read off a screen and
// typed on a phone without guessing. 15 chars ≈ 75 bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let server = null;
let currentPort = null;
let handlers = {};

function newToken() {
  const bytes = crypto.randomBytes(15);
  let out = '';
  for (let i = 0; i < 15; i++) {
    if (i > 0 && i % 5 === 0) out += '-';
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out; // e.g. K7QMD-3XR9T-BHFW2
}

// The token lives in settings so the Settings screen can show it, and so it
// survives restarts. Generated on first use.
function token() {
  const settings = store.load('settings', {}) || {};
  const existing = settings.phone?.token;
  if (existing) return existing;
  const fresh = newToken();
  store.save('settings', { ...settings, phone: { ...(settings.phone || {}), token: fresh } });
  return fresh;
}

function rotateToken() {
  const settings = store.load('settings', {}) || {};
  const fresh = newToken();
  store.save('settings', { ...settings, phone: { ...(settings.phone || {}), token: fresh } });
  return fresh;
}

// Timing-safe compare so the token can't be guessed a character at a time.
function tokenOk(supplied) {
  const expected = token();
  if (typeof supplied !== 'string' || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function distDir() {
  return path.join(__dirname, '..', '..', 'dist');
}

function readBody(req, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function start(port, getWindow, ipcHandlers) {
  if (server && currentPort === port) return status();
  stop();
  handlers = ipcHandlers || {};
  currentPort = port;

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const send = (code, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
    };

    // ---- API (token required) ----
    if (url.pathname.startsWith('/api/')) {
      const supplied =
        (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('k');
      if (!tokenOk(supplied)) return send(401, { error: 'Bad or missing key' });

      if (url.pathname === '/api/ping') return send(200, { ok: true, app: 'daily-deck' });

      if (url.pathname === '/api/invoke' && req.method === 'POST') {
        try {
          const { channel, payload } = JSON.parse(await readBody(req) || '{}');
          const handler = handlers[channel];
          if (!handler) return send(404, { error: `Channel not available on phone: ${channel}` });
          return send(200, { result: await handler(payload) });
        } catch (err) {
          return send(500, { error: err.message });
        }
      }
      return send(404, { error: 'Unknown endpoint' });
    }

    // ---- static UI (open — app code only, no data) ----
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method not allowed' });

    // The page's CSP is script-src 'self', so the remote flag has to arrive as
    // a real same-origin file — an inline <script> would be blocked.
    if (url.pathname === '/__deck-remote.js') {
      return send(200, 'window.__DECK_REMOTE__=true;', 'text/javascript; charset=utf-8');
    }

    const root = distDir();
    if (!fs.existsSync(path.join(root, 'index.html'))) {
      return send(503, 'Daily Deck has not been built yet — run "npm run build" on the laptop.',
        'text/plain; charset=utf-8');
    }

    // Resolve inside dist only; anything unknown falls back to index.html (SPA).
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = path.resolve(root, rel);
    if (!file.startsWith(path.resolve(root)) || rel === '' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }

    let body = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();

    // Tell the UI it is running over HTTP so it uses the API instead of IPC.
    if (ext === '.html') {
      body = Buffer.from(
        body.toString('utf8').replace(
          '<div id="root">',
          '<script src="/__deck-remote.js"></script><div id="root">'
        )
      );
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  server.on('error', (err) => {
    console.error('Phone server error:', err.message);
    server = null;
    currentPort = null;
  });
  // 0.0.0.0 so both the LAN and the Tailscale interface can reach it.
  server.listen(port, '0.0.0.0');
  return status();
}

function stop() {
  if (server) {
    server.close();
    server = null;
    currentPort = null;
  }
}

// Every address the phone could use, Tailscale first (it works anywhere).
function addresses(port) {
  const os = require('os');
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const tailscale = /tailscale/i.test(name) || net.address.startsWith('100.');
      out.push({ name, address: net.address, url: `http://${net.address}:${port}`, tailscale });
    }
  }
  out.sort((a, b) => Number(b.tailscale) - Number(a.tailscale));
  return out;
}

function status() {
  const settings = store.load('settings', {}) || {};
  const port = settings.phone?.port || 5601;
  return {
    running: !!server,
    port: currentPort || port,
    token: token(),
    addresses: addresses(currentPort || port),
  };
}

module.exports = { start, stop, status, rotateToken };
