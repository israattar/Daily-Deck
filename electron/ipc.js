// All IPC handlers in one place: the UI asks, the main process answers.
const { ipcMain, dialog, shell } = require('electron');

const store = require('./store');
const appleHealth = require('./integrations/apple-health-import');
const healthWebhook = require('./integrations/health-webhook');
const internships = require('./integrations/internships');
const calendar = require('./integrations/calendar');
const gowish = require('./integrations/gowish');

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

  ipcMain.handle('internships:refresh', (_e, sources) => internships.refreshAll(sources));

  ipcMain.handle('calendar:fetch', (_e, { calendars, from, to }) =>
    calendar.fetchEvents(calendars, from, to)
  );

  ipcMain.handle('gowish:sync', (_e, { shareUrl }) => gowish.fetchWishlist(shareUrl));

  // Open links in the real browser, never inside the app.
  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

module.exports = { registerIpc };
