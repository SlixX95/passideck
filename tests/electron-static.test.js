const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronPkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/electron/package.json'), 'utf8'));
const main = fs.readFileSync(path.join(root, 'packages/electron/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'packages/electron/preload.js'), 'utf8');
const shellHtml = fs.readFileSync(path.join(root, 'packages/electron/shell.html'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'packages/electron/shell.js'), 'utf8');
const shellPreload = fs.readFileSync(path.join(root, 'packages/electron/shell-preload.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/electron.yml'), 'utf8');

assert.strictEqual(pkg.main, 'packages/electron/main.js', 'npm package main should point at Electron entry');
assert.ok(pkg.files.includes('packages/electron/**'), 'npm package must include the complete Electron shell');
assert.strictEqual(electronPkg.version, pkg.version, 'desktop wrapper version must match the root package version');
assert.ok(electronPkg.author && pkg.author, 'packaged Electron metadata must identify an author');
assert.strictEqual(pkg.scripts.electron, 'electron .', 'electron dev script should run the wrapper');
assert.strictEqual(pkg.scripts['dist:electron'], 'electron-builder --linux AppImage --win portable', 'linux runner should build Linux + Windows portable artifacts');
assert.strictEqual(pkg.scripts['dist:electron:win'], 'electron-builder --win portable', 'windows runner should build portable exe only');
assert.strictEqual(pkg.scripts['dist:electron:linux'], 'electron-builder --linux AppImage', 'linux-only build should stay callable');
assert.strictEqual(pkg.scripts['dist:electron:mac'], 'electron-builder --mac dmg', 'mac build should stay split for macOS runners');
assert.strictEqual(pkg.build.appId, 'dev.passi.passideck', 'electron-builder appId required');
assert.strictEqual(pkg.build.executableName, 'PassiDeck', 'portable exe name must be filesystem-safe');
assert.deepStrictEqual(pkg.build.directories, { app: 'packages/electron', output: 'dist/electron' }, 'portable client must build from the thin wrapper app dir');
assert.deepStrictEqual(pkg.build.files, ['**/*', '!node_modules/**', '!package-lock.json'], 'electron app dir should ship only wrapper files');
assert.ok(pkg.devDependencies.electron, 'electron devDependency required');
assert.ok(pkg.devDependencies['electron-builder'], 'electron-builder devDependency required');
assert.ok(main.includes('let mainWindow'), 'main must retain BrowserWindow reference');
assert.ok(main.includes('PASSIDECK_URL'), 'main must allow URL via env');
assert.ok(main.includes("const LEGACY_DEV_URL = 'http://42.69.42.44:8792/';") && main.includes('url === LEGACY_DEV_URL ? DEFAULT_URL : url'), 'release portable must migrate the old dev backend URL');
assert.ok(!main.includes('http://127.0.0.1:'), 'portable defaults must not point at localhost on AI-Server/MiniPC');
assert.ok(main.includes('Menu.setApplicationMenu(null)'), 'desktop app must hide the native File/Edit/View menu');
assert.ok(main.includes('autoHideMenuBar: true'), 'desktop app should not show native menu chrome');
assert.ok(main.includes("process.platform === 'darwin'") && main.includes("titleBarStyle: 'hiddenInset'") && main.includes('trafficLightPosition: { x: 12, y: 8 }'), 'macOS traffic lights must be vertically centered in the compact 30px titlebar');
assert.ok(main.includes('const TITLEBAR_HEIGHT = 30;') && shellHtml.includes('#titlebar { position: relative; -webkit-app-region: drag; height: 30px;'), 'desktop titlebar and backend view offset must stay at the compact 30px height');
assert.ok(main.includes('frame: false'), 'Windows and Linux must keep themed custom window chrome');
assert.ok(!main.includes('transparent:') && main.includes("backgroundColor: '#020505'"), 'the desktop BrowserWindow must be opaque on every platform');
assert.ok(
  main.includes("x: 0") &&
  main.includes('width: Math.max(0, width)') &&
  main.includes('height: Math.max(0, height - TITLEBAR_HEIGHT)') &&
  !main.includes('RESIZE_BORDER'),
  'backend view must fill the complete app content area below the titlebar without visible resize gutters'
);
assert.ok(
  main.includes("ipcMain.on('passideck:window-resize'") &&
  main.includes('const RESIZE_DIRECTIONS = new Set') &&
  main.includes('function assertResizeSender') &&
  main.includes('function resizeWindowFromRenderer') &&
  shellJs.includes("document.querySelectorAll('.resize-handle')") &&
  shellHtml.includes('data-resize="bottom-right"') &&
  shellPreload.includes("ipcRenderer.send('passideck:window-resize'") &&
  preload.includes('platform: process.platform') &&
  preload.includes("windowResize: (phase, value) => ipcRenderer.send('passideck:window-resize'"),
  'frameless Windows resizing must stay sender-validated from both shell and edge-filling backend view'
);
assert.ok(shellPreload.includes('platform: process.platform'), 'local shell must receive the trusted Electron platform');
assert.ok(shellJs.includes('document.documentElement.dataset.platform = window.passideckShell.platform'), 'local shell must expose platform styling on the root element');
assert.ok(shellHtml.indexOf('<button id="uiToggle"') < shellHtml.indexOf('<button id="globalSoundToggle"'), 'desktop UI toggle must sit beside and before Notify and Reload');
assert.ok(shellHtml.indexOf('<button id="globalSoundToggle"') < shellHtml.indexOf('<button data-action="reload"'), 'global sound toggle must sit beside and before Reload');
assert.ok(shellJs.includes('toggleUi') && shellJs.includes("textContent = hidden ? 'UI Off' : 'UI On'"), 'shell UI control must toggle and visibly label the active backend UI state');
assert.ok(shellJs.includes('setGlobalSoundEnabled') && shellJs.includes("textContent = state.globalSoundEnabled ? '🔔 On' : '🔕 Off'"), 'shell Bell control must toggle and visibly label global sound state');
assert.ok(shellJs.includes("querySelectorAll('#windowControls button[data-action]')"), 'generic window actions must not overwrite the UI and Bell click handlers');
assert.ok(shellPreload.includes("ipcRenderer.invoke('passideck:ui-hidden'") && shellPreload.includes("ipcRenderer.invoke('passideck:toggle-ui'"), 'trusted shell bridge must expose active-backend UI state and toggle IPC');
assert.ok(shellPreload.includes("ipcRenderer.invoke('passideck:set-global-sound-enabled'"), 'trusted shell bridge must expose global sound toggle IPC');
assert.ok(main.includes("ipcMain.handle('passideck:ui-hidden'") && main.includes("ipcMain.handle('passideck:toggle-ui'") && main.includes("document.body.classList.contains('chrome-hidden')"), 'main process must read and toggle the active backend UI through the existing client contract');
assert.ok(main.includes("insertCSS('#chromePeek { display: none !important; }')"), 'Electron backend views must suppress the right-side UI peek button');
assert.ok(main.includes("ipcMain.handle('passideck:set-global-sound-enabled'") && main.includes('setAudioMuted(!config.globalSoundEnabled)'), 'main process must mute every backend view from persisted global sound state');
assert.ok(preload.includes("notifyResponseComplete: details => ipcRenderer.send('passideck:response-complete'"), 'backend completion must use a narrow trusted preload event');
assert.ok(preload.includes("hiddenDesktop: details?.hiddenDesktop === true"), 'backend completion bridge must preserve only the trusted hidden-desktop attention bit');
assert.ok(preload.includes("clearResponseAttention: () => ipcRenderer.send('passideck:clear-response-attention')"), 'clicking the notified pane must clear desktop tab attention through a narrow trusted preload event');
assert.ok(preload.includes("setNotifyBlinking: enabled => ipcRenderer.send('passideck:set-notify-blinking'"), 'backend settings must synchronize Notify blinking through a narrow trusted preload event');
for (const [name, source] of [['main', main], ['preload', preload], ['shell HTML', shellHtml], ['shell JS', shellJs], ['shell preload', shellPreload]]) {
  assert.ok(!/transparency/i.test(source), `${name} must not retain transparency support`);
}
assert.ok(main.includes("view.setBackgroundColor('#020505')"), 'backend views must be opaque');
assert.ok(
  main.includes("ipcMain.on('passideck:set-notify-blinking'") &&
  /function setNotifyBlinking[\s\S]*backendIdForSender[\s\S]*config\.notifyBlinking = Boolean\(enabled\)/.test(main) &&
  main.includes('config.notifyBlinking = Boolean(enabled)') &&
  main.includes('notifyBlinking: entry?.notifyBlinking ?? config.notifyBlinking'),
  'desktop Notify blinking must be sender-validated, persisted, and included in shell state'
);
assert.ok(
  !main.includes('attentionAt') && !main.includes('responsePulse') &&
  !main.includes('globalSoundEnabled: config.globalSoundEnabled,\n    notifyBlinking: config.notifyBlinking,') &&
  (main.match(/return shellState\(\);/g) || []).length === 1 && !main.includes('selectedTextForContextMenu') &&
  !main.includes("require('crypto')") && !main.includes('if (entry) entry.notifyBlinking') &&
  !shellJs.includes('backend.responsePulse') && !shellJs.includes('tab.dataset.backendId') &&
  !shellJs.includes('render(await window.passideckShell.setGlobalSoundEnabled') &&
  !shellHtml.includes('dialog::backdrop'),
  'Electron cleanup must not retain duplicated shell state, mutation replies, one-use wrappers, or ghost shell styling'
);
assert.ok(
  shellJs.includes("backend.notifyBlinking ? ' response-blinking' : ''") &&
  shellJs.includes("backend.hiddenDesktopAttention ? ' hidden-desktop-attention' : ''") &&
  shellHtml.includes('.backend-tab.response-pulse.response-blinking:not(.active)') &&
  shellHtml.includes('.backend-tab.response-pulse.response-blinking.hidden-desktop-attention') &&
  shellHtml.includes('.backend-tab.response-pulse {'),
  'desktop attention must also animate the active backend tab when the waiting response belongs to a hidden virtual desktop'
);
assert.ok(
  main.includes("ipcMain.on('passideck:response-complete'") &&
  main.includes('backendIdForSender') &&
  main.includes('hiddenDesktopAttention') &&
  main.includes('event.senderFrame !== event.sender.mainFrame'),
  'main must map response completion from the trusted backend WebContents instead of accepting a renderer-supplied backend id'
);
assert.ok(
  main.includes('webContents.getFocusedWebContents()') &&
  main.includes("app.dock?.bounce('informational')") &&
  main.includes('const MAC_DOCK_BOUNCE_COUNT = 3;') &&
  main.includes('mainWindow.flashFrame(true)') &&
  main.includes('stopNativeAttention();') &&
  main.includes("win.on('focus'"),
  'native attention must use exactly three informational Dock bounces on macOS, preserve Windows flashing, and stop on focus'
);

const focusHelper = main.match(/^function passideckWindowIsFocused\(\) \{[\s\S]*?^\}/m)?.[0];
const stopAttentionHelper = main.match(/^function stopNativeAttention\(\) \{[\s\S]*?^\}/m)?.[0];
const requestAttentionHelper = main.match(/^function requestNativeAttention\(\) \{[\s\S]*?^\}/m)?.[0];
const responseHelper = main.match(/^function markBackendResponseComplete\(id, details = \{\}\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(focusHelper && stopAttentionHelper && requestAttentionHelper && responseHelper, 'Electron attention helpers must remain behavior-testable');

function responseCompleteFocusProbe(focusTarget, platform = 'win32', destroyed = false) {
  const shellContents = {};
  const backendContents = {};
  const entry = { view: { webContents: backendContents } };
  const flashCalls = [];
  const bounceCalls = [];
  const timers = [];
  const context = {
    process: { platform },
    app: { dock: { bounce: kind => { bounceCalls.push(kind); return bounceCalls.length; }, cancelBounce: () => {} } },
    webContents: {
      getFocusedWebContents: () => ({ shell: shellContents, backend: backendContents, other: {} }[focusTarget] || null)
    },
    mainWindow: {
      webContents: shellContents,
      isFocused: () => focusTarget === 'window',
      isDestroyed: () => destroyed,
      flashFrame: enabled => flashCalls.push(enabled)
    },
    backendViews: new Map([['backend', entry]]),
    notifyShell: () => {},
    MAC_DOCK_BOUNCE_COUNT: 3,
    MAC_DOCK_BOUNCE_INTERVAL_MS: 800,
    dockBounceTimers: [],
    dockBounceIds: [],
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: () => {}
  };
  vm.runInNewContext(`${focusHelper}\n${stopAttentionHelper}\n${requestAttentionHelper}\n${responseHelper}\nmarkBackendResponseComplete('backend');`, context);
  while (timers.length) timers.shift()();
  return { flashCalls, bounceCalls, entry };
}

for (const target of ['window', 'shell', 'backend']) {
  const focused = responseCompleteFocusProbe(target);
  assert.deepStrictEqual(focused.flashCalls, [], `${target} focus must not flash the taskbar`);
  assert.deepStrictEqual(focused.bounceCalls, [], `${target} focus must not bounce the Dock`);
}
assert.deepStrictEqual(responseCompleteFocusProbe('other').flashCalls, [true], 'another application must trigger Windows taskbar attention');
assert.deepStrictEqual(responseCompleteFocusProbe('none').flashCalls, [true], 'missing app focus must trigger Windows taskbar attention');
assert.deepStrictEqual(responseCompleteFocusProbe('other', 'darwin').bounceCalls, ['informational', 'informational', 'informational'], 'macOS Dock attention must stop after exactly three bounces');
assert.deepStrictEqual(responseCompleteFocusProbe('other', 'darwin').flashCalls, [], 'macOS must not start indefinite flashFrame attention');
assert.strictEqual(responseCompleteFocusProbe('backend').entry.attention, true, 'focused completion must retain in-app attention');
const destroyedCompletion = responseCompleteFocusProbe('none', 'win32', true);
assert.deepStrictEqual(destroyedCompletion.flashCalls, [], 'late completion after close must not flash a destroyed BrowserWindow');
assert.strictEqual(destroyedCompletion.entry.attention, undefined, 'late completion after close must abort the response-attention path');

const closedHandler = main.match(/win\.on\('closed', \(\) => \{([\s\S]*?)\n  \}\);/)?.[1];
assert.ok(closedHandler?.includes('stopNativeAttention();'), 'closing the BrowserWindow must cancel pending native attention');

function nativeAttentionCleanupProbe(platform = 'darwin', destroyed = false) {
  const clearedTimers = [];
  const cancelledBounces = [];
  const flashCalls = [];
  const context = {
    process: { platform },
    app: { dock: { cancelBounce: id => cancelledBounces.push(id) } },
    mainWindow: { isDestroyed: () => destroyed, flashFrame: enabled => flashCalls.push(enabled) },
    dockBounceTimers: [11, 12],
    dockBounceIds: [21, 22],
    clearTimeout: id => clearedTimers.push(id)
  };
  vm.runInNewContext(`${stopAttentionHelper}\nstopNativeAttention();`, context);
  return { clearedTimers, cancelledBounces, flashCalls, timers: context.dockBounceTimers, bounceIds: context.dockBounceIds };
}

const macCleanup = nativeAttentionCleanupProbe();
assert.deepStrictEqual(macCleanup.clearedTimers, [11, 12], 'macOS attention cleanup must clear every pending timer');
assert.deepStrictEqual(macCleanup.cancelledBounces, [21, 22], 'macOS attention cleanup must cancel every active Dock bounce');
assert.strictEqual(macCleanup.timers.length, 0, 'macOS attention cleanup must drop stale timer ids');
assert.strictEqual(macCleanup.bounceIds.length, 0, 'macOS attention cleanup must drop stale bounce ids');
assert.deepStrictEqual(nativeAttentionCleanupProbe('win32').flashCalls, [false], 'non-macOS attention cleanup must stop taskbar flashing');
assert.deepStrictEqual(nativeAttentionCleanupProbe('win32', true).flashCalls, [], 'closed Windows cleanup must not call flashFrame on a destroyed BrowserWindow');
assert.ok(
  shellJs.includes("backend.attention ? ' attention response-pulse' : ''") &&
  shellJs.includes("backend.attention ? ' attention' : ''") &&
  !shellJs.includes("badge.className = 'response-badge'") &&
  shellJs.includes('new response') &&
  shellHtml.includes('.connectionStatus.attention::before') &&
  shellHtml.includes('.connectionStatus.attention::after') &&
  shellHtml.includes("content: '🔔'") &&
  shellHtml.includes('@keyframes connection-dot-out') &&
  shellHtml.includes('@keyframes connection-bell-in') &&
  shellHtml.includes('.backend-tab.response-blinking .connectionStatus.attention::before') &&
  shellHtml.includes('.backend-tab.response-blinking .connectionStatus.attention::after') &&
  !shellHtml.includes('@media (prefers-reduced-motion: reduce)'),
  'shell tabs must morph the connection dot into a persistent accessible response bell under the explicit Notify blinking setting'
);
assert.ok(
  main.includes("ipcMain.on('passideck:clear-response-attention'") &&
  main.includes('clearBackendAttention(backendIdForSender(event))') &&
  !main.includes('ATTENTION_PULSE_MS') &&
  !main.includes('responsePulseTimer'),
  'desktop backend attention must persist until the notified pane is clicked'
);
assert.ok(
  shellHtml.includes('.backend-tab.response-pulse') &&
  shellHtml.includes('infinite') &&
  !shellHtml.includes('html.attention-pulse #titlebar { animation:'),
  'response attention must smoothly pulse only the exact backend tab until click'
);
assert.ok(
  !shellHtml.includes('.backend-tab.response-pulse, html.attention-pulse #titlebar') &&
  !shellHtml.includes('.response-badge { animation: none'),
  'desktop response attention must keep pulsing even when the OS requests reduced motion'
);
assert.ok(
  shellHtml.includes('backend-response-pulse 1.6s') &&
  !shellHtml.includes('response-titlebar-flash') &&
  !shellHtml.includes('#ff3158') &&
  !shellHtml.includes('NEW'),
  'desktop response attention must use a calm theme-colored backend-tab pulse without titlebar flash or text badge'
);
assert.ok(
  !/html\[data-platform="darwin"\]\s+#windowControls\s*\{[^}]*display:\s*none/.test(shellHtml) &&
  /html\[data-platform="darwin"\]\s+#windowControls\s+button\[data-action\]:not\(\[data-action="reload"\]\)\s*\{[^}]*display:\s*none/.test(shellHtml),
  'macOS must keep Bell and Reload visible while hiding custom minimize/maximize/close controls'
);
assert.ok(/html\[data-platform="darwin"\]\s+#titlebar\s*\{[^}]*padding-left:/.test(shellHtml), 'macOS titlebar must reserve room for native traffic lights');
assert.ok(main.includes("input.key === 'F5'") && main.includes("input.key.toLowerCase() === 'r'"), 'F5 and Ctrl/Cmd+R must reload the active backend');
assert.ok(main.includes("ipcMain.on('passideck:window-action'"), 'desktop titlebar controls must route through trusted IPC');
assert.ok(main.includes('settings.json'), 'backend profiles should persist in Electron userData');
assert.ok(main.includes('normalizeUrl'), 'backend URLs must be validated by URL parser');
assert.ok(!main.includes('backend.url = releaseBackendUrl(backend.url)'), 'saving a backend profile must preserve its validated URL, including the Dev URL');
assert.ok(main.includes('[backend] invalid URL override'), 'invalid CLI/env backend URLs must not leave a blank window');
assert.strictEqual((main.match(/before-input-event/g) || []).length, 1, 'desktop may intercept only the dedicated reload shortcut handler');
assert.ok(main.includes("ipcMain.handle('passideck:copy-text'") && main.includes("ipcMain.handle('passideck:read-clipboard-text'"), 'desktop text copy/paste must use sender-validated native clipboard IPC');
assert.ok(
  preload.includes("openExternal: url => ipcRenderer.invoke('passideck:open-external'") &&
  main.includes("ipcMain.handle('passideck:open-external'") &&
  main.includes("['http:', 'https:'].includes(url.protocol)") &&
  main.includes('await shell.openExternal(url.href)'),
  'terminal links must use a sender-validated HTTP(S)-only native browser bridge'
);
assert.ok(main.includes("ipcMain.handle('passideck:read-clipboard-image'") && main.includes('clipboard.readImage()') && main.includes('backendIdForSender(event)'), 'desktop image paste must use a sender-validated native clipboard fallback');
assert.ok(main.includes("webContents.on('context-menu'") && main.includes('term.getSelection()'), 'backend views must copy DOM and xterm selections on right click');
assert.ok(main.includes('term.clearSelection()') && main.includes('removeAllRanges()'), 'desktop right-click copy must clear the copied terminal/DOM selection');
assert.ok(!main.includes("label: 'Copy'") && !main.includes('Menu.buildFromTemplate'), 'right-click selection copy must not open an extra menu');
assert.ok(main.includes('nodeIntegration: false'), 'remote UI must not get Node integration');
assert.ok(main.includes('contextIsolation: true'), 'remote UI must use context isolation');
assert.ok(main.includes('sandbox: true'), 'remote UI preload must stay sandboxed');
assert.ok(main.includes('assertShellSender'), 'profile IPC must reject calls outside the local shell');
assert.ok(main.includes("webContents.on('will-navigate'"), 'backend views must block cross-origin top-level navigation');
assert.ok(main.includes("webContents.on('will-redirect'"), 'backend views must block cross-origin redirects');
assert.ok(main.includes('setWindowOpenHandler'), 'desktop must handle external links without opening privileged child windows');
assert.ok(main.includes('setPermissionRequestHandler'), 'remote UI permissions must be handled explicitly');
assert.ok(main.includes("show: process.env.PASSIDECK_SMOKE_HIDDEN !== '1'"), 'Electron QA must support a truly hidden smoke window');
assert.ok(main.includes("permission === 'notifications'"), 'trusted backends must retain session-exit notifications while other permissions stay denied');
assert.ok(main.includes('preload.js'), 'backend views should wire the sandboxed preload');
assert.ok(preload.includes('contextBridge'), 'backend preload should be explicit even if tiny');
assert.ok(!preload.includes('Object.freeze'), 'contextBridge API must remain callable in the portable exe');
assert.ok(preload.includes("copyText: text => ipcRenderer.invoke('passideck:copy-text'") && preload.includes("readText: () => ipcRenderer.invoke('passideck:read-clipboard-text')"), 'sandboxed backend preload must expose native text clipboard bridges');
assert.ok(preload.includes("readImage: () => ipcRenderer.invoke('passideck:read-clipboard-image')"), 'sandboxed backend preload must expose the native image fallback');
assert.ok(
  preload.includes("getAppVersion: () => ipcRenderer.invoke('passideck:get-app-version')") &&
  main.includes("ipcMain.handle('passideck:get-app-version'") && main.includes('app.getVersion()'),
  'desktop renderer must receive the packaged app version through sender-validated IPC'
);

assert.ok(shellPreload.includes('contextBridge'), 'local shell must use an explicit preload bridge');
assert.ok(
  shellPreload.includes("ipcRenderer.invoke('passideck:set-dialog-open'") &&
  main.includes("ipcMain.handle('passideck:set-dialog-open'") &&
  main.includes('setDialogOpen(open)'),
  'backend editor must hide the native WebContentsView while its shell dialog is open'
);
assert.ok(!shellJs.includes('showModal()') && shellJs.includes('dialog.show()'), 'backend editor must stay non-modal so window controls remain usable');
assert.ok(
  shellJs.includes("document.addEventListener('pointerdown'") && shellJs.includes("event.key === 'Escape'"),
  'backend editor must close on outside pointer-down and Escape'
);
assert.ok(shellHtml.includes('transition-delay: 300ms'), 'backend edit affordance must wait 300ms before appearing on hover');

assert.ok(
  shellHtml.includes('class="color-editor"') && shellHtml.includes('id="backendColorPreview"') &&
  shellHtml.includes('id="backendColor" type="text"') && shellJs.includes('updateColorPreview'),
  'backend color editor must use an inline hex field with visible preview'
);
assert.ok(!shellHtml.includes('type="color"'), 'backend color editing must not open a native picker that blocks dialog actions');
assert.ok(main.includes('WebContentsView'), 'desktop must keep one live WebContentsView per backend tab');
assert.ok(
  main.includes('function focusActiveView()') &&
  main.includes('view.webContents.focus()') &&
  main.includes("win.on('focus', () => {") &&
  (main.match(/focusActiveView\(\)/g) || []).length >= 3,
  'window activation, backend selection, and dialog close must focus the active backend view'
);
assert.ok(main.includes("loadFile(path.join(__dirname, 'shell.html'))"), 'desktop window must load the local tab shell');
assert.ok(main.includes("ipcMain.handle('passideck:list-backends'"), 'shell must list configured backend profiles');
assert.ok(main.includes("ipcMain.handle('passideck:select-backend'"), 'shell must switch visible backend views');
assert.ok(main.includes("ipcMain.handle('passideck:save-backend'"), 'shell must add and edit backend profiles');
assert.ok(main.includes("ipcMain.handle('passideck:remove-backend'"), 'shell must remove backend profiles');
assert.ok(shellHtml.includes('backendTabs') && shellHtml.includes('addBackend'), 'shell must render tab strip and add control');
assert.ok(
  /#backendTabs\s*,\s*#addBackend\s*,\s*#windowControls\s*\{[^}]*-webkit-app-region:\s*no-drag/.test(shellHtml),
  'add-backend button must be clickable instead of acting as a frameless-window drag region'
);
assert.ok(shellJs.includes('backend.color') && shellJs.includes('connectionStatus'), 'tabs must show backend color and connection state');

assert.ok(workflow.includes('runs-on: [self-hosted, Windows, X64]'), 'portable workflow must only target Windows self-hosted runners');
assert.ok(workflow.includes("runner.name }}' -ne 'ai-server-passideck-dev'"), 'portable workflow must hard-fail on any non-AI-server runner');
assert.ok(!workflow.includes('pull_request:'), 'untrusted PR code must never execute on the persistent self-hosted runner');
assert.ok(workflow.includes('contents: read'), 'build workflow token must stay read-only');

console.log('electron-static ok');
