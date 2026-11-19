// The Atelier browser's toolbar: navigation and Capture only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atelierBrowser', {
  command: (cmd, arg) => ipcRenderer.invoke('browser:command', cmd, arg),
  capture: (opts) => ipcRenderer.invoke('browser:capture', opts),
  onState(callback) {
    const l = (_e, s) => callback(s);
    ipcRenderer.on('browser:state', l);
    return () => ipcRenderer.removeListener('browser:state', l);
  },
});
