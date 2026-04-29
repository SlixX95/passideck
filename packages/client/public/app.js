const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

const LAYOUTS = ['auto', '1x1', '2x1', '3x1', '1x2', '1x3', '2x2'];
const LAYOUT_SLOTS = new Proxy({}, { get: (_, key) => layoutSize(String(key)).slots });
const THEMES = {
  blue:   { background: '#0f1117', foreground: '#c8ccd8', cursor: '#7aa2f7', selectionBackground: '#3d5a9e' },
  green:  { background: '#0f1117', foreground: '#d5e8d0', cursor: '#9ece6a', selectionBackground: '#4c6f38' },
  emerald:{ background: '#020505', foreground: '#d9fff0', cursor: '#00ff91', selectionBackground: '#0d6041' },
  cyan:   { background: '#020505', foreground: '#d6fff8', cursor: '#5fffd1', selectionBackground: '#197568' },
  amber:  { background: '#0f1117', foreground: '#ead7ba', cursor: '#e0af68', selectionBackground: '#7c5f33' },
  purple: { background: '#0f1117', foreground: '#ddd3ff', cursor: '#bb9af7', selectionBackground: '#624f8f' },
  red:    { background: '#0f1117', foreground: '#f3c5cc', cursor: '#f7768e', selectionBackground: '#893b4a' },
  mono:   { background: '#0f1117', foreground: '#c8ccd8', cursor: '#c8ccd8', selectionBackground: '#555b6f' }
};

const state = {
  sessions: new Map(),
  order: [],
  layout: 'auto',
  activeLayout: 'auto',
  activeId: null,
  theme: 'blue',
  fontSize: 13,
  minimized: new Set(),
  saveTimer: null,
  launchBusy: false,
  uploadBusy: false,
  clipboardPasteArmed: false,
  clipboardPasteTimer: null,
  systemMonitorTimer: null,
  pointerDrag: null,
  panePrefs: { titles: {}, order: [] },
  saveState: 'saved'
};

const PANE_PREFS_KEY = 'passideck:pane-prefs:v1';
const CHROME_PREF_KEY = 'passideck:chrome-hidden:v1';
const FONT_SIZE_KEY = 'passideck:font-size:v1';
const SYSTEM_MONITOR_KEY = 'passideck:system-monitor:v1';
const TERM_SNAPSHOT_PREFIX = 'passideck:term-snapshot:v1:';
const TERM_SNAPSHOT_MAX_LINES = 20000;
const TERM_SNAPSHOT_MAX_CHARS = 1024 * 1024;

function requestClosePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  showCloseConfirm(id, panelTitle(entry.session));
}

let closeHitLayerInstalled = false;
function installCloseHitLayer() {
  if (closeHitLayerInstalled) return;
  closeHitLayerInstalled = true;
  document.addEventListener('pointerdown', e => {
    if (document.getElementById('closeModal')?.classList.contains('open')) return;
    if (e.target?.closest?.('#chromePeek')) return;
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#chromePeek')) return;
    for (const btn of document.querySelectorAll('#termGrid .term-panel:not(.layout-hidden) button.danger')) {
      const rect = btn.getBoundingClientRect();
      const pad = 8;
      const inside = e.clientX >= rect.left - pad && e.clientX <= rect.right + pad && e.clientY >= rect.top - pad && e.clientY <= rect.bottom + pad;
      if (!inside) continue;
      const id = btn.dataset.paneId;
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      requestClosePanel(id);
      return;
    }
  }, true);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}


function parseLayout(layout) {
  const m = String(layout || '').match(/^(\d+)x(\d+)$/);
  return m ? { rows: Number(m[1]), cols: Number(m[2]) } : null;
}

function layoutSize(layout, count = visibleLayoutCount()) {
  count = Math.max(1, Number(count) || 1);
  const base = parseLayout(layout);
  if (!base) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    return { rows, cols, slots: rows * cols };
  }
  let { rows, cols } = base;
  if (rows > cols) cols = Math.max(cols, Math.ceil(count / rows));
  else if (cols > rows) rows = Math.max(rows, Math.ceil(count / cols));
  else if (count > rows * cols) {
    cols = Math.max(cols, Math.ceil(Math.sqrt(count)));
    rows = Math.max(rows, Math.ceil(count / cols));
  }
  return { rows, cols, slots: rows * cols };
}

function layoutName(size) {
  return `${size.rows}x${size.cols}`;
}

function visibleLayoutCount() {
  return state.order.filter(id => state.sessions.has(id) && !state.minimized.has(id)).length || 1;
}

function applyGridSize() {
  const grid = document.getElementById('termGrid');
  if (!grid) return;
  const size = layoutSize(state.layout);
  state.activeLayout = layoutName(size);
  grid.className = 'grid-container layout-auto';
  grid.dataset.layout = state.layout;
  grid.dataset.activeLayout = state.activeLayout;
  grid.style.setProperty('--grid-rows', size.rows);
  grid.style.setProperty('--grid-cols', size.cols);
}

function setSaveState(value) {
  state.saveState = value;
  const el = document.getElementById('saveState');
  if (el) el.textContent = value;
}

function uiPayload() {
  return {
    layout: state.activeLayout,
    baseLayout: state.layout,
    activeId: state.activeId,
    theme: state.theme
  };
}

function saveUiState() {
  setSaveState('saving');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => api('PUT', '/api/ui-state', uiPayload()).then(() => setSaveState('saved')).catch(() => setSaveState('offline')), 150);
}

function visiblePaneIds(layout = state.activeLayout) {
  const ids = state.order.filter(id => state.sessions.has(id) && !state.minimized.has(id));
  const cap = layoutSize(layout, ids.length).slots;
  return new Set(ids.slice(0, cap));
}

function autoMinimizeExcess() {
  const visible = visiblePaneIds();
  for (const [id, entry] of state.sessions) {
    if (!visible.has(id) && !state.minimized.has(id)) {
      minimizePanel(id);
    }
  }
}

function autoRestoreToFillSlots() {
  const slotCount = getCurrentSlotCount();
  const visible = getVisibleCount();
  if (visible >= slotCount) return;
  // Restore minimized panels in order until slots full
  for (const id of state.order) {
    if (!state.minimized.has(id)) continue;
    if (getVisibleCount() >= slotCount) break;
    restorePanel(id);
  }
}

function applyLayoutVisibility() {
  applyGridSize();
  const grid = document.getElementById('termGrid');
  const hidden = document.getElementById('hiddenPanes');
  const visible = visiblePaneIds();
  for (const id of state.order) {
    const entry = state.sessions.get(id);
    if (!entry) continue;
    const shouldHide = !visible.has(id) || state.minimized.has(id);
    if (shouldHide) {
      if (entry.el.parentElement !== hidden) hidden.appendChild(entry.el);
      entry.el.classList.add('layout-hidden');
    } else {
      if (entry.el.parentElement !== grid) grid.appendChild(entry.el);
      entry.el.classList.remove('layout-hidden');
    }
  }
}

