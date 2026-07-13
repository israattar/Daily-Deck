// Opens desktop MT4 on demand (when the Trading tab is viewed) so the
// DailyDeckReporter EA can sync — without keeping MT4 running all day.
// Launches minimised, and only if MT4 isn't already open.
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const store = require('./../store');

const EXE = 'terminal.exe';

// Find MT4's terminal.exe: a saved path wins, otherwise scan the usual
// Program Files locations for a MetaTrader/FP Markets install.
function detectPath() {
  const saved = store.load('settings', {})?.trading?.mt4Path;
  if (saved && fs.existsSync(saved)) return saved;

  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const dir of dirs) {
      if (!/mt4|metatrader|fpmarkets|fp markets/i.test(dir)) continue;
      const candidate = path.join(root, dir, EXE);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function isRunning() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${EXE}`, '/NH'], (err, stdout) => {
      resolve(!err && stdout.toLowerCase().includes(EXE));
    });
  });
}

// Ensure MT4 is open. Returns what happened so the UI can show status.
async function ensureRunning() {
  if (await isRunning()) return { running: true, launched: false };

  const exe = detectPath();
  if (!exe) return { running: false, launched: false, error: 'MT4 not found — set its path in Settings' };

  // `start "" /min` launches minimised without stealing focus.
  exec(`start "" /min "${exe}"`, { windowsHide: true });
  return { running: true, launched: true, path: exe };
}

// Is MT4 open and has it synced recently? Used for the Trading status light.
// "fresh" allows a bit over one EA cycle (5 min) before it counts as stale.
async function connectionStatus() {
  const running = await isRunning();
  const lastSync = store.load('trading', {})?.lastMt4Sync || null;
  const ageMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
  return { running, lastSync, fresh: running && ageMs < 7 * 60 * 1000, found: !!detectPath() };
}

module.exports = { ensureRunning, detectPath, connectionStatus };
