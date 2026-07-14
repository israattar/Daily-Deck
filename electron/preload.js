// Safe bridge between the UI and the main process.
// The UI only sees `window.deck` — no direct Node access.
const { contextBridge, ipcRenderer } = require('electron');

// Every channel the UI is allowed to call.
const INVOKE_CHANNELS = [
  'store:load',
  'store:save',
  'health:importExport',
  'health:webhookStatus',
  'internships:refresh',
  'trading:importMT4',
  'myfxbook:configure',
  'myfxbook:status',
  'myfxbook:sync',
  'trading:ensureMt4',
  'trading:mt4Status',
  'prayer:fetch',
  'news:refresh',
  'calendar:fetch',
  'gowish:sync',
  'shell:open',
];

// Channels the main process pushes to the UI.
const EVENT_CHANNELS = ['health:updated', 'trading:updated'];

contextBridge.exposeInMainWorld('deck', {
  load: (name, fallback) => ipcRenderer.invoke('store:load', { name, fallback }),
  save: (name, data) => ipcRenderer.invoke('store:save', { name, data }),

  invoke: (channel, payload) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload);
  },

  on: (channel, callback) => {
    if (!EVENT_CHANNELS.includes(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