function setLayout(layout, opts = {}) {
  if (!layout || !LAYOUTS.includes(layout)) return;
  state.layout = layout;
  applyLayoutVisibility();
  // Grid changes must not un-minimize user-hidden panes.
  autoMinimizeExcess();
  updateGridPickerActive();
  // Two-pass fit: immediate + delayed to let browser finish reflow
  requestAnimationFrame(() => {
    fitAll();
    setTimeout(fitAll, 50);
  });
  if (opts.persist !== false) saveUiState();
}

/* ── Grid Picker ── */
function layoutLabel(layout) {
  if (layout === 'auto') return 'Auto';
  const { rows, cols } = parseLayout(layout);
  if (rows > cols) return `${rows} rows`;
  if (cols > rows) return `${cols} columns`;
  return `${rows}×${cols}`;
}

function layoutTitle(layout) {
  if (layout === 'auto') return 'Auto layout';
  const { rows, cols } = parseLayout(layout);
  if (rows > cols) return `${rows} rows; new panes add columns`;
  if (cols > rows) return `${cols} columns; new panes add rows`;
  return `${rows}×${cols}; grows balanced`;
}

function buildGridPicker() {
  const container = document.getElementById('gridPickerInline');
  if (!container) return;
  container.innerHTML = '<label class="layout-select-label" for="layoutSelect">Layout</label><select id="layoutSelect" class="layout-select" aria-label="Layout"></select>';
  const select = container.querySelector('select');
  for (const layout of LAYOUTS) {
    const option = document.createElement('option');
    option.value = layout;
    option.textContent = layoutLabel(layout);
    option.title = layoutTitle(layout);
    select.appendChild(option);
  }
  select.onchange = () => { setLayout(select.value); showToast(layoutTitle(select.value)); };
  updateGridPickerActive();
}

function updateGridPickerActive() {
  const select = document.getElementById('layoutSelect');
  if (select) select.value = state.layout;
}

/* ── Font Size ── */
function setFontSize(size, opts = {}) {
  size = Math.max(10, Math.min(24, Number(size) || 13));
  state.fontSize = size;
  for (const [, entry] of state.sessions) {
    try { entry.term.setOption('fontSize', size); } catch {}
  }
  requestAnimationFrame(fitAll);
  const slider = document.getElementById('fontSizeSlider');
  const label = document.getElementById('fontSizeLabel');
  if (slider) slider.value = size;
  if (label) label.textContent = `${size}px`;
  if (opts.persist !== false) {
    try { localStorage.setItem(FONT_SIZE_KEY, String(size)); } catch {}
  }
}

/* ── Minimize / Restore ── */
function getVisibleCount() {
  return state.order.filter(id => state.sessions.has(id) && !state.minimized.has(id) && !state.sessions.get(id).el.classList.contains('layout-hidden')).length;
}

function getCurrentSlotCount() {
  return layoutSize(state.activeLayout).slots;
}

function smartRestorePanel(id) {
  const slotCount = getCurrentSlotCount();
  const visible = getVisibleCount();
  if (visible < slotCount) {
    // Platz da → einfach restore
    restorePanel(id);
  } else if (state.activeId && state.activeId !== id) {
    // Kein Platz → aktives Pane minimieren, dieses an dessen Position öffnen
    const activeEntry = state.sessions.get(state.activeId);
    const restoreEntry = state.sessions.get(id);
    if (activeEntry && restoreEntry) {
      const activeIndex = state.order.indexOf(state.activeId);
      const restoreIndex = state.order.indexOf(id);
      if (activeIndex >= 0 && restoreIndex >= 0) {
        [state.order[activeIndex], state.order[restoreIndex]] = [state.order[restoreIndex], state.order[activeIndex]];
        savePanePrefs();
      }
      // Swap DOM positions in grid
      const grid = document.getElementById('termGrid');
      const hidden = document.getElementById('hiddenPanes');
      // Move active to hidden, restore to active's position
      const activeNext = activeEntry.el.nextSibling;
      if (activeNext && activeNext.parentElement === grid) {
        grid.insertBefore(restoreEntry.el, activeNext);
      } else {
        grid.appendChild(restoreEntry.el);
      }
      hidden.appendChild(activeEntry.el);
    }
    state.minimized.add(state.activeId);
    activeEntry.el.classList.add('minimized');
    activeEntry.el.classList.add('layout-hidden');
    state.minimized.delete(id);
    restoreEntry.el.classList.remove('minimized');
    restoreEntry.el.classList.remove('layout-hidden');
    updateMinimizedBar();
    selectPanel(id, { persist: false });
    requestAnimationFrame(() => { fitAll(); setTimeout(fitAll, 50); });
  } else {
    // Fallback: erstes sichtbares Pane minimieren
    const firstVisible = state.order.find(oid => state.sessions.has(oid) && !state.minimized.has(oid));
    if (firstVisible) {
      minimizePanel(firstVisible);
      restorePanel(id);
    } else {
      restorePanel(id);
    }
  }
}

function minimizePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  entry.el.classList.add('minimized');
  state.minimized.add(id);
  updateMinimizedBar();
  applyLayoutVisibility();
  requestAnimationFrame(fitAll);
}

function restorePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  entry.el.classList.remove('minimized');
  state.minimized.delete(id);
  updateMinimizedBar();
  applyLayoutVisibility();
  selectPanel(id, { persist: false });
  // Fit after restore — panel was display:none, needs full resize cycle
  requestAnimationFrame(() => {
    fitAll();
    setTimeout(fitAll, 50);
  });
}

function updateMinimizedBar() {
  const bar = document.getElementById('minimizedBar');
  const tabs = document.getElementById('minimizedTabs');
  if (!bar || !tabs) return;

  if (state.minimized.size === 0) {
    bar.hidden = true;
    tabs.innerHTML = '';
    return;
  }
  bar.hidden = false;
  tabs.innerHTML = '';
  for (const id of state.order) {
    if (!state.minimized.has(id)) continue;
    const entry = state.sessions.get(id);
    if (!entry) continue;
    const tab = document.createElement('div');
    tab.className = 'minimized-tab';
    // Tooltip: zeigt was passiert wenn kein Platz
    const willReplace = getVisibleCount() >= getCurrentSlotCount();
    const replaceTarget = state.activeId && state.activeId !== id ? panelTitle(state.sessions.get(state.activeId)?.session) : null;
    const tip = willReplace
      ? `Ersetzt: ${replaceTarget || 'aktives Fenster'}`
      : 'Wiederherstellen';
    tab.innerHTML = `<span class="min-title">${escapeHtml(panelTitle(entry.session))}</span><button class="restore-btn" title="${tip}">□</button>`;

    tab.querySelector('.min-title').onclick = (e) => { e.stopPropagation(); smartRestorePanel(id); };
    tab.querySelector('.restore-btn').onclick = (e) => { e.stopPropagation(); smartRestorePanel(id); };
    tabs.appendChild(tab);
  }
}

