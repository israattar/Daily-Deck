// Tiny JSON-file store. Each "collection" (health, trading, settings, ...)
// is one JSON file in the app's user-data folder, so everything survives
// closing the app, rebooting, updating the code, etc.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(name) {
  if (!/^[a-z-]+$/.test(name)) throw new Error(`Bad collection name: ${name}`);
  return path.join(dataDir(), `${name}.json`);
}

function load(name, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temp file then rename, so a crash mid-write never corrupts data.
function save(name, data) {
  const file = fileFor(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { load, save, dataDir };
