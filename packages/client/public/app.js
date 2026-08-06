const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;
const AUTH_TOKEN_KEY = 'passideck:auth-token';
const PERFORMANCE_MODE_KEY = 'passideck:performance-mode';
const SOCKET_HEARTBEAT_MS = 15000;
const SOCKET_STALE_MS = SOCKET_HEARTBEAT_MS * 3;
const LATENCY_PROBE_MS = 3000;
const HERMES_TUI_WHEEL_MULTIPLIER = 3;

function authToken() {
  const urlToken = new URLSearchParams(window.location.search).get('token') || '';
  if (urlToken) {
    try { sessionStorage.setItem(AUTH_TOKEN_KEY, urlToken); } catch {}
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('token');
    history.replaceState(history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    return urlToken;
  }
  try { return sessionStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

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

function terminalTheme(name) {
  const theme = THEMES[name] || THEMES.blue;
  return {
    ...theme,
    scrollbarSliderBackground: `${theme.cursor}85`,
    scrollbarSliderHoverBackground: theme.cursor,
    scrollbarSliderActiveBackground: theme.cursor
  };
}

const state = {
  sessions: new Map(),
  order: [],
  activeId: null,
  theme: 'blue',
  skin: 'neon',
  fontSize: 13,
  responseSoundMode: 'background',
  responseSoundTone: 'soft',
  responseSoundVolume: 60,
  notifyBlinking: true,
  dynamicTitles: true,
  performanceMode: false,
  minimized: new Set(),
  responsiveMinimized: new Set(),
  saveTimer: null,
  saveInFlight: 0,
  saveQueued: false,
  launchBusy: false,
  uploadBusy: false,
  systemMonitorTimer: null,
  systemMonitorInFlight: false,
  codexLimitsTimer: null,
  socketHeartbeatTimer: null,
  latencyProbeTimer: null,
  resumeTimer: null,
  resumeForceReconnect: false,
  fitFrame: null,
  fitOptions: null,
  fitTimer: null,
  fitTimerLate: null,
  pointerDrag: null,
  resizeDrag: null,
  sharedResizeDrag: null,
  zCounter: 10,
  hydrating: false,
  uiRevision: 0,
  lastUiState: null,
  uiEvents: null,
  activeDesktopId: 'desktop-1',
  panePrefs: { titles: {}, order: [], desktopOrder: ['desktop-1'], paneDesktop: {}, desktops: { 'desktop-1': { name: 'Desktop 1', minimized: [], windows: {}, viewport: null } } }
};

const DESKTOP_VIEW_KEY = 'passideck:desktop-view:v1';
const UI_DRAFT_KEY = 'passideck:ui-draft:v1';
const MAX_DESKTOPS = 3;

function localDesktopView() {
  try { return JSON.parse(sessionStorage.getItem(DESKTOP_VIEW_KEY) || '{}'); }
  catch { return {}; }
}

function saveLocalDesktopView() {
  try { sessionStorage.setItem(DESKTOP_VIEW_KEY, JSON.stringify({ activeDesktopId: state.activeDesktopId })); } catch {}
}

function activeDesktop() {
  return state.panePrefs.desktops[state.activeDesktopId] || state.panePrefs.desktops[state.panePrefs.desktopOrder[0]];
}

function desktopPaneIds(id = state.activeDesktopId) {
  return state.order.filter(paneId => state.sessions.has(paneId) && state.panePrefs.paneDesktop[paneId] === id);
}

function frontmostDesktopPaneId(id = state.activeDesktopId) {
  const ids = desktopPaneIds(id);
  const minimized = id === state.activeDesktopId
    ? state.minimized
    : new Set(state.panePrefs.desktops[id]?.minimized || []);
  const prefs = windowPrefs(id);
  const orderIndex = paneId => state.order.indexOf(paneId);
  return ids
    .filter(paneId => !minimized.has(paneId))
    .sort((a, b) => (Number(prefs[b]?.z) || 0) - (Number(prefs[a]?.z) || 0) || orderIndex(b) - orderIndex(a))[0] || ids[0] || null;
}

const TERM_SNAPSHOT_PREFIX = 'passideck:term-snapshot:v2:';
const TERM_SNAPSHOT_MAX_LINES = 20000;
const TERM_SNAPSHOT_MAX_CHARS = 1024 * 1024;
const TERM_SNAPSHOT_DEBOUNCE_MS = 1000;
const TERM_OUTPUT_ACTIVE_FLUSH_MS = 16;
const TERM_OUTPUT_VISIBLE_FLUSH_MS = 250;
const TERM_OUTPUT_HIDDEN_FLUSH_MS = 1000;
const TERM_OUTPUT_BUFFER_MAX_CHARS = 1024 * 1024;

const TOOLTIP_MARGIN = 8;
const TOOLTIP_DELAY_MS = 300;
let tooltipDelayTimer = null;
let tooltipDelayTarget = null;

function tooltipText(el) {
  return el?.dataset?.tooltip || '';
}

function setTooltip(el, text) {
  if (!el) return;
  const v = String(text || '').trim();
  el.removeAttribute('title');
  if (!v) {
    delete el.dataset.tooltip;
    return;
  }
  el.dataset.tooltip = v;
  if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-hidden')) el.setAttribute('aria-label', v);
}

function appTooltip() {
  let tip = document.getElementById('appTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'appTooltip';
    tip.className = 'app-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}

function placeTooltip(target) {
  const text = tooltipText(target);
  const tip = appTooltip();
  if (!text) return hideTooltip();
  tip.textContent = text;
  tip.hidden = false;
  tip.classList.add('visible');
  const tr = target.getBoundingClientRect();
  const r = tip.getBoundingClientRect();
  const below = tr.bottom + 8 + r.height <= window.innerHeight - TOOLTIP_MARGIN;
  const top = below ? tr.bottom + 8 : Math.max(TOOLTIP_MARGIN, tr.top - r.height - 8);
  let left = tr.left + (tr.width - r.width) / 2;
  left = Math.max(TOOLTIP_MARGIN, Math.min(left, window.innerWidth - r.width - TOOLTIP_MARGIN));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideTooltip() {
  clearTooltipDelay();
  const tip = document.getElementById('appTooltip');
  if (!tip) return;
  tip.hidden = true;
  tip.classList.remove('visible');
}

function clearTooltipDelay() {
  if (tooltipDelayTimer) clearTimeout(tooltipDelayTimer);
  tooltipDelayTimer = null;
  tooltipDelayTarget = null;
}

function scheduleTooltip(target) {
  if (!target || !tooltipText(target)) return hideTooltip();
  if (tooltipDelayTarget === target && tooltipDelayTimer) return;
  clearTooltipDelay();
  const tip = document.getElementById('appTooltip');
  if (tip && !tip.hidden) {
    tip.hidden = true;
    tip.classList.remove('visible');
  }
  tooltipDelayTarget = target;
  tooltipDelayTimer = setTimeout(() => {
    const current = tooltipDelayTarget;
    clearTooltipDelay();
    if (!current?.isConnected || !current.matches?.(':hover')) return;
    placeTooltip(current);
  }, TOOLTIP_DELAY_MS);
}

function normalizeNativeTooltips(root = document) {
  root.querySelectorAll('[title]').forEach(el => setTooltip(el, el.getAttribute('title')));
}

function installTooltips() {
  normalizeNativeTooltips();
  document.addEventListener('pointerover', e => {
    const target = e.target.closest?.('[data-tooltip]');
    if (target) scheduleTooltip(target);
  }, true);
  document.addEventListener('pointerout', e => {
    if (e.target.closest?.('[data-tooltip]') && !e.relatedTarget?.closest?.('[data-tooltip]')) hideTooltip();
  }, true);
  document.addEventListener('focusin', e => {
    const target = e.target.closest?.('[data-tooltip]');
    if (target) placeTooltip(target);
  }, true);
  document.addEventListener('focusout', e => {
    if (e.target.closest?.('[data-tooltip]')) hideTooltip();
  }, true);
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}

function requestClosePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  showCloseConfirm(id, panelTitle(entry.session));
}

function installDesktopWindowResizeHandles() {
  if (window.passideckDesktop?.platform !== 'win32' || typeof window.passideckDesktop.windowResize !== 'function' || document.getElementById('desktopWindowResizeHandles')) return;
  const wrap = document.createElement('div');
  wrap.id = 'desktopWindowResizeHandles';
  wrap.className = 'desktop-window-resize-handles';
  for (const direction of ['left', 'right', 'bottom', 'bottom-left', 'bottom-right']) {
    const handle = document.createElement('span');
    handle.className = 'desktop-window-resize-handle';
    handle.dataset.appResize = direction;
    let resizing = false;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      resizing = true;
      trySetPointerCapture(handle, event.pointerId);
      window.passideckDesktop.windowResize('start', { direction, screenX: event.screenX, screenY: event.screenY });
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (resizing) window.passideckDesktop.windowResize('move', { screenX: event.screenX, screenY: event.screenY });
    });
    const finish = event => {
      if (!resizing) return;
      resizing = false;
      window.passideckDesktop.windowResize('end', { screenX: event.screenX, screenY: event.screenY });
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    wrap.appendChild(handle);
  }
  document.body.appendChild(wrap);
}

function setConnectionStatus(id, status) {
  const entry = state.sessions.get(id);
  const el = entry?.el || document.getElementById(`panel-${id}`);
  if (!el) return;
  el.dataset.connectionStatus = status;
  if (entry && status !== 'live') setSessionWorking(id, false);
  updateSessionIndicator(id);
  if (state.activeId === id) renderBackendLatency();
}

function updateSessionIndicator(id) {
  const entry = state.sessions.get(id);
  const el = entry?.el || document.getElementById(`panel-${id}`);
  if (!el) return;
  const dot = el.querySelector('.connection-dot');
  if (dot) {
    const labels = { live: 'Connected', reconnecting: 'Reconnecting', offline: 'Offline' };
    const working = Boolean(entry?.working && el.dataset.connectionStatus === 'live');
    const attention = Boolean(entry?.responseAttention);
    const label = attention ? 'New response' : working ? 'Working' : labels[el.dataset.connectionStatus] || el.dataset.connectionStatus;
    el.classList.toggle('working', working);
    el.classList.toggle('response-attention', attention);
    setTooltip(dot, label);
    dot.setAttribute('aria-label', label);
  }
}

function setSessionWorking(id, working) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  const next = Boolean(working);
  if (entry.working === next) return;
  entry.working = next;
  updateSessionIndicator(id);
}

function applyHermesEvent(id, message) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  if (!isHermesEntry(entry) && !isHermesTuiEntry(entry)) {
    if (message.type === 'hermes-events') {
      entry.pendingHermesEvents = [];
      if (message.connected !== false) entry.pendingHermesEvents.push(message);
    } else {
      entry.pendingHermesEvents.push(message);
      if (entry.pendingHermesEvents.length > 20) entry.pendingHermesEvents.shift();
    }
    return;
  }
  if (message.type === 'hermes-events' && !isHermesTuiEntry(entry)) return;
  if (message.type === 'hermes-events') {
    const runningKnown = typeof message.running === 'boolean';
    entry.hermesEventsConnected = Boolean(message.connected && runningKnown);
    if (runningKnown) setSessionWorking(id, message.running);
    else syncSessionWorkingFromTerminal(id, entry);
    return;
  }
  const event = message.event || {};
  if (isHermesTuiEntry(entry)) entry.hermesEventsConnected = true;
  if (event.type === 'message.start') setSessionWorking(id, true);
  if (event.type === 'message.complete') setSessionWorking(id, false);
  if (event.type === 'session.info' && typeof event.payload?.running === 'boolean') setSessionWorking(id, event.payload.running);
}

function syncSessionWorkingFromTerminal(id, entry, viewportRows = null) {
  if (!isHermesTuiEntry(entry)) return;
  if (entry.hermesEventsConnected) return;
  if (viewportRows) {
    const working = viewportRows.slice(-2).some(row => terminalLineText(row).includes('Ctrl+C to interrupt'));
    setSessionWorking(id, working);
    return;
  }
  const buffer = entry.term?.buffer?.active;
  if (!buffer) return;
  const viewportY = buffer.viewportY || 0;
  const end = Math.min(buffer.length || 0, viewportY + (entry.term.rows || 0));
  let working = false;
  for (let i = Math.max(viewportY, end - 2); i < end; i += 1) {
    const line = buffer.getLine(i);
    if (line && line.translateToString(false).includes('Ctrl+C to interrupt')) {
      working = true;
      break;
    }
  }
  setSessionWorking(id, working);
}

function renderBackendLatency() {
  const el = document.getElementById('backendLatency');
  if (!el) return;
  const socket = state.sessions.get(state.activeId)?.ws;
  const latency = socket?.readyState === WebSocket.OPEN && Number.isFinite(socket.latencyMs) ? socket.latencyMs : null;
  const label = !state.activeId ? 'No active terminal'
    : socket?.readyState !== WebSocket.OPEN ? 'Backend disconnected'
    : latency === null ? 'Measuring backend round trip'
    : `Backend round trip: ${latency} ms`;
  el.dataset.level = latency === null ? 'offline' : latency >= 250 ? 'bad' : latency >= 100 ? 'warn' : 'good';
  el.querySelector('b').textContent = latency === null ? '-- ms' : `${latency} ms`;
  setTooltip(el, label);
  el.setAttribute('aria-label', label);
}

let closeHitLayerInstalled = false;
function installCloseHitLayer() {
  if (closeHitLayerInstalled) return;
  closeHitLayerInstalled = true;
  document.addEventListener('pointerdown', e => {
    if (document.getElementById('closeModal')?.classList.contains('open')) return;
    if (e.target?.closest?.('#chromePeek')) return;

    const topEl = document.elementFromPoint(e.clientX, e.clientY);
    if (topEl?.closest?.('#chromePeek')) return;

    const closeButton = topEl?.closest?.('button.danger');
    if (!closeButton) return;

    const panel = topEl?.closest?.('#termGrid .term-panel:not(.layout-hidden)');
    if (!panel || panel.classList.contains('minimized')) return;

    const btn = panel.querySelector('button.danger');
    if (!btn || closeButton !== btn) return;

    const id = btn.dataset.paneId || panel.dataset.paneId;
    if (!id) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    requestClosePanel(id);
  }, true);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (method === 'PUT' && path === '/api/ui-state') opts.keepalive = true;
  const token = authToken();
  if (token) opts.headers['X-PassiDeck-Token'] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const error = new Error(`${method} ${path} -> ${res.status}`);
    error.status = res.status;
    try { error.data = await res.json(); } catch {}
    throw error;
  }
  return res.json();
}


function windowPrefs(desktopId = state.activeDesktopId) {
  const resolvedDesktopId = state.panePrefs.desktops[desktopId] ? desktopId : state.panePrefs.desktopOrder[0];
  const desktop = state.panePrefs.desktops[resolvedDesktopId];
  desktop.windows = desktop.windows && typeof desktop.windows === 'object' ? desktop.windows : {};
  return desktop.windows;
}

function desktopSize() {
  const r = document.getElementById('termGrid')?.getBoundingClientRect?.() || { width: window.innerWidth || 1280, height: window.innerHeight || 720 };
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
}

function resizeWindowsForDesktop(from, to) {
  if (!from?.w || !from?.h || !to?.w || !to?.h || (from.w === to.w && from.h === to.h)) return;
  const scaleX = to.w / from.w;
  const scaleY = to.h / from.h;
  const prefs = windowPrefs();
  for (const rect of Object.values(prefs)) {
    rect.x *= scaleX;
    rect.y *= scaleY;
    rect.w *= scaleX;
    rect.h *= scaleY;
  }
  for (const id of state.sessions.keys()) if (prefs[id]) applyFreeWindow(id);
  renderSharedResizeHandles();
}

function isCompactViewport() {
  const { w, h } = desktopSize();
  const width = Math.min(w, window.innerWidth || w);
  const height = window.innerHeight || h;
  return width <= 1024 || height <= 419 || (width <= 1200 && window.matchMedia?.('(pointer: coarse)').matches);
}

function responsiveMinimizeForViewport() {
  if (!isCompactViewport()) {
    for (const id of state.responsiveMinimized) {
      state.minimized.delete(id);
      state.sessions.get(id)?.el.classList.remove('minimized');
    }
    state.responsiveMinimized.clear();
    return;
  }
  const paneIds = desktopPaneIds();
  const keep = state.activeId && paneIds.includes(state.activeId) ? state.activeId : paneIds[0];
  for (const id of paneIds) {
    if (id !== keep && state.sessions.has(id) && !state.minimized.has(id)) {
      state.minimized.add(id);
      state.responsiveMinimized.add(id);
      state.sessions.get(id)?.el.classList.add('minimized');
    }
  }
}


function rectCoveredArea(rect, blockers) {
  const covered = blockers.map(blocker => ({
    x: Math.max(rect.x, blocker.x),
    y: Math.max(rect.y, blocker.y),
    right: Math.min(rect.x + rect.w, blocker.x + blocker.w),
    bottom: Math.min(rect.y + rect.h, blocker.y + blocker.h)
  })).filter(c => c.right > c.x && c.bottom > c.y);
  const xs = [...new Set(covered.flatMap(c => [c.x, c.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const intervals = covered
      .filter(c => c.x < xs[i + 1] && c.right > xs[i])
      .map(c => [c.y, c.bottom])
      .sort((a, b) => a[0] - b[0]);
    let height = 0, end = -Infinity;
    for (const [start, bottom] of intervals) {
      height += Math.max(0, bottom - Math.max(start, end));
      end = Math.max(end, bottom);
    }
    area += (xs[i + 1] - xs[i]) * height;
  }
  return area;
}

function occupiedWindowRects(excludeId = null, desktopId = state.activeDesktopId) {
  const prefs = windowPrefs(desktopId);
  const minimized = desktopId === state.activeDesktopId
    ? state.minimized
    : new Set(state.panePrefs.desktops[desktopId]?.minimized || []);
  return Object.entries(prefs)
    .filter(([id]) => id !== excludeId && state.sessions.has(id) && state.panePrefs.paneDesktop[id] === desktopId && !minimized.has(id))
    .map(([, r]) => r);
}

function desktopCandidates() {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const W = r.width, H = r.height;
  const q = [
    { x: 0, y: 0, w: W / 2, h: H },
    { x: W / 2, y: 0, w: W / 2, h: H },
    { x: 0, y: H / 2, w: W, h: H / 2 },
    { x: 0, y: 0, w: W, h: H / 2 },
    { x: W / 2, y: 0, w: W / 2, h: H / 2 },
    { x: 0, y: H / 2, w: W / 2, h: H / 2 },
    { x: W / 2, y: H / 2, w: W / 2, h: H / 2 },
    { x: 0, y: 0, w: W / 2, h: H / 2 }
  ];
  return q;
}

function freeSpaceWindowRect(id = null, desktopId = state.activeDesktopId) {
  const occupied = occupiedWindowRects(id, desktopId);
  const gaps = occupied.length ? desktopGapSlotRects(occupied.map(rect => ({ rect }))) : [];
  for (const c of [...gaps, ...desktopCandidates()]) {
    const area = c.w * c.h;
    const overlap = rectCoveredArea(c, occupied);
    if (overlap / Math.max(1, area) < 0.08) return { ...c, z: nextWindowZ(desktopId) };
  }
  return null;
}


function compactWindowZ(prefs) {
  const orderIndex = paneId => {
    const index = state.order.indexOf(paneId);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const zValue = rect => {
    const value = Number(rect?.z);
    return Number.isFinite(value) && value >= 1 && value <= 9999 ? value : 0;
  };
  const entries = Object.entries(prefs).sort((a, b) => zValue(a[1]) - zValue(b[1]) || orderIndex(a[0]) - orderIndex(b[0]));
  entries.forEach(([, rect], index) => { rect.z = Math.min(9998, 10 + index); });
  return Math.max(10, ...entries.map(([, rect]) => rect.z));
}

function windowZSnapshot(prefs = windowPrefs()) {
  return Object.fromEntries(Object.entries(prefs).map(([id, rect]) => [id, rect?.z]));
}

function restoreWindowZSnapshot(snapshot, prefs = windowPrefs()) {
  if (!snapshot) return;
  for (const [id, z] of Object.entries(snapshot)) if (prefs[id]) prefs[id].z = z;
}

function nextWindowZ(desktopId = state.activeDesktopId) {
  const prefs = windowPrefs(desktopId);
  const vals = Object.values(prefs).map(rect => Number(rect?.z));
  const invalid = vals.some(value => !Number.isFinite(value) || value < 1 || value > 9999);
  const valid = vals.filter(value => Number.isFinite(value) && value >= 1 && value <= 9999);
  let maxZ = Math.max(...valid, 10);
  let counter = Number(state.zCounter);
  if (!Number.isFinite(counter) || counter < 10) counter = 10;
  if (invalid || maxZ >= 9999 || counter >= 9999) {
    maxZ = compactWindowZ(prefs);
    counter = maxZ;
  }
  state.zCounter = Math.max(counter, maxZ) + 1;
  return state.zCounter;
}

function defaultWindowRect(index = 0, desktopId = state.activeDesktopId) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const free = freeSpaceWindowRect(null, desktopId);
  if (free) return free;
  const { w, h } = defaultWindowSize();
  const offset = (index % 8) * 34;
  return {
    x: Math.max(0, Math.min(r.width - 120, 24 + offset)),
    y: Math.max(0, Math.min(r.height - 80, 24 + offset)),
    w,
    h,
    z: nextWindowZ(desktopId)
  };
}

function defaultWindowSize() {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  return {
    w: Math.max(420, Math.min(900, r.width * 0.46)),
    h: Math.max(280, Math.min(620, r.height * 0.46))
  };
}

function makeFreeWindow(id, rect) {
  const entry = state.sessions.get(id);
  if (!entry) return null;
  const prefs = windowPrefs();
  const grid = document.getElementById('termGrid');
  const gr = grid?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1280, height: 720 };
  const r = rect || entry.el.getBoundingClientRect();
  const currentRect = {
    x: Math.max(0, Math.min(gr.width - 120, r.left - gr.left + (grid?.scrollLeft || 0))),
    y: Math.max(0, Math.min(gr.height - 80, r.top - gr.top + (grid?.scrollTop || 0))),
    w: Math.max(360, r.width || 640),
    h: Math.max(220, r.height || 400)
  };
  if (!prefs[id]) {
    prefs[id] = { ...currentRect, z: nextWindowZ() };
  } else if (rect) {
    Object.assign(prefs[id], currentRect);
  }
  entry.el.classList.add('free-window');
  applyFreeWindow(id);
  return prefs[id];
}

function ensureFreeWindow(id) {
  const prefs = windowPrefs();
  if (!prefs[id]) prefs[id] = defaultWindowRect(Object.keys(prefs).length);
  return makeFreeWindow(id);
}

function clampWindowRect(rect = {}) {
  const grid = document.getElementById('termGrid');
  const gr = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const desktopW = Math.max(1, Number(gr.width) || 1280);
  const desktopH = Math.max(1, Number(gr.height) || 720);
  const minW = Math.min(300, desktopW);
  const minH = Math.min(190, desktopH);
  const fallbackW = Math.min(640, desktopW);
  const fallbackH = Math.min(400, desktopH);
  const rawW = Number.isFinite(Number(rect.w)) ? Number(rect.w) : fallbackW;
  const rawH = Number.isFinite(Number(rect.h)) ? Number(rect.h) : fallbackH;
  const w = Math.max(minW, Math.min(rawW, desktopW));
  const h = Math.max(minH, Math.min(rawH, desktopH));
  const maxX = Math.max(0, desktopW - w);
  const maxY = Math.max(0, desktopH - h);
  const rawX = Number.isFinite(Number(rect.x)) ? Number(rect.x) : 0;
  const rawY = Number.isFinite(Number(rect.y)) ? Number(rect.y) : 0;
  return {
    x: Math.max(0, Math.min(maxX, rawX)),
    y: Math.max(0, Math.min(maxY, rawY)),
    w,
    h,
    z: Number(rect.z) > 0 && Number(rect.z) < 10000 ? Number(rect.z) : nextWindowZ()
  };
}

function renderWindowRect(rect = {}) {
  const rendered = clampWindowRect(rect);
  if (window.passideckDesktop?.platform !== 'win32') return rendered;
  const viewport = activeDesktop()?.viewport;
  const current = desktopSize();
  const right = Number(rect.x) + Number(rect.w);
  const bottom = Number(rect.y) + Number(rect.h);
  if (viewport?.w && Math.abs(right - viewport.w) < 2) rendered.w = Math.max(1, current.w - rendered.x);
  if (viewport?.h && Math.abs(bottom - viewport.h) < 2) rendered.h = Math.max(1, current.h - rendered.y);
  return rendered;
}

function applyFreeWindow(id) {
  const entry = state.sessions.get(id);
  const p = windowPrefs()[id];
  if (!entry || !p) return;
  const rect = renderWindowRect(p);
  entry.el.classList.add('free-window');
  entry.el.classList.remove('layout-hidden');
  entry.el.style.gridColumn = '';
  entry.el.style.gridRow = '';
  entry.el.style.left = `${rect.x}px`;
  entry.el.style.top = `${rect.y}px`;
  entry.el.style.width = `${rect.w}px`;
  entry.el.style.height = `${rect.h}px`;
  entry.el.style.zIndex = String(rect.z || 10);
}

function bringWindowToFront(id, opts = {}) {
  const p = ensureFreeWindow(id);
  if (!p) return;
  p.z = nextWindowZ();
  applyFreeWindow(id);
  renderSharedResizeHandles();
  if (opts.persist !== false) savePanePrefs();
}

function clearDesktopSlotSuggestions() {
  document.getElementById('desktopSlotSuggestions')?.remove();
}

function clearSharedResizeHandles() {
  document.getElementById('sharedResizeHandles')?.remove();
}

function visibleWindowRects() {
  const prefs = windowPrefs();
  return state.order
    .filter(id => state.sessions.has(id) && !state.minimized.has(id) && prefs[id])
    .map(id => ({ id, rect: clampWindowRect(prefs[id]) }));
}

function intervalOverlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function mergeSharedResizeGroup(map, key, seed) {
  const current = map.get(key) || { ...seed, beforeIds: new Set(), afterIds: new Set(), start: seed.start, end: seed.end };
  current.pos = (current.pos + seed.pos) / 2;
  current.start = Math.min(current.start, seed.start);
  current.end = Math.max(current.end, seed.end);
  seed.beforeIds.forEach(id => current.beforeIds.add(id));
  seed.afterIds.forEach(id => current.afterIds.add(id));
  map.set(key, current);
}

function sharedResizeGroups() {
  const rects = visibleWindowRects();
  const vertical = new Map();
  const horizontal = new Map();
  const edgeTol = 8;
  const minSegment = 56;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i], b = rects[j];
      const ar = a.rect.x + a.rect.w;
      const br = b.rect.x + b.rect.w;
      const abVertical = intervalOverlap(a.rect.y, a.rect.y + a.rect.h, b.rect.y, b.rect.y + b.rect.h);
      if (abVertical >= minSegment && Math.abs(ar - b.rect.x) <= edgeTol) {
        mergeSharedResizeGroup(vertical, Math.round(((ar + b.rect.x) / 2) / edgeTol) * edgeTol, {
          axis: 'vertical', pos: (ar + b.rect.x) / 2, start: Math.max(a.rect.y, b.rect.y), end: Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h), beforeIds: new Set([a.id]), afterIds: new Set([b.id])
        });
      }
      if (abVertical >= minSegment && Math.abs(br - a.rect.x) <= edgeTol) {
        mergeSharedResizeGroup(vertical, Math.round(((br + a.rect.x) / 2) / edgeTol) * edgeTol, {
          axis: 'vertical', pos: (br + a.rect.x) / 2, start: Math.max(a.rect.y, b.rect.y), end: Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h), beforeIds: new Set([b.id]), afterIds: new Set([a.id])
        });
      }
      const abHorizontal = intervalOverlap(a.rect.x, a.rect.x + a.rect.w, b.rect.x, b.rect.x + b.rect.w);
      const ab = a.rect.y + a.rect.h;
      const bb = b.rect.y + b.rect.h;
      if (abHorizontal >= minSegment && Math.abs(ab - b.rect.y) <= edgeTol) {
        mergeSharedResizeGroup(horizontal, Math.round(((ab + b.rect.y) / 2) / edgeTol) * edgeTol, {
          axis: 'horizontal', pos: (ab + b.rect.y) / 2, start: Math.max(a.rect.x, b.rect.x), end: Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w), beforeIds: new Set([a.id]), afterIds: new Set([b.id])
        });
      }
      if (abHorizontal >= minSegment && Math.abs(bb - a.rect.y) <= edgeTol) {
        mergeSharedResizeGroup(horizontal, Math.round(((bb + a.rect.y) / 2) / edgeTol) * edgeTol, {
          axis: 'horizontal', pos: (bb + a.rect.y) / 2, start: Math.max(a.rect.x, b.rect.x), end: Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w), beforeIds: new Set([b.id]), afterIds: new Set([a.id])
        });
      }
    }
  }
  return [...vertical.values(), ...horizontal.values()].filter(g => g.beforeIds.size && g.afterIds.size && g.end - g.start >= minSegment);
}

