/**
 * ============================================================
 * PHOENIX DRAFT — ELECTRON MAIN PROCESS v2
 * Two windows: Control (main) + Display (borderless).
 * Ctrl+F toggles fullscreen on the DISPLAY window.
 * Ctrl+Shift+F toggles fullscreen on the CONTROL window.
 * ============================================================
 */

const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow = null;
let displayWindow = null;
let activeWindow = 'control'; // which window has "focus" for shortcuts

// ——— WINDOW POSITION STORAGE ———
const userDataPath = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to load window state:', e);
  }
  return null;
}

function saveWindowState(state) {
  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn('Failed to save window state:', e);
  }
}

// ——— DISPLAY WINDOW POSITION LOGIC ———
function getDisplayWindowBounds() {
  const saved = loadWindowState();
  const displays = screen.getAllDisplays();

  // Saved position wins
  if (saved && saved.displayBounds) {
    return saved.displayBounds;
  }

  // Second monitor if available
  if (displays.length > 1) {
    const secondary = displays[1];
    return {
      x: secondary.bounds.x + 40,
      y: secondary.bounds.y + 40,
      width: Math.min(1600, secondary.bounds.width - 80),
      height: Math.min(900, secondary.bounds.height - 80)
    };
  }

  // Fallback — offset from control window
  const primary = screen.getPrimaryDisplay();
  return {
    x: primary.bounds.x + 80,
    y: primary.bounds.y + 80,
    width: 1280,
    height: 720
  };
}

// ——— CREATE CONTROL WINDOW ———
function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Phoenix Draft — Control',
    backgroundColor: '#050202',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile('control.html');

  controlWindow.on('focus', () => { activeWindow = 'control'; });

  controlWindow.on('closed', () => {
    controlWindow = null;
    if (displayWindow && !displayWindow.isDestroyed()) {
      displayWindow.close();
    }
    app.quit();
  });
}

// ——— CREATE DISPLAY WINDOW ———
function createDisplayWindow() {
  const bounds = getDisplayWindowBounds();

  displayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'Phoenix Draft — Display',
    frame: false,
    backgroundColor: '#050202',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  displayWindow.loadFile('display.html');

  displayWindow.on('focus', () => { activeWindow = 'display'; });

  // Remember position on move/resize (only when NOT fullscreen)
  const savePosition = () => {
    if (!displayWindow || displayWindow.isDestroyed()) return;
    if (displayWindow.isFullScreen()) return; // don't save fullscreen bounds
    const b = displayWindow.getBounds();
    saveWindowState({ displayBounds: b });
  };

  displayWindow.on('move', savePosition);
  displayWindow.on('resize', savePosition);

  displayWindow.on('closed', () => {
    displayWindow = null;
  });
}

// ——— FULLSCREEN TOGGLE IPC ———
ipcMain.on('toggle-display-fullscreen', () => {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.setFullScreen(!displayWindow.isFullScreen());
  }
});

ipcMain.on('toggle-control-fullscreen', () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.setFullScreen(!controlWindow.isFullScreen());
  }
});

// ——— HERO DATA FILE OPERATIONS ———
const HEROES_FILE = path.join(userDataPath, 'heroes.json');
const VERSION_FILE = path.join(userDataPath, 'heroes-version.json');

ipcMain.handle('get-heroes-path', () => {
  return HEROES_FILE;
});

ipcMain.handle('read-local-heroes', () => {
  try {
    if (fs.existsSync(HEROES_FILE)) {
      return JSON.parse(fs.readFileSync(HEROES_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to read local heroes:', e);
  }
  return null; // null = app falls back to bundled assets/heroes.json
});

ipcMain.handle('write-local-heroes', (event, heroes) => {
  try {
    fs.writeFileSync(HEROES_FILE, JSON.stringify(heroes, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to write local heroes:', e);
    return false;
  }
});

ipcMain.handle('read-local-version', () => {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to read local version:', e);
  }
  return null;
});

ipcMain.handle('write-local-version', (event, v) => {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to write local version:', e);
    return false;
  }
});

// ——— APP LIFECYCLE ———
app.whenReady().then(() => {
  createControlWindow();
  createDisplayWindow();

  // Global shortcuts
  globalShortcut.register('CommandOrControl+F', () => {
    // Toggle fullscreen on the display window (main use case)
    if (displayWindow && !displayWindow.isDestroyed()) {
      displayWindow.setFullScreen(!displayWindow.isFullScreen());
    }
  });

  globalShortcut.register('CommandOrControl+Shift+F', () => {
    // Toggle fullscreen on the control window
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.setFullScreen(!controlWindow.isFullScreen());
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      createDisplayWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ——— IPC: CROSS-WINDOW STATE SYNC ———
ipcMain.on('draft-state-update', (event, state) => {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.webContents.send('draft-state-update', state);
  }
});

ipcMain.handle('request-current-state', () => {
  return null;
});