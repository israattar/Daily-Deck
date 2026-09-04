// Daily Deck — Electron main process.
// Creates the window, wires up IPC, and starts the health webhook server.
const { app, BrowserWindow } = require('electron');
const path = require('path');

const store = require('./store');
const { registerIpc, remoteHandlers } = require('./ipc');
const healthWebhook = require('./integrations/health-webhook');
const mt4Live = require('./integrations/mt4-live');
const phoneServer = require('./integrations/phone-server');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0d0e1f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Surface renderer console errors on stdout when debugging (DECK_DEBUG=1).
  if (process.env.DECK_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Only one instance of Daily Deck — clicking the shortcut again focuses it.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc(() => mainWindow);
    createWindow();

    const settings = store.load('settings', {});
    if (settings.healthWebhook?.enabled) {
      healthWebhook.start(settings.healthWebhook.port || 5599, () => mainWindow);
    }

    // Serve the UI to her phone when she's turned it on in Settings.
    if (settings.phone?.enabled) {
      phoneServer.start(settings.phone.port || 5601, () => mainWindow, remoteHandlers(() => mainWindow));
    }

    // Watch for P/L files from the MT4 Expert Advisor (no-op until MT4 exists).
    mt4Live.startWatcher(() => mainWindow);
  });
}

app.on('window-all-closed', () => app.quit());
