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