/* ── Close Confirmation ── */
function isSessionExited(session) {
  return session?.meta?.status === 'exited';
}

function setTheme(theme, opts = {}) {
  if (!THEMES[theme]) theme = 'blue';
  state.theme = theme;
  document.body.dataset.theme = theme;
  const select = document.getElementById('themeSelect');
  if (select) select.value = theme;
  for (const entry of state.sessions.values()) {
    entry.term.options.theme = THEMES[theme];
  }
  if (opts.persist !== false) saveUiState();
}

function setChromeHidden(hidden) {
  document.body.classList.toggle('chrome-hidden', Boolean(hidden));
  try { localStorage.setItem(CHROME_PREF_KEY, hidden ? '1' : '0'); } catch {}
  requestAnimationFrame(fitAll);
}

function updateSystemMonitor(metrics) {
  const monitor = document.getElementById('systemMonitor');
  if (!monitor || !metrics) return;
  for (const key of ['cpu', 'ram', 'net']) {
    const cell = monitor.querySelector(`[data-metric="${key}"]`);
    const value = Math.max(0, Math.min(100, Math.round(Number(metrics[key]) || 0)));
    cell?.style.setProperty('--v', `${value}%`);
    const label = cell?.querySelector('b');
    if (label) label.textContent = `${value}%`;
  }
}

async function pollSystemMonitor() {
  if (!document.body.classList.contains('system-monitor-on')) return;
  try {
    updateSystemMonitor(await api('GET', '/api/system-metrics'));
  } catch (err) {
    console.warn('system metrics unavailable', err);
  }
}

function startSystemMonitorPolling() {
  if (state.systemMonitorTimer) return;
  pollSystemMonitor();
  state.systemMonitorTimer = setInterval(pollSystemMonitor, 1000);
}

function stopSystemMonitorPolling() {
  if (!state.systemMonitorTimer) return;
  clearInterval(state.systemMonitorTimer);
  state.systemMonitorTimer = null;
}

function setSystemMonitorVisible(visible, opts = {}) {
  const enabled = Boolean(visible);
  document.body.classList.toggle('system-monitor-on', enabled);
  const monitor = document.getElementById('systemMonitor');
  const toggle = document.getElementById('systemMonitorToggle');
  if (monitor) monitor.hidden = !enabled;
  if (toggle) toggle.checked = enabled;
  if (enabled) startSystemMonitorPolling();
  else stopSystemMonitorPolling();
  if (opts.persist !== false) {
    try { localStorage.setItem(SYSTEM_MONITOR_KEY, enabled ? '1' : '0'); } catch {}
  }
  requestAnimationFrame(fitAll);
}

function toggleChrome() {
  setChromeHidden(!document.body.classList.contains('chrome-hidden'));
}

function fitAll() {
  for (const [id, entry] of state.sessions) {
    try {
      entry.fit.fit();
      const payload = { type: 'resize', cols: entry.term.cols, rows: entry.term.rows };
      if (entry.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify(payload));
      else api('POST', `/api/sessions/${id}/resize`, payload).catch(() => {});
    } catch {}
  }
}

function updateEmpty() {
  document.getElementById('emptyState').style.display = state.sessions.size ? 'none' : 'grid';
  document.getElementById('stat-active').textContent = String(state.sessions.size);
}

function isPlainShellCommand(command) {
  const cmd = String(command || '').trim();
  return !cmd || /^(zsh|bash|fish|sh|dash|tcsh|ksh|csh|pwsh|powershell|\/bin\/bash|\/bin\/sh)$/i.test(cmd);
}

function stripTerminalReplyJunk(data) {
  return String(data || '')
    // CSI cursor reports / CPR: ESC [ row ; col R
    .replace(/\x1b\[[0-9;?]*R/g, '')
    // OSC color reports: ESC ] 10/11/12 ; rgb:.... BEL or ST
    .replace(/\x1b\](?:10|11|12);rgb:[0-9a-f/]+(?:\x07|\x1b\\)/gi, '')
    // Old buffers may already contain bare leaked OSC color report fragments.
    .replace(/(?:^|[;\s])(?:10|11|12);rgb:[0-9a-f]{2,4}(?:\/[0-9a-f]{2,4}){2}/gi, '')
    .replace(/(?:^|[;\s])(?:rgb:[0-9a-f]{2,4}(?:\/[0-9a-f]{2,4}){2})/gi, '')
    .replace(/(?:^|[;\s])(?:\d{1,3};\d{1,3}R)+/g, '')
    .replace(/(?:^|[;\s])(?:\d{1,3}R)+/g, '')
    // Some browsers/bridges drop ESC, BEL, semicolons, and `rgb:...`, leaving
    // semicolons/ESC stripped to 101110...3R from OSC 10/11 + CPR replies.
    .replace(/\b(?=(?:(?:10|11|12|\d{1,3}R){4,}))(?=(?:(?:10|11|12|\d{1,3}R)*R))(?:10|11|12|\d{1,3}R){4,}\b/g, '');
}

function sanitizeTerminalInput(data) {
  // xterm can answer app probes itself. Do not forward those terminal-generated
  // replies to bash/readline, where they echo as junk like `3R3R10;rgb:...`.
  return stripTerminalReplyJunk(data);
}

const OUTPUT_FRAME_LIMIT = 256 * 1024;

function normalizeReplayText(data) {
  return String(data || '')
    .replace(/\x1bc/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[P_^][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function sanitizeTerminalOutput(data) {
  let text = stripTerminalReplyJunk(data);
  if (text.length > OUTPUT_FRAME_LIMIT) text = `\r\n[PassiDeck: großer Replay gekürzt — letzte ${OUTPUT_FRAME_LIMIT} Zeichen]\r\n` + text.slice(-OUTPUT_FRAME_LIMIT);
  return text;
}

function writeTerminalOutput(term, data, done) {
  const text = sanitizeTerminalOutput(data);
  const chunkSize = 32768;
  let offset = 0;
  function writeChunk() {
    const chunk = text.slice(offset, offset + chunkSize);
    if (!chunk) { if (done) done(); return; }
    offset += chunkSize;
    term.write(chunk, () => {
      if (offset < text.length) requestAnimationFrame(writeChunk);
      else if (done) done();
    });
  }
  writeChunk();
}

function writeTerminalReplay(term, data) {
  // Browser reload gets a fresh xterm. Do not replay old cursor/TUI state into it.
  // Reset first, then write plain snapshot. Live output after reconnect stays raw.
  try { term.reset(); } catch {}
  writeTerminalOutput(term, normalizeReplayText(data));
}

function snapshotKey(id) {
  return `${TERM_SNAPSHOT_PREFIX}${id}`;
}

function terminalSnapshot(entry) {
  const term = entry?.term;
  if (!term) return '';
  try {
    const serialized = entry.serialize?.serialize({ scrollback: TERM_SNAPSHOT_MAX_LINES });
    if (serialized) return serialized.slice(-TERM_SNAPSHOT_MAX_CHARS);
  } catch {}
  const buffer = term.buffer?.active;
  if (!buffer) return '';
  // Persist exactly the visible viewport, not scrollback tail. TUI apps (Hermes/Codex)
  // keep menus in the active viewport; using buffer.length tail can restore a different
  // slice after reload and make the screen appear to change.
  const rows = Math.max(1, Math.min(TERM_SNAPSHOT_MAX_LINES, term.rows || 30));
  const start = Math.max(0, buffer.viewportY || 0);
  const end = Math.min(buffer.length || 0, start + rows);
  const lines = [];
  for (let i = start; i < end; i += 1) {
    const line = buffer.getLine(i);
    lines.push(line ? line.translateToString(false) : '');
  }
  let text = lines.join('\r\n').replace(/[\r\n]+$/g, '');
  if (text.length > TERM_SNAPSHOT_MAX_CHARS) text = text.slice(-TERM_SNAPSHOT_MAX_CHARS);
  return text;
}

function hasTerminalSnapshot(id) {
  try { return Boolean(localStorage.getItem(snapshotKey(id))); } catch { return false; }
}

function saveTerminalSnapshot(id) {
  const entry = state.sessions.get(id);
  if (!entry?.term) return;
  let text = terminalSnapshot(entry);
  if (!text) return;
  // localStorage quotas vary by browser/device. Keep the big snapshot when possible;
  // if quota is full, degrade gracefully instead of losing reload restore entirely.
  while (text.length > 0) {
    try {
      localStorage.setItem(snapshotKey(id), JSON.stringify({ id, text, savedAt: Date.now() }));
      return;
    } catch {}
    if (text.length <= 65536) return;
    text = text.slice(-Math.floor(text.length * 0.6));
  }
}

function scheduleTerminalSnapshot(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  clearTimeout(entry.snapshotTimer);
  entry.snapshotTimer = setTimeout(() => saveTerminalSnapshot(id), 120);
}

function restoreTerminalSnapshot(id, term) {
  try {
    const raw = localStorage.getItem(snapshotKey(id));
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    const text = String(snapshot.text || '');
    if (!text) return false;
    try { term.reset(); } catch {}
    term.write(text);
    return true;
  } catch {
    return false;
  }
}

function saveAllTerminalSnapshots() {
  for (const id of state.sessions.keys()) saveTerminalSnapshot(id);
}

function loadPanePrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PANE_PREFS_KEY) || '{}');
    state.panePrefs = {
      titles: prefs.titles && typeof prefs.titles === 'object' ? prefs.titles : {},
      order: Array.isArray(prefs.order) ? prefs.order.filter(id => typeof id === 'string') : []
    };
  } catch {
    state.panePrefs = { titles: {}, order: [] };
  }
}

function savePanePrefs() {
  state.panePrefs.order = state.order.slice();
  localStorage.setItem(PANE_PREFS_KEY, JSON.stringify(state.panePrefs));
}

function sessionKind(session) {
  const cmd = String(session.meta?.command || session.meta?.label || '').toLowerCase();
  if (cmd.includes('hermes')) return 'Hermes';
  if (cmd.includes('codex')) return 'Codex';
  if (cmd.includes('bash') || cmd.includes('zsh') || cmd.includes('shell')) return 'Shell';
  return session.meta?.label || session.meta?.command || 'Fenster';
}

function defaultTitle(session) {
  const kind = sessionKind(session);
  const peers = state.order.filter(id => state.sessions.has(id) && sessionKind(state.sessions.get(id).session) === kind);
  const n = Math.max(1, peers.indexOf(session.id) + 1 || peers.length + 1);
  return `${kind} ${n}`;
}

function customTitle(session) {
  const title = state.panePrefs.titles?.[session.id];
  return title || defaultTitle(session);
}

function panelTitle(session) {
  const entry = state.sessions.get(session.id);
  const custom = state.panePrefs.titles?.[session.id];
  if (custom) return custom;
  if (entry?.autoTitle) return entry.autoTitle;
  return defaultTitle(session);
}

function clearDropTargets() {
  document.querySelectorAll('.term-panel.drop-target')
    .forEach(panel => panel.classList.remove('drop-target'));
  document.getElementById('dropPlaceholder')?.remove();
}

function dropPlaceholder() {
  let el = document.getElementById('dropPlaceholder');
  if (!el) {
    el = document.createElement('section');
    el.id = 'dropPlaceholder';
    el.className = 'drop-placeholder';
    el.innerHTML = '<span>Hier ablegen</span>';
  }
  return el;
}

function placeDropPlaceholder(target) {
  const grid = document.getElementById('termGrid');
  const ph = dropPlaceholder();
  const gridRect = grid.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const left = rect.left - gridRect.left + grid.scrollLeft;
  const top = rect.top - gridRect.top + grid.scrollTop;
  ph.querySelector('span').textContent = 'Hier tauschen';
  ph.style.left = `${left}px`;
  ph.style.top = `${top}px`;
  ph.style.width = `${rect.width}px`;
  ph.style.height = `${rect.height}px`;
  if (ph.parentElement !== grid) grid.appendChild(ph);
  return ph;
}

function visibleDropPanels(sourceId) {
  return [...document.querySelectorAll('#termGrid .term-panel:not(.layout-hidden)')]
    .filter(panel => panel.dataset.paneId && panel.dataset.paneId !== sourceId);
}

function nearestDropPanel(x, y, sourceId) {
  const panels = visibleDropPanels(sourceId);
  let best = null;
  let bestDistance = Infinity;
  for (const panel of panels) {
    const rect = panel.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return panel;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = panel;
      bestDistance = distance;
    }
  }
  return best;
}

function markDropTargetAt(x, y, sourceId) {
  const target = nearestDropPanel(x, y, sourceId);
  if (!target) {
    clearDropTargets();
    return null;
  }
  clearDropTargets();
  target.classList.add('drop-target');
  placeDropPlaceholder(target);
  return { targetId: target.dataset.paneId };
}

function markDropTarget(event, el) {
  const next = markDropTargetAt(event.clientX, event.clientY, state.draggingId);
  return next?.targetId ? 'swap' : 'none';
}

function endPointerDrag(event) {
  const drag = state.pointerDrag;
  if (!drag) return;
  event?.preventDefault?.();
  const { sourceId, targetId, handle } = drag;
  state.pointerDrag = null;
  state.draggingId = null;
  document.removeEventListener('pointermove', updatePointerDrag, true);
  document.removeEventListener('pointerup', endPointerDrag, true);
  document.removeEventListener('pointercancel', endPointerDrag, true);
  try { handle?.releasePointerCapture?.(event?.pointerId); } catch {}
  document.getElementById(`panel-${sourceId}`)?.classList.remove('dragging');
  document.body.classList.remove('pane-dragging');
  clearDropTargets();
  if (targetId && targetId !== sourceId) swapPanels(sourceId, targetId);
}

function updatePointerDrag(event) {
  const drag = state.pointerDrag;
  if (!drag) return;
  event.preventDefault();
  const next = markDropTargetAt(event.clientX, event.clientY, drag.sourceId);
  drag.targetId = next?.targetId || null;
  drag.side = null;
}

function startPointerDrag(id, handle, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.pointerDrag = { sourceId: id, targetId: null, side: null, handle };
  state.draggingId = id;
  try { handle.setPointerCapture?.(event.pointerId); } catch {}
  document.getElementById(`panel-${id}`)?.classList.add('dragging');
  document.body.classList.add('pane-dragging');
  document.addEventListener('pointermove', updatePointerDrag, true);
  document.addEventListener('pointerup', endPointerDrag, true);
  document.addEventListener('pointercancel', endPointerDrag, true);
  updatePointerDrag(event);
}

function createPanel(session, opts = {}) {
  if (state.sessions.has(session.id) || session.meta.status === 'exited') return;
  const id = session.id;
  const grid = document.getElementById('termGrid');
  const el = document.createElement('section');
  el.className = 'term-panel';
  el.id = `panel-${id}`;
  el.dataset.paneId = id;
  el.innerHTML = `
    <div class="term-header">
      <span class="term-title" contenteditable="true" spellcheck="false" aria-label="Fenstername">${escapeHtml(panelTitle(session))}</span>
      <span class="term-drag-handle" role="button" tabindex="0" title="Fenster verschieben" aria-label="Fenster verschieben">✥</span>
      <div class="term-actions">
        <button class="minimize" title="Minimieren" aria-label="Minimieren">−</button>
        <button class="danger" title="Schließen" aria-label="Schließen">×</button>
      </div>
    </div>
    <div class="terminal" id="term-${id}"></div>
  `;
  grid.appendChild(el);

  const titleEl = el.querySelector('.term-title');
  const dragHandle = el.querySelector('.term-drag-handle');
  const [minBtn, closeBtn] = el.querySelectorAll('button');
  minBtn.dataset.paneId = id;
  closeBtn.dataset.paneId = id;
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = panelTitle(session); titleEl.blur(); }
  });
  titleEl.addEventListener('blur', () => {
    const next = titleEl.textContent.trim();
    if (next && next !== defaultTitle(session)) state.panePrefs.titles[id] = next;
    else delete state.panePrefs.titles[id];
    titleEl.textContent = panelTitle(session);
    savePanePrefs();
    renderSwitcher();
    updateMinimizedBar();
  });
  titleEl.addEventListener('mousedown', e => e.stopPropagation());
  minBtn.onclick = e => { e.stopPropagation(); minimizePanel(id); };
  minBtn.addEventListener('pointerdown', e => e.stopPropagation());
  minBtn.addEventListener('mousedown', e => e.stopPropagation());
  minBtn.addEventListener('mouseup', e => e.stopPropagation());
  closeBtn.onclick = e => {
    e.stopPropagation();
    if (!document.getElementById('closeModal')?.classList.contains('open')) requestClosePanel(id);
  };
  closeBtn.addEventListener('pointerdown', e => e.stopPropagation());
  closeBtn.addEventListener('mousedown', e => e.stopPropagation());
  closeBtn.addEventListener('mouseup', e => e.stopPropagation());
  // Only select panel when clicking on terminal area, not header (buttons/title/drag)
  el.querySelector('.terminal').addEventListener('mousedown', () => selectPanel(id));
  dragHandle.addEventListener('pointerdown', e => startPointerDrag(id, dragHandle, e));
  dragHandle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dragHandle.title = 'Zum Verschieben gedrückt halten und ziehen';
    }
  });
  // Native HTML5 drag remains as a fallback for synthetic tests/older browsers.
  dragHandle.draggable = true;
  dragHandle.addEventListener('dragstart', e => {
    if (state.pointerDrag) return;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    state.draggingId = id;
    el.classList.add('dragging');
    document.body.classList.add('pane-dragging');
  });
  dragHandle.addEventListener('dragend', () => {
    state.draggingId = null;
    el.classList.remove('dragging');
    document.body.classList.remove('pane-dragging');
    clearDropTargets();
  });
  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    markDropTarget(e, el);
  });
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop-target');
  });
  el.addEventListener('drop', e => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    markDropTarget(e, el);
    clearDropTargets();
    swapPanels(sourceId, id);
  });

  const term = new Terminal({
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: state.fontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 20000,
    theme: THEMES[state.theme]
  });
  const fit = new FitAddon.FitAddon();
  const serialize = window.SerializeAddon ? new SerializeAddon.SerializeAddon() : null;
  term.loadAddon(fit);
  if (serialize) term.loadAddon(serialize);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  const termEl = el.querySelector('.terminal');
  term.open(termEl);
  termEl.addEventListener('contextmenu', e => handleTerminalContextMenu(e, id));

  // Auto-detect terminal title (vim, Codex, Hermes TUI, etc.)
  term.onTitleChange(title => {
    const entry = state.sessions.get(id);
    if (!entry) return;
    // Ignore generic/empty titles
    if (!title || /^(\s*|bash$|zsh$|\/bin\/bash$|\/bin\/zsh$)/.test(title)) return;
    // Only update if user hasn't set a custom title
    const custom = state.panePrefs.titles?.[id];
    entry.autoTitle = title;
    if (!custom) {
      const titleEl = el.querySelector('.term-title');
      if (titleEl && document.activeElement !== titleEl) {
        titleEl.textContent = title;
      }
      updateMinimizedBar();
    }
  });

  const ro = new ResizeObserver(() => fitAll());
  ro.observe(el.querySelector('.terminal'));
  term.onData(data => {
    const entry = state.sessions.get(id);
    const clean = sanitizeTerminalInput(data);
    if (clean && entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify({ type: 'input', data: clean }));
  });

  const hasSnapshot = hasTerminalSnapshot(id);
  state.sessions.set(id, { session, el, term, fit, serialize, ws: null, ro, restored: hasSnapshot, snapshotTimer: null });
  const replaceId = opts.replaceId;
  const replaceIndex = replaceId ? state.order.indexOf(replaceId) : -1;
  state.order = state.order.filter(existing => existing !== id && existing !== replaceId);
  if (replaceId && replaceIndex >= 0 && state.sessions.has(replaceId)) {
    state.order.splice(Math.min(replaceIndex, state.order.length), 0, id);
    state.order.push(replaceId);
    state.minimized.add(replaceId);
    state.sessions.get(replaceId)?.el.classList.add('minimized');
    updateMinimizedBar();
  } else {
    state.order.push(id);
  }

  const ws = attachSocket(id, term, el);
  state.sessions.get(id).ws = ws;

  updateEmpty();
  renderSwitcher();
  selectPanel(id, { persist: false });
  requestAnimationFrame(() => {
    fitAll();
    const entry = state.sessions.get(id);
    if (entry && hasSnapshot) {
      entry.restored = restoreTerminalSnapshot(id, term);
      requestAnimationFrame(() => {
        try { fit.fit(); sendResize(id); } catch {}
        scheduleTerminalSnapshot(id);
      });
    }
  });
}

