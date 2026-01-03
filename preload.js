const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openNoteWindow: (noteId) => ipcRenderer.invoke('open-note-window', noteId),
  broadcastRefresh: () => ipcRenderer.send('broadcast-refresh'),
  sendNotification: (title, options) => ipcRenderer.invoke('send-notification', title, options),
  onRefreshNotes: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const subscription = () => callback();
    ipcRenderer.on('refresh-notes', subscription);
    return () => ipcRenderer.removeListener('refresh-notes', subscription);
  }
});
