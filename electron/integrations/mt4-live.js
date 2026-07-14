// Live P/L from the DailyDeckReporter Expert Advisor running inside
// desktop MT4. Data arrives two ways (the EA does both, every sync):
//   1. an HTTP POST to /trading on the local listener (instant), and
//   2. a JSON file written into MT4's own data folder, which we watch
//      here as a fallback in case MT4's WebRequest is not whitelisted.
const fs = require('fs');
const path = require('path');
const store = require('./../store');

// Merge {"YYYY-MM-DD": netProfit} into the trading calendar, plus optional
// per-day trade counts {"YYYY-MM-DD": n} and per-day stats
// {"YYYY-MM-DD": {n, w, l, hs, hws, hls}} (trades, wins, losses, and hold
// seconds total / wins-only / losses-only). Days in the payload are
// authoritative; zero days are skipped, and days before the Settings
// "importFrom" cut-off are ignored.
function ingestDays(days, counts, stats, trades) {
  if (!days || typeof days !== 'object') throw new Error('No days in payload');

  const trading = store.load('trading', {});
  trading.days = trading.days || {};
  trading.counts = trading.counts || {};
  trading.stats = trading.stats || {};
  trading.trades = trading.trades || {};
  trading.goals = trading.goals || {};
  const cutoff = importCutoff();

  let imported = 0;
  for (const [date, value] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (cutoff && date < cutoff) continue;
    const profit = Number(value);
    if (!Number.isFinite(profit) || Math.abs(profit) < 0.005) continue;
    trading.days[date] = Math.round(profit * 100) / 100;
    if (stats && stats[date]) {
      trading.stats[date] = stats[date];
      trading.counts[date] = Number(stats[date].n) || undefined;
    } else if (counts && counts[date] != null) {
      trading.counts[date] = Number(counts[date]);
    }
    if (Array.isArray(trades?.[date])) trading.trades[date] = trades[date];
    imported++;
  }
  if (imported > 0) {
    trading.lastMt4Sync = new Date().toISOString();
    store.save('trading', trading);
  }
  return { days: imported };
}

// Settings → Trading imports → "Ignore trades before". Shared by every
// automated trading import; manual entries in the UI are never filtered.
function importCutoff() {
  const date = store.load('settings', {})?.trading?.importFrom;
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : null;
}

// ---- fallback file watcher ---------------------------------------------
// The EA writes MQL4\Files\DailyDeck\pnl.json inside the terminal's data
// folder (%APPDATA%\MetaQuotes\Terminal\<id>\...). Poll for changes.

const seenMtimes = new Map();
let timer = null;

function startWatcher(getWindow) {
  if (timer) return;
  const scan = () => scanOnce(getWindow);
  scan(); // catch up immediately on app start
  timer = setInterval(scan, 45000);
}

// After MT4 is launched it takes ~15-25s to connect and the EA to write.
// Run a few extra scans so freshly-opened MT4 data shows up promptly
// instead of waiting for the next regular poll.
function triggerCatchupScans(getWindow) {
  [8000, 20000, 35000, 55000].forEach((ms) => setTimeout(() => scanOnce(getWindow), ms));
}

function scanOnce(getWindow) {
  for (const file of findReportFiles()) {
    try {
      const mtime = fs.statSync(file).mtimeMs;
      if (seenMtimes.get(file) === mtime) continue;
      seenMtimes.set(file, mtime);
      const payload = JSON.parse(readTextFile(file));
      const summary = ingestDays(payload.days, payload.counts, payload.stats, payload.trades);
      if (summary.days > 0) getWindow()?.webContents.send('trading:updated', summary);
    } catch {
      // unreadable or half-written file — try again next poll
    }
  }
}

function findReportFiles() {
  const terminals = path.join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal');
  let entries = [];
  try {
    entries = fs.readdirSync(terminals);
  } catch {
    return []; // MT4 not installed (yet)
  }
  const files = [];
  for (const entry of entries) {
    const file = path.join(terminals, entry, 'MQL4', 'Files', 'DailyDeck', 'pnl.json');
    if (fs.existsSync(file)) files.push(file);
  }
  return files;
}

// MQL4 may write ANSI or UTF-16 depending on flags — handle both.
function readTextFile(file) {
  const buffer = fs.readFileSync(file);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le').slice(1);
  return buffer.toString('utf8');
}

module.exports = { ingestDays, startWatcher, triggerCatchupScans, importCutoff };
