const { app, BrowserWindow, Menu, WebContentsView, clipboard, ipcMain, shell, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const { normalizeBackend, normalizeConfig, normalizeUrl } = require('./backend-profiles');

const LEGACY_DEV_URL = 'http://42.69.42.44:8792/';
const DEFAULT_URL = 'http://42.69.42.44:8791/';
const TITLEBAR_HEIGHT = 30;
const MAC_DOCK_BOUNCE_COUNT = 3;
const MAC_DOCK_BOUNCE_INTERVAL_MS = 800;
const RESIZE_DIRECTIONS = new Set(['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 500;
let mainWindow;
let config;
let dialogOpen = false;
let resizeDrag = null;
let dockBounceTimers = [];
let dockBounceIds = [];
const backendViews = new Map();

if (process.env.PASSIDECK_SMOKE_USER_DATA) app.setPath('userData', process.env.PASSIDECK_SMOKE_USER_DATA);

function configPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function releaseBackendUrl(value) {
  const url = normalizeUrl(value);
  return url === LEGACY_DEV_URL ? DEFAULT_URL : url;
}

function readConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (stored.backendUrl) stored.backendUrl = releaseBackendUrl(stored.backendUrl);
    return normalizeConfig(stored);
  } catch {
    return normalizeConfig();
  }
}

function writeConfig() {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function applyStartupOverride() {
  try {
    const arg = process.argv.find(value => value.startsWith('--url='));
    const value = arg?.slice('--url='.length) || process.env.PASSIDECK_URL;
    if (!value) return;
    config.backends[0].url = releaseBackendUrl(value);
    config.activeBackendId = config.backends[0].id;
  } catch (error) {
    console.error(`[backend] invalid URL override: ${error.message}`);
  }
}

function shellState() {
  return {
    activeBackendId: config.activeBackendId,
    globalSoundEnabled: config.globalSoundEnabled,
    backends: config.backends.map(backend => {
      const entry = backendViews.get(backend.id);
      return {
        ...backend,
        status: entry?.status || 'loading',
        attention: Boolean(entry?.attention),
        hiddenDesktopAttention: Boolean(entry?.hiddenDesktopAttention),
        notifyBlinking: entry?.notifyBlinking ?? config.notifyBlinking
      };
    })
  };
}

function notifyShell() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('passideck:backends-changed', shellState());
}

function clearBackendAttention(id, notify = true) {
  const entry = backendViews.get(id);
  if (!entry || (!entry.attention && !entry.hiddenDesktopAttention)) return;
  entry.attention = false;
  entry.hiddenDesktopAttention = false;
  if (notify) notifyShell();
}

function backendIdForSender(event) {
  if (event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted PassiDeck backend frame');
  for (const [id, entry] of backendViews) {
    if (entry.view.webContents === event.sender) return id;
  }
  throw new Error('Unknown PassiDeck backend');
}

function passideckWindowIsFocused() {
  const focused = webContents.getFocusedWebContents();
  if (mainWindow?.isFocused() || focused === mainWindow?.webContents) return true;
  for (const entry of backendViews.values()) {
    if (focused === entry.view.webContents) return true;
  }
  return false;
}

function stopNativeAttention() {
  if (process.platform !== 'darwin') {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
    return;
  }
  for (const timer of dockBounceTimers) clearTimeout(timer);
  for (const id of dockBounceIds) app.dock?.cancelBounce(id);
  dockBounceTimers = [];
  dockBounceIds = [];
}

function requestNativeAttention() {
  if (passideckWindowIsFocused()) return;
  if (process.platform !== 'darwin') {
    mainWindow.flashFrame(true);
    return;
  }
  stopNativeAttention();
  const bounce = () => {
    if (passideckWindowIsFocused()) return;
    const id = app.dock?.bounce('informational');
    if (id !== undefined) dockBounceIds.push(id);
  };
  bounce();
  for (let i = 1; i < MAC_DOCK_BOUNCE_COUNT; i++) {
    dockBounceTimers.push(setTimeout(bounce, i * MAC_DOCK_BOUNCE_INTERVAL_MS));
  }
}

function markBackendResponseComplete(id, details = {}) {
  const entry = backendViews.get(id);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) return;
  requestNativeAttention();
  entry.attention = true;
  entry.hiddenDesktopAttention ||= details?.hiddenDesktop === true;
  notifyShell();
}

function activeView() {
  return backendViews.get(config.activeBackendId)?.view;
}

function focusActiveView() {
  const view = activeView();
  if (!view || dialogOpen || view.webContents.isDestroyed()) return;
  view.webContents.focus();
}

function fitActiveView() {
  const view = activeView();
  if (!view || !mainWindow || dialogOpen) return;
  const [width, height] = mainWindow.getContentSize();
  view.setBounds({
    x: 0,
    y: TITLEBAR_HEIGHT,
    width: Math.max(0, width),
    height: Math.max(0, height - TITLEBAR_HEIGHT)
  });
}

function setDialogOpen(open) {
  const next = Boolean(open);
  if (next === dialogOpen) return dialogOpen;
  dialogOpen = next;
  const view = activeView();
  if (!view || !mainWindow) return dialogOpen;
  if (dialogOpen) mainWindow.contentView.removeChildView(view);
  else {
    mainWindow.contentView.addChildView(view);
    fitActiveView();
    focusActiveView();
  }
  return dialogOpen;
}

function setViewStatus(id, status) {
  const entry = backendViews.get(id);
  if (!entry || entry.status === status) return;
  entry.status = status;
  notifyShell();
}

function setGlobalSoundEnabled(enabled) {
  config.globalSoundEnabled = Boolean(enabled);
  for (const { view } of backendViews.values()) view.webContents.setAudioMuted(!config.globalSoundEnabled);
  writeConfig();
  notifyShell();
}

function setNotifyBlinking(event, enabled) {
  const entry = backendViews.get(backendIdForSender(event));
  config.notifyBlinking = Boolean(enabled);
  entry.notifyBlinking = config.notifyBlinking;
  writeConfig();
  notifyShell();
}

function activeUiHidden(toggle = false) {
  const view = activeView();
  if (!view || view.webContents.isDestroyed()) return false;
  return view.webContents.executeJavaScript(
    `(() => { if (${toggle} && typeof toggleChrome === 'function') toggleChrome(); return document.body.classList.contains('chrome-hidden'); })()`
  );
}

async function copySelectionOnContextMenu(webContents, params) {
  let selectedText = params.selectionText;
  if (!selectedText) {
    try {
      selectedText = await webContents.executeJavaScript(
        `typeof activeTerminalEntry === 'function' ? (() => { const entry = activeTerminalEntry(); return entry?.term ? entry.term.getSelection() : ''; })() : ''`
      );
    } catch {}
  }
  if (!selectedText) return;
  clipboard.writeText(selectedText);
  try {
    await webContents.executeJavaScript(
      `(() => { const entry = typeof activeTerminalEntry === 'function' ? activeTerminalEntry() : null; if (entry?.term) entry.term.clearSelection(); window.getSelection?.()?.removeAllRanges(); })()`
    );
  } catch {}
}

function createBackendView(backend) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  const entry = { view, status: 'loading', notifyBlinking: config.notifyBlinking };
  backendViews.set(backend.id, entry);
  view.setBackgroundColor('#020505');
  view.webContents.setAudioMuted(!config.globalSoundEnabled);
  view.webContents.on('dom-ready', () => { void view.webContents.insertCSS('#chromePeek { display: none !important; }'); });
  view.webContents.on('did-start-loading', () => setViewStatus(backend.id, 'loading'));
  view.webContents.on('did-finish-load', () => setViewStatus(backend.id, 'online'));
  view.webContents.on('did-fail-load', () => setViewStatus(backend.id, 'offline'));
  view.webContents.on('render-process-gone', () => setViewStatus(backend.id, 'offline'));
  view.webContents.on('context-menu', (_event, params) => {
    void copySelectionOnContextMenu(view.webContents, params);
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(backend.url).origin) event.preventDefault();
  });
  view.webContents.on('will-redirect', (event, url) => {
    if (new URL(url).origin !== new URL(backend.url).origin) event.preventDefault();
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (['http:', 'https:'].includes(new URL(url).protocol)) shell.openExternal(url).catch(() => {});
    } catch {}
    return { action: 'deny' };
  });
  view.webContents.loadURL(backend.url);
  return view;
}

