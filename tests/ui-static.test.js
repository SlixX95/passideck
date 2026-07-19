const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const app = read('packages/client/public/app.js');
const server = read('packages/server/src/index.js');
const session = read('packages/server/src/session.js');
const html = read('packages/client/public/index.html');
const style = read('packages/client/public/style.css');
const installer = read('scripts/install.sh');
const service = read('scripts/passideck.service');
const pkg = JSON.parse(read('package.json'));

for (const needle of [
  'function makeFreeWindow',
  'function savePanePrefs',
  'function pollSystemMonitor',
]) assert.ok(app.includes(needle), `missing app guard: ${needle}`);

for (const needle of [
  "app.get('/api/system-metrics'",
  'function requestGuard',
  'function saveUiStateHandler',
  "type: 'replay'",
  'const UPLOAD_MIME_ALLOWLIST = new Set',
  'const UPLOAD_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000',
]) assert.ok(server.includes(needle), `missing server guard: ${needle}`);

assert.ok(session.includes('randomUUID()'), 'session ids should use stdlib crypto.randomUUID');
assert.ok(html.includes('vendor/xterm.js') && !html.includes('cdn.jsdelivr.net'), 'client assets must stay local');
assert.ok(html.includes("location.port === '8792' ? 'PassiDeck Dev' : 'PassiDeck'"), 'browser tab title must distinguish dev port 8792 from normal/live');
assert.ok(!style.includes('.response-pulse { animation: none'), 'response attention must keep pulsing even when the OS requests reduced motion');
assert.ok(!style.includes('#ff3158') && !style.includes("content: 'NEW'"), 'response attention must stay theme-colored and must not add a NEW badge');
assert.ok(html.includes('app.js?v=20260719-hermes-native-bell') && html.includes('style.css?v=20260719-hermes-native-bell'), 'client cache keys must activate native Hermes completion bells and adaptive one-third gap proposals');
assert.ok(app.includes('term.onBell?.(() => notifyResponseComplete(id));'), 'native Hermes terminal completion BEL must drive response attention');
assert.ok(!app.includes("msg.type === 'response-complete'"), 'PassiDeck must not infer Hermes completion through server database events');
assert.ok(app.includes("el.classList.toggle('hermes-tui', isHermesTuiEntry({ session }))"), 'Hermes TUI panes must carry a narrow styling hook');
assert.ok(style.includes('.term-panel.hermes-tui .xterm-viewport') && style.includes('scrollbar-width: none'), 'Hermes TUI panes must hide xterm scrollbars without disabling TUI scrolling');
assert.ok(html.includes('id="desktopSwitcher"') && html.includes('id="addDesktop"'), 'multi-desktop controls must be present in the shared browser/Electron renderer');
assert.ok(app.includes('handleDesktopShortcut') && app.includes('movePaneToDesktop') && app.includes('DESKTOP_VIEW_KEY'), 'desktop switching, pane movement and per-window local selection must stay wired');
assert.ok(!app.includes('confirm('), 'destructive actions must not use native browser/Electron confirmation dialogs');
assert.ok(
  html.includes('id="closeModalText"') &&
  app.includes('function showConfirmation') &&
  app.includes("showConfirmation('Delete desktop?', message, 'Delete', () => performDeleteDesktop(id))"),
  'desktop deletion must reuse the themed PassiDeck confirmation modal with dynamic copy and action'
);
assert.ok(app.includes("window.addEventListener('pagehide', flushUiState)") && app.includes('UI_DRAFT_KEY'), 'page exit must retain unsaved desktop state without racing an in-flight revision');
assert.ok(app.includes('crypto.randomUUID?.()') && app.includes('Date.now().toString(36)'), 'desktop IDs need a plain-HTTP fallback where randomUUID is unavailable');
assert.ok(!html.includes('status-chip') && !html.includes('stat-active') && !html.includes('saveState'), 'window/save status chip should stay removed so launch controls start at the left edge');
assert.ok(!style.includes('.status-chip') && !style.includes('#saveState'), 'removed window/save status chip must not leave dead CSS');
assert.ok(!app.includes('setSaveState') && !app.includes("saveState: 'saved'"), 'removed save indicator must not leave display-only state logic');
assert.ok(!html.includes('minimizedBar'), 'unused minimized bar markup should stay deleted');
assert.ok(!app.includes('function authQuery'), 'unused authQuery should stay deleted');
assert.ok(!app.includes('function desktopWindowIds'), 'unused desktopWindowIds should stay deleted');
assert.ok(!app.includes('function terminalViewportLines'), 'unused terminalViewportLines wrapper should stay deleted');
assert.ok(!pkg.workspaces, 'fake workspaces should stay deleted');
assert.ok(!pkg.dependencies.uuid && !pkg.dependencies.open, 'uuid/open packages should stay deleted');
assert.ok(pkg.scripts.test.includes('tests/browser-cdp.test.js'), 'npm test must keep browser smoke');
assert.strictEqual(pkg.engines.node, '>=20.0.0', 'runtime contract must match better-sqlite3 Node support');
for (const script of ['prepare', 'predev', 'preserver', 'prestart']) {
  assert.ok(pkg.scripts[script]?.includes('prepare-assets'), `${script} must generate browser vendor assets`);
}
assert.ok(html.includes('role="region" aria-labelledby="settingsTitle"'), 'settings must use non-modal region semantics');
assert.ok(html.includes('aria-controls="settingsPanel"'), 'settings toggle must identify its controlled region');
assert.ok(html.includes('id="fontSizeSelect"') && !html.includes('id="fontSizeSlider"'), 'terminal text size must use a visible dropdown instead of a slider');
assert.ok(
  html.includes('id="notifyBlinkingSelect"') &&
  html.includes('<option value="on">On</option>') &&
  html.includes('<option value="off">Off</option>'),
  'Notifications settings must expose persistent Notify blinking On/Off choices'
);
assert.ok(
  app.includes('notifyBlinking: true') &&
  app.includes('notifyBlinking: state.notifyBlinking') &&
  app.includes('function setNotifyBlinking') &&
  app.includes('window.passideckDesktop?.setNotifyBlinking?.(state.notifyBlinking)'),
  'Notify blinking must default on, persist in shared UI state, and synchronize the Electron shell'
);
assert.ok(
  style.includes('.term-header.response-pulse {') &&
  style.includes('.switcher-btn.response-pulse {') &&
  style.includes('body.notify-blinking .term-header.response-pulse') &&
  style.includes('body.notify-blinking .switcher-btn.response-pulse:not(.active)'),
  'pending responses must keep a static peak while animation is gated by the setting and never runs on the active tab'
);
for (const section of ['Appearance', 'Terminal', 'Notifications', 'Interface']) assert.ok(html.includes(`>${section}</h2>`), `settings must keep the ${section} section`);
assert.ok(style.includes('.settings-group') && style.includes('max-height: calc(100dvh - 44px)'), 'settings must stay grouped and viewport-bounded');
assert.ok(
  html.includes('id="passideckVersion"') && html.includes('id="desktopAppVersion"') &&
  html.includes('class="settings-version-footer"'),
  'settings must include a quiet version footer for PassiDeck and the optional desktop app version'
);
assert.ok(
  server.includes("version: PASSIDECK_VERSION") &&
  app.includes("document.getElementById('passideckVersion').textContent = `PassiDeck ${health.version}`") &&
  app.includes("window.passideckDesktop?.getAppVersion?.()"),
  'settings versions must come from the running server and the trusted Electron bridge'
);
assert.ok(style.includes('.settings-version-footer'), 'settings version footer must have dedicated low-emphasis styling');
assert.ok(app.includes('function previewFontSize') && app.includes('setTimeout(() => setFontSize(size), 250)'), 'font-size selection must apply live after the intent delay');
assert.ok(app.includes('entry.term.options.fontSize = size') && !app.includes("term.setOption('fontSize'"), 'font-size updates must use the xterm 6 options API');
assert.ok(!app.includes("setProperty('--settings-font-size'" ) && style.includes('font-size: 12px') && style.includes('width: min(29em'), 'settings typography and panel geometry must stay fixed at 12px');
assert.ok(app.includes("'X-PassiDeck-Token': token") && app.includes('keepalive: true'), 'authenticated unload persistence must retain its auth header');

