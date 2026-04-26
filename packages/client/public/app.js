const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

const LAYOUTS = ['1x1', '1x2', '2x1', '1x3', '3x1', '2x2', '3x2', '2x3', '2x4', '4x2', '3x3'];
const LAYOUT_SLOTS = Object.freeze({
  '1x1': 1,
  '1x2': 2,
  '2x1': 2,
  '1x3': 3,
  '3x1': 3,
  '2x2': 4,
  '3x2': 6,
  '2x3': 6,
  '2x4': 8,
  '4x2': 8,
  '3x3': 9
});
const THEMES = {
  blue:   { background: '#0f1117', foreground: '#c8ccd8', cursor: '#7aa2f7', selectionBackground: '#3d5a9e' },
  green:  { background: '#0f1117', foreground: '#d5e8d0', cursor: '#9ece6a', selectionBackground: '#4c6f38' },
  amber:  { background: '#0f1117', foreground: '#ead7ba', cursor: '#e0af68', selectionBackground: '#7c5f33' },
  purple: { background: '#0f1117', foreground: '#ddd3ff', cursor: '#bb9af7', selectionBackground: '#624f8f' },
  red:    { background: '#0f1117', foreground: '#f3c5cc', cursor: '#f7768e', selectionBackground: '#893b4a' },
  mono:   { background: '#0f1117', foreground: '#c8ccd8', cursor: '#c8ccd8', selectionBackground: '#555b6f' }
};

const state = {
  sessions: new Map(),
  order: [],
  layout: '2x1',
  activeLayout: '2x1',
  focusedId: null,
  primaryId: null,
  activeId: null,
  theme: 'blue',
  saveTimer: null,
  launchBusy: false,
  uploadBusy: false,
  clipboardPasteArmed: false,
  clipboardPasteTimer: null,
  panePrefs: { titles: {}, order: [] }
};

const PANE_PREFS_KEY = 'passideck:pane-prefs:v1';
const CHROME_PREF_KEY = 'passideck:chrome-hidden:v1';
const TERM_SNAPSHOT_PREFIX = 'passideck:term-snapshot:v1:';
const TERM_SNAPSHOT_MAX_LINES = 240;
const TERM_SNAPSHOT_MAX_CHARS = 64000;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

function uiPayload() {
  return {
    layout: state.activeLayout,
    baseLayout: state.layout,
    focusedId: state.focusedId,
    primaryId: state.primaryId,
    activeId: state.activeId,
    theme: state.theme
  };
}

function saveUiState() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => api('PUT', '/api/ui-state', uiPayload()).catch(console.error), 150);
}

function visiblePaneIds(layout = state.activeLayout) {
  const ids = state.order.filter(id => state.sessions.has(id));
  const cap = layout === 'focus' ? 1 : layout === 'half' ? 2 : (LAYOUT_SLOTS[layout] || ids.length || 1);
  if (!ids.length) return new Set();
  if (ids.length <= cap) return new Set(ids);
  const prioritized = [];
  const push = id => { if (id && ids.includes(id) && !prioritized.includes(id)) prioritized.push(id); };
  if (layout === 'focus') push(state.focusedId || state.activeId || ids[0]);
  else if (layout === 'half') { push(state.primaryId || state.activeId || ids[0]); push(state.activeId); }
  else push(state.activeId);
  ids.forEach(push);
  return new Set(prioritized.slice(0, cap));
}

function applyLayoutVisibility() {
  const visible = visiblePaneIds();
  for (const [id, entry] of state.sessions) {
    entry.el.classList.toggle('layout-hidden', !visible.has(id));
  }
}

function setLayout(layout, opts = {}) {
  if (!layout || ![...LAYOUTS, 'focus', 'half'].includes(layout)) return;
  const grid = document.getElementById('termGrid');
  grid.className = `grid-container layout-${layout}`;
  state.activeLayout = layout;
  if (!['focus', 'half'].includes(layout)) {
    state.layout = layout;
    state.focusedId = null;
    state.primaryId = null;
    document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused', 'primary'));
  }
  applyLayoutVisibility();
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  requestAnimationFrame(fitAll);
  if (opts.persist !== false) saveUiState();
}

function focusPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  state.focusedId = id;
  state.primaryId = null;
  setLayout('focus', { persist: false });
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('focused');
  applyLayoutVisibility();
  selectPanel(id, { persist: false });
  if (opts.persist !== false) saveUiState();
}

function halfPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  state.focusedId = id;
  state.primaryId = id;
  setLayout('half', { persist: false });
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('primary');
  applyLayoutVisibility();
  selectPanel(id, { persist: false });
  if (opts.persist !== false) saveUiState();
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
    const serialized = entry.serialize?.serialize({ scrollback: Math.max(0, term.rows || 30) });
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
  const text = terminalSnapshot(entry);
  try {
    if (text) localStorage.setItem(snapshotKey(id), JSON.stringify({ id, text, savedAt: Date.now() }));
  } catch {}
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

function defaultTitle(session) {
  return session.meta.label || session.meta.command || 'Fenster';
}

function customTitle(session) {
  const title = state.panePrefs.titles?.[session.id];
  return title || defaultTitle(session);
}

function panelTitle(session) {
  return customTitle(session);
}

function clearDropTargets() {
  document.querySelectorAll('.term-panel.drop-before, .term-panel.drop-after')
    .forEach(panel => panel.classList.remove('drop-before', 'drop-after'));
}

function dropSide(event, el) {
  const rect = el.getBoundingClientRect();
  const horizontal = rect.width >= rect.height;
  const midpoint = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
  return (horizontal ? event.clientX : event.clientY) < midpoint ? 'before' : 'after';
}

function markDropTarget(event, el) {
  const side = dropSide(event, el);
  clearDropTargets();
  el.classList.add(side === 'before' ? 'drop-before' : 'drop-after');
  return side;
}

function createPanel(session) {
  if (state.sessions.has(session.id) || session.meta.status === 'exited') return;
  const id = session.id;
  const grid = document.getElementById('termGrid');
  const el = document.createElement('section');
  el.className = 'term-panel';
  el.id = `panel-${id}`;
  el.innerHTML = `
    <div class="term-header">
      <span class="term-title" contenteditable="true" spellcheck="false" aria-label="Fenstername">${escapeHtml(panelTitle(session))}</span>
      <span class="term-drag-handle" draggable="true" title="Fenster ziehen" aria-label="Fenster ziehen">⋮⋮</span>
      <div class="term-actions">
        <button class="danger" title="close">×</button>
      </div>
    </div>
    <div class="terminal" id="term-${id}"></div>
  `;
  grid.appendChild(el);

  const titleEl = el.querySelector('.term-title');
  const dragHandle = el.querySelector('.term-drag-handle');
  const closeBtn = el.querySelector('button');
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
  });
  titleEl.addEventListener('mousedown', e => e.stopPropagation());
  closeBtn.onclick = () => closePanel(id);
  el.addEventListener('mousedown', () => selectPanel(id));
  dragHandle.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  dragHandle.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    clearDropTargets();
  });
  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    markDropTarget(e, el);
  });
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-after');
  });
  el.addEventListener('drop', e => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    const side = markDropTarget(e, el);
    clearDropTargets();
    movePanel(sourceId, id, side);
  });

  const term = new Terminal({
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 5000,
    theme: THEMES[state.theme]
  });
  const fit = new FitAddon.FitAddon();
  const serialize = window.SerializeAddon ? new SerializeAddon.SerializeAddon() : null;
  term.loadAddon(fit);
  if (serialize) term.loadAddon(serialize);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(el.querySelector('.terminal'));

  const ro = new ResizeObserver(() => fitAll());
  ro.observe(el.querySelector('.terminal'));
  term.onData(data => {
    const entry = state.sessions.get(id);
    const clean = sanitizeTerminalInput(data);
    if (clean && entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify({ type: 'input', data: clean }));
  });

  const hasSnapshot = hasTerminalSnapshot(id);
  state.sessions.set(id, { session, el, term, fit, serialize, ws: null, ro, restored: hasSnapshot, snapshotTimer: null });
  state.order = state.order.filter(existing => existing !== id);
  state.order.push(id);

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
    btn.innerHTML = `<span>${idx + 1}</span><span class="switcher-title">${escapeHtml(panelTitle(entry.session))}</span>`;
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
  if (state.activeId === id) state.activeId = state.order[0] || null;
  updateEmpty();
  renderSwitcher();
  if (state.activeId) selectPanel(state.activeId, { persist: false });
  savePanePrefs();
  saveUiState();
}

