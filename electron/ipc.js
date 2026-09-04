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
const claudeUsage = require('./integrations/claude-usage');
const phoneServer = require('./integrations/phone-server');

// Handlers that need nothing but their payload. The phone server reuses this
// exact map over HTTP, so the phone and the desktop share one implementation
// instead of drifting apart. Anything needing a file dialog, the MT4 desktop,
// or a password stays out of here and is registered desktop-only below.
function remoteHandlers(getWindow) {
  return {
    'store:load': ({ name, fallback }) => store.load(name, fallback),
    'store:save': ({ name, data }) => {
      store.save(name, data);

      // Settings changes may turn the health webhook on/off.
      if (name === 'settings') {
        const webhook = data.healthWebhook || {};
        if (webhook.enabled) healthWebhook.start(webhook.port || 5599, getWindow);
        else healthWebhook.stop();
      }
      return true;
    },
    'health:webhookStatus': () => healthWebhook.status(),
    'myfxbook:status': () => myfxbook.status(),
    'myfxbook:sync': ({ accountId } = {}) => myfxbook.sync(accountId),
    'trading:mt4Status': () => mt4Launch.connectionStatus(),
    'prayer:fetch': ({ city }) => prayer.fetchDay(city),
    'news:refresh': () => news.refresh(),
    'internships:refresh': (sources) => internships.refreshAll(sources),
    'calendar:fetch': ({ calendars, from, to }) => calendar.fetchEvents(calendars, from, to),
    'claude:usage': () => claudeUsage.analyze(),
    'claude:snapshots': () => claudeUsage.getSnapshots(),
    'claude:log': (reading) => claudeUsage.logReading(reading),
  };
}

function registerIpc(getWindow) {
  for (const [channel, handler] of Object.entries(remoteHandlers(getWindow))) {
    ipcMain.handle(channel, (_e, payload) => handler(payload));
  }

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

  // Myfxbook login — desktop only: the password must never cross the network.
  ipcMain.handle('myfxbook:configure', (_e, { email, password }) =>
    myfxbook.configureAndTest(email, password)
  );

  // Open MT4 when the Trading tab is viewed, then scan for its data.
  ipcMain.handle('trading:ensureMt4', async () => {
    const result = await mt4Launch.ensureRunning();
    if (result.launched) mt4Live.triggerCatchupScans(getWindow);
    return result;
  });

  // Open links in the real browser, never inside the app.
  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // Phone access — desktop-only controls, so the phone can't disable or
  // re-key the very server it is talking to.
  ipcMain.handle('phone:status', () => phoneServer.status());
  ipcMain.handle('phone:rotate', () => {
    phoneServer.rotateToken();
    return phoneServer.status();
  });
  ipcMain.handle('phone:enable', (_e, { enabled, port } = {}) => {
    const settings = store.load('settings', {}) || {};
    const nextPort = Number(port) || settings.phone?.port || 5601;
    store.save('settings', {
      ...settings,
      phone: { ...(settings.phone || {}), enabled: !!enabled, port: nextPort },
    });
    if (enabled) phoneServer.start(nextPort, getWindow, remoteHandlers(getWindow));
    else phoneServer.stop();
    return phoneServer.status();
  });
}

module.exports = { registerIpc, remoteHandlers };
