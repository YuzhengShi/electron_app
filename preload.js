const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendSelectedText: (text) => ipcRenderer.send('selected-text', text)
});