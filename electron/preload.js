const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FateElectronZoom', {
  get() {
    return ipcRenderer.invoke('fate:get-zoom-factor');
  },
  set(factor) {
    return ipcRenderer.invoke('fate:set-zoom-factor', factor);
  },
  reset() {
    return ipcRenderer.invoke('fate:set-zoom-factor', 1);
  }
});

contextBridge.exposeInMainWorld('FateElectronPerformance', {
  getInfo() {
    return ipcRenderer.invoke('fate:get-performance-info');
  }
});

contextBridge.exposeInMainWorld('FateElectronDiagnostics', {
  startUiMinuteLog(meta) {
    return ipcRenderer.invoke('fate:start-ui-minute-log', meta || {});
  },
  appendUiMinuteLog(payload) {
    return ipcRenderer.invoke('fate:append-ui-minute-log', payload || {});
  },
  finishUiMinuteLog(payload) {
    return ipcRenderer.invoke('fate:finish-ui-minute-log', payload || {});
  }
});

contextBridge.exposeInMainWorld('FateElectronAuthBridge', {
  beginGoogleSignIn(options) {
    return ipcRenderer.invoke('fate:begin-external-google-signin', options || {});
  }
});

contextBridge.exposeInMainWorld('FateElectronFlyApi', {
  request(options) {
    return ipcRenderer.invoke('fate:fly-api-request', options || {});
  }
});

contextBridge.exposeInMainWorld('FateDesktopUpdater', {
  getState() {
    return ipcRenderer.invoke('fate:desktop-update-get-state');
  },
  check() {
    return ipcRenderer.invoke('fate:desktop-update-check');
  },
  download() {
    return ipcRenderer.invoke('fate:desktop-update-download');
  },
  install() {
    return ipcRenderer.invoke('fate:desktop-update-install');
  },
  onState(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (event, state) => callback(state);
    ipcRenderer.on('fate:desktop-update-state', listener);
    return () => ipcRenderer.removeListener('fate:desktop-update-state', listener);
  }
});

ipcRenderer.on('fate:desktop-window-shown', () => {
  window.dispatchEvent(new Event('fate-desktop-window-shown'));
});

setTimeout(() => {
  ipcRenderer.invoke('fate:append-ui-minute-log', {
    type: 'preload-ready',
    at: new Date().toISOString(),
    sessionId: 'preload-boot',
    href: location.href,
    userAgent: navigator.userAgent
  }).catch(() => {});
}, 0);
