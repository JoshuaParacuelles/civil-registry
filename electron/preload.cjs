const { contextBridge, ipcRenderer } = require('electron');

// Ma-expose lang kini nga functions sa renderer (React app).
// Walay direct access sa ipcRenderer ang frontend, para luwas.
contextBridge.exposeInMainWorld('desktop', {

  getAppVersion: () => ipcRenderer.invoke('app:version'),

  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),

  setFullscreen: (value) => ipcRenderer.invoke('window:set-fullscreen', !!value),

  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),

  // Mo-return og unsubscribe function, kay gi-call kini sa Settings.jsx
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
});