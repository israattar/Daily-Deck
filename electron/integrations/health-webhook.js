// Local HTTP endpoint that receives automatic pushes from the
// "Health Auto Export" iPhone app (REST API export → http://<laptop-ip>:<port>/health).
// This is what keeps Apple Watch stats updating without touching the laptop.
const http = require('http');
const store = require('./../store');
const mt4Live = require('./mt4-live');

let server = null;
let currentPort = null;
let lastReceived = null;

function start(port, getWindow) {
  if (server && currentPort === port) return;
  stop();

  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const reply = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    const received = (summary) => {
      lastReceived = new Date().toISOString();
      getWindow()?.webContents.send('health:updated', summary);
      reply(200, { ok: true, ...summary });
    };

    // Simple format, used by the Apple Shortcuts automation:
    //   GET /health?steps=8123&sleepMin=444  (date optional, defaults to today)
    if (req.method === 'GET' && url.pathname === '/health' && hasSimpleParams(url.searchParams)) {
      try {
        received(ingestSimple(Object.fromEntries(url.searchParams)));
      } catch (err) {
        reply(400, { ok: false, error: err.message });
      }
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Daily Deck is listening.\nPOST Health Auto Export JSON to /health, or GET /health?steps=...&sleepMin=...');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/health') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          // Health Auto Export format if it has metrics, otherwise simple.
          const isHae = (payload?.data?.metrics || payload?.metrics || []).length > 0;
          received(isHae ? ingest(payload) : ingestSimple(payload));
        } catch (err) {
          reply(400, { ok: false, error: err.message });
        }
      });
      return;
    }
    // P/L pushes from the DailyDeckReporter EA inside desktop MT4.
    if (req.method === 'POST' && url.pathname === '/trading') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const summary = mt4Live.ingestDays(parsed.days, parsed.counts, parsed.stats);
          lastReceived = new Date().toISOString();
          getWindow()?.webContents.send('trading:updated', summary);
          reply(200, { ok: true, ...summary });
        } catch (err) {
          reply(400, { ok: false, error: err.message });
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

// ---- Simple format (Apple Shortcuts) ----------------------------------
// Accepts flat values: steps, sleepMin (or sleepHours/sleep), flow/period,
// and an optional date. Values may arrive as text — parsed forgivingly.

const SIMPLE_KEYS = ['steps', 'sleep', 'sleepMin', 'sleepMinutes', 'sleepHours', 'flow', 'period'];

function hasSimpleParams(searchParams) {
  return SIMPLE_KEYS.some((key) => searchParams.has(key));
}

function ingestSimple(input) {
  const date = isoDate(input.date) || localToday();
  const health = store.load('health', {});
  health.steps = health.steps || {};
  health.sleep = health.sleep || {};
  health.cycle = health.cycle || { days: {} };

  const summary = { date };

  const steps = num(input.steps);
  if (steps != null) {
    health.steps[date] = Math.round(steps);
    summary.steps = health.steps[date];
  }

  let hours = num(input.sleepHours ?? input.sleep);
  const minutes = num(input.sleepMin ?? input.sleepMinutes);
  if (hours == null && minutes != null) hours = minutes / 60;
  if (hours != null && hours > 24) hours /= 60; // minutes sent in the hours field
  if (hours != null && hours > 0) {
    health.sleep[date] = { ...(health.sleep[date] || {}), hours: round1(hours) };
    summary.sleepHours = round1(hours);
  }

  const flow = input.flow || input.period;
  if (flow) {
    health.cycle.days[date] = String(flow).toLowerCase();
    summary.flow = health.cycle.days[date];
  }

  if (Object.keys(summary).length === 1) {
    throw new Error('No usable values — send steps, sleepMin and/or flow');
  }

  health.lastSync = new Date().toISOString();
  store.save('health', health);
  return summary;
}

function num(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^\d.eE+-]/g, '');
  if (!/\d/.test(cleaned)) return null; // "banana" must not become 0
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Today in the laptop's timezone (toISOString alone would give UTC).
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