function visibleSharedResizeSegments(group, rects = visibleWindowRects()) {
  const participantIds = new Set([...group.beforeIds, ...group.afterIds]);
  const participantZ = Math.max(...rects.filter(item => participantIds.has(item.id)).map(item => item.rect.z || 0));
  let segments = [{ start: group.start, end: group.end }];
  for (const item of rects) {
    const rect = item.rect;
    if (participantIds.has(item.id) || (rect.z || 0) <= participantZ) continue;
    const crossesHandle = group.axis === 'vertical'
      ? rect.x < group.pos + 5 && rect.x + rect.w > group.pos - 5
      : rect.y < group.pos + 5 && rect.y + rect.h > group.pos - 5;
    if (!crossesHandle) continue;
    const cutStart = group.axis === 'vertical' ? rect.y : rect.x;
    const cutEnd = group.axis === 'vertical' ? rect.y + rect.h : rect.x + rect.w;
    segments = segments.flatMap(segment => {
      if (cutEnd <= segment.start || cutStart >= segment.end) return [segment];
      return [
        { start: segment.start, end: Math.max(segment.start, cutStart) },
        { start: Math.min(segment.end, cutEnd), end: segment.end }
      ].filter(part => part.end > part.start);
    });
  }
  return segments;
}

function renderSharedResizeHandles() {
  const grid = document.getElementById('termGrid');
  if (!grid || isCompactViewport() || state.pointerDrag || state.resizeDrag || state.sharedResizeDrag) return;
  clearSharedResizeHandles();
  const groups = sharedResizeGroups();
  if (!groups.length) return;
  const wrap = document.createElement('section');
  wrap.id = 'sharedResizeHandles';
  wrap.className = 'shared-resize-handles';
  for (const group of groups) {
    for (const segment of visibleSharedResizeSegments(group)) {
      const handle = document.createElement('div');
      handle.className = `shared-resize-handle ${group.axis}`;
      handle.setAttribute('aria-hidden', 'true');
      if (group.axis === 'vertical') {
        handle.style.left = `${group.pos - 5}px`;
        handle.style.top = `${segment.start}px`;
        handle.style.width = '10px';
        handle.style.height = `${segment.end - segment.start}px`;
      } else {
        handle.style.left = `${segment.start}px`;
        handle.style.top = `${group.pos - 5}px`;
        handle.style.width = `${segment.end - segment.start}px`;
        handle.style.height = '10px';
      }
      handle.addEventListener('pointerdown', e => startSharedResize(group, e));
      wrap.appendChild(handle);
    }
  }
  grid.appendChild(wrap);
}

function layoutSize(_layout, count) {
  const n = Math.max(1, Number(count) || 1);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.ceil(n / cols) };
}

function desktopGridSlotRects(count = visibleWindowIds().length + 1) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const size = layoutSize('auto', Math.max(4, count));
  const rects = [];
  for (let row = 0; row < size.rows; row += 1) {
    for (let col = 0; col < size.cols; col += 1) {
      rects.push({ x: col * r.width / size.cols, y: row * r.height / size.rows, w: r.width / size.cols, h: r.height / size.rows });
    }
  }
  return rects;
}

function similarRect(a, b) {
  return Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8 && Math.abs(a.w - b.w) < 8 && Math.abs(a.h - b.h) < 8;
}

function pointerGapSlotRect(rect, x, y) {
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const edgeZone = ratio => ratio < 1 / 3 ? -1 : ratio > 2 / 3 ? 1 : 0;
  const horizontal = halfW >= 300 ? edgeZone((x - rect.x) / rect.w) : 0;
  const vertical = halfH >= 190 ? edgeZone((y - rect.y) / rect.h) : 0;
  if (!horizontal && !vertical) return rect;
  return {
    ...rect,
    x: horizontal > 0 ? rect.x + halfW : rect.x,
    y: vertical > 0 ? rect.y + halfH : rect.y,
    w: horizontal ? halfW : rect.w,
    h: vertical ? halfH : rect.h
  };
}

function slotRectsForDrag(sourceId, pointerX = null, pointerY = null) {
  const prefs = windowPrefs();
  const occupied = state.order
    .filter(id => id !== sourceId && state.sessions.has(id) && !state.minimized.has(id) && prefs[id])
    .map(id => ({ id, rect: { x: prefs[id].x, y: prefs[id].y, w: prefs[id].w, h: prefs[id].h } }));
  const occupiedRects = occupied.map(o => o.rect);
  const gridRect = document.getElementById('termGrid')?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const hasPointer = Number.isFinite(pointerX) && Number.isFinite(pointerY);
  const centerX = hasPointer && pointerX >= gridRect.width / 3 && pointerX <= gridRect.width * 2 / 3;
  const centerY = hasPointer && pointerY >= gridRect.height / 3 && pointerY <= gridRect.height * 2 / 3;
  let candidates = centerY && !centerX
    ? [
        { x: 0, y: 0, w: gridRect.width / 2, h: gridRect.height },
        { x: gridRect.width / 2, y: 0, w: gridRect.width / 2, h: gridRect.height }
      ]
    : centerX && !centerY
      ? [
          { x: 0, y: 0, w: gridRect.width, h: gridRect.height / 2 },
          { x: 0, y: gridRect.height / 2, w: gridRect.width, h: gridRect.height / 2 }
        ]
      : centerX && centerY
        ? []
        : desktopGridSlotRects(visibleWindowIds().length + 1);
  const isAvailable = c => {
    const area = c.w * c.h;
    const overlap = rectCoveredArea(c, occupiedRects);
    return area >= 300 * 190 && overlap / Math.max(1, area) <= 0.12;
  };
  if (hasPointer) {
    const gaps = desktopGapSlotRects(occupied);
    const pointed = gaps.filter(c => pointInRect(pointerX, pointerY, c) && isAvailable(c));
    if (pointed.length) {
      const distance = c => Math.hypot(pointerX - c.x - c.w / 2, pointerY - c.y - c.h / 2);
      pointed.sort((a, b) => distance(a) - distance(b) || (b.w * b.h) - (a.w * a.h));
      const gapTarget = pointerGapSlotRect(pointed[0], pointerX, pointerY);
      const standardTarget = candidates.find(c => pointInRect(pointerX, pointerY, c) && isAvailable(c));
      const gapWasSubdivided = !similarRect(gapTarget, pointed[0]);
      candidates = gapWasSubdivided || !standardTarget || gapTarget.w * gapTarget.h >= standardTarget.w * standardTarget.h
        ? [gapTarget]
        : [standardTarget];
    }
  }
  const free = [];
  for (const c of candidates) {
    if (!isAvailable(c)) continue;
    const rect = { ...c };
    if (!free.some(existing => similarRect(existing.rect, rect))) free.push({ id: `free-${free.length}`, rect });
  }
  return { free, occupied };
}

function desktopGapSlotRects(occupied) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const occupiedRects = occupied.map(o => o.rect);
  const xs = [0, r.width];
  const ys = [0, r.height];
  for (const o of occupied) {
    const a = o.rect;
    xs.push(Math.max(0, Math.min(r.width, a.x)), Math.max(0, Math.min(r.width, a.x + a.w)));
    ys.push(Math.max(0, Math.min(r.height, a.y)), Math.max(0, Math.min(r.height, a.y + a.h)));
  }
  const normalizeAxis = values => [...new Set(values.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const ux = normalizeAxis(xs);
  const uy = normalizeAxis(ys);
  const cells = [];
  for (let yi = 0; yi < uy.length - 1; yi += 1) {
    for (let xi = 0; xi < ux.length - 1; xi += 1) {
      const c = { x: ux[xi], y: uy[yi], w: ux[xi + 1] - ux[xi], h: uy[yi + 1] - uy[yi] };
      const overlap = rectCoveredArea(c, occupiedRects);
      if (overlap / Math.max(1, c.w * c.h) <= 0.02) cells.push(c);
    }
  }
  const mergeRuns = (items, axis) => {
    const sorted = [...items].sort(axis === 'x'
      ? (a, b) => a.y - b.y || a.x - b.x
      : (a, b) => a.x - b.x || a.y - b.y);
    const runs = [];
    for (const c of sorted) {
      const last = runs.at(-1);
      const adjacent = axis === 'x'
        ? last && last.y === c.y && last.h === c.h && last.x + last.w === c.x
        : last && last.x === c.x && last.w === c.w && last.y + last.h === c.y;
      if (adjacent) last[axis === 'x' ? 'w' : 'h'] += c[axis === 'x' ? 'w' : 'h'];
      else runs.push({ ...c });
    }
    return runs;
  };
  const rows = mergeRuns(cells, 'x');
  const columns = mergeRuns(cells, 'y');
  const rects = [];
  for (const c of [...cells, ...rows, ...columns, ...mergeRuns(rows, 'y'), ...mergeRuns(columns, 'x')]) {
    if (!rects.some(rect => similarRect(rect, c))) rects.push(c);
  }
  return rects.filter(c => c.w >= 300 && c.h >= 190).sort((a, b) => (b.w * b.h) - (a.w * a.h));
}

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function chooseDesktopSlotAt(x, y, sourceId) {
  const grid = document.getElementById('termGrid');
  const gr = grid?.getBoundingClientRect?.();
  if (!gr) return null;
  const px = x - gr.left;
  const py = y - gr.top;
  const slots = slotRectsForDrag(sourceId, px, py);
  const free = slots.free
    .filter(slot => pointInRect(px, py, slot.rect))
    .sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h))[0];
  if (free) return { type: 'free', rect: free.rect, slots };
  return { type: 'none', slots };
}

function showDesktopSlotSuggestions(result) {
  const grid = document.getElementById('termGrid');
  const slots = result?.slots;
  if (!grid || !slots) { clearDesktopSlotSuggestions(); return; }
  let wrap = document.getElementById('desktopSlotSuggestions');
  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'desktopSlotSuggestions';
    wrap.className = 'desktop-slot-suggestions';
    grid.appendChild(wrap);
  }
  const geometrySignature = slots.free.map(({ rect }) => [rect.x, rect.y, rect.w, rect.h].map(Math.round).join(',')).join('|');
  if (wrap.dataset.geometrySignature !== geometrySignature) {
    wrap.dataset.geometrySignature = geometrySignature;
    wrap.replaceChildren();
    for (const slot of slots.free) {
      const el = document.createElement('div');
      el.className = 'desktop-slot free';
      el.style.left = `${slot.rect.x}px`;
      el.style.top = `${slot.rect.y}px`;
      el.style.width = `${slot.rect.w}px`;
      el.style.height = `${slot.rect.h}px`;
      const fraction = Math.max(1, Math.round(grid.clientWidth * grid.clientHeight / (slot.rect.w * slot.rect.h)));
      const label = document.createElement('span');
      label.textContent = `Free · 1/${fraction}`;
      el.appendChild(label);
      wrap.appendChild(el);
    }
  }
  const activeFree = result.type === 'free' ? result.rect : null;
  Array.from(wrap.children).forEach((el, index) => {
    el.classList.toggle('active', Boolean(activeFree && similarRect(activeFree, slots.free[index]?.rect)));
  });
}

function applyFreeSlotSnap(id, rect) {
  const prefs = windowPrefs();
  const p = ensureFreeWindow(id);
  if (!p) return;
  Object.assign(prefs[id], { ...rect, z: p.z || nextWindowZ() });
  applyFreeWindow(id);
}



function visibleWindowIds(firstId = null) {
  const ids = desktopPaneIds().filter(id => !state.minimized.has(id));
  if (!firstId || !ids.includes(firstId)) return ids;
  return [firstId, ...ids.filter(id => id !== firstId)];
}

function tileRects(rect, count) {
  if (count <= 0) return [];
  if (count === 1) return [rect];
  const cols = rect.w >= rect.h ? Math.ceil(Math.sqrt(count)) : Math.floor(Math.sqrt(count));
  const c = Math.max(1, cols);
  const rows = Math.ceil(count / c);
  return Array.from({ length: count }, (_, i) => {
    const x = i % c, y = Math.floor(i / c);
    const w = rect.w / c, h = rect.h / rows;
    return { x: rect.x + x * w, y: rect.y + y * h, w, h };
  });
}

function applyRectsToWindows(ids, rects) {
  const prefs = windowPrefs();
  ids.forEach((id, i) => {
    const p = ensureFreeWindow(id);
    if (!p || !rects[i]) return;
    Object.assign(prefs[id], { ...rects[i], z: nextWindowZ() });
    applyFreeWindow(id);
  });
  savePanePrefs();
  scheduleTerminalFit();
  renderSharedResizeHandles();
}

function layoutProposalRects(key, ids) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const W = r.width, H = r.height, n = ids.length;
  if (key === 'columns') return tileRects({ x: 0, y: 0, w: W, h: H }, n).map((a, i) => n > 1 ? { ...a, x: i * W / n, y: 0, w: W / n, h: H } : a);
  if (key === 'rows') return Array.from({ length: n }, (_, i) => ({ x: 0, y: i * H / n, w: W, h: H / n }));
  if (key === 'focus-left') return [{ x: 0, y: 0, w: W / 2, h: H }, ...tileRects({ x: W / 2, y: 0, w: W / 2, h: H }, n - 1)];
  if (key === 'focus-right') return [{ x: W / 2, y: 0, w: W / 2, h: H }, ...tileRects({ x: 0, y: 0, w: W / 2, h: H }, n - 1)];
  if (key === 'focus-top') return [{ x: 0, y: 0, w: W, h: H / 2 }, ...tileRects({ x: 0, y: H / 2, w: W, h: H / 2 }, n - 1)];
  if (key === 'focus-bottom') return [{ x: 0, y: H / 2, w: W, h: H / 2 }, ...tileRects({ x: 0, y: 0, w: W, h: H / 2 }, n - 1)];
  return tileRects({ x: 0, y: 0, w: W, h: H }, n);
}

function orderWindowIdsForRects(ids, rects) {
  const prefs = windowPrefs();
  const remaining = ids.slice();
  return rects.slice(0, ids.length).map(target => {
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    let best = 0;
    let bestDistance = Infinity;
    remaining.forEach((id, index) => {
      const source = prefs[id];
      if (!source) return;
      const dx = source.x + source.w / 2 - tx;
      const dy = source.y + source.h / 2 - ty;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    return remaining.splice(best, 1)[0];
  });
}

function layoutProposals(id) {
  const visibleIds = visibleWindowIds();
  const proposals = visibleIds.length === 1
    ? [{ key: 'full', label: 'Full' }]
    : visibleIds.length === 2
      ? [{ key: 'columns', label: 'Side by side' }, { key: 'rows', label: 'Stacked' }]
      : [
          { key: 'grid', label: 'Grid' },
          { key: 'columns', label: 'Columns' },
          { key: 'rows', label: 'Rows' },
          { key: 'focus-left', label: 'Left + rest' },
          { key: 'focus-right', label: 'Right + rest' },
          { key: 'focus-top', label: 'Top + rest' },
          { key: 'focus-bottom', label: 'Bottom + rest' }
        ];
  return proposals.map(proposal => {
    const rects = layoutProposalRects(proposal.key, visibleIds);
    const focused = proposal.key.startsWith('focus-') && visibleIds.includes(id);
    const ids = focused
      ? [id, ...orderWindowIdsForRects(visibleIds.filter(other => other !== id), rects.slice(1))]
      : orderWindowIdsForRects(visibleIds, rects);
    return { ...proposal, ids, rects };
  });
}

function clearLayoutAssist() {
  document.getElementById('layoutAssist')?.remove();
}

function showLayoutAssist(id, anchor, hover = {}) {
  const grid = document.getElementById('termGrid');
  if (!grid) return;
  clearLayoutAssist();
  const gr = grid.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  const box = document.createElement('section');
  box.id = 'layoutAssist';
  box.className = 'layout-assist';
  box.style.left = `${Math.max(4, Math.min(gr.width - 260, ar.right - gr.left - 244))}px`;
  box.style.top = `${Math.max(4, ar.bottom - gr.top + 4)}px`;
  for (const p of layoutProposals(id)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-card';
    btn.innerHTML = `<span class="layout-mini"></span><b>${p.label}</b>`;
    const mini = btn.querySelector('.layout-mini');
    p.rects.forEach(r => {
      const c = document.createElement('i');
      const W = gr.width, H = gr.height;
      c.style.left = `${r.x / W * 100}%`; c.style.top = `${r.y / H * 100}%`;
      c.style.width = `${r.w / W * 100}%`; c.style.height = `${r.h / H * 100}%`;
      mini.appendChild(c);
    });
    btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); applyRectsToWindows(p.ids, p.rects); clearLayoutAssist(); });
    box.appendChild(btn);
  }
  for (const desktopId of state.panePrefs.desktopOrder) {
    if (desktopId === state.activeDesktopId) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-move';
    btn.dataset.targetDesktopId = desktopId;
    btn.textContent = `Move to ${state.panePrefs.desktops[desktopId].name}`;
    btn.onclick = () => { movePaneToDesktop(id, desktopId); clearLayoutAssist(); };
    box.appendChild(btn);
  }
  box.addEventListener('mouseenter', () => hover.enter?.());
  box.addEventListener('mouseleave', () => hover.leave?.());
  grid.appendChild(box);
}

function applyLayoutVisibility() {
  const grid = document.getElementById('termGrid');
  const hidden = document.getElementById('hiddenPanes');
  if (!grid || !hidden) return;
  grid.className = 'grid-container layout-desktop';
  clearDesktopSlotSuggestions();
  clearSharedResizeHandles();
  clearLayoutAssist();
  for (const id of state.order) {
    const entry = state.sessions.get(id);
    if (!entry) continue;
    if (state.panePrefs.paneDesktop[id] !== state.activeDesktopId || state.minimized.has(id)) {
      if (entry.el.parentElement !== hidden) hidden.appendChild(entry.el);
      entry.el.classList.add('layout-hidden');
      continue;
    }
    if (entry.el.parentElement !== grid) grid.appendChild(entry.el);
    entry.el.classList.remove('layout-hidden');
    ensureFreeWindow(id);
  }
  renderSharedResizeHandles();
}

function persistentMinimizedIds() {
  return [...state.minimized].filter(id => !state.responsiveMinimized.has(id));
}

function uiPayload() {
  return {
    revision: state.uiRevision,
    activeId: state.activeId,
    theme: state.theme,
    skin: state.skin,
    fontSize: state.fontSize,
    notifyBlinking: state.notifyBlinking,
    chromeHidden: document.body.classList.contains('chrome-hidden'),
    systemMonitor: document.body.classList.contains('system-monitor-on'),
    panePrefs: state.panePrefs
  };
}

function sameUiValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeUiArrays(base, local, remote) {
  const baseSet = new Set(base);
  const remoteSet = new Set(remote);
  const merged = local.filter(value => !baseSet.has(value) || remoteSet.has(value));
  for (const value of remote) if (!baseSet.has(value) && !merged.includes(value)) merged.push(value);
  return merged;
}

function mergeUiChanges(base, local, remote) {
  if (sameUiValue(local, base)) return structuredClone(remote);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) return mergeUiArrays(base, local, remote);
  const objects = [base, local, remote].every(value => value && typeof value === 'object' && !Array.isArray(value));
  if (!objects) return structuredClone(local);
  const result = structuredClone(remote);
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (!(key in local) && key in base) {
      delete result[key];
      continue;
    }
    if (!(key in base)) {
      result[key] = structuredClone(local[key]);
      continue;
    }
    const merged = mergeUiChanges(base[key], local[key], remote[key]);
    if (merged === undefined && !(key in remote)) delete result[key];
    else result[key] = merged;
  }
  return result;
}

function persistUiDraft(payload = uiPayload(), base = state.lastUiState || payload) {
  try { localStorage.setItem(UI_DRAFT_KEY, JSON.stringify({ base, local: payload })); } catch {}
}

function readUiDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(UI_DRAFT_KEY) || 'null');
    return draft?.base && draft?.local ? draft : null;
  } catch { return null; }
}

function clearUiDraft() {
  try { localStorage.removeItem(UI_DRAFT_KEY); } catch {}
}

function uiSavePending() {
  return state.saveQueued || state.saveTimer !== null || state.saveInFlight > 0;
}

function windowInteractionActive() {
  return Boolean(state.pointerDrag || state.resizeDrag || state.sharedResizeDrag);
}

function saveUiState() {
  if (state.hydrating) return;
  if (windowInteractionActive()) {
    state.saveQueued = true;
    return;
  }
  persistUiDraft();
  state.saveQueued = true;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    state.saveTimer = null;
    if (windowInteractionActive()) {
      state.saveQueued = true;
      return;
    }
    if (state.saveInFlight > 0) return;
    state.saveQueued = false;
    state.saveInFlight = 1;
    let retryPending = false;
    const captured = structuredClone(uiPayload());
    let local = structuredClone(captured);
    let base = state.lastUiState ? structuredClone(state.lastUiState) : structuredClone(local);
    let hadConflict = false;
    let saved = null;
    try {
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        try {
          saved = await api('PUT', '/api/ui-state', local);
        } catch (error) {
          if (error.status !== 409 || !error.data) throw error;
          hadConflict = true;
          const remote = error.data;
          local = mergeUiChanges(base, local, remote);
          local.revision = remote.revision;
          base = structuredClone(remote);
          if (attempt === 2) {
            applyAuthoritativeUiState(local, { force: true, baseline: remote });
            retryPending = true;
          }
        }
      }
      const savedRevision = Number(saved?.revision) || 0;
      if (saved && savedRevision < state.uiRevision) {
        state.saveQueued = true;
      } else if (saved && hadConflict) {
        const reconciled = mergeUiChanges(captured, structuredClone(uiPayload()), saved);
        reconciled.revision = saved.revision;
        applyAuthoritativeUiState(reconciled, { force: true, baseline: saved });
      } else if (saved) {
        state.uiRevision = Number(saved.revision) || state.uiRevision;
        state.lastUiState = structuredClone(saved);
      }
    } catch (error) {
      if (error.status === 409 && error.data) applyAuthoritativeUiState(error.data);
    } finally {
      state.saveInFlight = 0;
      if (retryPending || state.saveQueued) saveUiState();
      else if (saved) clearUiDraft();
    }
  }, 150);
}

function flushUiState() {
  const draft = readUiDraft();
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  state.saveQueued = false;
  if (!draft || state.saveInFlight > 0) return;
  const local = state.lastUiState ? mergeUiChanges(draft.base, draft.local, state.lastUiState) : structuredClone(draft.local);
  local.revision = state.uiRevision;
  const body = JSON.stringify(local);
  try {
    const token = authToken();
    if (token) {
      fetch('/api/ui-state', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-PassiDeck-Token': token }, body, keepalive: true });
    } else {
      navigator.sendBeacon?.('/api/ui-state', new Blob([body], { type: 'application/json' })) || fetch('/api/ui-state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch {}
}
/* ── Font Size ── */
let fontSizePreviewTimer = null;
function setFontSize(size, opts = {}) {
  clearTimeout(fontSizePreviewTimer);
  fontSizePreviewTimer = null;
  size = Math.max(10, Math.min(24, Number(size) || 13));
  state.fontSize = size;
  for (const [, entry] of state.sessions) entry.term.options.fontSize = size;
  scheduleTerminalFit();
  const select = document.getElementById('fontSizeSelect');
  const label = document.getElementById('fontSizeLabel');
  if (select) select.value = String(size);
  if (label) label.textContent = 'Live';
  if (opts.persist !== false) saveUiState();
}

function previewFontSize(size) {
  size = Math.max(10, Math.min(24, Number(size) || 13));
  const label = document.getElementById('fontSizeLabel');
  if (label) label.textContent = 'Pending';
  clearTimeout(fontSizePreviewTimer);
  fontSizePreviewTimer = setTimeout(() => setFontSize(size), 250);
}

/* ── Minimize / Restore ── */
function minimizePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  entry.el.classList.add('minimized');
  state.responsiveMinimized.delete(id);
  state.minimized.add(id);
  renderSwitcher();
  applyLayoutVisibility();
  savePanePrefs();
  scheduleTerminalFit();
}

function restorePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry || state.panePrefs.paneDesktop[id] !== state.activeDesktopId) return;
  entry.el.classList.remove('minimized');
  state.responsiveMinimized.delete(id);
  state.minimized.delete(id);
  ensureFreeWindow(id);
  renderSwitcher();
  applyLayoutVisibility();
  selectPanel(id, { persist: false });
  savePanePrefs();
  responsiveMinimizeForViewport();
  applyLayoutVisibility();
  // Fit after restore — panel was display:none, needs full resize cycle.
  scheduleTerminalFit();
}


/* ── Close Confirmation ── */
function setTheme(theme, opts = {}) {
  if (!THEMES[theme]) theme = 'blue';
  state.theme = theme;
  document.body.dataset.theme = theme;
  const select = document.getElementById('themeSelect');
  if (select) select.value = theme;
  for (const entry of state.sessions.values()) {
    entry.term.options.theme = terminalTheme(theme);
  }
  if (opts.persist !== false) saveUiState();
}

function setSkin(skin, opts = {}) {
  if (!['neon', 'stealth', 'prism'].includes(skin)) skin = 'neon';
  state.skin = skin;
  document.body.dataset.skin = skin;
  const select = document.getElementById('skinSelect');
  if (select) select.value = skin;
  if (opts.persist !== false) saveUiState();
}


function saveResponseSoundPrefs() {
  try {
    localStorage.setItem('passideck:response-sound', JSON.stringify({
      mode: state.responseSoundMode,
      tone: state.responseSoundTone,
      volume: state.responseSoundVolume
    }));
  } catch {}
}

function setResponseSoundMode(mode, opts = {}) {
  state.responseSoundMode = ['off', 'background', 'always'].includes(mode) ? mode : 'background';
  const select = document.getElementById('responseSoundModeSelect');
  if (select) select.value = state.responseSoundMode;
  if (opts.persist !== false) saveResponseSoundPrefs();
}

function setResponseSoundTone(tone, opts = {}) {
  state.responseSoundTone = ['soft', 'ping', 'chime'].includes(tone) ? tone : 'soft';
  const select = document.getElementById('responseSoundToneSelect');
  if (select) select.value = state.responseSoundTone;
  if (opts.persist !== false) saveResponseSoundPrefs();
}

function setResponseSoundVolume(volume, opts = {}) {
  state.responseSoundVolume = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
  const slider = document.getElementById('responseSoundVolume');
  const label = document.getElementById('responseSoundVolumeLabel');
  if (slider) slider.value = String(state.responseSoundVolume);
  if (label) label.textContent = `${state.responseSoundVolume}%`;
  if (opts.persist !== false) saveResponseSoundPrefs();
}

function loadResponseSoundPrefs() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('passideck:response-sound')) || {}; } catch {}
  setResponseSoundMode(prefs.mode, { persist: false });
  setResponseSoundTone(prefs.tone, { persist: false });
  setResponseSoundVolume(prefs.volume ?? 60, { persist: false });
}

function setNotifyBlinking(enabled, opts = {}) {
  state.notifyBlinking = Boolean(enabled);
  document.body.classList.toggle('notify-blinking', state.notifyBlinking);
  const select = document.getElementById('notifyBlinkingSelect');
  if (select) select.value = state.notifyBlinking ? 'on' : 'off';
  window.passideckDesktop?.setNotifyBlinking?.(state.notifyBlinking);
  if (opts.persist !== false) saveUiState();
}

function applyDynamicTitleSettings(settings) {
  if (!settings || typeof settings.dynamicTitles !== 'boolean') return;
  state.dynamicTitles = settings.dynamicTitles;
  const select = document.getElementById('dynamicTitleSelect');
  if (select) select.value = state.dynamicTitles ? 'on' : 'off';
  const hint = document.getElementById('dynamicTitleHint');
  if (hint) hint.textContent = settings.appliesAt === 'next-session'
    ? 'Applies to the next Hermes session'
    : 'Dynamic session titles';
}

async function saveDynamicTitleSetting(enabled) {
  const select = document.getElementById('dynamicTitleSelect');
  const previous = state.dynamicTitles;
  if (select) select.disabled = true;
  try {
    const saved = await api('PUT', '/api/settings', { dynamicTitles: Boolean(enabled) });
    applyDynamicTitleSettings(saved);
    showToast(`Dynamic Retitle ${saved.dynamicTitles ? 'enabled' : 'disabled'} for the next Hermes session`);
  } catch (err) {
    applyDynamicTitleSettings({ dynamicTitles: previous, appliesAt: 'next-session' });
    showToast(`Retitle setting failed: ${err.message}`, 'error');
  } finally {
    if (select) select.disabled = false;
  }
}

function setPerformanceMode(enabled, opts = {}) {
  state.performanceMode = Boolean(enabled);
  const select = document.getElementById('performanceModeSelect');
  if (select) select.value = state.performanceMode ? 'on' : 'off';
  for (const [id, entry] of state.sessions) {
    if (!entry.outputFlushTimer || entry.outputWriteInFlight || !entry.outputBuffer.length) continue;
    clearTimeout(entry.outputFlushTimer);
    entry.outputFlushTimer = null;
    scheduleTerminalOutputFlush(id, entry.term);
  }
  if (opts.persist !== false) {
    try { localStorage.setItem(PERFORMANCE_MODE_KEY, state.performanceMode ? 'on' : 'off'); } catch {}
  }
}

function loadPerformanceMode(sharedValue) {
  try {
    const stored = localStorage.getItem(PERFORMANCE_MODE_KEY);
    setPerformanceMode(stored === null ? sharedValue === true : stored === 'on', { persist: false });
    if (stored === null && typeof sharedValue === 'boolean') {
      localStorage.setItem(PERFORMANCE_MODE_KEY, state.performanceMode ? 'on' : 'off');
    }
  } catch { setPerformanceMode(sharedValue === true, { persist: false }); }
}

function shouldPlayResponseSound(id, hasDocumentFocus = document.hasFocus(), hidden = document.hidden) {
  if (state.responseSoundMode === 'off') return false;
  if (state.responseSoundMode === 'always') return true;
  return hidden || !hasDocumentFocus || state.activeId !== id;
}

function terminalInputIsFocused(id, hasDocumentFocus = document.hasFocus(), hidden = document.hidden, focused = document.activeElement) {
  if (!hasDocumentFocus || hidden || state.activeId !== id || state.panePrefs.paneDesktop[id] !== state.activeDesktopId || state.minimized.has(id)) return false;
  const entry = state.sessions.get(id);
  return Boolean(entry && !entry.el.classList.contains('layout-hidden') && entry.el.contains(focused) && focused?.closest?.('.xterm'));
}

function updateResponseAttentionUi(id) {
  const entry = state.sessions.get(id);
  updateSessionIndicator(id);
  const button = document.querySelector(`[data-switcher-pane-id="${CSS.escape(id)}"]`);
  const markAria = (el, marked) => {
    if (!el) return;
    const base = (el.getAttribute('aria-label') || '').replace(/, new response$/, '');
    el.setAttribute('aria-label', `${base}${marked ? ', new response' : ''}`);
  };
  button?.classList.toggle('response-pulse', Boolean(entry?.responseAttention));
  markAria(button, Boolean(entry?.responseAttention));
  const desktopId = state.panePrefs.paneDesktop[id];
  const desktopMarked = state.order.some(paneId => state.panePrefs.paneDesktop[paneId] === desktopId && state.sessions.get(paneId)?.responseAttention);
  const desktopTab = document.querySelector(`[data-desktop-id="${CSS.escape(desktopId || '')}"]`);
  desktopTab?.classList.toggle('attention', desktopMarked);
  markAria(desktopTab, desktopMarked);
}

function clearResponseAttention(id) {
  const entry = state.sessions.get(id);
  const header = entry?.el.querySelector('.term-header');
  if (!entry || (!entry.responseAttention && !header?.classList.contains('response-pulse'))) return;
  entry.responseAttention = false;
  header?.classList.remove('response-pulse');
  updateResponseAttentionUi(id);
  if (![...state.sessions.values()].some(item => item.responseAttention)) {
    window.passideckDesktop?.clearResponseAttention?.();
  }
}

function pulsePaneTitlebar(id) {
  const entry = state.sessions.get(id);
  const header = entry?.el.querySelector('.term-header');
  if (!entry || !header) return;
  entry.responseAttention = true;
  header.classList.remove('response-pulse');
  void header.offsetWidth;
  header.classList.add('response-pulse');
  updateResponseAttentionUi(id);
}

function notifyResponseComplete(id) {
  if (terminalInputIsFocused(id)) return;
  pulsePaneTitlebar(id);
  if (shouldPlayResponseSound(id)) playBell(state.responseSoundTone, state.responseSoundVolume);
  window.passideckDesktop?.notifyResponseComplete?.({
    hiddenDesktop: state.panePrefs.paneDesktop[id] !== state.activeDesktopId
  });
}

function setChromeHidden(hidden, opts = {}) {
  const wasHidden = document.body.classList.contains('chrome-hidden');
  const before = desktopSize();
  document.body.classList.toggle('chrome-hidden', Boolean(hidden));
  if (opts.resize !== false && wasHidden !== Boolean(hidden)) resizeWindowsForDesktop(before, desktopSize());
  scheduleTerminalFit();
  if (opts.persist !== false) saveUiState();
}