function applyPanelOrder() {
  const grid = document.getElementById('termGrid');
  state.order = state.order.filter(id => state.sessions.has(id));
  for (const id of state.order) {
    const entry = state.sessions.get(id);
    if (entry) grid.appendChild(entry.el);
  }
  applyLayoutVisibility();
  renderSwitcher();
  requestAnimationFrame(fitAll);
}

function restorePanelOrder() {
  const preferred = state.panePrefs.order.filter(id => state.sessions.has(id));
  const missing = state.order.filter(id => !preferred.includes(id));
  state.order = [...preferred, ...missing];
  applyPanelOrder();
}

function swapPanels(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  if (!state.sessions.has(sourceId) || !state.sessions.has(targetId)) return;
  const sourceIndex = state.order.indexOf(sourceId);
  const targetIndex = state.order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  [state.order[sourceIndex], state.order[targetIndex]] = [state.order[targetIndex], state.order[sourceIndex]];
  applyPanelOrder();
  selectPanel(sourceId, { persist: false });
  savePanePrefs();
}

function movePanel(sourceId, targetId, side = 'before') {
  if (!sourceId || !targetId || sourceId === targetId) return;
  if (!state.sessions.has(sourceId) || !state.sessions.has(targetId)) return;
  const next = state.order.filter(id => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  const insertAt = side === 'after' ? targetIndex + 1 : targetIndex;
  next.splice(insertAt, 0, sourceId);
  state.order = next;
  applyPanelOrder();
  selectPanel(sourceId, { persist: false });
  savePanePrefs();
}

function movePanelBefore(sourceId, targetId) {
  movePanel(sourceId, targetId, 'before');
}

function flashPaneExit(el) {
  el.classList.add('flash-exit');
  setTimeout(() => el.classList.remove('flash-exit'), 2000);
}

function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function notifySessionExit(title, exitCode) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(`PassiDeck: ${title}`, { body: `Session exited (code ${exitCode ?? '?'})`, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification(`PassiDeck: ${title}`, { body: `Session exited (code ${exitCode ?? '?'})` });
      });
    }
  } catch {}
}

function attachSocket(id, term, el) {
  const ws = new WebSocket(`${WS_BASE}?session=${encodeURIComponent(id)}`);
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const entry = state.sessions.get(id);
    if (msg.type === 'replay') {
      // The server intentionally does not replay PTY history anymore. Do not print its
      // reconnect marker into the terminal: that visibly changes shell contents on every
      // browser reload. A saved client viewport snapshot is restored separately.
      if (String(msg.data || '').includes('output replay disabled')) return;
      if (!entry?.restored) writeTerminalReplay(term, msg.data);
    }
    if (msg.type === 'output') writeTerminalOutput(term, msg.data, () => scheduleTerminalSnapshot(id));
    if (msg.type === 'exit') {
      el.classList.add('exited');
      flashPaneExit(el);
      playBell();
      notifySessionExit(panelTitle(session), msg.exitCode);
      renderSwitcher();
    }
  };
  ws.onopen = () => requestAnimationFrame(fitAll);
  ws.onclose = () => setTimeout(() => reconnect(id), 1000);
  return ws;
}

function reconnect(id) {
  const entry = state.sessions.get(id);
  if (!entry || entry.el.classList.contains('exited')) return;
  entry.ws = attachSocket(id, entry.term, entry.el);
}

function renderSwitcher() {
  const root = document.getElementById('switcherGrid');
  root.innerHTML = '';
  state.order = state.order.filter(id => state.sessions.has(id));
  state.order.slice(0, 9).forEach((id, idx) => {
    const entry = state.sessions.get(id);
    const btn = document.createElement('button');
    btn.className = 'switcher-btn';
    if (id === state.activeId) btn.classList.add('active');
    if (entry.el.classList.contains('exited')) btn.classList.add('exited');
    btn.title = `Alt+${idx + 1} · ${panelTitle(entry.session)}`;
    btn.innerHTML = `<span class="switcher-title">${escapeHtml(panelTitle(entry.session))}</span>`;
    btn.onclick = () => selectPanel(id);
    root.appendChild(btn);
  });
}

function selectPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  state.activeId = id;
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('active'));
  entry.el.classList.add('active');
  applyLayoutVisibility();
  entry.term.focus();
  requestAnimationFrame(fitAll);
  renderSwitcher();
  if (opts.persist !== false) saveUiState();
}

async function closePanel(id) {
  await api('DELETE', `/api/sessions/${id}`).catch(() => {});
  const entry = state.sessions.get(id);
  if (entry) {
    try { entry.ro.disconnect(); } catch {}
    try { entry.ws.close(); } catch {}
    try { entry.term.dispose(); } catch {}
    clearTimeout(entry.snapshotTimer);
    try { localStorage.removeItem(snapshotKey(id)); } catch {}
    entry.el.remove();
    state.sessions.delete(id);
    state.order = state.order.filter(existing => existing !== id);
  }
  state.minimized.delete(id);
  if (state.activeId === id) state.activeId = state.order[0] || null;
  updateEmpty();
  renderSwitcher();
  updateMinimizedBar();
  if (state.activeId) selectPanel(state.activeId, { persist: false });
  // Auto-restore minimized panels that now fit
  autoRestoreToFillSlots();
  savePanePrefs();
  saveUiState();
}

