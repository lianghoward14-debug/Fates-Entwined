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
