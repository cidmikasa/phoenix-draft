/**
 * ============================================================
 * PHOENIX DRAFT — PRELOAD SCRIPT
 * Safe IPC bridge between main process and renderer windows.
 * Exposes a minimal API to both control.html and display.html.
 * ============================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Control → Main → Display (state broadcast)
  sendStateUpdate: (state) => ipcRenderer.send('draft-state-update', state),

  // Display receives state updates
  onStateUpdate: (callback) => {
    ipcRenderer.on('draft-state-update', (event, state) => callback(state));
  },

  // Toggle fullscreen on display window
  toggleDisplayFullscreen: () => ipcRenderer.send('toggle-display-fullscreen'),

  // Detect if running in Electron
  isElectron: true
});