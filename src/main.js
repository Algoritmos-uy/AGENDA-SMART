const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const { callAssistant, callAssistantStream } = require('./assistant');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

function createWindow() {
  const iconName = process.platform === 'win32' ? 'agenda.ico' : 'agenda.png';
  const iconPath = path.join(app.getAppPath(), 'assets', 'icons', iconName);
  const indexPath = path.join(app.getAppPath(), 'index.html');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setTitle(`Agenda-Smart Profesional v${app.getVersion()}`);
  win.loadFile(indexPath);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.isEditable },
      { role: 'copy', enabled: params.selectionText?.length > 0 || params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Recargar', role: 'reload' },
      { label: 'Inspeccionar', click: () => win.webContents.inspectElement(params.x, params.y) },
    ]);
    menu.popup({ window: win });
  });

  return win;
}

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getLocale', () => {
  // Preferimos el locale del sistema. Si falla, devolvemos 'es'.
  try {
    if (typeof app.getPreferredSystemLanguages === 'function') {
      const langs = app.getPreferredSystemLanguages();
      if (Array.isArray(langs) && langs.length) return langs[0];
    }
    return app.getLocale?.() || 'es';
  } catch (e) {
    return 'es';
  }
});
ipcMain.handle('assistant:chat', async (_event, payload = {}) => {
  const { messages = [] } = payload;
  return callAssistant(messages);
});
ipcMain.handle('assistant:chatStream', async (event, payload = {}) => {
  const { messages = [], requestId } = payload;
  const sender = event?.sender;
  const sendChunk = (data) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('assistant:chunk', { ...data, requestId });
    }
  };
  return callAssistantStream(messages, { onChunk: sendChunk });
});

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.agenda.online');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});