async function launch(command) {
  if (state.launchBusy) return;
  state.launchBusy = true;
  try {
    const cmd = String(command || '').trim() || '/bin/bash';
    const session = await api('POST', '/api/sessions', { command: cmd, label: cmd });
    createPanel(session);
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

function pasteIntoActiveTerminal(text) {
  const entry = activeTerminalEntry();
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN) return false;
  entry.ws.send(JSON.stringify({ type: 'input', data: text }));
  entry.term.focus();
  return true;
}

function isHermesSession(entry) {
  const meta = entry?.session?.meta || {};
  const command = String(meta.command || '').trim().toLowerCase();
  const label = String(meta.label || '').trim().toLowerCase();
  return command === 'hermes' || command.endsWith('/hermes') || label === 'hermes';
}

function formatUploadInsertion(upload) {
  const entry = activeTerminalEntry();
  if (isHermesSession(entry) && /^image\//i.test(upload.type || '')) {
    // Codex-style UX for Hermes: attach first, show Hermes' [📎 Image #N] badge,
    // then Pascal can type a normal prompt without a raw file path in the composer.
    return `/image ${upload.path}\r`;
  }
  // Fallback for shell/Codex/unknown panes: keep the old explicit local path behavior.
  return `\x01${upload.path} `;
}

function findImageFileFromClipboardItems(items) {
  for (const item of items || []) {
    if (item.kind === 'file' && item.type?.startsWith('image/')) return item.getAsFile();
  }
  return null;
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

function handleTerminalPaste(e) {
  if (shouldLetBrowserHandlePaste(e.target)) return;

  const file = findImageFileFromClipboardItems(e.clipboardData?.items);
  if (file) {
    e.preventDefault();
    clearClipboardPasteMode();
    uploadFile(file, { pasteIntoTerminal: true });
    return;
  }

  const text = e.clipboardData?.getData('text/plain');
  if (text && pasteIntoActiveTerminal(text)) {
    e.preventDefault();
    clearClipboardPasteMode();
  }
}

function armClipboardPasteMode() {
  const btn = document.getElementById('clipboardImageBtn');
  state.clipboardPasteArmed = true;
  clearTimeout(state.clipboardPasteTimer);
  btn.textContent = 'press Ctrl+V';
  btn.classList.add('armed');
  state.clipboardPasteTimer = setTimeout(() => {
    state.clipboardPasteArmed = false;
    btn.textContent = 'clipboard image';
    btn.classList.remove('armed');
  }, 12000);
  window.focus();
}

function clearClipboardPasteMode() {
  const btn = document.getElementById('clipboardImageBtn');
  state.clipboardPasteArmed = false;
  clearTimeout(state.clipboardPasteTimer);
  btn.textContent = 'clipboard image';
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
  if (!file || (state.uploadBusy && !opts.keepBusy)) return;
  if (!opts.keepBusy) state.uploadBusy = true;
  try {
    const data = await readFileAsDataUrl(file);
    const upload = await uploadBlob({ name: file.name, type: file.type || 'application/octet-stream', data });
    if (opts.pasteIntoTerminal) pasteIntoActiveTerminal(formatUploadInsertion(upload));
  } catch (err) {
    console.error(err);
    alert(`Upload failed: ${err.message}`);
  } finally {
    if (!opts.keepBusy) state.uploadBusy = false;
  }
}

async function init() {
  loadPanePrefs();
  try { document.body.classList.toggle('chrome-hidden', localStorage.getItem(CHROME_PREF_KEY) === '1'); } catch {}
  const [sessions, ui] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null)
  ]);

  setTheme(ui?.theme || 'blue', { persist: false });
  sessions.forEach(createPanel);
  restorePanelOrder();

  const base = ui?.baseLayout || ui?.layout || '2x1';
  state.layout = LAYOUTS.includes(base) ? base : '2x1';
  if (ui?.layout === 'focus' && ui.focusedId && state.sessions.has(ui.focusedId)) focusPanel(ui.focusedId, { persist: false });
  else if (ui?.layout === 'half' && ui.primaryId && state.sessions.has(ui.primaryId)) halfPanel(ui.primaryId, { persist: false });
  else setLayout(state.layout, { persist: false });

  if (ui?.activeId && state.sessions.has(ui.activeId)) selectPanel(ui.activeId, { persist: false });
  else if (state.order[0]) selectPanel(state.order[0], { persist: false });
  updateEmpty();
  renderSwitcher();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

document.querySelectorAll('.layout-btn').forEach(btn => btn.onclick = () => setLayout(btn.dataset.layout));
document.querySelectorAll('[data-command]').forEach(btn => btn.onclick = () => launch(btn.dataset.command));
document.getElementById('settingsToggle').onclick = () => {
  const panel = document.getElementById('settingsPanel');
  panel.hidden = !panel.hidden;
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
document.addEventListener('paste', handleTerminalPaste, true);
window.addEventListener('resize', () => requestAnimationFrame(fitAll));
window.addEventListener('beforeunload', saveAllTerminalSnapshots);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAllTerminalSnapshots(); });
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    if (!document.getElementById('settingsPanel').hidden) document.getElementById('settingsPanel').hidden = true;
    else if (['focus', 'half'].includes(state.activeLayout)) setLayout(state.layout);
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
