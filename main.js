const { app, BrowserWindow, ipcMain, Menu, shell, Notification } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const iconPath = isDev
  ? path.join(__dirname, 'build', 'icon.png')
  : path.join(process.resourcesPath, 'icon.png');

const createMainWindow = () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
};

const createNoteWindow = (noteId) => {
  const win = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 400,
    minHeight: 400,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    alwaysOnTop: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('note.html', {
    query: { id: noteId }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
};

app.whenReady().then(() => {
  app.name = 'Sticky Notes';
  // Menu.setApplicationMenu(null);

  createMainWindow();

  ipcMain.handle('open-note-window', (_event, noteId) => {
    if (!noteId) return;
    createNoteWindow(noteId);
  });

  ipcMain.on('broadcast-refresh', (event) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.webContents.id === event.sender.id) return;
      win.webContents.send('refresh-notes');
    });
  });

  ipcMain.handle('send-notification', (_event, title, options = {}) => {
    const notification = new Notification({ title, ...options });
    notification.on('click', () => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.focus();
      });
    });
    notification.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
