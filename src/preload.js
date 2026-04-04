const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API mínima y segura al renderer.
// Solo se expone lo necesario (principio de mínimo privilegio).
contextBridge.exposeInMainWorld('appBridge', {
  // Prueba de conectividad preload ↔ renderer.
  ping: () => 'pong',
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getLocale: () => ipcRenderer.invoke('app:getLocale'),
  getAutoStartStatus: () => ipcRenderer.invoke('app:getAutoStartStatus'),
  setAutoStartEnabled: (enabled) => ipcRenderer.invoke('app:setAutoStartEnabled', enabled),
  chat: (payload) => ipcRenderer.invoke('assistant:chat', payload),
  chatStream: (payload) => ipcRenderer.invoke('assistant:chatStream', payload),
  transcribeAudio: (payload) => ipcRenderer.invoke('assistant:transcribeAudio', payload),
  getAssistantTelemetry: () => ipcRenderer.invoke('assistant:getTelemetry'),
  resetAssistantTelemetry: () => ipcRenderer.invoke('assistant:resetTelemetry'),
  getEvents: () => ipcRenderer.invoke('events:get'),
  saveEvents: (events) => ipcRenderer.invoke('events:save', events),
  onAssistantChunk: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('assistant:chunk', handler);
    return () => ipcRenderer.removeListener('assistant:chunk', handler);
  }
});