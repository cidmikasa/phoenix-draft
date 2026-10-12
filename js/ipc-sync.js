/**
 * ============================================================
 * PHOENIX DRAFT — IPC SYNC LAYER
 * When running inside Electron, sync state via IPC between windows.
 * When running in a browser (Live Server), fall back to localStorage.
 * ============================================================
 */

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;

/**
 * Broadcast state to other windows.
 * In Electron: sends via IPC.
 * In browser: relies on localStorage + storage event (already handled by state.js).
 */
function broadcastState(state) {
  if (IS_ELECTRON) {
    window.electronAPI.sendStateUpdate(state);
  }
  // In browser, saveDraftState() handles localStorage + polling fallback
}

/**
 * Listen for state updates from other windows.
 * In Electron: uses IPC listener.
 * In browser: state.js's onDraftStateChange handles it.
 */
function listenForStateUpdate(callback) {
  if (IS_ELECTRON) {
    window.electronAPI.onStateUpdate((state) => {
      callback(state);
    });
  }
  // In browser, onDraftStateChange() in state.js handles it
}

window.IS_ELECTRON = IS_ELECTRON;
window.broadcastState = broadcastState;
window.listenForStateUpdate = listenForStateUpdate;