function selectBackend(id) {
  const backend = config.backends.find(item => item.id === id);
  if (!backend) throw new Error('Unknown backend');
  const previous = activeView();
  if (previous) mainWindow.contentView.removeChildView(previous);
  config.activeBackendId = id;
  const view = backendViews.get(id)?.view || createBackendView(backend);
  if (!dialogOpen) {
    mainWindow.contentView.addChildView(view);
    fitActiveView();
    focusActiveView();
    clearBackendAttention(id, false);
  }
  writeConfig();
  notifyShell();
}

function saveBackend(value) {
  const existing = config.backends.find(item => item.id === value?.id);
  const backend = normalizeBackend({ ...value, id: existing?.id }, existing);
  if (existing) {
    Object.assign(existing, backend);
    const entry = backendViews.get(existing.id);
    if (entry && entry.view.webContents.getURL() !== existing.url) entry.view.webContents.loadURL(existing.url);
  } else {
    config.backends.push(backend);
    createBackendView(backend);
  }
  writeConfig();
  notifyShell();
}

function removeBackend(id) {
  if (config.backends.length === 1) throw new Error('At least one backend is required');
  const index = config.backends.findIndex(backend => backend.id === id);
  if (index < 0) throw new Error('Unknown backend');
  const wasActive = config.activeBackendId === id;
  const entry = backendViews.get(id);
  if (entry) {
    mainWindow.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
    backendViews.delete(id);
  }
  config.backends.splice(index, 1);
  if (wasActive) return selectBackend(config.backends[Math.min(index, config.backends.length - 1)].id);
  writeConfig();
  notifyShell();
}

function assertShellSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted PassiDeck shell');
  }
}

function assertResizeSender(event) {
  if (event.sender === mainWindow?.webContents) assertShellSender(event);
  else backendIdForSender(event);
}

function resizeWindowFromRenderer(event, phase, value = {}) {
  assertResizeSender(event);
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  if (phase === 'end') {
    resizeDrag = null;
    return;
  }
  const screenX = Number(value.screenX);
  const screenY = Number(value.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  if (phase === 'start') {
    if (!RESIZE_DIRECTIONS.has(value.direction) || mainWindow.isMaximized()) return;
    resizeDrag = { direction: value.direction, screenX, screenY, bounds: mainWindow.getBounds() };
    return;
  }
  if (phase !== 'move' || !resizeDrag) return;
  const dx = screenX - resizeDrag.screenX;
  const dy = screenY - resizeDrag.screenY;
  const start = resizeDrag.bounds;
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  if (resizeDrag.direction.includes('left')) left = Math.min(right - MIN_WINDOW_WIDTH, start.x + dx);
  if (resizeDrag.direction.includes('right')) right = Math.max(left + MIN_WINDOW_WIDTH, start.x + start.width + dx);
  if (resizeDrag.direction.includes('top')) top = Math.min(bottom - MIN_WINDOW_HEIGHT, start.y + dy);
  if (resizeDrag.direction.includes('bottom')) bottom = Math.max(top + MIN_WINDOW_HEIGHT, start.y + start.height + dy);
  mainWindow.setBounds({
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  });
}

function createWindow() {
  const windowChrome = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 8 } }
    : { frame: false };
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'PassiDeck',
    ...windowChrome,
    autoHideMenuBar: true,
    show: process.env.PASSIDECK_SMOKE_HIDDEN !== '1',
    backgroundColor: '#020505',
    webPreferences: {
      preload: path.join(__dirname, 'shell-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  win.webContents.on('before-input-event', (event, input) => {
    const reload = input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
    if (!reload) return;
    event.preventDefault();
    activeView()?.webContents.reload();
  });
  win.on('resize', fitActiveView);
  win.on('focus', () => {
    stopNativeAttention();
    focusActiveView();
  });
  win.on('closed', () => {
    stopNativeAttention();
    for (const { view } of backendViews.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    backendViews.clear();
  });
  win.loadFile(path.join(__dirname, 'shell.html')).then(() => {
    for (const backend of config.backends) createBackendView(backend);
    selectBackend(config.activeBackendId);
  });
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  config = readConfig();
  applyStartupOverride();
  ipcMain.handle('passideck:list-backends', event => { assertShellSender(event); return shellState(); });
  ipcMain.handle('passideck:select-backend', (event, id) => { assertShellSender(event); return selectBackend(String(id)); });
  ipcMain.handle('passideck:save-backend', (event, backend) => { assertShellSender(event); return saveBackend(backend); });
  ipcMain.handle('passideck:remove-backend', (event, id) => { assertShellSender(event); return removeBackend(String(id)); });
  ipcMain.handle('passideck:set-dialog-open', (event, open) => { assertShellSender(event); return setDialogOpen(open); });
  ipcMain.handle('passideck:ui-hidden', event => { assertShellSender(event); return activeUiHidden(); });
  ipcMain.handle('passideck:toggle-ui', event => { assertShellSender(event); return activeUiHidden(true); });
  ipcMain.handle('passideck:set-global-sound-enabled', (event, enabled) => { assertShellSender(event); return setGlobalSoundEnabled(enabled); });
  ipcMain.on('passideck:window-resize', resizeWindowFromRenderer);
  ipcMain.handle('passideck:get-app-version', event => { backendIdForSender(event); return app.getVersion(); });
  ipcMain.handle('passideck:open-external', async (event, value) => {
    backendIdForSender(event);
    if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid external URL');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported external URL');
    await shell.openExternal(url.href);
    return true;
  });
  ipcMain.on('passideck:set-notify-blinking', (event, enabled) => {
    try {
      setNotifyBlinking(event, enabled);
    } catch (error) {
      console.error(`[attention] ${error.message}`);
    }
  });
  ipcMain.handle('passideck:copy-text', (event, text) => {
    backendIdForSender(event);
    if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw new Error('Invalid clipboard text');
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle('passideck:read-clipboard-text', event => {
    backendIdForSender(event);
    return clipboard.readText();
  });
  ipcMain.handle('passideck:read-clipboard-image', event => {
    backendIdForSender(event);
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toDataURL();
  });
  ipcMain.on('passideck:response-complete', (event, details) => {
    try {
      markBackendResponseComplete(backendIdForSender(event), {
        hiddenDesktop: details?.hiddenDesktop === true
      });
    } catch (error) {
      console.error(`[attention] ${error.message}`);
    }
  });
  ipcMain.on('passideck:clear-response-attention', event => {
    try {
      clearBackendAttention(backendIdForSender(event));
    } catch (error) {
      console.error(`[attention] ${error.message}`);
    }
  });
  ipcMain.on('passideck:window-action', (event, action) => {
    assertShellSender(event);
    if (action === 'reload') activeView()?.webContents.reload();
    else if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    else if (action === 'close') mainWindow.close();
  });
  mainWindow = createWindow();
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const backend = config.backends.find(item => backendViews.get(item.id)?.view.webContents === webContents);
    const requestingUrl = details.requestingUrl || webContents.getURL();
    callback(Boolean(backend && permission === 'notifications' && new URL(requestingUrl).origin === new URL(backend.url).origin));
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });