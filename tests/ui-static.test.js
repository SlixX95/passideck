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
assert.ok(!style.includes('.response-pulse { animation: none'), 'response attention must keep blinking even when the OS requests reduced motion');
assert.ok(html.includes('app.js?v=20260716-resize-edge-snap') && html.includes('style.css?v=20260718-forced-attention-blink'), 'client cache keys must activate resize snapping and forced high-visibility response attention after reload');
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
for (const section of ['Appearance', 'Terminal', 'Notifications', 'Interface']) assert.ok(html.includes(`>${section}</h2>`), `settings must keep the ${section} section`);
assert.ok(style.includes('.settings-group') && style.includes('max-height: calc(100dvh - 44px)'), 'settings must stay grouped and viewport-bounded');
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
