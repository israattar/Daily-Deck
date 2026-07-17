// All IPC handlers in one place: the UI asks, the main process answers.
const { ipcMain, dialog, shell } = require('electron');

const store = require('./store');
const appleHealth = require('./integrations/apple-health-import');
const healthWebhook = require('./integrations/health-webhook');
const internships = require('./integrations/internships');
const mt4 = require('./integrations/mt4-import');
const myfxbook = require('./integrations/myfxbook');
const mt4Launch = require('./integrations/mt4-launch');
const mt4Live = require('./integrations/mt4-live');
const prayer = require('./integrations/prayer');
const news = require('./integrations/news');
const calendar = require('./integrations/calendar');
const gowish = require('./integrations/gowish');
const claudeUsage = require('./integrations/claude-usage');

function registerIpc(getWindow) {
  ipcMain.handle('store:load', (_e, { name, fallback }) => store.load(name, fallback));
  ipcMain.handle('store:save', (_e, { name, data }) => {
    store.save(name, data);

    // Settings changes may turn the health webhook on/off.
    if (name === 'settings') {
      const webhook = data.healthWebhook || {};
      if (webhook.enabled) healthWebhook.start(webhook.port || 5599, getWindow);
      else healthWebhook.stop();
    }
    return true;
  });

  // Pick an Apple Health export.xml and merge its history into the health store.
  ipcMain.handle('health:importExport', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Select your Apple Health export.xml',
      filters: [{ name: 'Apple Health export', extensions: ['xml'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return appleHealth.importFile(result.filePaths[0]);
  });

  ipcMain.handle('health:webhookStatus', () => healthWebhook.status());

  // Pick a MetaTrader 4 statement (.htm) and merge its per-day P/L.
  ipcMain.handle('trading:importMT4', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Select your MT4 statement report',
      filters: [{ name: 'MT4 report', extensions: ['htm', 'html'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return mt4.importFile(result.filePaths[0]);
  });

  // Myfxbook — automatic MT4 P/L sync (works with phone-only MT4).
  ipcMain.handle('myfxbook:configure', (_e, { email, password }) =>
    myfxbook.configureAndTest(email, password)
  );
  ipcMain.handle('myfxbook:status', () => myfxbook.status());
  ipcMain.handle('myfxbook:sync', (_e, { accountId } = {}) => myfxbook.sync(accountId));

  // Open MT4 when the Trading tab is viewed, then scan for its data.
  ipcMain.handle('trading:ensureMt4', async () => {
    const result = await mt4Launch.ensureRunning();
    if (result.launched) mt4Live.triggerCatchupScans(getWindow);
    return result;
  });

  ipcMain.handle('trading:mt4Status', () => mt4Launch.connectionStatus());

  ipcMain.handle('prayer:fetch', (_e, { city }) => prayer.fetchDay(city));

  ipcMain.handle('news:refresh', () => news.refresh());

  ipcMain.handle('internships:refresh', (_e, sources) => internships.refreshAll(sources));

  ipcMain.handle('calendar:fetch', (_e, { calendars, from, to }) =>
    calendar.fetchEvents(calendars, from, to)
  );

  ipcMain.handle('gowish:sync', (_e, { shareUrl }) => gowish.fetchWishlist(shareUrl));

  // Claude usage analytics — local transcripts + optional account limits.
  ipcMain.handle('claude:usage', () => claudeUsage.analyze());
  ipcMain.handle('claude:snapshots', () => claudeUsage.getSnapshots());
  ipcMain.handle('claude:log', (_e, reading) => claudeUsage.logReading(reading));

  // Open links in the real browser, never inside the app.
  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

module.exports = { registerIpc };