function updateSystemMonitor(metrics) {
  const monitor = document.getElementById('systemMonitor');
  if (!monitor || !metrics) return;
  for (const key of ['cpu', 'ram', 'disk']) {
    const cell = monitor.querySelector(`[data-metric="${key}"]`);
    if (!cell) continue;
    const label = cell.querySelector('b');
    if (key === 'disk' && (!Number.isFinite(Number(metrics.disk)) || !metrics.diskInfo)) {
      cell.classList.add('unavailable');
      cell.style.setProperty('--v', '0%');
      if (label) label.textContent = '--%';
      setTooltip(cell, 'Disk unavailable · backend restart needed');
      cell.setAttribute('aria-label', 'Disk unavailable');
      continue;
    }
    const value = Math.max(0, Math.min(100, Math.round(Number(metrics[key]) || 0)));
    cell.classList.remove('unavailable');
    cell.style.setProperty('--v', `${value}%`);
    if (label) label.textContent = `${value}%`;
    if (key === 'cpu') {
      const load = Number(metrics.load);
      const details = `CPU: ${value}% total usage${Number.isFinite(load) ? ` · load ${load.toFixed(2)} (1 min)` : ''}`;
      setTooltip(cell, details);
      cell.setAttribute('aria-label', details);
    }
    if (key === 'ram') {
      const info = metrics.memory || {};
      const hasDetails = Number.isFinite(Number(info.used)) && Number.isFinite(Number(info.total)) && Number(info.total) > 0 && Number.isFinite(Number(info.free));
      const details = hasDetails
        ? `RAM: ${formatBytes(info.used)} used of ${formatBytes(info.total)} · ${formatBytes(info.free)} free`
        : `RAM: ${value}% used`;
      setTooltip(cell, details);
      cell.setAttribute('aria-label', details);
    }
    if (key === 'disk') {
      const info = metrics.diskInfo || {};
      const details = info.error
        ? `Disk ${info.path || '/'}: ${info.error}`
        : `Disk ${info.path || '/'}: ${formatBytes(info.used)} used of ${formatBytes(info.total)} · ${formatBytes(info.free)} free`;
      setTooltip(cell, details);
      cell.setAttribute('aria-label', details);
    }
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Math.max(0, value);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

async function pollSystemMonitor() {
  if (!document.body.classList.contains('system-monitor-on') || document.hidden || state.systemMonitorInFlight) return;
  state.systemMonitorInFlight = true;
  try {
    const metrics = await api('GET', '/api/system-metrics');
    if (!document.hidden && document.body.classList.contains('system-monitor-on')) updateSystemMonitor(metrics);
  } catch (err) {
    console.warn('system metrics unavailable', err);
  } finally {
    state.systemMonitorInFlight = false;
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

function formatReset(ts) {
  if (!ts) return 'reset unknown';
  const value = typeof ts === 'number' || /^\d+(\.\d+)?$/.test(String(ts))
    ? Number(ts) * 1000
    : ts;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'reset unknown';
  return `reset ${date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
}

function renderCodexLimitCells(accounts) {
  const root = document.getElementById('codexLimits');
  if (!root) return;
  const list = accounts.length ? accounts : [{ index: 1 }];
  const signature = list.map(account => `${account.index}:${account.label || ''}:${account.active ? 1 : 0}`).join('|');
  if (root.dataset.signature === signature) return;
  root.dataset.signature = signature;
  root.replaceChildren();
  const indexed = list.length > 1;
  for (const account of list) {
    const cell = document.createElement('span');
    cell.className = 'codex-limit';
    cell.dataset.accountIndex = String(account.index);
    cell.setAttribute('data-account-index', String(account.index));
    cell.setAttribute('aria-label', `Codex ${indexed ? `#${account.index}` : ''} limits`);
    if (account.active) {
      const dot = document.createElement('i');
      dot.className = 'codex-active-dot';
      dot.setAttribute('aria-hidden', 'true');
      cell.append(dot);
    }
    const prefix = indexed ? `#${account.index} ` : '';
    if (prefix) {
      const accountLabel = document.createElement('span');
      accountLabel.className = 'codex-account-label';
      accountLabel.textContent = prefix.trim();
      cell.append(accountLabel);
    }
    for (const [kind, labelText] of [['primary', '5h'], ['secondary', '7d']]) {
      if (kind === 'secondary') {
        const separator = document.createElement('span');
        separator.className = 'codex-limit-separator';
        separator.textContent = '/';
        separator.setAttribute('aria-hidden', 'true');
        cell.append(separator);
      }
      const part = document.createElement('span');
      part.className = 'codex-limit-part';
      part.dataset.limit = kind;
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('b');
      value.textContent = '--%';
      part.append(label, value);
      cell.append(part);
    }
    root.append(cell);
  }
}

function setCodexLimitCell(account, kind, limit) {
  const cell = document.querySelector(`#codexLimits [data-account-index="${account.index}"]`);
  const part = cell?.querySelector(`[data-limit="${kind}"]`);
  if (!cell || !part) return;
  cell.classList.toggle('active-account', Boolean(account.active));
  cell.classList.toggle('limit-reached', Boolean(account.rateLimitReachedType));
  const windowName = kind === 'primary' ? '5h' : '7d';
  const accountName = account.label || `#${account.index}`;
  if (!limit) {
    part.classList.add('unavailable');
    part.querySelector('b').textContent = '--%';
    setTooltip(part, `Codex ${accountName} ${windowName}${account.active ? ' · currently active' : ''} unavailable${account.error ? ` · ${account.error}` : ''}`);
    return;
  }
  const used = Math.max(0, Math.min(100, Math.round(Number(limit.usedPercent) || 0)));
  const left = Math.max(0, 100 - used);
  part.classList.remove('unavailable');
  part.style.setProperty('--v', `${left}%`);
  part.querySelector('b').textContent = `${left}%`;
  setTooltip(part, `Codex ${accountName} ${windowName}${account.active ? ' · currently active' : ''}: ${left}% left (${used}% used) · ${formatReset(limit.resetsAt)}`);
}

function updateCodexLimits(data) {
  const accounts = Array.isArray(data?.accounts) && data.accounts.length
    ? data.accounts
    : [{ index: 1, label: '#1', primary: data?.primary, secondary: data?.secondary, error: data?.error }];
  renderCodexLimitCells(accounts);
  for (const account of accounts) {
    setCodexLimitCell(account, 'primary', account.primary);
    setCodexLimitCell(account, 'secondary', account.secondary);
  }
}

async function pollCodexLimits() {
  try {
    updateCodexLimits(await api('GET', '/api/codex-limits'));
  } catch (err) {
    console.warn('codex limits unavailable', err);
    updateCodexLimits(null);
  }
}

function startCodexLimitsPolling() {
  if (state.codexLimitsTimer) return;
  pollCodexLimits();
  state.codexLimitsTimer = setInterval(pollCodexLimits, 60000);
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
  if (opts.persist !== false) saveUiState();
}

function toggleChrome() {
  setChromeHidden(!document.body.classList.contains('chrome-hidden'));
}

function sendResize(id, entry, force = false) {
  if (entry.ws?.readyState !== WebSocket.OPEN) return;
  const cols = entry.term.cols;
  const rows = entry.term.rows;
  if (!force && entry.lastSentCols === cols && entry.lastSentRows === rows) return;
  entry.lastSentCols = cols;
  entry.lastSentRows = rows;
  entry.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}

function requestTerminalRedraw(entry) {
  entry.term.__passideckSnapshotLinks = null;
  if (entry.ws?.readyState !== WebSocket.OPEN) return;
  entry.ws.send(JSON.stringify({ type: 'redraw' }));
}

function fitEntry(id, entry, opts = {}) {
  if (entry.el.classList.contains('layout-hidden') || entry.el.offsetParent === null) return;
  const next = entry.fit.proposeDimensions?.();
  if (!next) {
    const oldCols = entry.term.cols;
    const oldRows = entry.term.rows;
    entry.fit.fit();
    if (entry.term.cols !== oldCols || entry.term.rows !== oldRows) entry.term.__passideckSnapshotLinks = null;
    sendResize(id, entry, opts.force);
    return;
  }
  const oldCols = entry.term.cols;
  const oldRows = entry.term.rows;
  const buffer = entry.term.buffer?.active;
  const atBottom = !buffer || buffer.viewportY >= buffer.baseY;
  const cols = Math.max(2, next.cols || oldCols || 80);
  const rows = Math.max(2, next.rows || oldRows || 24);
  const heightOnly = oldCols === cols && oldRows && oldRows !== rows;
  const targetRows = heightOnly && !opts.allowHeight ? oldRows : rows;
  const changed = oldCols !== cols || oldRows !== targetRows;
  if (changed) entry.term.__passideckSnapshotLinks = null;
  if (changed) entry.term.resize(cols, targetRows);
  if ((opts.scrollBottom || atBottom) && changed) entry.term.scrollToBottom?.();
  sendResize(id, entry, opts.force || changed);
}

function fitAll(opts = {}) {
  const ids = opts.ids ? new Set(opts.ids) : null;
  for (const [id, entry] of state.sessions) {
    if (ids && !ids.has(id)) continue;
    try { fitEntry(id, entry, opts); } catch {}
  }
}

function scheduleTerminalFit(opts = {}) {
  const previous = state.fitOptions;
  const fitAllPending = Boolean(previous && !previous.ids);
  state.fitOptions = { allowHeight: true, scrollBottom: true, ...opts };
  if (fitAllPending || !opts.ids) delete state.fitOptions.ids;
  else if (previous?.ids) state.fitOptions.ids = [...new Set([...previous.ids, ...opts.ids])];
  if (state.fitTimer) { clearTimeout(state.fitTimer); state.fitTimer = null; }
  if (state.fitTimerLate) { clearTimeout(state.fitTimerLate); state.fitTimerLate = null; }
  if (state.fitFrame) return;
  state.fitFrame = requestAnimationFrame(() => {
    state.fitFrame = null;
    const options = state.fitOptions;
    state.fitOptions = null;
    fitAll(options);
    if (options.secondPass === false) return;
    state.fitTimer = setTimeout(() => {
      state.fitTimer = null;
      fitAll(options);
    }, options.delay ?? 50);
    if (options.latePass !== false) {
      state.fitTimerLate = setTimeout(() => {
        state.fitTimerLate = null;
        fitAll(options);
      }, options.lateDelay ?? 250);
    }
  });
}

function installTerminalDragSelection(termEl, term, session) {
  let start = null;
  let origin = null;
  let replaying = false;
  let suspendedMouse = null;
  const isTui = () => isHermesTuiEntry(state.sessions.get(session.id) || { session });
  const suspendMouse = () => {
    const service = term?._core?.coreMouseService;
    if (!service || service.activeProtocol === 'NONE') return;
    suspendedMouse = { service, protocol: service.activeProtocol, encoding: service.activeEncoding };
    service.activeProtocol = 'NONE';
  };
  const resumeMouse = () => {
    if (!suspendedMouse) return;
    suspendedMouse.service.activeEncoding = suspendedMouse.encoding;
    suspendedMouse.service.activeProtocol = suspendedMouse.protocol;
    suspendedMouse = null;
  };
  const cancelInterruptedDrag = () => {
    if (!start && !suspendedMouse) return;
    start = origin = null;
    resumeMouse();
  };
  term.__passideckResumeMouse = resumeMouse;
  term.__passideckClearDragSelection = cancelInterruptedDrag;
  const block = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const cell = event => {
    const screen = termEl.querySelector('.xterm-screen');
    const rect = screen?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      col: Math.max(0, Math.min(term.cols - 1, Math.floor((event.clientX - rect.left) / (rect.width / term.cols)))),
      row: Math.max(0, Math.min(term.rows - 1, Math.floor((event.clientY - rect.top) / (rect.height / term.rows))))
    };
  };
  const linkAt = point => {
    const x = point.col + 1;
    const y = (term.buffer.active.viewportY || 0) + point.row + 1;
    const hovered = term?._core?.linkifier?.currentLink?.link;
    if (hovered &&
      (y > hovered.range.start.y || y === hovered.range.start.y && x >= hovered.range.start.x) &&
      (y < hovered.range.end.y || y === hovered.range.end.y && x <= hovered.range.end.x)
    ) return hovered.text;

    const buffer = term.buffer.active;
    const lineIndex = y - 1;
    const line = buffer.getLine(lineIndex);
    const urlId = line?.getCell(point.col)?.extended?.urlId;
    const oscLink = urlId && term?._core?._oscLinkService?.getLinkData(urlId)?.uri;
    if (oscLink) return oscLink;

    const restoredLinks = term.__passideckSnapshotLinks;
    const restoredRow = lineIndex - (restoredLinks?.baseY || 0);
    const restoredLink = restoredLinks?.links?.find(link =>
      link.row === restoredRow && point.col >= link.startCol && point.col < link.endCol &&
      line?.translateToString(false, link.startCol, link.endCol) === link.text
    );
    if (restoredLink) return restoredLink.url;

    let firstLineIndex = lineIndex;
    while (firstLineIndex > 0 && buffer.getLine(firstLineIndex)?.isWrapped) firstLineIndex -= 1;
    let lastLineIndex = lineIndex;
    while (buffer.getLine(lastLineIndex + 1)?.isWrapped) lastLineIndex += 1;
    let text = '';
    let offset = 0;
    for (let index = firstLineIndex; index <= lastLineIndex; index += 1) {
      const rowText = buffer.getLine(index)?.translateToString(false) || '';
      if (index < lineIndex) offset += rowText.length;
      text += rowText;
    }
    for (let col = 0; col < point.col; col += 1) {
      const cell = line?.getCell(col);
      if (cell?.getWidth() !== 0) offset += cell?.getChars()?.length || 1;
    }
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
      const value = match[0].replace(/[),.;!?]+$/, '');
      if (offset >= match.index && offset < match.index + value.length) return value;
    }
    return '';
  };
  const startDrag = event => {
    if (replaying || event.button !== 0 || !termEl.contains(event.target) || !isTui()) return;
    if (start) {
      block(event);
      return;
    }
    start = cell(event);
    origin = { target: event.target, clientX: event.clientX, clientY: event.clientY };
    if (start) {
      selectPanel(session.id);
      term.focus();
      suspendMouse();
      block(event);
    }
  };
  window.addEventListener('pointerdown', startDrag, true);
  window.addEventListener('mousedown', startDrag, true);
  const continueDrag = event => {
    if (start && !replaying) block(event);
  };
  window.addEventListener('pointermove', continueDrag, true);
  window.addEventListener('mousemove', continueDrag, true);
  const finishDrag = event => {
    if (replaying || !start) return;
    const end = cell(event);
    if (!end) {
      start = origin = null;
      resumeMouse();
      return;
    }
    block(event);
    const first = start.row < end.row || (start.row === end.row && start.col <= end.col) ? start : end;
    const last = first === start ? end : start;
    const length = (last.row - first.row) * term.cols + last.col - first.col + 1;
    const click = length < 2;
    start = null;
    if (!click) {
      term.select(first.col, (term.buffer.active.viewportY || 0) + first.row, length);
      origin = null;
      return;
    }
    term.clearSelection();
    term.focus();
    const link = linkAt(end);
    if (link) {
      origin = null;
      resumeMouse();
      void handleTerminalLink(event, link);
      return;
    }
    resumeMouse();
    replaying = true;
    const options = { button: 0, buttons: 1, clientX: origin.clientX, clientY: origin.clientY, bubbles: true, cancelable: true };
    origin.target.dispatchEvent(new MouseEvent('mousedown', options));
    origin.target.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
    replaying = false;
    origin = null;
  };
  window.addEventListener('pointerup', finishDrag, true);
  window.addEventListener('mouseup', finishDrag, true);
  window.addEventListener('pointercancel', cancelInterruptedDrag, true);
  window.addEventListener('blur', cancelInterruptedDrag, true);
  return () => {
    for (const type of ['pointerdown', 'mousedown']) window.removeEventListener(type, startDrag, true);
    for (const type of ['pointermove', 'mousemove']) window.removeEventListener(type, continueDrag, true);
    for (const type of ['pointerup', 'mouseup']) window.removeEventListener(type, finishDrag, true);
    window.removeEventListener('pointercancel', cancelInterruptedDrag, true);
    window.removeEventListener('blur', cancelInterruptedDrag, true);
    cancelInterruptedDrag();
    delete term.__passideckResumeMouse;
    delete term.__passideckClearDragSelection;
  };
}

function declaredTerminalOwner(session) {
  const command = String(session?.meta?.command || '').trim();
  return /\bhermes\b[^\n]*\s--tui\b/i.test(command) ? 'application' : 'viewport';
}

