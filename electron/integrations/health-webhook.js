// Local HTTP endpoint that receives automatic pushes from the
// "Health Auto Export" iPhone app (REST API export → http://<laptop-ip>:<port>/health).
// This is what keeps Apple Watch stats updating without touching the laptop.
const http = require('http');
const store = require('./../store');

let server = null;
let currentPort = null;
let lastReceived = null;

function start(port, getWindow) {
  if (server && currentPort === port) return;
  stop();

  server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Daily Deck is listening. POST Health Auto Export data to /health');
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/health')) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const summary = ingest(JSON.parse(body));
          lastReceived = new Date().toISOString();
          getWindow()?.webContents.send('health:updated', summary);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...summary }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('error', () => { server = null; });
  server.listen(port, '0.0.0.0');
  currentPort = port;
}

function stop() {
  if (server) server.close();
  server = null;
  currentPort = null;
}

function status() {
  return { running: !!server, port: currentPort, lastReceived };
}

// Merge a Health Auto Export payload into the health store.
// Tolerant of format differences between app versions.
function ingest(payload) {
  const metrics = payload?.data?.metrics || payload?.metrics || [];
  const health = store.load('health', {});
  health.steps = health.steps || {};
  health.sleep = health.sleep || {};
  health.cycle = health.cycle || { days: {} };

  let stepsDays = 0;
  let sleepNights = 0;
  let cycleDays = 0;

  for (const metric of metrics) {
    const name = (metric.name || '').toLowerCase();
    const points = metric.data || [];

    if (name.includes('step')) {
      for (const p of points) {
        const date = isoDate(p.date);
        if (date && p.qty != null) {
          health.steps[date] = Math.round(p.qty);
          stepsDays++;
        }
      }
    } else if (name.includes('sleep')) {
      for (const p of points) {
        const date = isoDate(p.sleepEnd || p.date);
        if (!date) continue;
        const hours = p.asleep ?? p.totalSleep ?? sumStages(p);
        if (!hours) continue;
        health.sleep[date] = {
          hours: round1(hours),
          deep: round1(p.deep),
          rem: round1(p.rem),
          core: round1(p.core),
          awake: round1(p.awake),
        };
        sleepNights++;
      }
    } else if (name.includes('menstrual')) {
      for (const p of points) {
        const date = isoDate(p.date);
        if (date) {
          health.cycle.days[date] = flowLabel(p.value ?? p.qty);
          cycleDays++;
        }
      }
    }
  }

  health.lastSync = new Date().toISOString();
  store.save('health', health);
  return { stepsDays, sleepNights, cycleDays };
}

function isoDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sumStages(p) {
  return (p.deep || 0) + (p.rem || 0) + (p.core || 0);
}

function round1(n) {
  return n == null ? undefined : Math.round(n * 10) / 10;
}

function flowLabel(value) {
  if (typeof value === 'string') return value.toLowerCase();
  return { 1: 'unspecified', 2: 'light', 3: 'medium', 4: 'heavy' }[value] || 'logged';
}

module.exports = { start, stop, status };
