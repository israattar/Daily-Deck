// Loads a page in an invisible browser window and runs an extractor script
// in it once it has rendered. Used for sites without a public API
// (Bright Network) — Electron is real Chromium, so JS-rendered
// pages and Cloudflare checks work where plain HTTP requests fail.
const { BrowserWindow } = require('electron');

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function scrape(url, extractorJs, { timeoutMs = 30000 } = {}) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.webContents.setUserAgent(CHROME_UA);

  try {
    await win.loadURL(url).catch(() => {}); // some sites "fail" the first load then redirect
    const deadline = Date.now() + timeoutMs;

    // Poll until the extractor finds something (pages render asynchronously).
    while (Date.now() < deadline) {
      await sleep(1500);
      try {
        const result = await win.webContents.executeJavaScript(extractorJs, true);
        if (result && (!Array.isArray(result) || result.length > 0)) return result;
      } catch {
        // page still navigating — keep waiting
      }
    }
    return null;
  } finally {
    win.destroy();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { scrape };