function installTerminalWheelScroll(termEl, term, session = null) {
  let wheelRemainder = 0;
  let touchY = null;
  let touchRemainder = 0;
  const applicationOwnsTouch = () => state.sessions.get(session?.id)?.terminalOwner === 'application';
  term.attachCustomWheelEventHandler?.(e => {
    const entry = state.sessions.get(session?.id);
    if (e.ctrlKey) return true;
    if (entry?.terminalOwner === 'application') {
      term.clearSelection();
      term.__passideckResumeMouse?.();
      return true;
    }
    const buffer = term.buffer?.active;
    if (!buffer || buffer.baseY <= 0) {
      e.preventDefault();
      return false;
    }
    const unit = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? term.rows : 1 / Math.max(8, state.fontSize * 1.2);
    wheelRemainder += e.deltaY * unit;
    const lines = Math.trunc(wheelRemainder);
    if (!lines) {
      e.preventDefault();
      return false;
    }
    wheelRemainder -= lines;
    term.scrollLines(lines);
    e.preventDefault();
    return false;
  });
  termEl.addEventListener('wheel', e => {
    const entry = state.sessions.get(session?.id);
    if (e.ctrlKey) return;
    if (entry?.terminalOwner === 'application') {
      term.clearSelection();
      term.__passideckResumeMouse?.();
      return;
    }
    const buffer = term.buffer?.active;
    if (!buffer || buffer.baseY <= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const unit = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? term.rows : 1 / Math.max(8, state.fontSize * 1.2);
    wheelRemainder += e.deltaY * unit;
    const lines = Math.trunc(wheelRemainder);
    if (!lines) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    wheelRemainder -= lines;
    term.scrollLines(lines);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true, passive: false });
  termEl.addEventListener('touchstart', e => {
    const buffer = term.buffer?.active;
    if (applicationOwnsTouch() || e.touches.length !== 1 || buffer?.type === 'alternate' || !buffer || buffer.baseY <= 0) {
      touchY = null;
      return;
    }
    touchY = e.touches[0].clientY;
    touchRemainder = 0;
  }, { capture: true, passive: true });
  termEl.addEventListener('touchmove', e => {
    if (applicationOwnsTouch()) { touchY = null; touchRemainder = 0; return; }
    if (touchY === null || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    touchRemainder += (touchY - y) / Math.max(8, state.fontSize * 1.2);
    touchY = y;
    const lines = Math.trunc(touchRemainder);
    if (lines) {
      touchRemainder -= lines;
      term.scrollLines(lines);
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true, passive: false });
  const endTouchScroll = () => { touchY = null; touchRemainder = 0; };
  termEl.addEventListener('touchend', endTouchScroll, true);
  termEl.addEventListener('touchcancel', endTouchScroll, true);
}

function updateEmpty() {
  document.getElementById('emptyState').style.display = desktopPaneIds().length ? 'none' : 'grid';
  renderBackendLatency();
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

function normalizeReplayText(data) {
  return String(data || '')
    .replace(/\x1bc/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[P_^][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function sanitizeTerminalOutput(data) {
  return stripTerminalReplyJunk(data);
}

function writeTerminalOutput(term, data, done, sanitize = true, onFrame = null, shouldContinue = null) {
  const text = sanitize ? sanitizeTerminalOutput(data) : String(data);
  const chunkSize = 32768;
  let offset = 0;
  function writeChunk() {
    if (shouldContinue && !shouldContinue()) return;
    if (offset >= text.length) { onFrame?.(null); done?.(); return; }
    const end = Math.min(text.length, offset + chunkSize);
    const chunk = text.slice(offset, end);
    term.write(chunk, () => {
      if (shouldContinue && !shouldContinue()) return;
      offset = end;
      if (offset < text.length) {
        const handle = setTimeout(writeChunk, 0);
        onFrame?.(handle);
      } else { onFrame?.(null); done?.(); }
    });
  }
  writeChunk();
}

function terminalOutputDelay(id) {
  const visible = state.panePrefs.paneDesktop[id] === state.activeDesktopId && !state.minimized.has(id);
  if (!visible) return TERM_OUTPUT_HIDDEN_FLUSH_MS;
  if (state.performanceMode && visible) return TERM_OUTPUT_ACTIVE_FLUSH_MS;
  return state.activeId === id ? TERM_OUTPUT_ACTIVE_FLUSH_MS : TERM_OUTPUT_VISIBLE_FLUSH_MS;
}

function scheduleTerminalOutputFlush(id, term) {
  const entry = state.sessions.get(id);
  if (!entry || entry.outputWriteInFlight || entry.outputFlushTimer) return;
  if (entry.pendingReplay !== null) return flushTerminalReplay(id, term);
  if (!entry.outputBuffer.length) return;
  entry.outputFlushTimer = setTimeout(() => flushTerminalOutput(id, term), terminalOutputDelay(id));
}

function flushTerminalOutput(id, term) {
  const entry = state.sessions.get(id);
  if (!entry || entry.outputCancelled) return;
  clearTimeout(entry.outputFlushTimer);
  entry.outputFlushTimer = null;
  if (entry.outputWriteInFlight) return;
  const buffered = entry.outputBuffer.join('');
  entry.outputBuffer = [];
  entry.outputBufferChars = 0;
  if (!buffered) return;
  entry.outputWriteInFlight = true;
  const generation = entry.outputGeneration;
  const live = () => !entry.outputCancelled && state.sessions.get(id) === entry && entry.outputGeneration === generation;
  writeTerminalOutput(term, buffered, () => {
    if (!live()) return;
    entry.outputFrameHandle = null;
    entry.outputWriteInFlight = false;
    if (entry.pendingReplay !== null) {
      flushTerminalReplay(id, term);
      return;
    }
    scheduleTerminalTitleRefresh(id);
    if (entry.outputBuffer.length) {
      scheduleTerminalOutputFlush(id, term);
      return;
    }
    scheduleTerminalSnapshot(id);
  }, false, handle => {
    if (live()) entry.outputFrameHandle = handle;
  }, live);
}

function resetTerminalOutputPipeline(entry) {
  entry.outputGeneration += 1;
  clearTimeout(entry.outputFlushTimer);
  clearTimeout(entry.outputFrameHandle);
  entry.outputFlushTimer = null;
  entry.outputFrameHandle = null;
  entry.outputWriteInFlight = false;
  entry.outputBuffer = [];
  entry.outputBufferChars = 0;
  entry.pendingReplay = null;
  entry.pendingReplayCursor = null;
  entry.pendingReplayAck = '';
  entry.pendingReplaySocket = null;
}

function queueTerminalOutput(id, term, data) {
  const entry = state.sessions.get(id);
  const text = sanitizeTerminalOutput(data);
  if (!entry || !text) return;
  clearTimeout(entry.snapshotTimer);
  entry.snapshotTimer = null;
  entry.outputBuffer.push(text);
  entry.outputBufferChars += text.length;
  if (entry.outputBufferChars > TERM_OUTPUT_BUFFER_MAX_CHARS) {
    resetTerminalOutputPipeline(entry);
    entry.ws?.close(4002, 'client output backlog');
    return;
  }
  scheduleTerminalOutputFlush(id, term);
}

function restoreReplayCursor(term, cursor, done) {
  const x = Number(cursor?.x);
  const y = Number(cursor?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return done?.();
  const col = Math.min(term.cols, x + 1);
  const row = Math.min(term.rows, y + 1);
  term.write(`\x1b[${row};${col}H`, done);
}

function flushTerminalReplay(id, term) {
  const entry = state.sessions.get(id);
  if (!entry || entry.outputCancelled || entry.outputWriteInFlight || entry.pendingReplay === null) return;
  const replay = entry.pendingReplay;
  const cursor = entry.pendingReplayCursor;
  const attachId = entry.pendingReplayAck;
  const replaySocket = entry.pendingReplaySocket;
  entry.pendingReplay = null;
  entry.pendingReplayCursor = null;
  entry.pendingReplayAck = '';
  entry.pendingReplaySocket = null;
  entry.outputWriteInFlight = true;
  try { term.reset(); } catch {}
  const generation = entry.outputGeneration;
  const live = () => !entry.outputCancelled && state.sessions.get(id) === entry && entry.outputGeneration === generation && (!replaySocket || entry.ws === replaySocket);
  writeTerminalOutput(term, replay, () => {
    if (!live()) return;
    restoreReplayCursor(term, cursor, () => {
      if (!live()) return;
      entry.outputFrameHandle = null;
      entry.outputWriteInFlight = false;
      if (attachId && replaySocket?.readyState === WebSocket.OPEN) replaySocket.send(JSON.stringify({ type: 'replay-ack', attachId }));
      if (entry.pendingReplay !== null) return flushTerminalReplay(id, term);
      scheduleTerminalTitleRefresh(id);
      if (entry.outputBuffer.length) scheduleTerminalOutputFlush(id, term);
      else scheduleTerminalSnapshot(id);
    });
  }, false, handle => {
    if (live()) entry.outputFrameHandle = handle;
  }, live);
}

function queueTerminalReplay(id, term, data, options = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  clearTimeout(entry.snapshotTimer);
  clearTimeout(entry.outputFlushTimer);
  entry.snapshotTimer = null;
  entry.outputFlushTimer = null;
  entry.outputBuffer = [];
  entry.outputBufferChars = 0;
  entry.pendingReplay = normalizeReplayText(data);
  entry.pendingReplayCursor = { x: options.cursorX, y: options.cursorY };
  entry.pendingReplayAck = String(options.attachId || '');
  entry.pendingReplaySocket = options.socket || null;
  flushTerminalReplay(id, term);
}

function snapshotKey(id) {
  return `${TERM_SNAPSHOT_PREFIX}${id}`;
}

function trimPlainSnapshotText(text, maxChars) {
  if (text.length <= maxChars) return text;
  const boundary = text.indexOf('\r\n', text.length - maxChars);
  return boundary >= 0 ? text.slice(boundary + 2) : '';
}

function terminalPlainSnapshot(entry, maxChars = TERM_SNAPSHOT_MAX_CHARS) {
  if (!entry) return '';
  entry.snapshotPlain = true;
  const term = entry.term;
  const buffer = term?.buffer?.active;
  if (!buffer) return '';
  const rows = Math.max(1, Math.min(TERM_SNAPSHOT_MAX_LINES, term.rows || 30));
  const start = Math.max(0, buffer.viewportY || 0);
  const end = Math.min(buffer.length || 0, start + rows);
  const lines = [];
  for (let i = start; i < end; i += 1) {
    const line = buffer.getLine(i);
    lines.push(line ? line.translateToString(false) : '');
  }
  const text = lines.join('\r\n').replace(/[\r\n]+$/g, '');
  return trimPlainSnapshotText(text, maxChars);
}

function terminalSnapshot(entry) {
  const term = entry?.term;
  if (!term) return '';
  entry.snapshotPlain = false;
  try {
    let serialized = entry.serialize?.serialize({ scrollback: TERM_SNAPSHOT_MAX_LINES });
    if (serialized && isHermesTuiEntry(entry) && /\x1b\[\?(?:9|1000|1002|1003)h/.test(serialized) && !serialized.includes('\x1b[?1006h')) serialized += '\x1b[?1006h';
    if (serialized && serialized.length <= TERM_SNAPSHOT_MAX_CHARS) return serialized;
  } catch {}
  return terminalPlainSnapshot(entry);
}

function terminalSnapshotLinks(entry) {
  const term = entry?.term;
  const buffer = term?.buffer?.active;
  if (!term || !buffer) return [];
  const links = [];
  const viewportY = buffer.viewportY || 0;
  const rows = Math.max(1, Math.min(term.rows || 30, buffer.length - viewportY));
  for (let row = 0; row < rows && links.length < 256; row += 1) {
    const line = buffer.getLine(viewportY + row);
    if (!line) continue;
    let startCol = -1;
    let urlId = 0;
    let url = '';
    const flush = endCol => {
      if (startCol < 0 || !url) return;
      const text = line.translateToString(false, startCol, endCol);
      if (text) links.push({ row, startCol, endCol, text, url });
      startCol = -1;
      urlId = 0;
      url = '';
    };
    for (let col = 0; col < term.cols; col += 1) {
      const nextId = Number(line.getCell(col)?.extended?.urlId) || 0;
      const nextUrl = nextId ? terminalLinkUrl(term?._core?._oscLinkService?.getLinkData(nextId)?.uri) : '';
      if (startCol >= 0 && nextId === urlId && nextUrl === url) continue;
      flush(col);
      if (nextUrl && nextUrl.length <= 8192) {
        startCol = col;
        urlId = nextId;
        url = nextUrl;
      }
    }
    flush(term.cols);
  }
  return links;
}

function hasTerminalSnapshot(id) {
  try { return Boolean(localStorage.getItem(snapshotKey(id))); } catch { return false; }
}

function saveTerminalSnapshot(id) {
  const entry = state.sessions.get(id);
  if (!entry?.term || entry.outputWriteInFlight) return;
  let text = terminalSnapshot(entry);
  let links = entry.snapshotPlain ? [] : terminalSnapshotLinks(entry);
  const pendingOutput = entry.outputBuffer.join('');
  if (!text && !pendingOutput) return;
  // localStorage quotas vary by browser/device. Keep the big snapshot when possible;
  // if quota is full, degrade gracefully instead of losing reload restore entirely.
  while (true) {
    try {
      const snapshot = { id, text, cols: entry.term.cols, savedAt: Date.now() };
      if (links.length) snapshot.links = links;
      if (pendingOutput) snapshot.pendingOutput = pendingOutput;
      localStorage.setItem(snapshotKey(id), JSON.stringify(snapshot));
      return;
    } catch {}
    if (text.includes('\x1b')) {
      text = terminalPlainSnapshot(entry, Math.floor(text.length * 0.6));
      if (entry.snapshotPlain) links = [];
      continue;
    }
    if (text.length <= 65536) return;
    links = [];
    text = trimPlainSnapshotText(text, Math.floor(text.length * 0.6));
  }
}

function scheduleTerminalSnapshot(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  clearTimeout(entry.snapshotTimer);
  entry.snapshotTimer = setTimeout(() => saveTerminalSnapshot(id), TERM_SNAPSHOT_DEBOUNCE_MS);
}

function restoreTerminalSnapshot(id, term, done = null, entry = null) {
  try {
    const raw = localStorage.getItem(snapshotKey(id));
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    const text = String(snapshot.text || '');
    const pendingOutput = String(snapshot.pendingOutput || '');
    if (!text && !pendingOutput) return false;
    try { term.reset(); } catch {}
    term.__passideckSnapshotLinks = null;
    const links = Number.isInteger(snapshot.cols) && snapshot.cols === term.cols && Array.isArray(snapshot.links) ? snapshot.links.slice(0, 256).flatMap(item => {
      const row = Number(item?.row);
      const startCol = Number(item?.startCol);
      const endCol = Number(item?.endCol);
      const text = String(item?.text || '');
      const url = terminalLinkUrl(item?.url);
      return Number.isInteger(row) && row >= 0 && row < term.rows &&
        Number.isInteger(startCol) && startCol >= 0 && startCol < term.cols &&
        Number.isInteger(endCol) && endCol > startCol && endCol <= term.cols &&
        text && text.length <= term.cols * 2 && url && url.length <= 8192
        ? [{ row, startCol, endCol, text, url }]
        : [];
    }) : [];
    const finishRestore = () => {
      const finish = () => {
        if (links.length) term.__passideckSnapshotLinks = { baseY: term.buffer.active.viewportY || 0, links };
        done?.();
      };
      if (isHermesEntry(entry) && !isHermesTuiEntry(entry) && term.buffer?.active?.type === 'alternate') {
        writeTerminalOutput(term, '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l', finish, false);
      } else finish();
    };
    const replayPendingOutput = () => {
      if (pendingOutput) writeTerminalOutput(term, pendingOutput, finishRestore, false);
      else finishRestore();
    };
    if (text) term.write(text, replayPendingOutput);
    else replayPendingOutput();
    return true;
  } catch {
    return false;
  }
}

function saveAllTerminalSnapshots() {
  for (const id of state.sessions.keys()) saveTerminalSnapshot(id);
}

function desktopNameKey(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function nextDesktopDefaultName(desktops = state.panePrefs.desktops, excludedId = null) {
  const used = new Set(Object.entries(desktops || {})
    .filter(([id]) => id !== excludedId)
    .map(([, desktop]) => desktopNameKey(desktop?.name)));
  let number = 1;
  while (used.has(`desktop ${number}`)) number += 1;
  return `Desktop ${number}`;
}

function normalizeDesktopNames(desktops, order) {
  const used = new Set();
  for (const id of order) {
    const desktop = desktops[id];
    if (!desktop) continue;
    let name = String(desktop.name || '').trim().slice(0, 40);
    if (!name || used.has(desktopNameKey(name))) {
      let number = 1;
      while (used.has(`desktop ${number}`)) number += 1;
      name = `Desktop ${number}`;
    }
    desktop.name = name;
    used.add(desktopNameKey(name));
  }
}

function loadPanePrefs(prefs = {}) {
  const legacyWindows = prefs.windows && typeof prefs.windows === 'object' ? prefs.windows : {};
  const legacyViewport = prefs.viewport && typeof prefs.viewport === 'object' ? prefs.viewport : null;
  const hasModernDesktops = prefs.desktops && typeof prefs.desktops === 'object' && Object.keys(prefs.desktops).length;
  const desktops = hasModernDesktops
    ? structuredClone(prefs.desktops)
    : { 'desktop-1': { name: 'Desktop 1', minimized: prefs.minimized || [], windows: legacyWindows.desktop || {}, viewport: legacyViewport } };
  const desktopOrder = Array.isArray(prefs.desktopOrder) ? prefs.desktopOrder.filter(id => desktops[id]) : [];
  for (const id of Object.keys(desktops)) if (!desktopOrder.includes(id)) desktopOrder.push(id);
  normalizeDesktopNames(desktops, desktopOrder);
  const fallbackDesktop = desktopOrder[0] || 'desktop-1';
  const order = Array.isArray(prefs.order) ? prefs.order.filter(id => typeof id === 'string') : [];
  const paneDesktop = prefs.paneDesktop && typeof prefs.paneDesktop === 'object' ? { ...prefs.paneDesktop } : {};
  for (const id of order) if (!desktops[paneDesktop[id]]) paneDesktop[id] = fallbackDesktop;
  state.panePrefs = {
    titles: prefs.titles && typeof prefs.titles === 'object' ? prefs.titles : {},
    order,
    desktopOrder,
    paneDesktop,
    desktops
  };
  const local = localDesktopView();
  state.activeDesktopId = desktops[local.activeDesktopId] ? local.activeDesktopId : fallbackDesktop;
  saveLocalDesktopView();
}

async function syncSessionsFromServer(incomingPanePrefs = null) {
  const sessions = await api('GET', '/api/sessions');
  const currentIds = new Set(sessions.map(session => session.id));
  for (const session of sessions) {
    const isNew = !state.sessions.has(session.id);
    const incomingDesktopId = incomingPanePrefs?.paneDesktop?.[session.id];
    if (isNew && incomingDesktopId) state.panePrefs.paneDesktop[session.id] = incomingDesktopId;
    createPanel(session);
  }
  for (const id of [...state.sessions.keys()]) {
    if (!currentIds.has(id)) discardPanel(id, { persist: false });
  }
}

function selectAuthoritativePane(id) {
  if (!id || !state.sessions.has(id) || state.panePrefs.paneDesktop[id] !== state.activeDesktopId || state.minimized.has(id)) return false;
  selectPanel(id, { persist: false });
  return true;
}

function nextActivePaneId() {
  const ids = desktopPaneIds();
  if (ids.includes(state.activeId) && !state.minimized.has(state.activeId)) return state.activeId;
  return ids.find(id => state.responsiveMinimized.has(id)) || frontmostDesktopPaneId();
}

function applyAuthoritativeUiState(ui, opts = {}) {
  if (!ui || (!opts.force && Number(ui.revision) <= state.uiRevision)) return;
  const wasHydrating = state.hydrating;
  const localActiveId = state.activeId;
  state.hydrating = true;
  state.uiRevision = Number(ui.revision) || 0;
  state.lastUiState = structuredClone(opts.baseline || ui);
  loadPanePrefs(ui.panePrefs || {});
  setTheme(ui.theme || 'green', { persist: false });
  setSkin(ui.skin || 'neon', { persist: false });
  setFontSize(ui.fontSize || state.fontSize, { persist: false });
  setNotifyBlinking(ui.notifyBlinking !== false, { persist: false });
  setChromeHidden(Boolean(ui.chromeHidden), { persist: false, resize: false });
  setSystemMonitorVisible(Boolean(ui.systemMonitor), { persist: false });
  restorePanelOrder();
  state.responsiveMinimized.clear();
  state.minimized = new Set((activeDesktop().minimized || []).filter(id => state.sessions.has(id)));
  for (const [id, entry] of state.sessions) {
    entry.el.classList.toggle('minimized', state.minimized.has(id));
    if (windowPrefs()[id]) applyFreeWindow(id);
  }
  responsiveMinimizeForViewport();
  applyLayoutVisibility();
  const localActiveValid = localActiveId && state.sessions.has(localActiveId) &&
    state.panePrefs.paneDesktop[localActiveId] === state.activeDesktopId && !state.minimized.has(localActiveId);
  const remoteActiveValid = ui.activeId && state.sessions.has(ui.activeId) &&
    state.panePrefs.paneDesktop[ui.activeId] === state.activeDesktopId && !state.minimized.has(ui.activeId);
  state.activeId = localActiveValid ? localActiveId : remoteActiveValid ? ui.activeId : nextActivePaneId();
  for (const [id, entry] of state.sessions) entry.el.classList.toggle('active', id === state.activeId);
  renderSwitcher();
  scheduleTerminalFit();
  state.hydrating = wasHydrating;
}

function reconcileIncomingUiState(ui) {
  if (!ui || Number(ui.revision) <= state.uiRevision) return;
  if (uiSavePending() && state.lastUiState) {
    const reconciled = mergeUiChanges(state.lastUiState, structuredClone(uiPayload()), ui);
    reconciled.revision = ui.revision;
    applyAuthoritativeUiState(reconciled, { force: true, baseline: ui });
    return;
  }
  applyAuthoritativeUiState(ui);
}

function connectUiEvents() {
  state.uiEvents?.close?.();
  const token = authToken();
  const events = new EventSource(`/api/ui-events${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  events.onmessage = async event => {
    try {
      const ui = JSON.parse(event.data);
      await syncSessionsFromServer(ui.panePrefs || null);
      reconcileIncomingUiState(ui);
    } catch {}
  };
  state.uiEvents = events;
}

function savePanePrefs() {
  if (state.hydrating) return;
  state.order = state.order.filter(id => state.sessions.has(id));
  state.panePrefs.order = state.order.slice();
  const desktop = activeDesktop();
  desktop.minimized = persistentMinimizedIds().filter(id => state.panePrefs.paneDesktop[id] === state.activeDesktopId && state.sessions.has(id));
  if (innerWidth > 900) desktop.viewport = desktopSize();
  const prefs = windowPrefs();
  for (const id of Object.keys(prefs)) {
    if (!state.sessions.has(id) || state.panePrefs.paneDesktop[id] !== state.activeDesktopId) delete prefs[id];
  }
  saveUiState();
}

function sessionKind(session) {
  const cmd = String(session.meta?.command || session.meta?.label || '').toLowerCase();
  if (cmd.includes('hermes')) return 'Hermes';
  if (cmd.includes('codex')) return 'Codex';
  if (cmd.includes('bash') || cmd.includes('zsh') || cmd.includes('shell')) return 'Shell';
  return session.meta?.label || session.meta?.command || 'Window';
}

function defaultTitle(session) {
  const kind = sessionKind(session);
  const peers = state.order.filter(id => state.sessions.has(id) && sessionKind(state.sessions.get(id).session) === kind);
  const n = Math.max(1, peers.indexOf(session.id) + 1 || peers.length + 1);
  return `${kind} ${n}`;
}

function sessionDescription(session) {
  const meta = session?.meta || {};
  const command = String(meta.command || meta.label || '').trim();
  const cwd = String(meta.cwd || '').trim();
  const home = String(meta.home || '').trim();
  const shortCwd = cwd && home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return [command, shortCwd].filter(Boolean).join(' · ');
}

function panelTitle(session) {
  const entry = state.sessions.get(session.id);
  const custom = state.panePrefs.titles?.[session.id];
  if (custom && !isPlaceholderTitle(custom)) return custom;
  const generated = entry?.autoTitle || session?.meta?.title || session?.title;
  if (generated) return generated;
  if (entry?.autoTitle) return entry.autoTitle;
  return 'No title';
}

function isPlaceholderTitle(title) {
  return /^(?:no title|title|titel)$/i.test(String(title || '').trim());
}

function generatedTitleFromSession(session) {
  const entry = state.sessions.get(session.id);
  return String(entry?.autoTitle || session?.meta?.title || session?.title || '').trim();
}


function terminalLineText(row) {
  return typeof row === 'string' ? row : String(row?.text || '');
}

function terminalLineIsSelected(row) {
  return Boolean(row && typeof row === 'object' && row.selected);
}

function terminalViewportRows(term) {
  const buffer = term?.buffer?.active;
  if (!buffer) return [];
  const start = Math.max(0, buffer.viewportY || 0);
  const end = Math.min(buffer.length || 0, start + Math.max(1, term.rows || 30));
  const rows = [];
  for (let i = start; i < end; i += 1) {
    const line = buffer.getLine(i);
    if (!line) continue;
    let selectedCells = 0;
    let bgCells = 0;
    const width = Math.min(line.length || term.cols || 120, term.cols || 120);
    for (let x = 0; x < width; x += 1) {
      const cell = line.getCell?.(x);
      if (!cell) continue;
      const chars = cell.getChars?.() || '';
      if (!chars.trim()) continue;
      if (cell.isInverse?.()) selectedCells += 1;
      const bgMode = cell.getBgColorMode?.() || 0;
      const bg = cell.getBgColor?.() || 0;
      if (bgMode || bg > 0) bgCells += 1;
    }
    const text = line.translateToString(false);
    const selected = selectedCells >= 2 || bgCells >= 2;
    if (line.isWrapped && rows.length) {
      rows.at(-1).text += text;
      rows.at(-1).selected ||= selected;
    } else {
      rows.push({ text, selected });
    }
  }
  return rows;
}

function cleanHermesSessionLine(row) {
  return terminalLineText(row).replace(/[│┃┆┊┌┐└┘├┤┬┴─═╭╮╰╯╔╗╚╝╠╣╦╩╬║╒╕╘╛╞╡╤╧╪]/g, ' ').trim();
}

function extractHermesSessionTitleCandidate(rowText) {
  const text = String(rowText || '').trim();
  const modelMatch = text.match(/\b(?:gpt|claude|gemini|codex|qwen|deepseek|openrouter|anthropic)[\w.\/-]*\s+(.+)$/i);
  const parts = text.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  let candidate = parts[parts.length - 1] || '';
  if ((!candidate || parts.length < 4) && modelMatch) candidate = modelMatch[1];
  candidate = candidate.replace(/^Start (?:a )?new live session$/i, '').replace(/\s+/g, ' ').trim();
  if (!candidate || candidate.length > 160) return '';
  if (!/[\p{L}\p{N}]/u.test(candidate)) return '';
  if (/^(?:new|draft|current\/default|\d+\s+msgs?|✓?\s*idle|\(untitled\)|untitled)$/i.test(candidate)) return '';
  return candidate;
}

function inferHermesVisibleTitle(rowsOrLines) {
  const rows = Array.isArray(rowsOrLines) ? rowsOrLines : [];
  if (!rows.some(raw => /^Hermes CLI Status$/i.test(cleanHermesSessionLine(raw)))) return '';
  for (const raw of rows) {
    const clean = cleanHermesSessionLine(raw).replace(/\s+/g, ' ').trim();
    const m = clean.match(/^Title\s*:\s*(.+)$/i);
    const candidate = m ? extractHermesSessionTitleCandidate(m[1]) || m[1].trim() : '';
    if (candidate && !isPlaceholderTitle(candidate)) return candidate.slice(0, 160);
  }
  return '';
}

function hermesSessionRowFromCleanLine(clean) {
  const numbered = clean.match(/(?:^|\s)(?:[▶>▸]\s*)?\d+\.\s+(.*)$/);
  if (numbered) return numbered[1].trim();
  const current = clean.match(/(?:^|\s)(?:[▶>▸]\s*)?(current\b.*)$/i);
  if (current) return current[1].trim();
  return '';
}

function hasHermesSessionPickerSignature(rowsOrLines) {
  const lines = (Array.isArray(rowsOrLines) ? rowsOrLines : []).map(cleanHermesSessionLine);
  return lines.some(line => /\b\d+\s+live\b.*\b\d+\s+resumable\b/i.test(line))
    || lines.some(line => /Start a new live session|New row: type prompt/i.test(line))
    || lines.some(line => /\bcurrent\b.*\b(?:idle|draft)\b.*\b(?:gpt|claude|gemini|codex|qwen|deepseek)\b/i.test(line));
}

function inferHermesSessionTitle(rowsOrLines) {
  const visible = Array.isArray(rowsOrLines) ? rowsOrLines : [];
  if (!hasHermesSessionPickerSignature(visible)) return '';
  const hasSessionsHeader = visible.some(row => /\bSessions\b/.test(terminalLineText(row)));
  const rows = [];
  let selectedMarkerSeen = false;
  for (const raw of visible) {
    const clean = cleanHermesSessionLine(raw);
    const markedSelected = /(?:^|\s)[▶>▸]\s*(?:\d+\.|\+|current\b)/i.test(clean) || terminalLineIsSelected(raw);
    if (markedSelected) selectedMarkerSeen = true;
    const row = hermesSessionRowFromCleanLine(clean);
    if (!row) continue;
    rows.push({ selected: markedSelected, row });
  }
  if (!hasSessionsHeader && !rows.some(row => /\bcurrent\b.*\b(?:gpt|claude|gemini|codex|qwen|deepseek)\b/i.test(row.row))) return '';
  const candidates = selectedMarkerSeen ? rows.filter(row => row.selected) : rows;
  const currentRows = candidates.filter(row => /\bcurrent\b/i.test(row.row));
  if (!selectedMarkerSeen && currentRows.length === 1) candidates.splice(0, candidates.length, currentRows[0]);
  for (const item of candidates) {
    const candidate = extractHermesSessionTitleCandidate(item.row);
    if (candidate) return candidate;
  }
  return '';
}

function selectedHermesSessionTitleIsEmpty(rowsOrLines) {
  const visible = Array.isArray(rowsOrLines) ? rowsOrLines : [];
  if (!visible.some(row => /\bSessions\b/.test(terminalLineText(row))) || !hasHermesSessionPickerSignature(visible)) return false;
  if (visible.some(row => /\bprompt\s*›|New row: type prompt/i.test(terminalLineText(row)))) return true;
  for (const raw of visible) {
    const clean = cleanHermesSessionLine(raw);
    const selected = terminalLineIsSelected(raw) || /(?:^|\s)[▶>▸]/.test(clean);
    if (!selected) continue;
    if (/\+\s+new\b/i.test(clean)) return true;
    const row = hermesSessionRowFromCleanLine(clean);
    if (!row) continue;
    return !extractHermesSessionTitleCandidate(row);
  }
  return false;
}

const TITLE_SOURCE_PRIORITY = {
  terminal: 0,
  'hermes-session': 1,
  server: 1,
  'passideck-provisional': 2,
  'hermes-db': 3,
  'passideck-retitle': 4
};

function titleSourcePriority(source) {
  return TITLE_SOURCE_PRIORITY[source] ?? 0;
}

function clearGeneratedTitle(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry || state.panePrefs.titles?.[id] && !isPlaceholderTitle(state.panePrefs.titles[id])) return false;
  const source = opts.source;
  if (source && titleSourcePriority(entry.titleSource) > titleSourcePriority(source)) return false;
  if (!entry.autoTitle && !entry.session.title && !entry.session.meta?.title && !entry.titleSource) return false;
  delete entry.autoTitle;
  delete entry.session.title;
  if (entry.session.meta) {
    delete entry.session.meta.title;
    delete entry.session.meta.titleSource;
  }
  entry.titleSource = '';
  const titleEl = entry.el.querySelector('.term-title');
  if (titleEl && document.activeElement !== titleEl) titleEl.textContent = panelTitle(entry.session);
  renderSwitcher();
  return true;
}

function applyGeneratedTitle(id, title, opts = {}) {
  const entry = state.sessions.get(id);
  const clean = String(title || '').trim();
  if (!entry || !clean || state.panePrefs.titles?.[id] && !isPlaceholderTitle(state.panePrefs.titles[id])) return false;
  const source = opts.source || 'terminal';
  if (titleSourcePriority(entry.titleSource) > titleSourcePriority(source)) return false;
  if (entry.autoTitle === clean && entry.titleSource === source) return false;
  entry.autoTitle = clean;
  entry.titleSource = source;
  entry.session.meta = { ...(entry.session.meta || {}), title: clean, titleSource: source };
  const titleEl = entry.el.querySelector('.term-title');
  if (titleEl && document.activeElement !== titleEl) titleEl.textContent = clean;
  renderSwitcher();
  return true;
}

function applySessionMeta(id, session) {
  const entry = state.sessions.get(id);
  if (!entry || !session?.meta) return false;
  const previousHermesSessionId = entry.session.meta?.hermesSessionId;
  const nextHermesSessionId = session.meta.hermesSessionId;
  if (previousHermesSessionId && nextHermesSessionId && previousHermesSessionId !== nextHermesSessionId) entry.titleSource = '';
  const meta = { ...(entry.session.meta || {}), ...session.meta };
  Object.assign(entry.session, session, { meta });
  const source = String(session.meta.titleSource || 'server');
  const title = String(session.meta.title || '').trim();
  if (title) return applyGeneratedTitle(id, title, { source });
  if (!Object.prototype.hasOwnProperty.call(session.meta, 'title')) return false;
  return clearGeneratedTitle(id, { source });
}

function refreshTitleFromTerminal(id, viewportRows = null) {
  const entry = state.sessions.get(id);
  if (!isHermesTuiEntry(entry)) return;
  const rows = viewportRows || terminalViewportRows(entry?.term);
  const inferred = inferHermesVisibleTitle(rows) || inferHermesSessionTitle(rows);
  if (inferred) applyGeneratedTitle(id, inferred, { source: 'hermes-session' });
  else if (selectedHermesSessionTitleIsEmpty(rows)) clearGeneratedTitle(id, { source: 'hermes-session' });
}

function scheduleTerminalTitleRefresh(id) {
  const entry = state.sessions.get(id);
  if (!entry || entry.titleRefreshTimer) return;
  entry.titleRefreshTimer = setTimeout(() => {
    entry.titleRefreshTimer = null;
    if (state.sessions.get(id) !== entry || !isHermesTuiEntry(entry)) return;
    const rows = terminalViewportRows(entry.term);
    syncSessionWorkingFromTerminal(id, entry, rows);
    refreshTitleFromTerminal(id, rows);
  }, 0);
}

function trySetPointerCapture(el, pointerId) {
  try { el?.setPointerCapture?.(pointerId); } catch {}
}

function endPointerDrag(event) {
  const d = state.pointerDrag;
  if (!d) return;
  event?.preventDefault?.();
  const canceled = event?.type === 'pointercancel';
  const slot = d.activeDesktopSlot;
  const p = windowPrefs()[d.sourceId];
  if (p && d.preDragRect) {
    if (canceled) Object.assign(p, d.cancelRect || d.preDragRect);
    else {
      const gridRect = document.getElementById('termGrid').getBoundingClientRect();
      Object.assign(p, {
        x: d.x - gridRect.left - d.preDragRect.w * d.grabRatioX,
        y: d.y - gridRect.top - d.preDragRect.h * d.grabRatioY,
        w: d.preDragRect.w,
        h: d.preDragRect.h
      });
      Object.assign(p, clampWindowRect(p));
    }
    applyFreeWindow(d.sourceId);
  }
  if (canceled) {
    restoreWindowZSnapshot(d.cancelZ);
    if (Object.prototype.hasOwnProperty.call(d, 'cancelZCounter')) state.zCounter = d.cancelZCounter;
    applyFreeWindow(d.sourceId);
  }
  state.pointerDrag = null;
  if (state.draggingId === d.sourceId) state.draggingId = null;
  document.removeEventListener('pointermove', updatePointerDrag, true);
  document.removeEventListener('pointerup', endPointerDrag, true);
  document.removeEventListener('pointercancel', endPointerDrag, true);
  document.removeEventListener('mousemove', updatePointerDrag, true);
  document.removeEventListener('mouseup', endPointerDrag, true);
  document.getElementById(`panel-${d.sourceId}`)?.classList.remove('dragging');
  document.body.classList.remove('pane-dragging');
  clearDesktopSlotSuggestions();
  if (!canceled) {
    if (slot?.type === 'free') applyFreeSlotSnap(d.sourceId, slot.rect);
    savePanePrefs();
  } else if (state.saveQueued) saveUiState();
  scheduleTerminalFit({ ids: [d.sourceId] });
  renderSharedResizeHandles();
}

function dragClientPoint(event, gridRect, d) {
  d.x = event.clientX;
  d.y = event.clientY;
  return { x: d.x, y: d.y };
}

function updatePointerDrag(event) {
  const d = state.pointerDrag;
  if (!d) return;
  event.preventDefault();
  const p = windowPrefs()[d.sourceId];
  if (!p) return;
  const grid = document.getElementById('termGrid');
  const gr = grid.getBoundingClientRect();
  const pt = dragClientPoint(event, gr, d);
  p.x = Math.max(-p.w + 80, Math.min(gr.width - 80, pt.x - gr.left - d.dx));
  p.y = Math.max(0, Math.min(gr.height - 32, pt.y - gr.top - d.dy));
  p.z = d.z;
  const slot = chooseDesktopSlotAt(pt.x, pt.y, d.sourceId);
  d.activeDesktopSlot = slot?.type === 'none' ? null : slot;
  showDesktopSlotSuggestions(slot);
  applyFreeWindow(d.sourceId);
}

function endWindowResize(event) {
  const d = state.resizeDrag;
  if (!d) return;
  event?.preventDefault?.();
  const canceled = event?.type === 'pointercancel';
  if (canceled) {
    const p = windowPrefs()[d.sourceId];
    if (p && d.startRect) {
      Object.assign(p, d.cancelRect || d.startRect);
    }
    restoreWindowZSnapshot(d.cancelZ);
    if (Object.prototype.hasOwnProperty.call(d, 'cancelZCounter')) state.zCounter = d.cancelZCounter;
    applyFreeWindow(d.sourceId);
  }
  state.resizeDrag = null;
  document.removeEventListener('pointermove', updateWindowResize, true);
  document.removeEventListener('pointerup', endWindowResize, true);
  document.removeEventListener('pointercancel', endWindowResize, true);
  document.removeEventListener('mousemove', updateWindowResize, true);
  document.removeEventListener('mouseup', endWindowResize, true);
  document.body.classList.remove('window-resizing');
  document.getElementById(`panel-${d.sourceId}`)?.classList.remove('resizing');
  if (!canceled) savePanePrefs();
  else if (state.saveQueued) saveUiState();
  scheduleTerminalFit({ ids: [d.sourceId] });
  renderSharedResizeHandles();
}

function snapWindowResize(sourceId, edge, rect) {
  const minW = 300;
  const minH = 190;
  const threshold = 16;
  const result = { ...rect };
  const prefs = windowPrefs();
  const neighbors = [...state.sessions.entries()]
    .filter(([id, entry]) => id !== sourceId && !state.minimized.has(id) && !entry.session.exited && !entry.el.classList.contains('layout-hidden') && prefs[id])
    .map(([id]) => prefs[id]);
  const nearest = (value, axis) => {
    let best = null;
    for (const other of neighbors) {
      const overlap = axis === 'x'
        ? Math.min(result.y + result.h, other.y + other.h) - Math.max(result.y, other.y)
        : Math.min(result.x + result.w, other.x + other.w) - Math.max(result.x, other.x);
      if (overlap <= 0) continue;
      for (const candidate of axis === 'x' ? [other.x, other.x + other.w] : [other.y, other.y + other.h]) {
        const distance = Math.abs(candidate - value);
        if (distance <= threshold && (!best || distance < best.distance)) best = { value: candidate, distance };
      }
    }
    return best?.value;
  };
  if (edge.includes('e')) {
    const target = nearest(result.x + result.w, 'x');
    if (target != null && target - result.x >= minW) result.w = target - result.x;
  }
  if (edge.includes('w')) {
    const right = result.x + result.w;
    const target = nearest(result.x, 'x');
    if (target != null && right - target >= minW) { result.x = target; result.w = right - target; }
  }
  if (edge.includes('s')) {
    const target = nearest(result.y + result.h, 'y');
    if (target != null && target - result.y >= minH) result.h = target - result.y;
  }
  if (edge.includes('n')) {
    const bottom = result.y + result.h;
    const target = nearest(result.y, 'y');
    if (target != null && bottom - target >= minH) { result.y = target; result.h = bottom - target; }
  }
  return result;
}

function updateWindowResize(event) {
  const d = state.resizeDrag;
  if (!d) return;
  event.preventDefault();
  const p = windowPrefs()[d.sourceId];
  if (!p) return;
  const grid = document.getElementById('termGrid');
  const gr = grid.getBoundingClientRect();
  const pt = dragClientPoint(event, gr, d);
  const dx = pt.x - d.startX;
  const dy = pt.y - d.startY;
  const edge = d.edge || 'se';
  const minW = 300;
  const minH = 190;
  let { x, y, w, h } = d.startRect;
  if (edge.includes('e')) w = Math.max(minW, Math.min(gr.width - x, d.startRect.w + dx));
  if (edge.includes('s')) h = Math.max(minH, Math.min(gr.height - y, d.startRect.h + dy));
  if (edge.includes('w')) {
    const right = d.startRect.x + d.startRect.w;
    x = Math.max(0, Math.min(right - minW, d.startRect.x + dx));
    w = right - x;
  }
  if (edge.includes('n')) {
    const bottom = d.startRect.y + d.startRect.h;
    y = Math.max(0, Math.min(bottom - minH, d.startRect.y + dy));
    h = bottom - y;
  }
  ({ x, y, w, h } = snapWindowResize(d.sourceId, edge, { x, y, w, h }));
  Object.assign(p, { x, y, w, h, z: d.z });
  applyFreeWindow(d.sourceId);
  scheduleTerminalFit({ ids: [d.sourceId], secondPass: false, latePass: false });
}

function startSharedResize(group, event) {
  if (event.button !== 0 || isCompactViewport()) return;
  event.preventDefault();
  event.stopPropagation();
  const ids = [...group.beforeIds, ...group.afterIds];
  const prefs = windowPrefs();
  const rects = {};
  ids.forEach(id => { if (prefs[id]) rects[id] = { ...prefs[id] }; });
  state.sharedResizeDrag = {
    axis: group.axis,
    beforeIds: [...group.beforeIds],
    afterIds: [...group.afterIds],
    startX: event.clientX,
    startY: event.clientY,
    rects
  };
  clearSharedResizeHandles();
  document.body.classList.add(group.axis === 'vertical' ? 'shared-resizing-x' : 'shared-resizing-y');
  document.addEventListener('pointermove', updateSharedResize, true);
  document.addEventListener('pointerup', endSharedResize, true);
  document.addEventListener('pointercancel', endSharedResize, true);
  document.addEventListener('mousemove', updateSharedResize, true);
  document.addEventListener('mouseup', endSharedResize, true);
  trySetPointerCapture(event.currentTarget, event.pointerId);
}

function sharedResizeDelta(d, rawDelta) {
  const minW = 300;
  const minH = 190;
  let min = -Infinity;
  let max = Infinity;
  if (d.axis === 'vertical') {
    d.beforeIds.forEach(id => { const r = d.rects[id]; if (r) min = Math.max(min, minW - r.w); });
    d.afterIds.forEach(id => { const r = d.rects[id]; if (r) max = Math.min(max, r.w - minW); });
  } else {
    d.beforeIds.forEach(id => { const r = d.rects[id]; if (r) min = Math.max(min, minH - r.h); });
    d.afterIds.forEach(id => { const r = d.rects[id]; if (r) max = Math.min(max, r.h - minH); });
  }
  return Math.max(min, Math.min(max, rawDelta));
}

function updateSharedResize(event) {
  const d = state.sharedResizeDrag;
  if (!d) return;
  event.preventDefault();
  const prefs = windowPrefs();
  const delta = sharedResizeDelta(d, d.axis === 'vertical' ? event.clientX - d.startX : event.clientY - d.startY);
  if (d.axis === 'vertical') {
    d.beforeIds.forEach(id => { const r = d.rects[id]; if (r && prefs[id]) { prefs[id].w = r.w + delta; applyFreeWindow(id); } });
    d.afterIds.forEach(id => { const r = d.rects[id]; if (r && prefs[id]) { prefs[id].x = r.x + delta; prefs[id].w = r.w - delta; applyFreeWindow(id); } });
  } else {
    d.beforeIds.forEach(id => { const r = d.rects[id]; if (r && prefs[id]) { prefs[id].h = r.h + delta; applyFreeWindow(id); } });
    d.afterIds.forEach(id => { const r = d.rects[id]; if (r && prefs[id]) { prefs[id].y = r.y + delta; prefs[id].h = r.h - delta; applyFreeWindow(id); } });
  }
  scheduleTerminalFit({ ids: [...d.beforeIds, ...d.afterIds], secondPass: false, latePass: false });
}

function endSharedResize(event) {
  const d = state.sharedResizeDrag;
  if (!d) return;
  event?.preventDefault?.();
  const canceled = event?.type === 'pointercancel';
  if (canceled) {
    const prefs = windowPrefs();
    for (const [id, rect] of Object.entries(d.rects)) {
      if (!prefs[id]) continue;
      Object.assign(prefs[id], rect);
      applyFreeWindow(id);
    }
  }
  document.removeEventListener('pointermove', updateSharedResize, true);
  document.removeEventListener('pointerup', endSharedResize, true);
  document.removeEventListener('pointercancel', endSharedResize, true);
  document.removeEventListener('mousemove', updateSharedResize, true);
  document.removeEventListener('mouseup', endSharedResize, true);
  document.body.classList.remove('shared-resizing-x', 'shared-resizing-y');
  state.sharedResizeDrag = null;
  if (!canceled) savePanePrefs();
  else if (state.saveQueued) saveUiState();
  scheduleTerminalFit({ ids: [...d.beforeIds, ...d.afterIds] });
  renderSharedResizeHandles();
}

function startWindowResize(id, event) {
  if (event.button !== 0 || isCompactViewport()) return;
  event.preventDefault();
  event.stopPropagation();
  const entry = state.sessions.get(id);
  if (!entry) return;
  const prefs = windowPrefs();
  if (!prefs[id]) return;
  const cancelRect = { ...prefs[id] };
  const cancelZ = windowZSnapshot(prefs);
  const cancelZCounter = state.zCounter;
  const p = makeFreeWindow(id, entry.el.getBoundingClientRect());
  bringWindowToFront(id, { persist: false });
  state.resizeDrag = {
    sourceId: id,
    edge: event.currentTarget?.dataset?.resizeEdge || 'se',
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    startRect: { x: p.x, y: p.y, w: p.w, h: p.h },
    cancelRect,
    cancelZ,
    cancelZCounter,
    z: p.z
  };
  clearSharedResizeHandles();
  entry.el.classList.add('resizing');
  document.body.classList.add('window-resizing');
  document.addEventListener('pointermove', updateWindowResize, true);
  document.addEventListener('pointerup', endWindowResize, true);
  document.addEventListener('pointercancel', endWindowResize, true);
  document.addEventListener('mousemove', updateWindowResize, true);
  document.addEventListener('mouseup', endWindowResize, true);
  trySetPointerCapture(event.currentTarget, event.pointerId);
}

function startPointerDrag(id, handle, event) {
  if (event.button !== 0 || isCompactViewport()) return;
  event.preventDefault();
  event.stopPropagation();
  const entry = state.sessions.get(id);
  if (!entry) return;
  const prefs = windowPrefs();
  if (!prefs[id]) return;
  const cancelRect = { ...prefs[id] };
  const cancelZ = windowZSnapshot(prefs);
  const cancelZCounter = state.zCounter;
  const r = entry.el.getBoundingClientRect();
  const p = makeFreeWindow(id, r);
  const grid = document.getElementById('termGrid');
  const gr = grid.getBoundingClientRect();
  const preDragRect = { x: p.x, y: p.y, w: p.w, h: p.h, z: p.z };
  const grabRatioX = Math.max(0, Math.min(1, (event.clientX - gr.left - p.x) / p.w));
  const grabRatioY = Math.max(0, Math.min(1, (event.clientY - gr.top - p.y) / p.h));
  const defaultSize = defaultWindowSize();
  p.w = Math.min(p.w, defaultSize.w);
  p.h = Math.min(p.h, defaultSize.h);
  p.x = event.clientX - gr.left - p.w * grabRatioX;
  p.y = event.clientY - gr.top - p.h * grabRatioY;
  Object.assign(p, clampWindowRect(p));
  applyFreeWindow(id);
  scheduleTerminalFit({ ids: [id], secondPass: false, latePass: false });
  bringWindowToFront(id, { persist: false });
  state.pointerDrag = { sourceId: id, dx: event.clientX - gr.left - p.x, dy: event.clientY - gr.top - p.y, x: event.clientX, y: event.clientY, z: p.z, activeDesktopSlot: null, preDragRect, cancelRect, cancelZ, cancelZCounter, grabRatioX, grabRatioY };
  state.draggingId = id;
  clearSharedResizeHandles();
  entry.el.classList.add('dragging');
  document.body.classList.add('pane-dragging');
  document.addEventListener('pointermove', updatePointerDrag, true);
  document.addEventListener('pointerup', endPointerDrag, true);
  document.addEventListener('pointercancel', endPointerDrag, true);
  document.addEventListener('mousemove', updatePointerDrag, true);
  document.addEventListener('mouseup', endPointerDrag, true);
  trySetPointerCapture(handle, event.pointerId);
}

function createPanel(session, opts = {}) {
  if (state.sessions.has(session.id) || session.meta.status === 'exited') return;
  const id = session.id;
  if (!state.panePrefs.paneDesktop[id]) state.panePrefs.paneDesktop[id] = state.panePrefs.desktopOrder[0];
  const grid = document.getElementById('termGrid');
  const el = document.createElement('section');
  el.className = 'term-panel';
  el.classList.toggle('hermes-tui', isHermesTuiEntry({ session }));
  el.id = `panel-${id}`;
  el.dataset.paneId = id;
  el.dataset.connectionStatus = 'reconnecting';
  el.innerHTML = `
    <div class="term-header">
      <span class="connection-dot" data-tooltip="Reconnecting" aria-label="Reconnecting"></span>
      <span class="term-title" contenteditable="true" spellcheck="false" aria-label="Window name">${escapeHtml(panelTitle(session))}</span>
      <div class="term-actions">
        <button class="arrange" data-tooltip="Arrange" aria-label="Arrange">▦</button>
        <button class="minimize" data-tooltip="Minimize" aria-label="Minimize">−</button>
        <button class="danger" data-tooltip="Close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="terminal" id="term-${id}"></div>
    <div class="window-resize-handle edge-n" data-resize-edge="n" data-tooltip="Resize top" aria-hidden="true"></div>
    <div class="window-resize-handle edge-e" data-resize-edge="e" data-tooltip="Resize right" aria-hidden="true"></div>
    <div class="window-resize-handle edge-s" data-resize-edge="s" data-tooltip="Resize bottom" aria-hidden="true"></div>
    <div class="window-resize-handle edge-w" data-resize-edge="w" data-tooltip="Resize left" aria-hidden="true"></div>
    <div class="window-resize-handle edge-ne" data-resize-edge="ne" data-tooltip="Resize" aria-hidden="true"></div>
    <div class="window-resize-handle edge-se" data-resize-edge="se" data-tooltip="Resize" aria-hidden="true"></div>
    <div class="window-resize-handle edge-sw" data-resize-edge="sw" data-tooltip="Resize" aria-hidden="true"></div>
    <div class="window-resize-handle edge-nw" data-resize-edge="nw" data-tooltip="Resize" aria-hidden="true"></div>
  `;
  grid.appendChild(el);
  el.addEventListener('mousedown', () => clearResponseAttention(id));

  const titleEl = el.querySelector('.term-title');
  const headerEl = el.querySelector('.term-header');
  const [arrangeBtn, minBtn, closeBtn] = el.querySelectorAll('button');
  setTooltip(headerEl, sessionDescription(session));
  arrangeBtn.dataset.paneId = id;
  minBtn.dataset.paneId = id;
  closeBtn.dataset.paneId = id;
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = panelTitle(session); titleEl.blur(); }
  });
  titleEl.addEventListener('blur', () => {
    const next = titleEl.textContent.trim();
    if (next && next !== defaultTitle(session) && next !== generatedTitleFromSession(session) && !isPlaceholderTitle(next)) state.panePrefs.titles[id] = next;
    else delete state.panePrefs.titles[id];
    titleEl.textContent = panelTitle(session);
    savePanePrefs();
    renderSwitcher();
  });
  titleEl.addEventListener('dblclick', e => { e.stopPropagation(); titleEl.dataset.editing = '1'; titleEl.focus(); });
  titleEl.addEventListener('blur', () => { delete titleEl.dataset.editing; });
  let arrangeHoverTimer = null;
  let arrangeDismissTimer = null;
  const cancelArrangeHover = () => { clearTimeout(arrangeHoverTimer); arrangeHoverTimer = null; };
  const cancelArrangeDismiss = () => { clearTimeout(arrangeDismissTimer); arrangeDismissTimer = null; };
  const dismissArrange = () => { cancelArrangeHover(); cancelArrangeDismiss(); clearLayoutAssist(); };
  const scheduleArrangeDismiss = () => {
    cancelArrangeDismiss();
    arrangeDismissTimer = setTimeout(dismissArrange, 120);
  };
  const openArrange = () => {
    cancelArrangeHover();
    showLayoutAssist(id, arrangeBtn, { enter: cancelArrangeDismiss, leave: scheduleArrangeDismiss });
  };
  arrangeBtn.addEventListener('mouseenter', () => {
    cancelArrangeDismiss();
    cancelArrangeHover();
    arrangeHoverTimer = setTimeout(openArrange, 300);
  });
  arrangeBtn.addEventListener('mouseleave', () => { cancelArrangeHover(); scheduleArrangeDismiss(); });
  arrangeBtn.onclick = e => { e.stopPropagation(); cancelArrangeDismiss(); openArrange(); };
  window.addEventListener('blur', dismissArrange);
  arrangeBtn.addEventListener('pointerdown', e => e.stopPropagation());
  arrangeBtn.addEventListener('mousedown', e => e.stopPropagation());
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
  const startHeaderDrag = e => {
    if (e.target.closest('.term-actions, button')) return;
    if (e.target.closest('.term-title') && titleEl.dataset.editing === '1') return;
    startPointerDrag(id, headerEl, e);
  };
  headerEl.addEventListener('pointerdown', startHeaderDrag);
  headerEl.addEventListener('mousedown', e => { if (!state.pointerDrag) startHeaderDrag(e); });
  el.querySelectorAll('.window-resize-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => startWindowResize(id, e));
  });

  const term = new Terminal({
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: state.fontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollOnUserInput: false,
    scrollback: 20000,
    linkHandler: { activate: handleTerminalLink },
    overviewRuler: { width: 4 },
    theme: terminalTheme(state.theme)
  });
  const fit = new FitAddon.FitAddon();
  const serialize = window.SerializeAddon ? new SerializeAddon.SerializeAddon() : null;
  term.loadAddon(fit);
  if (serialize) term.loadAddon(serialize);
  term.loadAddon(new WebLinksAddon.WebLinksAddon(handleTerminalLink));
  const termEl = el.querySelector('.terminal');
  term.open(termEl);
  installTerminalWheelScroll(termEl, term, session);
  const dragSelectionCleanup = installTerminalDragSelection(termEl, term, session);

  const ro = new ResizeObserver(() => {
    scheduleTerminalFit({ ids: [id] });
  });
  ro.observe(el.querySelector('.terminal'));
  term.onData(data => {
    clearResponseAttention(id);
    const entry = state.sessions.get(id);
    let clean = sanitizeTerminalInput(data);
    if (isHermesTuiEntry(entry) && /^(?:\x1b\[<6[45];\d+;\d+M)+$/.test(clean)) clean = clean.repeat(HERMES_TUI_WHEEL_MULTIPLIER);
    if (clean && entry?.ws?.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify({ type: 'input', data: clean }));
    }
  });

  const hasSnapshot = hasTerminalSnapshot(id);
  const terminalOwner = declaredTerminalOwner(session);
  state.sessions.set(id, { session, el, term, fit, serialize, ws: null, ro, arrangeCleanup: dismissArrange, dragSelectionCleanup, terminalOwner, terminalMode: isHermesTuiEntry({ session }) ? 'hermes-tui' : terminalOwner, hasSnapshot, attachCount: 0, attachId: '', outputSequence: 0, snapshotTimer: null, outputBuffer: [], outputBufferChars: 0, outputGeneration: 0, pendingReplay: null, pendingReplayCursor: null, pendingReplayAck: '', pendingReplaySocket: null, pendingHermesEvents: [], outputFlushTimer: null, outputWriteInFlight: false, outputFrameHandle: null, outputCancelled: false, titleRefreshTimer: null, titleSource: '', working: false, lastSentCols: 0, lastSentRows: 0 });
  term.onBell?.(() => notifyResponseComplete(id));

  if (state.minimized.has(id)) el.classList.add('minimized');
  const replaceId = opts.replaceId;
  const replaceIndex = replaceId ? state.order.indexOf(replaceId) : -1;
  state.order = state.order.filter(existing => existing !== id && existing !== replaceId);
  if (replaceId && replaceIndex >= 0 && state.sessions.has(replaceId)) {
    state.order.splice(Math.min(replaceIndex, state.order.length), 0, id);
    state.order.push(replaceId);
    state.minimized.add(replaceId);
    state.sessions.get(replaceId)?.el.classList.add('minimized');
    renderSwitcher();
  } else {
    state.order.push(id);
  }
  if (opts.autoPlace) windowPrefs()[id] = defaultWindowRect(Object.keys(windowPrefs()).length);

  const ws = attachSocket(id, term, el);
  state.sessions.get(id).ws = ws;

  updateEmpty();
  renderSwitcher();
  if (state.panePrefs.paneDesktop[id] === state.activeDesktopId) selectPanel(id, { persist: false });
  else applyLayoutVisibility();
  requestAnimationFrame(() => {
    fitAll({ allowHeight: true, scrollBottom: true });
  });
}

function applyPanelOrder() {
  state.order = state.order.filter(id => state.sessions.has(id));
  applyLayoutVisibility();
  renderSwitcher();
  scheduleTerminalFit();
}

function restorePanelOrder() {
  const preferred = state.panePrefs.order.filter(id => state.sessions.has(id));
  const missing = state.order.filter(id => !preferred.includes(id));
  state.order = [...preferred, ...missing];
  applyPanelOrder();
}

function flashPaneExit(el) {
  el.classList.add('flash-exit');
  setTimeout(() => el.classList.remove('flash-exit'), 2000);
}

function playBell(tone = state.responseSoundTone, volume = state.responseSoundVolume) {
  try {
    const level = Math.max(0, Math.min(100, Number(volume) || 0)) / 500;
    if (!level) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      soft: [[660, 0, 0.28, 'sine']],
      ping: [[880, 0, 0.16, 'triangle']],
      chime: [[660, 0, 0.18, 'sine'], [990, 0.12, 0.28, 'sine']]
    }[tone] || [[660, 0, 0.28, 'sine']];
    for (const [frequency, delay, duration, type] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = type;
      gain.gain.setValueAtTime(level, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    }
    setTimeout(() => ctx.close?.(), 500);
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

function handleSocketClose(id, socket, event) {
  const entry = state.sessions.get(id);
  if (!entry || entry.ws !== socket) return;
  if (event.code === 4000) {
    setConnectionStatus(id, 'offline');
    return;
  }
  if (event.code === 4001) {
    discardPanel(id);
    return;
  }
  if (!entry.el.classList.contains('exited')) setConnectionStatus(id, 'reconnecting');
  setTimeout(() => {
    if (state.sessions.get(id)?.ws === socket) reconnect(id);
  }, 1000);
}

function applyTerminalOwner(id, term, owner, mode = owner) {
  const entry = state.sessions.get(id);
  if (!entry || !['viewport', 'application'].includes(owner) || !['viewport', 'application', 'hermes-tui'].includes(mode)) return;
  const previous = entry.terminalOwner;
  const previousMode = entry.terminalMode;
  entry.terminalOwner = owner;
  entry.terminalMode = mode;
  entry.el.classList.toggle('hermes-tui', entry.terminalMode === 'hermes-tui');
  if (previousMode === 'hermes-tui' && mode !== 'hermes-tui') {
    term.__passideckClearDragSelection?.();
    term.clearSelection();
    entry.hermesEventsConnected = false;
    setSessionWorking(id, false);
    clearGeneratedTitle(id, { source: 'hermes-session' });
    entry.pendingHermesEvents = [];
  } else if (mode === 'hermes-tui') {
    scheduleTerminalTitleRefresh(id);
    const pendingHermesEvents = entry.pendingHermesEvents.splice(0);
    for (const message of pendingHermesEvents) applyHermesEvent(id, message);
  }
  if (owner === 'viewport' && previous === 'application' && term.buffer?.active?.type === 'alternate') {
    queueTerminalOutput(id, term, '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l');
  }
}

function hydrateLiveTerminal(id, term) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  const finish = () => requestAnimationFrame(() => {
    if (state.sessions.get(id) !== entry) return;
    try { fitEntry(id, entry, { force: true, allowHeight: true }); } catch {}
    requestTerminalRedraw(entry);
    scheduleTerminalSnapshot(id);
  });
  const firstAttach = entry.attachCount++ === 0;
  if (firstAttach && entry.hasSnapshot && restoreTerminalSnapshot(id, term, finish, entry)) return;
  finish();
}

function hydrateTerminalAttach(id, term, msg, socket) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  const sequence = Number(msg.sequence);
  if (Number.isFinite(sequence)) entry.outputSequence = sequence;
  if (msg.attachId) entry.attachId = String(msg.attachId);
  applyTerminalOwner(id, term, msg.owner, msg.mode);
  if (msg.kind === 'tmux-history') {
    entry.attachCount += 1;
    queueTerminalReplay(id, term, msg.data, { cursorX: msg.cursorX, cursorY: msg.cursorY, attachId: msg.attachId, socket });
    return;
  }
  if (msg.kind === 'live-only' || msg.kind === 'capture-unavailable') {
    hydrateLiveTerminal(id, term);
    return;
  }
  entry.attachCount += 1;
  queueTerminalReplay(id, term, msg.data, { cursorX: msg.cursorX, cursorY: msg.cursorY, attachId: msg.attachId, socket });
}

function attachSocket(id, term, el) {
  const qs = new URLSearchParams({ session: id });
  const token = authToken();
  if (token) qs.set('token', token);
  const ws = new WebSocket(`${WS_BASE}?${qs.toString()}`);
  ws.lastMessageAt = Date.now();
  ws.lastPongAt = 0;
  ws.onmessage = (event) => {
    if (state.sessions.get(id)?.ws !== ws) return;
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    ws.lastMessageAt = Date.now();
    if (msg.type === 'pong') {
      ws.lastPongAt = ws.lastMessageAt;
      if (ws.pingStartedAt) {
        ws.latencyMs = Math.round(ws.lastPongAt - ws.pingStartedAt);
        ws.pingStartedAt = 0;
        if (state.activeId === id) renderBackendLatency();
      }
      return;
    }
    const entry = state.sessions.get(id);
    if (msg.type === 'hermes-event' || msg.type === 'hermes-events') applyHermesEvent(id, msg);
    if (msg.type === 'meta') applySessionMeta(id, msg.session);
    if (msg.type === 'terminal-owner') applyTerminalOwner(id, term, msg.owner, msg.mode);
    if (msg.type === 'replay') hydrateTerminalAttach(id, term, msg, ws);
    if (msg.type === 'output') {
      const sequence = Number(msg.sequence);
      if (!Number.isFinite(sequence) || sequence > entry.outputSequence) {
        if (Number.isFinite(sequence)) entry.outputSequence = sequence;
        queueTerminalOutput(id, term, msg.data);
      }
    }
    if (msg.type === 'exit') {
      el.classList.add('exited');
      setConnectionStatus(id, 'offline');
      flashPaneExit(el);
      playBell();
      notifySessionExit(panelTitle(entry?.session || { id, meta: {} }), msg.exitCode);
      renderSwitcher();
    }
  };
  ws.onopen = () => {
    const entry = state.sessions.get(id);
    if (entry?.ws !== ws) return;
    ws.lastMessageAt = ws.lastPongAt = Date.now();
    setConnectionStatus(id, 'live');
    try { sendSocketPing(entry); } catch {}
    scheduleTerminalFit({ force: true });
  };
  ws.onerror = () => {
    if (state.sessions.get(id)?.ws === ws) setConnectionStatus(id, 'offline');
  };
  ws.onclose = (event) => handleSocketClose(id, ws, event);
  return ws;
}

function reconnect(id, force = false) {
  const entry = state.sessions.get(id);
  if (!entry || entry.el.classList.contains('exited')) return;
  const oldSocket = entry.ws;
  if (!force && oldSocket?.readyState === WebSocket.OPEN) return;
  resetTerminalOutputPipeline(entry);
  entry.ws = attachSocket(id, entry.term, entry.el);
  if (oldSocket && oldSocket !== entry.ws) {
    try { oldSocket.close(4000, 'superseded'); } catch {}
  }
}

function ensureSocketLive(id, entry, now = Date.now()) {
  const socket = entry.ws;
  const age = now - (socket?.lastPongAt || socket?.lastMessageAt || 0);
  if (socket?.readyState === WebSocket.CONNECTING && age <= SOCKET_STALE_MS) return false;
  if (socket?.readyState !== WebSocket.OPEN || age > SOCKET_STALE_MS) {
    reconnect(id, true);
    return false;
  }
  try { sendSocketPing(entry, now); } catch { reconnect(id, true); return false; }
  return true;
}

function sendSocketPing(entry, now = Date.now()) {
  const socket = entry?.ws;
  if (socket?.readyState !== WebSocket.OPEN || socket.pingStartedAt) return false;
  socket.pingStartedAt = now;
  try { socket.send(JSON.stringify({ type: 'ping' })); }
  catch (error) { socket.pingStartedAt = 0; throw error; }
  return true;
}

function probeActiveBackend() {
  if (document.hidden) return;
  const entry = state.sessions.get(state.activeId);
  renderBackendLatency();
  try { sendSocketPing(entry); } catch { if (state.activeId) reconnect(state.activeId, true); }
}

function startLatencyProbes() {
  if (state.latencyProbeTimer) return;
  probeActiveBackend();
  state.latencyProbeTimer = setInterval(probeActiveBackend, LATENCY_PROBE_MS);
}

function checkSocketHealth() {
  if (document.hidden) return;
  const now = Date.now();
  for (const [id, entry] of state.sessions) ensureSocketLive(id, entry, now);
}

function startSocketHeartbeat() {
  if (state.socketHeartbeatTimer) return;
  state.socketHeartbeatTimer = setInterval(checkSocketHealth, SOCKET_HEARTBEAT_MS);
}

function resumeAllPanes(forceReconnect = false) {
  if (document.hidden) return;
  const now = Date.now();
  fitAll({ force: true, allowHeight: true, scrollBottom: true });
  for (const [id, entry] of state.sessions) {
    const visible = state.panePrefs.paneDesktop[id] === state.activeDesktopId && !state.minimized.has(id) && !entry.el.classList.contains('layout-hidden') && entry.el.offsetParent !== null;
    if (visible) {
      try { entry.term.refresh(0, Math.max(0, entry.term.rows - 1)); } catch {}
    }
    if (forceReconnect) {
      reconnect(id, true);
    } else if (ensureSocketLive(id, entry, now) && visible) {
      sendResize(id, entry, true);
      requestTerminalRedraw(entry);
    }
  }
  scheduleTerminalFit({ force: true });
  pollCodexLimits();
  pollSystemMonitor();
}

function scheduleResume(forceReconnect = false) {
  state.resumeForceReconnect ||= forceReconnect;
  clearTimeout(state.resumeTimer);
  state.resumeTimer = setTimeout(() => {
    state.resumeTimer = null;
    const force = state.resumeForceReconnect;
    state.resumeForceReconnect = false;
    resumeAllPanes(force);
  }, 50);
}

function movePaneToDesktop(id, targetDesktopId) {
  const target = state.panePrefs.desktops[targetDesktopId];
  const sourceDesktopId = state.panePrefs.paneDesktop[id];
  const source = state.panePrefs.desktops[sourceDesktopId];
  if (!state.sessions.has(id) || !target || !source || sourceDesktopId === targetDesktopId) return;
  const sourceWindows = windowPrefs(sourceDesktopId);
  const targetWindows = windowPrefs(targetDesktopId);
  const rect = defaultWindowRect(desktopPaneIds(targetDesktopId).length, targetDesktopId);
  const wasActive = state.activeId === id;
  source.minimized = (source.minimized || []).filter(paneId => paneId !== id);
  delete sourceWindows[id];
  target.windows = targetWindows;
  targetWindows[id] = rect;
  target.minimized = (target.minimized || []).filter(paneId => paneId !== id);
  state.panePrefs.paneDesktop[id] = targetDesktopId;
  state.responsiveMinimized.delete(id);
  state.minimized.delete(id);
  if (targetDesktopId === state.activeDesktopId) state.activeId = id;
  else if (wasActive) state.activeId = nextActivePaneId();
  for (const [paneId, entry] of state.sessions) entry.el.classList.toggle('active', paneId === state.activeId);
  applyLayoutVisibility();
  updateEmpty();
  renderSwitcher();
  savePanePrefs();
}

function cancelWindowInteractions() {
  const cancelEvent = { type: 'pointercancel', preventDefault() {} };
  if (state.pointerDrag) endPointerDrag(cancelEvent);
  if (state.resizeDrag) endWindowResize(cancelEvent);
  if (state.sharedResizeDrag) endSharedResize(cancelEvent);
}

function selectDesktop(id) {
  if (!state.panePrefs.desktops[id] || id === state.activeDesktopId) return;
  cancelWindowInteractions();
  const current = activeDesktop();
  current.minimized = persistentMinimizedIds();
  current.windows = windowPrefs();
  if (innerWidth > 900) current.viewport = desktopSize();
  state.activeDesktopId = id;
  const next = activeDesktop();
  state.minimized = new Set((next.minimized || []).filter(paneId => state.sessions.has(paneId)));
  state.responsiveMinimized.clear();
  state.activeId = frontmostDesktopPaneId(id);
  for (const [paneId, entry] of state.sessions) {
    entry.el.classList.toggle('active', paneId === state.activeId);
    entry.el.classList.toggle('minimized', state.minimized.has(paneId));
  }
  saveLocalDesktopView();
  responsiveMinimizeForViewport();
  applyLayoutVisibility();
  updateEmpty();
  renderSwitcher();
  scheduleTerminalFit();
  requestAnimationFrame(() => {
    if (state.activeDesktopId !== id) return;
    for (const paneId of desktopPaneIds(id)) {
      if (state.minimized.has(paneId)) continue;
      const entry = state.sessions.get(paneId);
      if (!entry) continue;
      try {
        fitEntry(paneId, entry, { force: true, allowHeight: true, scrollBottom: true });
        entry.term.refresh(0, Math.max(0, entry.term.rows - 1));
      } catch {}
      requestTerminalRedraw(entry);
    }
  });
}

function createDesktop() {
  if (state.panePrefs.desktopOrder.length >= MAX_DESKTOPS) return;
  const id = crypto.randomUUID?.() || `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  state.panePrefs.desktops[id] = { name: nextDesktopDefaultName(), minimized: [], windows: {}, viewport: null };
  state.panePrefs.desktopOrder.push(id);
  selectDesktop(id);
  savePanePrefs();
}

function performDeleteDesktop(id) {
  if (state.panePrefs.desktopOrder.length <= 1 || !state.panePrefs.desktops[id]) return;
  const paneIds = state.order.filter(paneId => state.panePrefs.paneDesktop[paneId] === id);
  const fallback = state.panePrefs.desktopOrder.find(desktopId => desktopId !== id);
  if (state.activeDesktopId === id) selectDesktop(fallback);
  for (const paneId of paneIds) movePaneToDesktop(paneId, fallback);
  delete state.panePrefs.desktops[id];
  state.panePrefs.desktopOrder = state.panePrefs.desktopOrder.filter(desktopId => desktopId !== id);
  renderSwitcher();
  savePanePrefs();
}

function deleteDesktop(id) {
  if (state.panePrefs.desktopOrder.length <= 1 || !state.panePrefs.desktops[id]) return;
  const paneCount = state.order.filter(paneId => state.panePrefs.paneDesktop[paneId] === id).length;
  const message = paneCount
    ? `${paneCount} window${paneCount === 1 ? '' : 's'} will be moved to another desktop.`
    : 'This desktop will be removed.';
  showConfirmation('Delete desktop?', message, 'Delete', () => performDeleteDesktop(id));
}

function renderDesktops() {
  const switcher = document.getElementById('desktopSwitcher');
  if (!switcher) return;
  const add = document.getElementById('addDesktop');
  if (add) {
    add.disabled = state.panePrefs.desktopOrder.length >= MAX_DESKTOPS;
    setTooltip(add, add.disabled ? `Maximum ${MAX_DESKTOPS} desktops` : 'Add desktop');
  }
  switcher.replaceChildren(...state.panePrefs.desktopOrder.map((id, index) => {
    const attention = state.order.some(paneId => state.panePrefs.paneDesktop[paneId] === id && state.sessions.get(paneId)?.responseAttention);
    const active = id === state.activeDesktopId;
    const ordinal = index + 1;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `desktop-tab${active ? ' active' : ''}${attention ? ' attention' : ''}`;
    tab.dataset.desktopId = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active));
    if (active) tab.setAttribute('aria-current', 'page');
    const shortcut = index < 9 ? `, shortcut Alt Shift ${index + 1}` : '';
    tab.setAttribute('aria-label', `Desktop ${ordinal}${active ? ', current desktop' : ''}${shortcut}${attention ? ', new response' : ''}`);
    if (index < 9) tab.setAttribute('aria-keyshortcuts', `Alt+Shift+${index + 1}`);
    tab.textContent = String(ordinal);
    setTooltip(tab, `Desktop ${ordinal}${index < 9 ? ` · Alt+Shift+${index + 1}` : ''} · Right-click to delete`);
    tab.onclick = () => selectDesktop(id);
    tab.oncontextmenu = event => { event.preventDefault(); deleteDesktop(id); };
    return tab;
  }));
}

function renderSwitcher() {
  renderDesktops();
  state.order = state.order.filter(id => state.sessions.has(id));
  const switcher = document.getElementById('sessionSwitcher');
  if (!switcher) return;
  switcher.replaceChildren();
  for (const id of desktopPaneIds()) {
    const item = state.sessions.get(id);
    if (!item) continue;
    const wrapper = document.createElement('span');
    wrapper.className = 'switcher-item';
    const btn = document.createElement('button');
    btn.className = 'switcher-btn';
    btn.type = 'button';
    if (id === state.activeId) btn.classList.add('active');
    if (state.minimized.has(id)) btn.classList.add('minimized');
    if (id === state.activeId && state.minimized.has(id)) btn.classList.add('active-minimized');
    if (item.session.exited) btn.classList.add('exited');
    if (item.responseAttention) btn.classList.add('response-pulse');
    const title = panelTitle(item.session);
    const action = state.minimized.has(id) ? `Restore ${title}` : id === state.activeId ? `Minimize ${title}` : `Focus ${title}`;
    btn.dataset.switcherPaneId = id;
    btn.setAttribute('aria-label', `${action}${item.responseAttention ? ', new response' : ''}`);
    setTooltip(btn, action);
    btn.innerHTML = '<span class="switcher-title"></span>';
    btn.querySelector('.switcher-title').textContent = title;
    const close = document.createElement('button');
    close.className = 'switcher-close';
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${title}`);
    close.textContent = '×';
    close.onclick = e => { e.preventDefault(); e.stopPropagation(); requestClosePanel(id); };
    const activate = () => {
      clearResponseAttention(id);
      if (state.minimized.has(id)) restorePanel(id);
      else if (id === state.activeId) minimizePanel(id);
      else selectPanel(id);
    };
    btn.onclick = activate;
    wrapper.append(btn, close);
    switcher.appendChild(wrapper);
  }
}

function syncTerminalInputFocus(hasDocumentFocus = document.hasFocus()) {
  document.querySelectorAll('.term-panel.input-focused').forEach(panel => panel.classList.remove('input-focused'));
  if (!hasDocumentFocus || document.hidden) return;
  const entry = state.sessions.get(state.activeId);
  const focused = document.activeElement;
  if (entry?.el.contains(focused) && focused?.closest?.('.xterm')) entry.el.classList.add('input-focused');
}

function focusActiveTerminalOnWindowActivation() {
  const entry = state.sessions.get(state.activeId);
  if (document.hidden || document.getElementById('closeModal')?.classList.contains('open') || !entry || state.minimized.has(entry.session.id) || entry.el.classList.contains('layout-hidden')) {
    syncTerminalInputFocus();
    return;
  }
  entry.term.focus();
  syncTerminalInputFocus(true);
}

function selectPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry || state.panePrefs.paneDesktop[id] !== state.activeDesktopId) return;
  state.activeId = id;
  renderBackendLatency();
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('active'));
  entry.el.classList.add('active');
  applyLayoutVisibility();
  if (!state.minimized.has(id)) bringWindowToFront(id, { persist: false });
  entry.term.focus();
  syncTerminalInputFocus();
  scheduleTerminalFit();
  renderSwitcher();
  if (opts.persist !== false) saveUiState();
}

function discardPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (entry) {
    entry.outputCancelled = true;
    resetTerminalOutputPipeline(entry);
    try { entry.ro.disconnect(); } catch {}
    entry.dragSelectionCleanup?.();
    try { entry.ws.close(); } catch {}
    try { entry.term.dispose(); } catch {}
    window.removeEventListener('blur', entry.arrangeCleanup);
    clearTimeout(entry.snapshotTimer);
    clearTimeout(entry.titleRefreshTimer);
    try { localStorage.removeItem(snapshotKey(id)); } catch {}
    entry.el.remove();
    state.sessions.delete(id);
    state.order = state.order.filter(existing => existing !== id);
  }
  delete state.panePrefs.paneDesktop[id];
  for (const desktop of Object.values(state.panePrefs.desktops)) {
    desktop.minimized = (desktop.minimized || []).filter(paneId => paneId !== id);
    if (desktop.windows) delete desktop.windows[id];
  }
  state.responsiveMinimized.delete(id);
  state.minimized.delete(id);
  if (state.activeId === id) {
    state.activeId = nextActivePaneId();
    if (state.activeId && state.responsiveMinimized.delete(state.activeId)) {
      state.minimized.delete(state.activeId);
      state.sessions.get(state.activeId)?.el.classList.remove('minimized');
    }
  }
  updateEmpty();
  renderSwitcher();
  if (state.activeId) selectPanel(state.activeId, { persist: false });
  responsiveMinimizeForViewport();
  applyLayoutVisibility();
  if (opts.persist !== false) savePanePrefs();
}

async function closePanel(id) {
  try {
    await api('DELETE', `/api/sessions/${id}`);
  } catch (err) {
    showToast(`Close failed: ${err.message}`, 'error');
    return false;
  }
  discardPanel(id);
  return true;
}

async function launch(command) {
  if (state.launchBusy) return;
  state.launchBusy = true;
  try {
    const cmd = String(command || '').trim() || '/bin/bash';
    const session = await api('POST', '/api/sessions', { command: cmd, label: cmd });
    state.panePrefs.paneDesktop[session.id] = state.activeDesktopId;
    createPanel(session, { autoPlace: true });
    applyLayoutVisibility();
    savePanePrefs();
  } catch (err) {
    showToast(`Launch failed: ${err.message}`, 'error');
    return null;
  } finally {
    setTimeout(() => { state.launchBusy = false; }, 250);
  }
}

function activeTerminalEntry() {
  const id = state.activeId || state.order[0];
  return id ? state.sessions.get(id) : null;
}

function terminalEntryForTarget(target) {
  const panel = target?.closest?.('.term-panel');
  return panel ? state.sessions.get(panel.dataset.paneId) : null;
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (window.passideckDesktop?.copyText) return Boolean(await window.passideckDesktop.copyText(text));
  const previousFocus = document.activeElement;
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.readOnly = true;
  helper.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(helper);
  helper.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  helper.remove();
  previousFocus?.focus?.({ preventScroll: true });
  return copied;
}

function terminalLinkUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

async function handleTerminalLink(_event, value) {
  const url = terminalLinkUrl(value);
  if (!url) return false;
  let opened = false;
  try {
    if (window.passideckDesktop?.openExternal) {
      opened = Boolean(await window.passideckDesktop.openExternal(url));
    } else {
      const openedWindow = window.open('about:blank', '_blank');
      if (openedWindow) {
        try {
          openedWindow.opener = null;
          openedWindow.location.replace(url);
          opened = true;
        } catch {
          try { openedWindow.close(); } catch {}
        }
      }
    }
  } catch {}
  if (opened) return true;
  const copied = await copyTextToClipboard(url);
  if (copied) showToast('Link copied');
  else showToast('Could not open or copy link', 'error');
  return false;
}

function clearCopiedSelection(entry) {
  if (entry?.term) {
    entry.term.clearSelection();
    entry.term.__passideckResumeMouse?.();
  }
  window.getSelection?.()?.removeAllRanges();
}

function clearHermesTuiSelection(entry) {
  if (!isHermesTuiEntry(entry) || entry.ws?.readyState !== WebSocket.OPEN) return;
  entry.ws.send(JSON.stringify({ type: 'input', data: '\x1b' }));
}

async function copyTerminalSelection(entry) {
  const text = entry?.term?.getSelection?.() || '';
  if (!text || !await copyTextToClipboard(text)) return false;
  clearCopiedSelection(entry);
  clearHermesTuiSelection(entry);
  return true;
}

function handleTerminalCopyShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  const copyModifier = event.metaKey || (event.ctrlKey && event.shiftKey);
  if (key !== 'c' || !copyModifier || event.altKey) return;
  const terminalTarget = event.target?.closest?.('.terminal, .xterm');
  const entry = terminalTarget ? terminalEntryForTarget(terminalTarget) : null;
  if (!entry?.term?.getSelection?.()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void copyTerminalSelection(entry);
}

async function handleTerminalContextMenu(event) {
  const terminalTarget = event.target?.closest?.('.terminal, .xterm');
  const entry = terminalTarget ? terminalEntryForTarget(terminalTarget) : null;
  if (!entry || !entry.term?.getSelection?.()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await copyTerminalSelection(entry);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function isHermesEntry(entry) {
  const meta = entry?.session?.meta || {};
  return /\bhermes\b/i.test(String(meta.command || meta.label || ''));
}

function isHermesTuiEntry(entry) {
  if (entry?.terminalMode) return entry.terminalMode === 'hermes-tui';
  const meta = entry?.session?.meta || {};
  return isHermesEntry(entry) && /\s--tui\b/i.test(String(meta.command || meta.label || ''));
}

function uploadInsertion(upload, entry) {
  const path = upload?.path || '';
  if (String(upload?.type || '').startsWith('image/') && isHermesTuiEntry(entry)) return `\x01/image ${path}\r`;
  return `\x1b[200~${String(path).replace(/\x1b/g, '')} \x1b[201~`;
}

function sendUploadToEntry(entry, upload) {
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN) throw new Error('active terminal is offline');
  entry.ws.send(JSON.stringify({ type: 'input', data: uploadInsertion(upload, entry) }));
  entry.term.focus();
}

async function uploadFile(file, targetId = state.activeId) {
  if (!file) return null;
  const data = await readFileAsDataUrl(file);
  const upload = await api('POST', '/api/uploads', { name: file.name, type: file.type || 'application/octet-stream', data });
  sendUploadToEntry(state.sessions.get(targetId), upload);
  return upload;
}

async function uploadFiles(files, targetId = state.activeId) {
  if (state.uploadBusy || !files?.length) return;
  state.uploadBusy = true;
  try {
    for (const file of files) await uploadFile(file, targetId);
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error');
  } finally {
    state.uploadBusy = false;
  }
}

function clipboardFiles(data) {
  const files = [...(data?.files || [])];
  if (files.length) return files;
  for (const item of data?.items || []) {
    const file = item.kind === 'file' ? item.getAsFile() : null;
    if (file) files.push(file);
  }
  return files;
}

async function uploadDesktopClipboardImage(targetId) {
  try {
    const data = await window.passideckDesktop?.readImage?.();
    if (!data) return;
    const blob = await (await fetch(data)).blob();
    if (!blob.size) return;
    await uploadFiles([new File([blob], 'clipboard.png', { type: blob.type || 'image/png' })], targetId);
  } catch (err) {
    showToast(`Clipboard image failed: ${err.message}`, 'error');
  }
}

function bracketedPastePayload(text) {
  return `\x1b[200~${String(text || '').replace(/\x1b/g, '')}\x1b[201~`;
}

function insertIntoTerminalEntry(entry, text) {
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN || !text) return false;
  entry.ws.send(JSON.stringify({ type: 'input', data: bracketedPastePayload(text) }));
  entry.term.focus();
  return true;
}

function shouldLetBrowserHandlePaste(target) {
  const el = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  if (!el || el.closest('.terminal, .xterm')) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function handleTerminalPaste(event) {
  if (shouldLetBrowserHandlePaste(event.target)) return;
  const files = clipboardFiles(event.clipboardData);
  if (files.length && activeTerminalEntry()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void uploadFiles(files);
    return;
  }
  const text = event.clipboardData?.getData('text/plain');
  if (text && insertIntoTerminalEntry(activeTerminalEntry(), text)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!text && activeTerminalEntry() && window.passideckDesktop?.readImage) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void uploadDesktopClipboardImage(state.activeId);
  }
}

function letBrowserOwnTerminalPasteShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  if (key !== 'v' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
  const target = event.target?.nodeType === Node.ELEMENT_NODE ? event.target : event.target?.parentElement;
  if (!target?.closest('.terminal, .xterm')) return;
  // xterm would consume Ctrl+V as raw ^V. Keep browser default so it emits paste.
  event.stopImmediatePropagation();
}


function handleUploadDragOver(event) {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function handleUploadDrop(event) {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const panel = event.target?.closest?.('.term-panel');
  const targetId = panel?.dataset?.paneId || state.activeId;
  if (panel) selectPanel(targetId, { persist: false });
  void uploadFiles([...event.dataTransfer.files], targetId);
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

async function updateVersionFooter(health) {
  if (health?.version) document.getElementById('passideckVersion').textContent = `PassiDeck ${health.version}`;
  const desktopVersion = await Promise.resolve(window.passideckDesktop?.getAppVersion?.()).catch(() => null);
  if (!desktopVersion) return;
  const appVersion = document.getElementById('desktopAppVersion');
  appVersion.textContent = `Desktop app ${desktopVersion}`;
  appVersion.hidden = false;
}

async function init() {
  installTooltips();
  loadResponseSoundPrefs();
  state.hydrating = true;
  const [sessions, ui, health, settings] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null),
    api('GET', '/api/health').catch(() => null),
    api('GET', '/api/settings').catch(() => null)
  ]);
  void updateVersionFooter(health);
  applyDynamicTitleSettings(settings);
  loadPerformanceMode(ui?.performanceMode);

  state.uiRevision = Number(ui?.revision) || 0;
  state.lastUiState = ui ? structuredClone(ui) : null;
  loadPanePrefs(ui?.panePrefs || {});
  setTheme(ui?.theme || 'green', { persist: false });
  setSkin(ui?.skin || 'neon', { persist: false });
  setFontSize(ui?.fontSize || state.fontSize, { persist: false });
  setNotifyBlinking(ui?.notifyBlinking !== false, { persist: false });
  setChromeHidden(Boolean(ui?.chromeHidden), { persist: false, resize: false });
  setSystemMonitorVisible(Boolean(ui?.systemMonitor), { persist: false });
  startCodexLimitsPolling();
  installCloseHitLayer();
  sessions.forEach(createPanel);
  restorePanelOrder();

  scheduleTerminalFit();

  state.minimized = new Set((activeDesktop().minimized || []).filter(id => state.sessions.has(id)));
  state.minimized.forEach(id => state.sessions.get(id)?.el.classList.add('minimized'));
  responsiveMinimizeForViewport();
  applyLayoutVisibility();

  const firstDesktopPane = desktopPaneIds().find(id => !state.minimized.has(id));
  if (!selectAuthoritativePane(ui?.activeId) && firstDesktopPane) selectPanel(firstDesktopPane, { persist: false });
  updateEmpty();
  renderSwitcher();
  state.hydrating = false;
  const draft = readUiDraft();
  if (draft) {
    const remote = ui || draft.base;
    const reconciled = mergeUiChanges(draft.base, draft.local, remote);
    reconciled.revision = Number(remote.revision) || 0;
    applyAuthoritativeUiState(reconciled, { force: true, baseline: remote });
    saveUiState();
  }
  connectUiEvents();
  startSocketHeartbeat();
  startLatencyProbes();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

document.querySelectorAll('[data-command]').forEach(btn => btn.onclick = () => launch(btn.dataset.command));
document.getElementById('addDesktop').onclick = createDesktop;
function setSettingsOpen(open, restoreFocus = false) {
  const panel = document.getElementById('settingsPanel');
  const toggle = document.getElementById('settingsToggle');
  panel.hidden = !open;
  panel.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => document.getElementById('themeSelect')?.focus(), 0);
  else if (restoreFocus) setTimeout(() => toggle.focus(), 0);
}
document.getElementById('settingsToggle').onclick = () => setSettingsOpen(document.getElementById('settingsPanel').hidden);
document.getElementById('settingsClose').onclick = () => setSettingsOpen(false, true);
function setCompactMenuOpen(menu, open) {
  menu.classList.toggle('open', open);
  menu.querySelector(':scope > .compact-menu-toggle')?.setAttribute('aria-expanded', String(open));
}
document.addEventListener('pointerdown', event => {
  const panel = document.getElementById('settingsPanel');
  const toggle = document.getElementById('settingsToggle');
  if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) setSettingsOpen(false);
  document.querySelectorAll('.compact-menu.open').forEach(menu => { if (!menu.contains(event.target)) setCompactMenuOpen(menu, false); });
}, true);
document.querySelectorAll('.compact-menu-toggle').forEach(toggle => toggle.onclick = () => {
  const menu = toggle.closest('.compact-menu');
  const open = !menu.classList.contains('open');
  document.querySelectorAll('.compact-menu.open').forEach(other => setCompactMenuOpen(other, false));
  setCompactMenuOpen(menu, open);
});
document.querySelectorAll('.compact-menu').forEach(menu => menu.addEventListener('click', event => {
  if (event.target.closest('button:not(.compact-menu-toggle)')) setCompactMenuOpen(menu, false);
}));
document.getElementById('uploadFileBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = event => {
  void uploadFiles([...event.target.files]);
  event.target.value = '';
};
document.getElementById('clipboardImageBtn').onclick = () => {
  activeTerminalEntry()?.term.focus();
  showToast('Press Ctrl+V to paste an image');
};
document.getElementById('chromeToggle').onclick = toggleChrome;
document.getElementById('chromePeek').onclick = toggleChrome;
document.getElementById('themeSelect').onchange = e => setTheme(e.target.value);
document.getElementById('skinSelect').onchange = e => setSkin(e.target.value);
document.getElementById('dynamicTitleSelect').onchange = e => { void saveDynamicTitleSetting(e.target.value === 'on'); };
document.getElementById('fontSizeSelect').onchange = e => previewFontSize(Number(e.target.value));
document.getElementById('notifyBlinkingSelect').onchange = e => setNotifyBlinking(e.target.value === 'on');
document.getElementById('performanceModeSelect').onchange = e => setPerformanceMode(e.target.value === 'on');
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || event.key !== PERFORMANCE_MODE_KEY) return;
  setPerformanceMode(event.newValue === 'on', { persist: false });
});
document.getElementById('responseSoundModeSelect').onchange = e => setResponseSoundMode(e.target.value);
document.getElementById('responseSoundToneSelect').onchange = e => setResponseSoundTone(e.target.value);
document.getElementById('responseSoundVolume').oninput = e => setResponseSoundVolume(e.target.value);
document.getElementById('responseSoundTest').onclick = () => playBell(state.responseSoundTone, state.responseSoundVolume);
document.getElementById('systemMonitorToggle').onchange = e => setSystemMonitorVisible(e.target.checked);

// ── PassiDeck Confirmation Modal ──
let closeConfirmSessionId = null;
let closeModalOpenedAt = 0;
let closeModalReturnFocus = null;
let confirmationAction = null;
function showConfirmation(title, text, confirmLabel, action) {
  const modal = document.getElementById('closeModal');
  closeModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById('closeModalTitle').textContent = title;
  document.getElementById('closeModalText').textContent = text;
  document.getElementById('closeModalConfirm').textContent = confirmLabel;
  confirmationAction = action;

  // Do not rely on the native hidden repaint path here.
  // In full grids some browsers defer that paint until the next layout change.
  modal.hidden = false;
  modal.removeAttribute('hidden');
  modal.classList.add('open');
  modal.style.display = 'flex';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  closeModalOpenedAt = Date.now();
  void modal.offsetHeight; // force style/layout flush now

  setTimeout(() => document.getElementById('closeModalConfirm')?.focus(), 0);
}
function showCloseConfirm(sessionId, title) {
  closeConfirmSessionId = sessionId;
  showConfirmation(`${title} — really close?`, 'Process will be terminated.', 'Close', () => closePanel(sessionId));
}
function hideCloseConfirm() {
  const modal = document.getElementById('closeModal');
  modal.classList.remove('open');
  modal.style.display = 'none';
  modal.hidden = true;
  closeConfirmSessionId = null;
  confirmationAction = null;
  const returnFocus = closeModalReturnFocus;
  closeModalReturnFocus = null;
  if (returnFocus?.isConnected) setTimeout(() => returnFocus.focus?.(), 0);
}

function handleCloseModalKeydown(e) {
  const modal = document.getElementById('closeModal');
  if (!modal?.classList.contains('open')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    hideCloseConfirm();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopImmediatePropagation();
    runCloseConfirm();
    return;
  }
  if (e.key !== 'Tab') return;
  const focusables = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
function runCloseConfirm() {
  const action = confirmationAction;
  if (typeof action !== 'function') return;
  hideCloseConfirm();
  action();
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

document.addEventListener('keydown', handleCloseModalKeydown, true);
document.addEventListener('keydown', letBrowserOwnTerminalPasteShortcut, true);
document.addEventListener('keydown', handleTerminalCopyShortcut, true);
document.addEventListener('paste', handleTerminalPaste, true);
document.addEventListener('contextmenu', handleTerminalContextMenu, true);
document.addEventListener('dragover', handleUploadDragOver, true);
document.addEventListener('drop', handleUploadDrop, true);
window.addEventListener('focus', () => {
  requestAnimationFrame(focusActiveTerminalOnWindowActivation);
  scheduleResume();
});
window.addEventListener('online', () => scheduleResume(true));
window.addEventListener('pageshow', () => scheduleResume());
window.addEventListener('blur', () => { syncTerminalInputFocus(false); clearLayoutAssist(); cancelWindowInteractions(); });
document.documentElement.addEventListener('mouseleave', clearLayoutAssist);
document.addEventListener('focusin', () => syncTerminalInputFocus());
document.addEventListener('focusout', () => queueMicrotask(() => syncTerminalInputFocus()));
window.addEventListener('resize', () => { responsiveMinimizeForViewport(); applyLayoutVisibility(); scheduleTerminalFit(); });
window.addEventListener('beforeunload', saveAllTerminalSnapshots);
window.addEventListener('pagehide', flushUiState);
document.addEventListener('visibilitychange', () => {
  syncTerminalInputFocus();
  if (document.hidden) saveAllTerminalSnapshots();
  else scheduleResume();
});
function handleDesktopShortcut(e) {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
  const target = e.target?.nodeType === Node.ELEMENT_NODE ? e.target : null;
  if (target?.matches?.('input, select, textarea, [contenteditable="true"]') && !target.closest('.xterm')) return;
  let id = null;
  const digit = /^Digit([1-9])$/.exec(e.code || '');
  if (digit) id = state.panePrefs.desktopOrder[Number(digit[1]) - 1];
  else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    const order = state.panePrefs.desktopOrder;
    const current = Math.max(0, order.indexOf(state.activeDesktopId));
    const delta = e.code === 'ArrowLeft' ? -1 : 1;
    id = order[(current + delta + order.length) % order.length];
  }
  if (!id) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  selectDesktop(id);
}
document.addEventListener('keydown', handleDesktopShortcut, true);
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    const settingsPanel = document.getElementById('settingsPanel');
    if (!settingsPanel.hidden) {
      e.preventDefault();
      setSettingsOpen(false, true);
    }
  }
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const id = state.order[Number(e.key) - 1];
    if (id) state.minimized.has(id) ? restorePanel(id) : selectPanel(id);
  }
  if (e.altKey && e.key === '0') {
    e.preventDefault();
    toggleChrome();
  }
  if (e.ctrlKey && e.shiftKey && key === 'n') {
    e.preventDefault();
    launch('/bin/bash');
  }
});

async function ensureSerializeAddon() {
  if (window.SerializeAddon) return;
  const res = await fetch('vendor/addon-serialize.js');
  const code = await res.text();
  Function(code).call(window);
}

installDesktopWindowResizeHandles();
ensureSerializeAddon().then(init).catch(err => {
  console.error(err);
  document.getElementById('emptyState').innerHTML = '<h2>PassiDeck error.</h2><p>Check console.</p>';
});
