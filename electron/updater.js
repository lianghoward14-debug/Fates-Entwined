const { app, BrowserWindow, ipcMain } = require('electron');

const INITIAL_CHECK_DELAY_MS = 12 * 1000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_EVENT = 'fate:desktop-update-state';

function cleanError(error) {
  const message = error && error.message ? error.message : String(error || 'Unknown update error');
  return message.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function cleanVersion(value) {
  return String(value || '').replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 64);
}

function createDesktopUpdater() {
  let autoUpdater = null;
  let started = false;
  let checkInFlight = null;
  let initialCheckTimer = null;
  let periodicCheckTimer = null;
  let state = {
    supported: false,
    status: 'disabled',
    currentVersion: cleanVersion(app.getVersion()),
    availableVersion: '',
    percent: 0,
    error: '',
    reason: 'not-started'
  };

  function snapshot() {
    return { ...state };
  }

  function broadcast() {
    const payload = snapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isLoadingMainFrame()) continue;
      win.webContents.send(UPDATE_EVENT, payload);
    }
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    broadcast();
  }

  function recordError(error) {
    const message = cleanError(error);
    console.warn('[desktop-updater]', message);
    updateState({ status: 'error', error: message });
  }

  async function checkNow() {
    if (!autoUpdater || !state.supported) return snapshot();
    if (checkInFlight) {
      await checkInFlight;
      return snapshot();
    }
    updateState({ status: 'checking', error: '' });
    checkInFlight = autoUpdater.checkForUpdates()
      .catch(recordError)
      .finally(() => {
        checkInFlight = null;
      });
    await checkInFlight;
    return snapshot();
  }

  async function downloadNow() {
    if (!autoUpdater || !state.supported) return snapshot();
    try {
      updateState({ status: 'downloading', error: '' });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      recordError(error);
    }
    return snapshot();
  }

  function installNow() {
    if (!autoUpdater || state.status !== 'ready') return false;
    // Install silently so updates feel native to the client instead of reopening
    // the interactive NSIS setup wizard, then force the updated app to relaunch.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  }

  ipcMain.handle('fate:desktop-update-get-state', () => snapshot());
  ipcMain.handle('fate:desktop-update-check', () => checkNow());
  ipcMain.handle('fate:desktop-update-download', () => downloadNow());
  ipcMain.handle('fate:desktop-update-install', () => installNow());

  function attachWindow(win) {
    if (!win || win.isDestroyed()) return;
    const sendState = () => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(UPDATE_EVENT, snapshot());
      }
    };
    win.webContents.on('did-finish-load', sendState);
  }

  function start() {
    if (started) return snapshot();
    started = true;

    if (!app.isPackaged) {
      updateState({ reason: 'development-build' });
      return snapshot();
    }
    if (process.platform !== 'win32') {
      updateState({ reason: 'windows-installer-only' });
      return snapshot();
    }
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      updateState({ reason: 'portable-build' });
      return snapshot();
    }

    try {
      ({ autoUpdater } = require('electron-updater'));
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.autoRunAppAfterInstall = true;
      autoUpdater.allowPrerelease = false;
      autoUpdater.logger = {
        info: (...args) => console.info('[desktop-updater]', ...args),
        warn: (...args) => console.warn('[desktop-updater]', ...args),
        error: (...args) => console.error('[desktop-updater]', ...args),
        debug: (...args) => console.debug('[desktop-updater]', ...args)
      };
    } catch (error) {
      updateState({ reason: 'updater-unavailable', error: cleanError(error) });
      return snapshot();
    }

    updateState({ supported: true, status: 'idle', reason: '', error: '' });
    autoUpdater.on('checking-for-update', () => updateState({ status: 'checking', error: '' }));
    autoUpdater.on('update-available', info => {
      updateState({
        status: 'downloading',
        availableVersion: cleanVersion(info && info.version),
        percent: 0,
        error: ''
      });
    });
    autoUpdater.on('update-not-available', () => {
      updateState({ status: 'idle', availableVersion: '', percent: 0, error: '' });
    });
    autoUpdater.on('download-progress', progress => {
      const percent = Number.isFinite(progress && progress.percent)
        ? Math.max(0, Math.min(100, Math.round(progress.percent)))
        : 0;
      updateState({ status: 'downloading', percent });
    });
    autoUpdater.on('update-downloaded', info => {
      updateState({
        status: 'ready',
        availableVersion: cleanVersion(info && info.version) || state.availableVersion,
        percent: 100,
        error: ''
      });
    });
    autoUpdater.on('error', recordError);

    initialCheckTimer = setTimeout(() => checkNow(), INITIAL_CHECK_DELAY_MS);
    periodicCheckTimer = setInterval(() => checkNow(), CHECK_INTERVAL_MS);
    initialCheckTimer.unref?.();
    periodicCheckTimer.unref?.();
    return snapshot();
  }

  function stop() {
    if (initialCheckTimer) clearTimeout(initialCheckTimer);
    if (periodicCheckTimer) clearInterval(periodicCheckTimer);
    initialCheckTimer = null;
    periodicCheckTimer = null;
  }

  return { attachWindow, start, stop, getState: snapshot };
}

module.exports = { createDesktopUpdater };
