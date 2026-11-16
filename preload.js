const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onUpdate: (callback) => ipcRenderer.on('update', (_event, data) => callback(data)),
  copy: (text) => ipcRenderer.send('copy', text),
  reportHeight: (height) => ipcRenderer.send('height', height),
});
