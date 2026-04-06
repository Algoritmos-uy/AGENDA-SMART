const { app, BrowserWindow, Menu, shell, ipcMain, Tray, session } = require('electron');
const { callAssistant, callAssistantStream, transcribeAudio, synthesizeSpeech } = require('./assistant');
const telemetry = require('./assistantTelemetry');
const { isAutoStartSupported, isAutoStartLaunch } = require('./autoStartUtils');
const store = require('./backgroundStore');
const scheduler = require('./backgroundScheduler');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
const stayInTray = true;
const AUTOSTART_ARG = '--autostart';

function configureMediaPermissions() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const isLocalApp = String(requestingOrigin || '').startsWith('file://');
    if (!isLocalApp) return false;
    return permission === 'media' || permission === 'audioCapture';
  });

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const isLocalApp = String(details?.requestingUrl || '').startsWith('file://');
    if (!isLocalApp) {
      callback(false);
      return;
    }
    callback(permission === 'media' || permission === 'audioCapture');
  });
}

function createWindow({ startHidden = false } = {}) {
  const iconName = process.platform === 'win32' ? 'agenda.ico' : 'agenda.png';
  const iconPath = path.join(app.getAppPath(), 'assets', 'icons', iconName);
  const indexPath = path.join(app.getAppPath(), 'index.html');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: !startHidden,
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

  win.on('close', (e) => {
    if (isQuitting) return;
    if (stayInTray) {
      e.preventDefault();
      win.hide();
      return;
    }
    isQuitting = true;
  });

  mainWindow = win;
  return win;
}

function getAutoStartStatus() {
  const supported = isAutoStartSupported(process.platform);
  const settings = typeof app.getLoginItemSettings === 'function' ? app.getLoginItemSettings() : {};
  return {
    supported,
    enabled: supported ? !!settings?.openAtLogin : false,
    launchAtLogin: isAutoStartLaunch({ argv: process.argv, loginItemSettings: settings }),
  };
}

function setAutoStartEnabled(enabled) {
  const supported = isAutoStartSupported(process.platform);
  if (!supported || typeof app.setLoginItemSettings !== 'function') {
    return { ok: false, ...getAutoStartStatus() };
  }

  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: true,
    args: [AUTOSTART_ARG],
  });

  return { ok: true, ...getAutoStartStatus() };
}

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getLocale', () => {
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
ipcMain.handle('app:getAutoStartStatus', () => getAutoStartStatus());
ipcMain.handle('app:setAutoStartEnabled', (_event, enabled) => setAutoStartEnabled(Boolean(enabled)));
ipcMain.handle('assistant:chat', async (_event, payload = {}) => {
  const { messages = [], provider, retry = false } = payload;
  return callAssistant(messages, { provider, retry });
});
ipcMain.handle('assistant:chatStream', async (event, payload = {}) => {
  const { messages = [], requestId, provider, retry = false } = payload;
  const sender = event?.sender;
  const sendChunk = (data) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('assistant:chunk', { ...data, requestId });
    }
  };
  return callAssistantStream(messages, { onChunk: sendChunk, provider, retry });
});
ipcMain.handle('assistant:transcribeAudio', async (_event, payload = {}) => {
  const { provider = 'openai', language = 'es', mimeType = 'audio/webm', audioBuffer } = payload;
  return transcribeAudio({ audioBuffer, mimeType, language }, { provider });
});
ipcMain.handle('assistant:synthesizeSpeech', async (_event, payload = {}) => {
  const { text = '', provider, language = 'es', voice, format = 'mp3' } = payload;
  return synthesizeSpeech({ text, language, voice, format }, { provider });
});
ipcMain.handle('assistant:getTelemetry', async () => telemetry.getSnapshot());
ipcMain.handle('assistant:resetTelemetry', async () => {
  telemetry.resetTelemetry();
  return { ok: true };
});

ipcMain.handle('events:get', async () => store.readEvents());

ipcMain.handle('events:save', async (_event, list = []) => {
  try {
    const normalized = Array.isArray(list) ? list : [];
    await store.writeEvents(normalized);
    scheduler.onEventsSaved();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'write_failed' };
  }
});

function createTray() {
  const iconName = process.platform === 'win32' ? 'agenda.ico' : 'agenda.png';
  const iconPath = path.join(app.getAppPath(), 'assets', 'icons', iconName);
  tray = new Tray(iconPath);
  tray.setToolTip('Agenda-Smart Profesional');
  const template = [
    {
      label: 'Mostrar',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.agenda.online');
  configureMediaPermissions();
  const autoStart = getAutoStartStatus();
  const startHidden = stayInTray && autoStart.launchAtLogin;
  createWindow({ startHidden });
  createTray();

  scheduler.initScheduler();
  store.readEvents().then(() => {
    scheduler.checkUpcomingEvents();
  }).catch(() => scheduler.checkUpcomingEvents());

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
  if (isQuitting) return;
  if (process.platform !== 'darwin') {
    return;
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  scheduler.clearAllTimers();
});