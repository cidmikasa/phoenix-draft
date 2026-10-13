/**
 * ============================================================
 * PHOENIX DRAFT — PRELOAD SCRIPT v2
 * Safe IPC bridge + userData filesystem access for heroes.
 * ============================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ——— Cross-window state sync ———
  sendStateUpdate: (state) => ipcRenderer.send('draft-state-update', state),
  onStateUpdate: (callback) => {
    ipcRenderer.on('draft-state-update', (event, state) => callback(state));
  },

  // ——— Fullscreen ———
  toggleDisplayFullscreen: () => ipcRenderer.send('toggle-display-fullscreen'),

  // ——— Hero data (userData) ———
  getHeroesPath:    () => ipcRenderer.invoke('get-heroes-path'),
  readLocalHeroes:  () => ipcRenderer.invoke('read-local-heroes'),
  writeLocalHeroes: (heroes) => ipcRenderer.invoke('write-local-heroes', heroes),
  readLocalVersion: () => ipcRenderer.invoke('read-local-version'),
  writeLocalVersion:(v) => ipcRenderer.invoke('write-local-version', v),

  // ——— Detection flag ———
  isElectron: true
});