async function launch(command) {
  if (state.launchBusy) return;
  state.launchBusy = true;
  try {
    const cmd = String(command || '').trim() || '/bin/bash';
    const wasActive = state.activeId;
    const replaceId = null;
    const session = await api('POST', '/api/sessions', { command: cmd, label: cmd });
    createPanel(session, { replaceId });
    applyLayoutVisibility();
    savePanePrefs();
  } finally {
    setTimeout(() => { state.launchBusy = false; }, 250);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

async function uploadBlob({ name, type, data }) {
  return api('POST', '/api/uploads', { name, type, data });
}

function activeTerminalEntry() {
  const id = state.activeId || state.order[0];
  return id ? state.sessions.get(id) : null;
}

function pasteIntoTerminalEntry(entry, text) {
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN || !text) return false;
  entry.ws.send(JSON.stringify({ type: 'input', data: text }));
  entry.term.focus();
  return true;
}

function bracketedPastePayload(text) {
  return `\x1b[200~${String(text || '').replace(/\x1b/g, '')}\x1b[201~`;
}

function insertIntoTerminalEntry(entry, text) {
  return pasteIntoTerminalEntry(entry, bracketedPastePayload(text));
}

function pasteIntoActiveTerminal(text) {
  return pasteIntoTerminalEntry(activeTerminalEntry(), text);
}

function insertIntoActiveTerminal(text) {
  return insertIntoTerminalEntry(activeTerminalEntry(), text);
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { return document.execCommand('copy'); }
  finally { ta.remove(); }
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return fallbackCopyText(text);
}

async function readTextFromClipboard() {
  if (!navigator.clipboard?.readText || !window.isSecureContext) return '';
  return navigator.clipboard.readText();
}

async function pasteClipboardIntoTerminalEntry(entry) {
  const imageFile = await readImageFileFromSystemClipboard();
  if (imageFile) {
    const upload = await uploadFile(imageFile, { keepBusy: true });
    return upload ? insertIntoTerminalEntry(entry, `${upload.path} `) : false;
  }
  return insertIntoTerminalEntry(entry, await readTextFromClipboard());
}

async function handleTerminalContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  selectPanel(id, { persist: false });
  const entry = state.sessions.get(id);
  const selected = entry?.term?.getSelection?.() || '';
  if (selected) {
    try {
      await copyTextToClipboard(selected);
      entry.term.clearSelection?.();
    } catch (err) {
      console.warn('terminal right-click copy failed', err);
    }
    return;
  }
  try {
    await pasteClipboardIntoTerminalEntry(entry);
  } catch (err) {
    console.warn('terminal right-click paste failed', err);
  }
}

function formatUploadInsertion(upload) {
  // Keep uploads simple and upstream-friendly: paste the local path into the PTY.
  // Hermes can auto-detect image paths on submit; shells/Codex/unknown panes keep
  // the same explicit path behavior.
  return `\x01${upload.path} `;
}

function findImageFileFromClipboardData(data) {
  for (const file of data?.files || []) {
    if (file.type?.startsWith('image/')) return file;
  }
  for (const item of data?.items || []) {
    if (item.kind === 'file' && item.type?.startsWith('image/')) return item.getAsFile();
  }
  return null;
}

async function readImageFileFromSystemClipboard() {
  if (!navigator.clipboard?.read || !window.isSecureContext) return null;
  const items = await navigator.clipboard.read();
  for (const item of items || []) {
    const type = item.types?.find(t => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type.split('/')[1] || 'png';
    return new File([blob], `clipboard-image-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`, { type });
  }
  return null;
}

function imageUrlFromClipboardData(data) {
  const uri = (data?.getData('text/uri-list') || '').split('\n').find(line => line && !line.startsWith('#')) || '';
  const text = data?.getData('text/plain') || uri;
  const html = data?.getData('text/html') || '';
  const htmlSrc = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '';
  const candidate = htmlSrc || text.trim();
  if (/^data:image\//i.test(candidate)) return candidate;
  if (/^https?:\/\//i.test(candidate) && /\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico)(?:[?#].*)?$/i.test(candidate)) return candidate;
  if (/^\/uploads\/[^\s]+\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico)(?:[?#].*)?$/i.test(candidate)) return candidate;
  return '';
}

async function uploadImageUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const blob = await res.blob();
  if (!blob.type?.startsWith('image/')) throw new Error('URL is not an image');
  const name = decodeURIComponent(String(url).split('/').pop().split('?')[0]) || `clipboard-url-${Date.now()}.png`;
  await uploadFile(new File([blob], name, { type: blob.type }), { pasteIntoTerminal: true });
}

function shouldLetBrowserHandlePaste(target) {
  const el = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  if (!el) return false;
  // xterm uses a hidden textarea; Ctrl+V there must go through the PTY bridge.
  if (el.closest('.terminal, .xterm')) return false;
  if (el.closest('.term-title[contenteditable="true"]')) return true;
  if (el.closest('input, textarea, select')) return true;
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  return false;
}

async function handleTerminalPaste(e) {
  if (shouldLetBrowserHandlePaste(e.target)) return;

  const file = findImageFileFromClipboardData(e.clipboardData);
  if (file) {
    e.preventDefault();
    e.stopImmediatePropagation();
    clearClipboardPasteMode();
    uploadFile(file, { pasteIntoTerminal: true });
    return;
  }

  const imageUrl = imageUrlFromClipboardData(e.clipboardData);
  if (imageUrl) {
    e.preventDefault();
    e.stopImmediatePropagation();
    clearClipboardPasteMode();
    try {
      const clipboardFile = await readImageFileFromSystemClipboard();
      if (clipboardFile) await uploadFile(clipboardFile, { pasteIntoTerminal: true });
      else await uploadImageUrl(imageUrl);
    } catch (err) {
      console.warn(err);
      insertIntoActiveTerminal(e.clipboardData?.getData('text/plain') || imageUrl);
    }
    return;
  }

  const text = e.clipboardData?.getData('text/plain');
  if (text && insertIntoActiveTerminal(text)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    clearClipboardPasteMode();
  }
}

function letBrowserOwnTerminalPasteShortcut(e) {
  const key = String(e.key || '').toLowerCase();
  if (key !== 'v' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  const target = e.target?.nodeType === Node.ELEMENT_NODE ? e.target : e.target?.parentElement;
  if (!target?.closest('.terminal, .xterm')) return;
  // xterm may otherwise turn Ctrl+V into raw ^V. Stop xterm key handling, but do not preventDefault;
  // the browser then emits a real paste event that handleTerminalPaste can route to the PTY/upload bridge.
  e.stopImmediatePropagation();
}

function armClipboardPasteMode() {
  const btn = document.getElementById('clipboardImageBtn');
  state.clipboardPasteArmed = true;
  clearTimeout(state.clipboardPasteTimer);
  btn.textContent = 'press Ctrl+V';
  btn.classList.add('armed');
  state.clipboardPasteTimer = setTimeout(() => {
    state.clipboardPasteArmed = false;
    btn.textContent = '▧ clip img';
    btn.classList.remove('armed');
  }, 12000);
  window.focus();
}

function clearClipboardPasteMode() {
  const btn = document.getElementById('clipboardImageBtn');
  state.clipboardPasteArmed = false;
  clearTimeout(state.clipboardPasteTimer);
  btn.textContent = '▧ clip img';
  btn.classList.remove('armed');
}

async function uploadClipboardImage() {
  if (state.uploadBusy) return;
  if (!navigator.clipboard?.read || !window.isSecureContext) {
    armClipboardPasteMode();
    return;
  }
  state.uploadBusy = true;
  try {
    let file = null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        const ext = type.split('/')[1] || 'png';
        file = new File([blob], `clipboard-image-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`, { type });
        break;
      }
    }
    if (!file) {
      armClipboardPasteMode();
      return;
    }
    await uploadFile(file, { pasteIntoTerminal: true, keepBusy: true });
  } catch (err) {
    console.warn(err);
    armClipboardPasteMode();
  } finally {
    state.uploadBusy = false;
  }
}

async function uploadFile(file, opts = {}) {
  if (!file || (state.uploadBusy && !opts.keepBusy)) return null;
  if (!opts.keepBusy) state.uploadBusy = true;
  try {
    const data = await readFileAsDataUrl(file);
    const upload = await uploadBlob({ name: file.name, type: file.type || 'application/octet-stream', data });
    if (opts.pasteIntoTerminal) pasteIntoActiveTerminal(formatUploadInsertion(upload));
    return upload;
  } catch (err) {
    console.error(err);
    showToast(`Upload failed: ${err.message}`, 'error');
    return null;
  } finally {
    if (!opts.keepBusy) state.uploadBusy = false;
  }
}


function showToast(text, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
  el.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.hidden = true; }, 2200);
}

async function init() {
  loadPanePrefs();
  try { document.body.classList.toggle('chrome-hidden', localStorage.getItem(CHROME_PREF_KEY) === '1'); } catch {}

  // Load saved font size
  const savedFontSize = localStorage.getItem(FONT_SIZE_KEY);
  if (savedFontSize && !isNaN(Number(savedFontSize))) state.fontSize = Number(savedFontSize);

  const [sessions, ui] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null)
  ]);

  setTheme(ui?.theme || 'green', { persist: false });
  setFontSize(state.fontSize, { persist: false });
  setSystemMonitorVisible(localStorage.getItem(SYSTEM_MONITOR_KEY) === '1', { persist: false });
  installCloseHitLayer();
  buildGridPicker();
  sessions.forEach(createPanel);
  restorePanelOrder();

  const base = ui?.baseLayout || ui?.layout || 'auto';
  state.layout = LAYOUTS.includes(base) ? base : 'auto';
  setLayout(state.layout, { persist: false });

  if (ui?.activeId && state.sessions.has(ui.activeId)) selectPanel(ui.activeId, { persist: false });
  else if (state.order[0]) selectPanel(state.order[0], { persist: false });
  updateEmpty();
  renderSwitcher();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