assert.ok(app.includes("state.minimized.has(id) ? restorePanel(id) : selectPanel(id)"), 'Alt+number must restore minimized panes');
assert.ok(app.includes("document.addEventListener('paste', handleTerminalPaste, true)") && app.includes("document.addEventListener('keydown', letBrowserOwnTerminalPasteShortcut, true)") && app.includes("document.addEventListener('drop', handleUploadDrop, true)"), 'text/file paste and file drop terminal bridges must stay enabled');

assert.ok(html.includes('id="uploadFileBtn"') && html.includes('id="clipboardImageBtn"') && html.includes('id="fileInput"'), 'upload, clipboard image, and file picker controls must stay available');
assert.ok(app.includes("document.addEventListener('contextmenu', handleTerminalContextMenu, true)") && app.includes('term.clearSelection()'), 'right-click copy must clear terminal selection in browser and desktop renderers');
assert.ok(installer.includes('PASSIDECK_ROOT=$(quote_env "$ROOT")'), 'installer must persist its actual checkout root for systemd');
assert.ok(service.includes("ExecStart=/bin/sh -c 'exec node \"$PASSIDECK_ROOT/packages/cli/src/index.js\" --no-open'"), 'user service must exec Node directly from the installed checkout');
assert.ok(service.includes('Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin'), 'user service must provide PATH for npm and node');
assert.ok(service.includes('KillMode=process'), 'service restart must preserve detached tmux sessions');

console.log('ui-static ok');
