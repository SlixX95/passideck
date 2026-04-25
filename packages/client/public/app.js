const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

const state = {
  sessions: new Map(),
  layout: '2x1',
  activeLayout: '2x1',
  focusedId: null,
  primaryId: null,
  saveTimer: null,
  launchBusy: false
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
    primaryId: state.primaryId
  };
}

function saveUiState() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => api('PUT', '/api/ui-state', uiPayload()).catch(console.error), 150);
}

function setLayout(layout, opts = {}) {
  if (!layout) return;
  const grid = document.getElementById('termGrid');
  grid.className = `grid layout-${layout}`;
  state.activeLayout = layout;
  if (!['focus', 'half'].includes(layout)) {
    state.layout = layout;
    state.focusedId = null;
    state.primaryId = null;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('focused', 'primary'));
  }
  document.querySelectorAll('.layouts button').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  requestAnimationFrame(fitAll);
  if (opts.persist !== false) saveUiState();
}

function focusPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  setLayout('focus', { persist: false });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('focused');
  state.focusedId = id;
  state.primaryId = null;
  if (opts.persist !== false) saveUiState();
}

function halfPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  setLayout('half', { persist: false });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('focused', 'primary'));
  entry.el.classList.add('primary');
  state.focusedId = id;
  state.primaryId = id;
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
}

function panelTitle(session) {
  return session.meta.label || session.meta.command || session.id.slice(0, 8);
}

function createPanel(session) {
  if (state.sessions.has(session.id) || session.meta.status === 'exited') return;
  const id = session.id;
  const grid = document.getElementById('termGrid');
  const el = document.createElement('section');
  el.className = 'panel';
  el.id = `panel-${id}`;
  el.innerHTML = `
    <div class="panelbar">
      <span class="title">${escapeHtml(panelTitle(session))}</span>
      <span class="sid">${id.slice(0, 8)}</span>
      <button title="focus">□</button>
      <button title="half">▅</button>
      <button class="danger" title="close">×</button>
    </div>
    <div class="terminal" id="term-${id}"></div>
  `;
  grid.appendChild(el);

  const [focusBtn, halfBtn, closeBtn] = el.querySelectorAll('button');
  focusBtn.onclick = () => focusPanel(id);
  halfBtn.onclick = () => halfPanel(id);
  closeBtn.onclick = () => closePanel(id);

  const term = new Terminal({
    fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: '#05070d', foreground: '#d7e1ff', cursor: '#7aa2f7', selectionBackground: '#33467a' }
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(el.querySelector('.terminal'));

  const ws = new WebSocket(`${WS_BASE}?session=${encodeURIComponent(id)}`);
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'output') term.write(msg.data);
    if (msg.type === 'exit') el.classList.add('exited');
  };
  ws.onopen = () => requestAnimationFrame(fitAll);
  ws.onclose = () => setTimeout(() => reconnect(id), 1000);
  term.onData(data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
  });

  const ro = new ResizeObserver(() => fitAll());
  ro.observe(el.querySelector('.terminal'));

  state.sessions.set(id, { session, el, term, fit, ws, ro });
  updateEmpty();
  requestAnimationFrame(fitAll);
}

function reconnect(id) {
  const entry = state.sessions.get(id);
  if (!entry || entry.el.classList.contains('exited')) return;
  const ws = new WebSocket(`${WS_BASE}?session=${encodeURIComponent(id)}`);
  entry.ws = ws;
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'output') entry.term.write(msg.data);
    if (msg.type === 'exit') entry.el.classList.add('exited');
  };
  ws.onclose = () => setTimeout(() => reconnect(id), 1500);
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
  }
  updateEmpty();
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

async function init() {
  const [sessions, ui] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null)
  ]);
  sessions.forEach(createPanel);

  const base = ui?.baseLayout || ui?.layout || '2x1';
  state.layout = ['focus', 'half'].includes(base) ? '2x1' : base;
  if (ui?.layout === 'focus' && ui.focusedId && state.sessions.has(ui.focusedId)) focusPanel(ui.focusedId, { persist: false });
  else if (ui?.layout === 'half' && ui.primaryId && state.sessions.has(ui.primaryId)) halfPanel(ui.primaryId, { persist: false });
  else setLayout(state.layout, { persist: false });
  updateEmpty();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

document.querySelectorAll('.layouts button').forEach(btn => btn.onclick = () => setLayout(btn.dataset.layout));
document.querySelectorAll('.quick button').forEach(btn => btn.onclick = () => launch(btn.dataset.command));
document.getElementById('promptLaunch').onclick = () => {
  const input = document.getElementById('promptInput');
  launch(input.value);
  input.value = '';
};
document.getElementById('promptInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('promptLaunch').click();
});
window.addEventListener('resize', () => requestAnimationFrame(fitAll));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ['focus', 'half'].includes(state.activeLayout)) setLayout(state.layout);
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    document.getElementById('promptInput').focus();
  }
});

init().catch(err => {
  console.error(err);
  document.getElementById('emptyState').innerHTML = '<h1>PassiDeck Fehler.</h1><p>Konsole prüfen.</p>';
});
