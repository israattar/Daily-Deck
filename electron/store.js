// Tiny JSON-file store. Each "collection" (health, trading, settings, ...)
// is one JSON file in the app's user-data folder, so everything survives
// closing the app, rebooting, updating the code, etc.
//
// Every save is also mirrored to a folder under Documents (which on this
// machine is OneDrive-synced), so a wiped %APPDATA% — the actual cause of
// a past data-loss incident — doesn't take the only copy with it. If the
// primary file is ever missing, load() recovers from the mirror and
// re-seeds the primary automatically.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mirrorDir() {
  const dir = path.join(app.getPath('documents'), 'Daily Deck Backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(name) {
  if (!/^[a-z-]+$/.test(name)) throw new Error(`Bad collection name: ${name}`);
  return path.join(dataDir(), `${name}.json`);
}

function mirrorFileFor(name) {
  return path.join(mirrorDir(), `${name}.json`);
}

// Write to a temp file then rename, so a crash mid-write never corrupts data.
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function load(name, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch {
    // Primary missing or unreadable — fall back to the mirror and heal the primary.
    try {
      const text = fs.readFileSync(mirrorFileFor(name), 'utf8');
      try { writeAtomic(fileFor(name), text); } catch { /* best effort */ }
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }
}

function save(name, data) {
  const text = JSON.stringify(data, null, 2);
  writeAtomic(fileFor(name), text);
  try { writeAtomic(mirrorFileFor(name), text); } catch { /* mirror is best-effort */ }
}

module.exports = { load, save, dataDir };
