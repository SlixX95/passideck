const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

const LAYOUTS = ['1x1', '1x2', '2x1', '1x3', '3x1', '2x2', '3x2', '2x3', '2x4', '4x2', '3x3'];
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
  uploadBusy: false
};

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
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  requestAnimationFrame(fitAll);
  if (opts.persist !== false) saveUiState();
}

function focusPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  setLayout('focus', { persist: false });
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('focused');
  state.focusedId = id;
  state.primaryId = null;
  selectPanel(id, { persist: false });
  if (opts.persist !== false) saveUiState();
}

function halfPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  setLayout('half', { persist: false });
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('primary');
  state.focusedId = id;
  state.primaryId = id;
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

function panelTitle(session) {
  return session.meta.label || session.meta.command || session.id.slice(0, 8);
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
      <span class="term-title">${escapeHtml(panelTitle(session))}</span>
      <span class="term-id">${id.slice(0, 8)}</span>
      <div class="term-actions">
        <button title="focus">□</button>
        <button title="half">▅</button>
        <button class="danger" title="close">×</button>
      </div>
    </div>
    <div class="terminal" id="term-${id}"></div>
  `;
  grid.appendChild(el);

  const [focusBtn, halfBtn, closeBtn] = el.querySelectorAll('button');
  focusBtn.onclick = () => focusPanel(id);
  halfBtn.onclick = () => halfPanel(id);
  closeBtn.onclick = () => closePanel(id);
  el.addEventListener('mousedown', () => selectPanel(id));

  const term = new Terminal({
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 5000,
    theme: THEMES[state.theme]
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(el.querySelector('.terminal'));

  const ro = new ResizeObserver(() => fitAll());
  ro.observe(el.querySelector('.terminal'));
  term.onData(data => {
    const entry = state.sessions.get(id);
    if (entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify({ type: 'input', data }));
  });

  state.sessions.set(id, { session, el, term, fit, ws: null, ro });
  state.order.push(id);

  const ws = attachSocket(id, term, el);
  state.sessions.get(id).ws = ws;

  updateEmpty();
  renderSwitcher();
  selectPanel(id, { persist: false });
  requestAnimationFrame(fitAll);
}

function attachSocket(id, term, el) {
  const ws = new WebSocket(`${WS_BASE}?session=${encodeURIComponent(id)}`);
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'output') term.write(msg.data);
    if (msg.type === 'exit') {
      el.classList.add('exited');
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
  entry.term.focus();
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
    entry.el.remove();
    state.sessions.delete(id);
    state.order = state.order.filter(existing => existing !== id);
  }
  if (state.activeId === id) state.activeId = state.order[0] || null;
  updateEmpty();
  renderSwitcher();
  if (state.activeId) selectPanel(state.activeId, { persist: false });
  saveUiState();
}

async function launch(command) {
  if (state.launchBusy) return;
  state.launchBusy = true;
  try {
    const cmd = String(command || '').trim() || '/bin/bash';
    const session = await api('POST', '/api/sessions', { command: cmd, label: cmd });
    createPanel(session);
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

function pasteIntoActiveTerminal(text) {
  const id = state.activeId || state.order[0];
  const entry = id ? state.sessions.get(id) : null;
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN) return false;
  entry.ws.send(JSON.stringify({ type: 'input', data: text }));
  entry.term.focus();
  return true;
}

function formatInsertedPath(upload) {
  return `${upload.path} `;
}

async function uploadFile(file) {
  if (!file || state.uploadBusy) return;
  state.uploadBusy = true;
  try {
    const data = await readFileAsDataUrl(file);
    const upload = await uploadBlob({ name: file.name, type: file.type || 'application/octet-stream', data });
    pasteIntoActiveTerminal(formatInsertedPath(upload));
  } catch (err) {
    console.error(err);
    alert(`Upload failed: ${err.message}`);
  } finally {
    state.uploadBusy = false;
  }
}

async function captureScreenshot() {
  if (state.uploadBusy) return;
  const id = state.activeId || state.order[0];
  const entry = id ? state.sessions.get(id) : null;
  if (!entry) return alert('Kein aktives Fenster');
  state.uploadBusy = true;
  try {
    const rows = [...entry.el.querySelectorAll('.xterm-rows > div')].map(row => row.textContent || '');
    const header = panelTitle(entry.session);
    const fontSize = 14;
    const lineHeight = 19;
    const pad = 14;
    const width = Math.max(900, Math.min(2200, entry.el.getBoundingClientRect().width * 2));
    const height = Math.max(320, pad * 3 + 24 + rows.length * lineHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = THEMES[state.theme].background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--tg-surface') || '#161821';
    ctx.fillRect(0, 0, canvas.width, 38);
    ctx.fillStyle = THEMES[state.theme].cursor;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(header, pad, 24);
    ctx.fillStyle = THEMES[state.theme].foreground;
    ctx.font = `${fontSize}px monospace`;
    rows.forEach((line, i) => ctx.fillText(line, pad, 54 + i * lineHeight));
    const data = canvas.toDataURL('image/png');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const upload = await uploadBlob({ name: `passideck-${stamp}.png`, type: 'image/png', data });
    pasteIntoActiveTerminal(formatInsertedPath(upload));
  } catch (err) {
    console.error(err);
    alert(`Screenshot failed: ${err.message}`);
  } finally {
    state.uploadBusy = false;
  }
}

async function init() {
  const [sessions, ui] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null)
  ]);

  setTheme(ui?.theme || 'blue', { persist: false });
  sessions.forEach(createPanel);

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
document.getElementById('uploadFileBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  uploadFile(file);
};
document.getElementById('screenshotBtn').onclick = () => captureScreenshot();
document.getElementById('themeSelect').onchange = e => setTheme(e.target.value);
window.addEventListener('resize', () => requestAnimationFrame(fitAll));
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
  if (e.ctrlKey && e.shiftKey && key === 'n') {
    e.preventDefault();
    launch('/bin/bash');
  }
  if (e.ctrlKey && e.shiftKey && key === 'u') {
    e.preventDefault();
    document.getElementById('fileInput').click();
  }
  if (e.ctrlKey && e.shiftKey && key === 's') {
    e.preventDefault();
    captureScreenshot();
  }
});

init().catch(err => {
  console.error(err);
  document.getElementById('emptyState').innerHTML = '<h2>PassiDeck Fehler.</h2><p>Konsole prüfen.</p>';
});
