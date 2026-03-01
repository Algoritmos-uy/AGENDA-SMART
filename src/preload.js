const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API mínima y segura al renderer.
// Solo se expone lo necesario (principio de mínimo privilegio).
contextBridge.exposeInMainWorld('appBridge', {
  // Prueba de conectividad preload ↔ renderer.
  ping: () => 'pong',
  getVersion: () => ipcRenderer.invoke('app:getVersion')
});