document.querySelectorAll('[data-command]').forEach(btn => btn.onclick = () => launch(btn.dataset.command));
document.getElementById('settingsToggle').onclick = () => {
  const panel = document.getElementById('settingsPanel');
  panel.hidden = !panel.hidden;
  document.getElementById('settingsToggle').setAttribute('aria-expanded', String(!panel.hidden));
};
document.getElementById('chromeToggle').onclick = toggleChrome;
document.getElementById('chromePeek').onclick = toggleChrome;
document.getElementById('uploadFileBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  uploadFile(file, { pasteIntoTerminal: true });
};
document.getElementById('clipboardImageBtn').onclick = () => uploadClipboardImage();
document.getElementById('themeSelect').onchange = e => setTheme(e.target.value);
document.getElementById('fontSizeSlider').oninput = e => setFontSize(Number(e.target.value));
document.getElementById('systemMonitorToggle').onchange = e => setSystemMonitorVisible(e.target.checked);

// ── Close Confirmation Modal ──
let closeConfirmSessionId = null;
let closeModalOpenedAt = 0;
function showCloseConfirm(sessionId, title) {
  const modal = document.getElementById('closeModal');
  document.getElementById('closeModalTitle').textContent = `${title} — wirklich schließen?`;

  // Do not rely on the native hidden repaint path here.
  // In full grids some browsers defer that paint until the next layout change.
  modal.hidden = false;
  modal.removeAttribute('hidden');
  modal.classList.add('open');
  modal.style.display = 'flex';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  closeModalOpenedAt = Date.now();
  closeConfirmSessionId = sessionId;
  void modal.offsetHeight; // force style/layout flush now

  setTimeout(() => document.getElementById('closeModalConfirm')?.focus(), 0);
}
function hideCloseConfirm() {
  const modal = document.getElementById('closeModal');
  modal.classList.remove('open');
  modal.style.display = 'none';
  modal.hidden = true;
  closeConfirmSessionId = null;
}
function runCloseConfirm() {
  const id = closeConfirmSessionId;
  if (!id) return;
  hideCloseConfirm();
  closePanel(id);
}
document.getElementById('closeModalConfirm').onclick = runCloseConfirm;
document.getElementById('closeModalConfirm').addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopImmediatePropagation();
  runCloseConfirm();
}, true);
document.getElementById('closeModalCancel').onclick = hideCloseConfirm;
document.getElementById('closeModalCancel').addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopImmediatePropagation();
  hideCloseConfirm();
}, true);
document.getElementById('closeModal').addEventListener('click', e => {
  // Ignore the same physical click that opened the modal.
  if (Date.now() - closeModalOpenedAt < 400) return;
  // Only close if clicking directly on overlay, not from a propagated button click
  if (e.target === document.getElementById('closeModal') && !e.composedPath().includes(document.querySelector('.modal-box'))) {
    hideCloseConfirm();
  }
});

document.addEventListener('paste', handleTerminalPaste, true);
document.addEventListener('keydown', letBrowserOwnTerminalPasteShortcut, true);
window.addEventListener('resize', () => {
    fitAll();
    setTimeout(fitAll, 50);
  });
window.addEventListener('beforeunload', saveAllTerminalSnapshots);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAllTerminalSnapshots(); });
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    if (!document.getElementById('settingsPanel').hidden) document.getElementById('settingsPanel').hidden = true;
  }
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const id = state.order[Number(e.key) - 1];
    if (id) selectPanel(id);
  }
  if (e.altKey && e.key === '0') {
    e.preventDefault();
    toggleChrome();
  }
  if (e.ctrlKey && e.shiftKey && key === 'n') {
    e.preventDefault();
    launch('/bin/bash');
  }
  if (e.ctrlKey && e.shiftKey && key === 'u') {
    e.preventDefault();
    document.getElementById('fileInput').click();
  }
  if (e.ctrlKey && e.shiftKey && key === 'v') {
    e.preventDefault();
    uploadClipboardImage();
  }
});

async function ensureSerializeAddon() {
  if (window.SerializeAddon) return;
  const res = await fetch('addon-serialize.min.js?v=20260426');
  const code = await res.text();
  Function(code).call(window);
}

ensureSerializeAddon().then(init).catch(err => {
  console.error(err);
  document.getElementById('emptyState').innerHTML = '<h2>PassiDeck Fehler.</h2><p>Konsole prüfen.</p>';
});
