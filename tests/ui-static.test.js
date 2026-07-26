const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const app = read('packages/client/public/app.js');
const server = read('packages/server/src/index.js');
const session = read('packages/server/src/session.js');
const database = read('packages/server/src/database.js');
const config = read('packages/server/src/config.js');
const html = read('packages/client/public/index.html');
const style = read('packages/client/public/style.css');
const installer = read('scripts/install.sh');
const service = read('scripts/passideck.service');
const pkg = JSON.parse(read('package.json'));

function cssBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `missing CSS block: ${marker}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

for (const [name, source] of [
  ['client', app],
  ['client HTML', html],
  ['client CSS', style],
  ['server', server]
]) assert.ok(!/transparency/i.test(source), `${name} must not retain transparency code or controls`);

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
assert.ok(
  app.includes('function renderCodexLimitCells') &&
  app.includes("const prefix = indexed ? `#${account.index} ` : ''") &&
  app.includes("separator.textContent = '/'") &&
  app.includes("part.dataset.limit = kind") &&
  app.includes('data-account-index'),
  'Codex limit chrome must render one compact 5h / 7d chip per credential index'
);
assert.ok(
  app.includes("cell.classList.toggle('active-account', Boolean(account.active))") &&
  app.includes("dot.className = 'codex-active-dot'") &&
  style.includes('.codex-limit { display: inline-flex;') &&
  style.includes('border: 1px solid var(--tg-border)') &&
  style.includes('.codex-limit.active-account {') &&
  style.includes('background: color-mix(in srgb, var(--tg-accent) 16%, #050909)') &&
  style.includes('.codex-active-dot { display: block; width: 7px; height: 7px;'),
  'the currently selected Codex credential must have a genuinely rendered, high-contrast active marker'
);
assert.ok(!style.includes('.response-pulse { animation: none'), 'response attention must keep pulsing even when the OS requests reduced motion');
assert.ok(!style.includes('#ff3158') && !style.includes("content: 'NEW'"), 'response attention must stay theme-colored and must not add a NEW badge');
assert.ok(
  !html.includes('gridPickerInline') && !html.includes('class="layout-pack"') &&
  !app.includes('function buildGridPicker') && !app.includes('function updateGridPickerActive') && !app.includes('function setLayout(') &&
  !style.includes('.grid-picker-inline') && !style.includes('.layout-select'),
  'retired Desktop layout chip must not leave markup, JavaScript, or CSS behind'
);
assert.ok(
  app.includes('CPU: ${value}% total usage') && app.includes('load ${load.toFixed(2)} (1 min)') &&
  app.includes('RAM: ${formatBytes(info.used)} used of ${formatBytes(info.total)} · ${formatBytes(info.free)} free'),
  'CPU and RAM monitor cells must expose informative usage tooltips'
);
assert.ok(
  html.includes('id="backendLatency"') && html.includes('<span>NET</span><b>-- ms</b>') &&
  app.includes('const LATENCY_PROBE_MS = 3000;') &&
  app.includes('function sendSocketPing(') && app.includes('function renderBackendLatency(') &&
  app.includes('ws.latencyMs = Math.round(ws.lastPongAt - ws.pingStartedAt)') &&
  app.includes('state.latencyProbeTimer = setInterval(probeActiveBackend, LATENCY_PROBE_MS)') &&
  style.includes('.backend-latency {') && style.includes('.backend-latency[data-level="bad"] b'),
  'the active terminal must expose a visible, continuously measured backend WebSocket round-trip'
);
assert.ok(html.includes('viewport-fit=cover'), 'smartphone viewport must support display cutouts and safe-area insets');
assert.ok(
  html.includes('id="compactLaunchMenu"') && html.includes('id="compactActionsMenu"') &&
  html.includes('class="compact-menu-toggle"') && html.includes('aria-controls="compactActionsList"') &&
  app.includes('width <= 1024') && app.includes('window.innerHeight') && app.includes('height <= 419') &&
  app.includes("width <= 1200 && window.matchMedia?.('(pointer: coarse)').matches") &&
  style.includes('@media (max-width: 1024px), (max-height: 419px), (pointer: coarse) and (max-width: 1200px)'),
  'Fold-class touch displays must use the compact one-pane chrome with dropdown menus'
);
const firefoxScrollbarBlock = cssBlock(style, '@supports not selector(::-webkit-scrollbar)');
assert.ok(
  (style.match(/scrollbar-width: thin;/g) || []).length === 1 &&
  firefoxScrollbarBlock.includes('scrollbar-width: thin;') &&
  firefoxScrollbarBlock.includes('scrollbar-color:') &&
  !firefoxScrollbarBlock.includes('.xterm-viewport') &&
  style.includes('::-webkit-scrollbar { width: 4px; height: 4px; }') &&
  style.includes('::-webkit-scrollbar-button { display: none; }') &&
  style.includes('.xterm .xterm-scrollable-element > .scrollbar.vertical > .slider') &&
  style.includes('.term-panel.hermes-tui .xterm .xterm-scrollable-element > .scrollbar.vertical') &&
  style.includes('border-radius: 999px;') &&
  app.includes('function terminalTheme(name)') &&
  app.includes('scrollbarSliderBackground:') &&
  app.includes('scrollbarSliderHoverBackground:') &&
  app.includes('scrollbarSliderActiveBackground:') &&
  app.includes('overviewRuler: { width: 4 }'),
  'native surfaces and xterm 6 must use their own real scrollbar contracts'
);
assert.ok(!app.includes('function startDesktopRename(') && !style.includes('.desktop-rename'), 'ordinal-only desktop controls must not retain rename UI');
assert.ok(style.includes('.desktop-tab.active, .desktop-tab.active.attention') && style.includes('font-weight: 900;'), 'active desktop must retain a solid high-contrast state even when attention is present');
assert.ok(style.includes('.grid-container {') && style.includes('padding: 0;'), 'desktop grid must not reserve a visible inset around maximized panes');
assert.ok(app.includes('function renderWindowRect(') && app.includes('function installDesktopWindowResizeHandles('), 'Windows desktop renderer must fill authoritative edge panes while retaining invisible resize hit areas');
assert.ok(
  style.includes('body[data-skin="neon"]') && style.includes('--tg-panel-radius: 8px') &&
  style.includes('body[data-skin="stealth"]') && style.includes('--tg-panel-radius: 0px') &&
  style.includes('body[data-skin="prism"]') && style.includes('--tg-panel-radius: 2px'),
  'the three opaque surface styles must retain their distinct geometry'
);
assert.ok(style.includes('@keyframes desktop-response-pulse') && style.includes('background: color-mix(in srgb, var(--tg-accent) 34%, #030707)') && style.includes('box-shadow: 0 0 16px color-mix(in srgb, var(--tg-accent) 68%, transparent)'), 'desktop attention must pulse its surface and border clearly without alarm colors');
for (const name of ['desktop-response-pulse', 'switcher-response-pulse', 'pane-response-pulse']) {
  const block = cssBlock(style, `@keyframes ${name}`);
  assert.ok(/\bopacity\s*:/.test(block), `${name} must retain a visible compositor-only pulse`);
  assert.ok(!/\b(?:filter|background|border-color|box-shadow)\s*:/.test(block), `${name} must not animate repaint-heavy paint properties`);
}
assert.ok(app.includes('term.onBell?.(() => notifyResponseComplete(id));'), 'native Hermes terminal completion BEL must drive response attention');
assert.ok(app.includes("entry.outputBuffer = '\\x1bc\\r\\n[PassiDeck: output backlog reset]\\r\\n';"), 'terminal output backpressure must bound overload with a parser-safe reset marker');
const outputFlushBlock = app.slice(app.indexOf('function flushTerminalOutput'), app.indexOf('function queueTerminalOutput'));
assert.ok(!outputFlushBlock.includes('saveTerminalSnapshot('), 'terminal output flushes must not synchronously serialize snapshots on the hot path');
assert.ok(app.includes('if (entry.outputWriteInFlight) return;'), 'mid-write terminal snapshots must keep the last fully parsed state');
assert.ok(app.includes('const handle = requestAnimationFrame(writeChunk);') && app.includes('cancelAnimationFrame(entry.outputFrameHandle);'), 'chunk scheduling must be unconditional and cancellable when a pane is discarded');
assert.ok(app.includes('const text = sanitizeTerminalOutput(data);') && app.includes('}, false,'), 'batched terminal output must sanitize each source frame without truncating the combined flush');
assert.ok(app.includes('clearTimeout(entry.outputFlushTimer);'), 'discarding a pane must cancel pending terminal output flushes');
assert.ok(app.includes('const TERM_SNAPSHOT_DEBOUNCE_MS = 1000;') && app.includes('setTimeout(() => saveTerminalSnapshot(id), TERM_SNAPSHOT_DEBOUNCE_MS)'), 'terminal snapshots must wait for a full second of idle output');
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
for (const name of ['slotKey', 'rectOverlap', 'clampWindowPrefs', 'handleUploadPaste', 'updateMinimizedBar', 'visibleTopbarDescription']) {
  assert.ok(!app.includes(`function ${name}`), `unused ${name} helper should stay deleted`);
}
assert.ok(!app.includes('activeSessionDescription') && !html.includes('activeSessionDescription'), 'removed topbar session description must not retain a DOM path');
assert.ok(!app.includes('term-session-desc') && !style.includes('.term-session-desc'), 'removed pane session description must not retain hidden DOM or CSS');
assert.ok(!app.includes('descEl'), 'removed pane description must not retain a runtime reference');
assert.ok(!style.includes('.active-session-desc') && !style.includes('.minimized-bar'), 'removed description and minimized bars must not retain CSS');
for (const token of ['--tg-green', '--tg-radius-sm', '--z-window-base', '--z-overlay']) assert.ok(!style.includes(token), `unused CSS token ${token} should stay deleted`);
assert.ok(!style.includes('.command-center::before') && !style.includes('.command-center::after'), 'disabled command-center gradients should stay deleted');
assert.ok(!style.includes('.chrome-btn.armed'), 'unused armed button state should stay deleted');
assert.ok(!html.includes('layout-auto'), 'retired auto-layout class should stay deleted');
assert.ok(!session.includes('OUTPUT_REPLAY_LIMIT') && !session.includes('appendOutput(') && !session.includes('replayOutput('), 'disabled server output replay must not retain a second output buffer');
assert.ok(!database.includes('cleanupStaleSessions'), 'unused stale-session cleanup must stay deleted');
assert.ok(!server.includes('insert: file') && !app.includes('upload?.insert'), 'uploads must expose one canonical path field');
for (const field of ['minimized', 'windows', 'viewport']) assert.ok(!app.includes(`state.panePrefs.${field}`), `legacy panePrefs.${field} alias must stay read-only`);
assert.ok(!installer.includes('defaultTheme:') && !installer.includes('projects:'), 'installer must not write ignored config fields');
assert.ok(!config.includes('configDir: dir') && !config.includes('configPath: file'), 'loaded config must expose only runtime settings');
assert.ok(!pkg.workspaces, 'fake workspaces should stay deleted');
assert.ok(!pkg.dependencies.uuid && !pkg.dependencies.open, 'uuid/open packages should stay deleted');
assert.ok(pkg.scripts.test.includes('tests/browser-cdp.test.js'), 'npm test must keep browser smoke');
assert.strictEqual(pkg.engines.node, '>=20.0.0', 'runtime contract must match better-sqlite3 Node support');
assert.ok(!pkg.scripts.predev, 'dev must not prepare assets twice through predev and prestart');
for (const script of ['prepare', 'preserver', 'prestart']) {
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
  html.includes('id="performanceModeSelect"') &&
  html.includes('<option value="off">Energy saver</option>') &&
  html.includes('<option value="on">Performance</option>') &&
  app.includes('performanceMode: false') &&
  app.includes("const PERFORMANCE_MODE_KEY = 'passideck:performance-mode'") &&
  app.includes("localStorage.setItem(PERFORMANCE_MODE_KEY, state.performanceMode ? 'on' : 'off')") &&
  app.includes('function loadPerformanceMode(sharedValue)') &&
  app.includes("stored === null && typeof sharedValue === 'boolean'") &&
  app.includes('loadPerformanceMode(ui?.performanceMode);') &&
  app.includes("window.addEventListener('storage', event => {") &&
  app.includes('event.storageArea !== localStorage || event.key !== PERFORMANCE_MODE_KEY') &&
  !app.includes('performanceMode: state.performanceMode') &&
  app.includes('function setPerformanceMode') &&
  app.includes('if (state.performanceMode && visible) return TERM_OUTPUT_ACTIVE_FLUSH_MS;'),
  'Settings must persist Performance mode per browser profile/backend origin so shared UI updates cannot reset it'
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
assert.ok(
  app.includes('new WebLinksAddon.WebLinksAddon(handleTerminalLink)') &&
  app.includes('linkHandler: { activate: handleTerminalLink }') &&
  app.includes('window.passideckDesktop?.openExternal') &&
  app.includes("window.open('about:blank', '_blank')") &&
  app.includes("showToast('Link copied')"),
  'raw and OSC 8 terminal links must share the desktop/browser opener and copy with visible feedback when opening fails'
);
assert.ok(app.includes("window.open('about:blank', '_blank')") && app.includes('openedWindow.location.replace(url)'), 'browser link fallback must create a safe tab and navigate it explicitly');
assert.ok(
  app.includes("window.addEventListener('mousedown', startDrag, true)") &&
  app.includes("window.addEventListener('mouseup', finishDrag, true)") &&
  app.includes('term?._core?._oscLinkService?.getLinkData') &&
  app.includes('buffer.getLine(firstLineIndex)?.isWrapped') &&
  !app.includes('provider.provideLinks(y') &&
  app.includes('handleTerminalLink(event, link)'),
  'Hermes TUI selection must support mouse-only browser/desktop input and activate terminal links from the trusted pointer event'
);
assert.ok(html.includes('app.js?v=20260726-terminal-link-open-v3') && html.includes('style.css?v=20260726-terminal-link-open-v3'), 'client cache keys must activate TUI mouse selection and link clicks');

assert.ok(html.includes('id="uploadFileBtn"') && html.includes('id="clipboardImageBtn"') && html.includes('id="fileInput"'), 'upload, clipboard image, and file picker controls must stay available');
assert.ok(app.includes("document.addEventListener('contextmenu', handleTerminalContextMenu, true)") && app.includes('term.clearSelection()'), 'right-click copy must clear terminal selection in browser and desktop renderers');
assert.ok(installer.includes('PASSIDECK_ROOT=$(quote_env "$ROOT")'), 'installer must persist its actual checkout root for systemd');
assert.ok(service.includes("ExecStart=/bin/sh -c 'exec node \"$PASSIDECK_ROOT/packages/cli/src/index.js\" --no-open'"), 'user service must exec Node directly from the installed checkout');
assert.ok(service.includes('Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin'), 'user service must provide PATH for npm and node');
assert.ok(service.includes('KillMode=process'), 'service restart must preserve detached tmux sessions');

console.log('ui-static ok');
