const API = window.location.origin;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;
const AUTH_TOKEN_KEY = 'passideck:auth-token';

function authToken() {
  const urlToken = new URLSearchParams(window.location.search).get('token') || '';
  if (urlToken) {
    try { sessionStorage.setItem(AUTH_TOKEN_KEY, urlToken); } catch {}
    return urlToken;
  }
  try { return sessionStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

function authQuery() {
  const token = authToken();
  return token ? `token=${encodeURIComponent(token)}` : '';
}

const LEGACY_LAYOUTS = new Set(['auto', '1x1', '2x1', '3x1', '4x1', '1x2', '1x3', '1x4']);
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
  skin: 'neon',
  fontSize: 13,
  minimized: new Set(),
  saveTimer: null,
  launchBusy: false,
  uploadBusy: false,
  clipboardPasteArmed: false,
  clipboardPasteTimer: null,
  systemMonitorTimer: null,
  codexLimitsTimer: null,
  fitFrame: null,
  fitTimer: null,
  fitTimerLate: null,
  pointerDrag: null,
  resizeDrag: null,
  sharedResizeDrag: null,
  zCounter: 10,
  hydrating: false,
  panePrefs: { titles: {}, order: [], windows: {} },
  saveState: 'saved'
};

const SERVER_STATE_ONLY = true;
const TERM_SNAPSHOT_PREFIX = 'passideck:term-snapshot:v1:';
const TERM_SNAPSHOT_MAX_LINES = 20000;
const TERM_SNAPSHOT_MAX_CHARS = 1024 * 1024;

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
  document.addEventListener('pointermove', e => {
    const target = e.target.closest?.('[data-tooltip]');
    if (target && !document.getElementById('appTooltip')?.hidden) placeTooltip(target);
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

function setConnectionStatus(id, status) {
  const entry = state.sessions.get(id);
  const el = entry?.el || document.getElementById(`panel-${id}`);
  if (!el) return;
  el.dataset.connectionStatus = status;
  const dot = el.querySelector('.connection-dot');
  if (dot) {
    const labels = { live: 'Connected', reconnecting: 'Reconnecting', offline: 'Offline' };
    const label = labels[status] || status;
    setTooltip(dot, label);
    dot.setAttribute('aria-label', label);
  }
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
  const token = authToken();
  if (token) opts.headers['X-PassiDeck-Token'] = token;
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


function slotKey(layout = state.layout) {
  return 'desktop';
}

function windowPrefs() {
  state.panePrefs.windows = state.panePrefs.windows && typeof state.panePrefs.windows === 'object' ? state.panePrefs.windows : {};
  state.panePrefs.windows[slotKey()] = state.panePrefs.windows[slotKey()] || {};
  return state.panePrefs.windows[slotKey()];
}

function desktopSize() {
  const r = document.getElementById('termGrid')?.getBoundingClientRect?.() || { width: window.innerWidth || 1280, height: window.innerHeight || 720 };
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
}

function scaleWindowPrefsToViewport() {
  const old = state.panePrefs.viewport;
  const now = desktopSize();
  const prefs = windowPrefs();
  if (old?.w > 0 && old?.h > 0 && (Math.abs(old.w - now.w) > 2 || Math.abs(old.h - now.h) > 2)) {
    const sx = now.w / old.w;
    const sy = now.h / old.h;
    for (const p of Object.values(prefs)) {
      p.x *= sx; p.y *= sy; p.w *= sx; p.h *= sy;
    }
  }
  clampWindowPrefs(prefs);
  state.panePrefs.viewport = now;
}

function responsiveMinimizeForViewport() {
  const { w, h } = desktopSize();
  if (w >= 720 && h >= 420) return;
  const keep = state.activeId && state.sessions.has(state.activeId) ? state.activeId : state.order.find(id => state.sessions.has(id));
  for (const id of state.order) {
    if (id !== keep && state.sessions.has(id)) {
      state.minimized.add(id);
      state.sessions.get(id)?.el.classList.add('minimized');
    }
  }
}

function desktopWindowIds() {
  return new Set(Object.keys(windowPrefs()).filter(id => state.sessions.has(id) && !state.minimized.has(id)));
}

function rectOverlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function occupiedWindowRects(excludeId = null) {
  const prefs = windowPrefs();
  return Object.entries(prefs)
    .filter(([id]) => id !== excludeId && state.sessions.has(id) && !state.minimized.has(id))
    .map(([, r]) => r);
}

function desktopCandidates() {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const W = r.width, H = r.height;
  const q = [
    { x: W / 2, y: 0, w: W / 2, h: H },
    { x: 0, y: 0, w: W / 2, h: H },
    { x: 0, y: H / 2, w: W, h: H / 2 },
    { x: 0, y: 0, w: W, h: H / 2 },
    { x: W / 2, y: 0, w: W / 2, h: H / 2 },
    { x: 0, y: H / 2, w: W / 2, h: H / 2 },
    { x: W / 2, y: H / 2, w: W / 2, h: H / 2 },
    { x: 0, y: 0, w: W / 2, h: H / 2 }
  ];
  return q;
}

function freeSpaceWindowRect(id = null) {
  const occupied = occupiedWindowRects(id);
  for (const c of desktopCandidates()) {
    const area = c.w * c.h;
    const overlap = occupied.reduce((sum, r) => sum + rectOverlap(c, r), 0);
    if (overlap / Math.max(1, area) < 0.08) return { ...c, z: nextWindowZ() };
  }
  return null;
}


function nextWindowZ() {
  const vals = Object.values(windowPrefs()).map(r => Number(r.z) || 0).filter(v => v > 0 && v < 10000);
  state.zCounter = Math.max(state.zCounter || 10, ...vals, 10) + 1;
  return state.zCounter;
}

function defaultWindowRect(index = 0) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const free = freeSpaceWindowRect();
  if (free) return free;
  const { w, h } = defaultWindowSize();
  const offset = (index % 8) * 34;
  return {
    x: Math.max(0, Math.min(r.width - 120, 24 + offset)),
    y: Math.max(0, Math.min(r.height - 80, 24 + offset)),
    w,
    h,
    z: nextWindowZ()
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

function clampWindowPrefs(prefs = windowPrefs()) {
  for (const [id, rect] of Object.entries(prefs)) {
    prefs[id] = clampWindowRect(rect);
  }
  return prefs;
}

function applyFreeWindow(id) {
  const entry = state.sessions.get(id);
  const p = windowPrefs()[id];
  if (!entry || !p) return;
  const rect = clampWindowRect(p);
  Object.assign(p, rect);
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

function bringWindowToFront(id) {
  const p = ensureFreeWindow(id);
  if (!p) return;
  p.z = nextWindowZ();
  applyFreeWindow(id);
  savePanePrefs();
}

function clearSnapSuggestions() {
  document.getElementById('snapSuggestions')?.remove();
}

function clearDesktopSlotSuggestions() {
  document.getElementById('desktopSlotSuggestions')?.remove();
  document.querySelectorAll('.term-panel.slot-swap-target').forEach(el => el.classList.remove('slot-swap-target'));
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

function renderSharedResizeHandles() {
  const grid = document.getElementById('termGrid');
  if (!grid || state.pointerDrag || state.resizeDrag || state.sharedResizeDrag) return;
  clearSharedResizeHandles();
  const groups = sharedResizeGroups();
  if (!groups.length) return;
  const wrap = document.createElement('section');
  wrap.id = 'sharedResizeHandles';
  wrap.className = 'shared-resize-handles';
  for (const group of groups) {
    const handle = document.createElement('div');
    handle.className = `shared-resize-handle ${group.axis}`;
    handle.setAttribute('aria-hidden', 'true');
    if (group.axis === 'vertical') {
      handle.style.left = `${group.pos - 5}px`;
      handle.style.top = `${group.start}px`;
      handle.style.width = '10px';
      handle.style.height = `${group.end - group.start}px`;
    } else {
      handle.style.left = `${group.start}px`;
      handle.style.top = `${group.pos - 5}px`;
      handle.style.width = `${group.end - group.start}px`;
      handle.style.height = '10px';
    }
    handle.addEventListener('pointerdown', e => startSharedResize(group, e));
    wrap.appendChild(handle);
  }
  grid.appendChild(wrap);
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

function slotRectsForDrag(sourceId) {
  const prefs = windowPrefs();
  const occupied = state.order
    .filter(id => id !== sourceId && state.sessions.has(id) && !state.minimized.has(id) && prefs[id])
    .map(id => ({ id, rect: { x: prefs[id].x, y: prefs[id].y, w: prefs[id].w, h: prefs[id].h } }));
  const candidates = [...desktopGapSlotRects(occupied), ...desktopGridSlotRects(visibleWindowIds().length + 1), ...desktopCandidates()];
  const free = [];
  for (const c of candidates) {
    const area = c.w * c.h;
    if (area < 300 * 190) continue;
    const overlap = occupied.reduce((sum, o) => sum + rectOverlap(c, o.rect), 0);
    if (overlap / Math.max(1, area) > 0.12) continue;
    const rect = { ...c };
    if (!free.some(existing => similarRect(existing.rect, rect))) free.push({ id: `free-${free.length}`, rect });
  }
  return { free, occupied };
}

function desktopGapSlotRects(occupied) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const xs = [0, r.width];
  const ys = [0, r.height];
  for (const o of occupied) {
    const a = o.rect;
    xs.push(Math.max(0, Math.min(r.width, a.x)), Math.max(0, Math.min(r.width, a.x + a.w)));
    ys.push(Math.max(0, Math.min(r.height, a.y)), Math.max(0, Math.min(r.height, a.y + a.h)));
  }
  const ux = [...new Set(xs.map(v => Math.round(v)))].sort((a, b) => a - b);
  const uy = [...new Set(ys.map(v => Math.round(v)))].sort((a, b) => a - b);
  const rects = [];
  for (let yi = 0; yi < uy.length - 1; yi += 1) {
    for (let xi = 0; xi < ux.length - 1; xi += 1) {
      const c = { x: ux[xi], y: uy[yi], w: ux[xi + 1] - ux[xi], h: uy[yi + 1] - uy[yi] };
      if (c.w < 300 || c.h < 190) continue;
      const overlap = occupied.reduce((sum, o) => sum + rectOverlap(c, o.rect), 0);
      if (overlap / Math.max(1, c.w * c.h) <= 0.02) rects.push(c);
    }
  }
  return rects.sort((a, b) => (b.w * b.h) - (a.w * a.h));
}

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function pointInCenter(px, py, rect) {
  return px >= rect.x + rect.w * 0.25 && px <= rect.x + rect.w * 0.75 && py >= rect.y + rect.h * 0.25 && py <= rect.y + rect.h * 0.75;
}

function chooseDesktopSlotAt(x, y, sourceId) {
  const grid = document.getElementById('termGrid');
  const gr = grid?.getBoundingClientRect?.();
  if (!gr) return null;
  const px = x - gr.left;
  const py = y - gr.top;
  const slots = slotRectsForDrag(sourceId);
  const swap = slots.occupied.find(slot => pointInCenter(px, py, slot.rect));
  if (swap) return { type: 'swap', targetId: swap.id, rect: swap.rect, slots };
  const free = slots.free.find(slot => pointInRect(px, py, slot.rect));
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
  wrap.innerHTML = '';
  const activeFree = result.type === 'free' ? result.rect : null;
  for (const slot of slots.free) {
    const el = document.createElement('div');
    el.className = `desktop-slot free${activeFree && similarRect(activeFree, slot.rect) ? ' active' : ''}`;
    el.style.left = `${slot.rect.x}px`;
    el.style.top = `${slot.rect.y}px`;
    el.style.width = `${slot.rect.w}px`;
    el.style.height = `${slot.rect.h}px`;
    el.innerHTML = '<span>Frei</span>';
    wrap.appendChild(el);
  }
  document.querySelectorAll('.term-panel.slot-swap-target').forEach(el => el.classList.remove('slot-swap-target'));
  if (result.type === 'swap') document.getElementById(`panel-${result.targetId}`)?.classList.add('slot-swap-target');
}

function applyFreeSlotSnap(id, rect) {
  const prefs = windowPrefs();
  const p = ensureFreeWindow(id);
  if (!p) return;
  Object.assign(prefs[id], { x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: p.z || nextWindowZ() });
  applyFreeWindow(id);
}

function swapWindowSlots(sourceId, targetId, sourceSlotRect = null) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const prefs = windowPrefs();
  const source = ensureFreeWindow(sourceId);
  const target = ensureFreeWindow(targetId);
  if (!source || !target) return;
  const sourceRect = sourceSlotRect || { x: source.x, y: source.y, w: source.w, h: source.h };
  const targetRect = { x: target.x, y: target.y, w: target.w, h: target.h };
  Object.assign(prefs[sourceId], { ...targetRect, z: nextWindowZ() });
  Object.assign(prefs[targetId], { ...sourceRect, z: Math.max(1, (prefs[sourceId].z || 10) - 1) });
  const si = state.order.indexOf(sourceId);
  const ti = state.order.indexOf(targetId);
  if (si >= 0 && ti >= 0) [state.order[si], state.order[ti]] = [state.order[ti], state.order[si]];
  applyFreeWindow(targetId);
  applyFreeWindow(sourceId);
  renderSwitcher();
  renderSharedResizeHandles();
}

function snapSuggestionsAt(x, y) {
  const grid = document.getElementById('termGrid');
  if (!grid) return [];
  const r = grid.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return [];
  const edge = Math.min(42, Math.max(24, Math.min(r.width, r.height) * 0.045));
  const nearLeft = x - r.left <= edge;
  const nearRight = r.right - x <= edge;
  const nearTop = y - r.top <= edge;
  const nearBottom = r.bottom - y <= edge;
  const W = r.width;
  const H = r.height;
  const suggestions = [];
  const add = (key, label, rect) => suggestions.push({ key, label, rect });
  if (nearLeft && nearTop) {
    add('top-left-quarter', 'Top-left quarter', { x: 0, y: 0, w: W / 2, h: H / 2 });
    add('left-half', 'Left half', { x: 0, y: 0, w: W / 2, h: H });
    add('top-half', 'Top half', { x: 0, y: 0, w: W, h: H / 2 });
  } else if (nearRight && nearTop) {
    add('top-right-quarter', 'Top-right quarter', { x: W / 2, y: 0, w: W / 2, h: H / 2 });
    add('right-half', 'Right half', { x: W / 2, y: 0, w: W / 2, h: H });
    add('top-half', 'Top half', { x: 0, y: 0, w: W, h: H / 2 });
  } else if (nearLeft && nearBottom) {
    add('bottom-left-quarter', 'Bottom-left quarter', { x: 0, y: H / 2, w: W / 2, h: H / 2 });
    add('left-half', 'Left half', { x: 0, y: 0, w: W / 2, h: H });
    add('bottom-half', 'Bottom half', { x: 0, y: H / 2, w: W, h: H / 2 });
  } else if (nearRight && nearBottom) {
    add('bottom-right-quarter', 'Bottom-right quarter', { x: W / 2, y: H / 2, w: W / 2, h: H / 2 });
    add('right-half', 'Right half', { x: W / 2, y: 0, w: W / 2, h: H });
    add('bottom-half', 'Bottom half', { x: 0, y: H / 2, w: W, h: H / 2 });
  } else if (nearLeft) add('left-half', 'Left half', { x: 0, y: 0, w: W / 2, h: H });
  else if (nearRight) add('right-half', 'Right half', { x: W / 2, y: 0, w: W / 2, h: H });
  else if (nearTop) add('top-half', 'Top half', { x: 0, y: 0, w: W, h: H / 2 });
  else if (nearBottom) add('bottom-half', 'Bottom half', { x: 0, y: H / 2, w: W, h: H / 2 });
  return suggestions;
}

function showSnapSuggestions(suggestions, activeKey = null) {
  const grid = document.getElementById('termGrid');
  if (!grid || !suggestions.length) { clearSnapSuggestions(); return; }
  let wrap = document.getElementById('snapSuggestions');
  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'snapSuggestions';
    wrap.className = 'snap-suggestions';
    grid.appendChild(wrap);
  }
  wrap.innerHTML = '';
  for (const s of suggestions) {
    const el = document.createElement('div');
    el.className = `snap-choice${s.key === activeKey ? ' active' : ''}`;
    el.dataset.snapKey = s.key;
    el.style.left = `${s.rect.x}px`;
    el.style.top = `${s.rect.y}px`;
    el.style.width = `${s.rect.w}px`;
    el.style.height = `${s.rect.h}px`;
    el.innerHTML = `<span>${s.label}</span>`;
    wrap.appendChild(el);
  }
}

function chooseSnapSuggestionAt(x, y, suggestions) {
  if (!suggestions.length) return null;
  const grid = document.getElementById('termGrid');
  const r = grid.getBoundingClientRect();
  const px = x - r.left;
  const py = y - r.top;
  const containing = suggestions.filter(s => px >= s.rect.x && px <= s.rect.x + s.rect.w && py >= s.rect.y && py <= s.rect.y + s.rect.h);
  if (containing.length) return containing.sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h))[0];
  return suggestions[0];
}

function visibleWindowIds(firstId = null) {
  const ids = state.order.filter(id => state.sessions.has(id) && !state.minimized.has(id));
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

function leftoverRects(used) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const W = r.width, H = r.height;
  return [
    { x: 0, y: 0, w: used.x, h: H },
    { x: used.x + used.w, y: 0, w: W - used.x - used.w, h: H },
    { x: 0, y: 0, w: W, h: used.y },
    { x: 0, y: used.y + used.h, w: W, h: H - used.y - used.h }
  ].filter(a => a.w >= 180 && a.h >= 120).sort((a, b) => b.w * b.h - a.w * a.h);
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

function applySnapSuggestion(id, suggestion) {
  if (!id || !suggestion) return;
  const ids = visibleWindowIds(id);
  const rem = ids.slice(1);
  const rects = [suggestion.rect];
  const left = leftoverRects(suggestion.rect)[0];
  if (left) rects.push(...tileRects(left, rem.length));
  applyRectsToWindows(ids, rects);
}

function layoutProposalRects(key, ids) {
  const grid = document.getElementById('termGrid');
  const r = grid?.getBoundingClientRect?.() || { width: 1280, height: 720 };
  const W = r.width, H = r.height, n = ids.length;
  if (key === 'columns') return tileRects({ x: 0, y: 0, w: W, h: H }, n).map((a, i) => n > 1 ? { ...a, x: i * W / n, y: 0, w: W / n, h: H } : a);
  if (key === 'rows') return Array.from({ length: n }, (_, i) => ({ x: 0, y: i * H / n, w: W, h: H / n }));
  if (key === 'focus-left') return [{ x: 0, y: 0, w: W / 2, h: H }, ...tileRects({ x: W / 2, y: 0, w: W / 2, h: H }, n - 1)];
  if (key === 'focus-top') return [{ x: 0, y: 0, w: W, h: H / 2 }, ...tileRects({ x: 0, y: H / 2, w: W, h: H / 2 }, n - 1)];
  return tileRects({ x: 0, y: 0, w: W, h: H }, n);
}

function layoutProposals(id) {
  const ids = visibleWindowIds(id);
  const base = [
    { key: 'grid', label: 'Grid', ids },
    { key: 'columns', label: 'Spalten', ids },
    { key: 'rows', label: 'Zeilen', ids }
  ];
  if (ids.length > 1) base.push({ key: 'focus-left', label: 'Links + Rest', ids }, { key: 'focus-top', label: 'Oben + Rest', ids });
  return base.map(p => ({ ...p, rects: layoutProposalRects(p.key, p.ids) }));
}

function clearLayoutAssist() {
  document.getElementById('layoutAssist')?.remove();
}

function showLayoutAssist(id, anchor) {
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
  box.addEventListener('mouseleave', () => setTimeout(clearLayoutAssist, 120));
  grid.appendChild(box);
}

function applyLayoutVisibility() {
  const grid = document.getElementById('termGrid');
  const hidden = document.getElementById('hiddenPanes');
  if (!grid || !hidden) return;
  grid.className = 'grid-container layout-desktop';
  grid.dataset.layout = 'desktop';
  grid.dataset.activeLayout = 'desktop';
  grid.style.gridTemplateColumns = '';
  grid.style.gridTemplateRows = '';
  grid.querySelectorAll('.empty-slot, .resize-gutter, .drop-placeholder').forEach(el => el.remove());
  clearSnapSuggestions();
  clearDesktopSlotSuggestions();
  clearSharedResizeHandles();
  clearLayoutAssist();
  for (const id of state.order) {
    const entry = state.sessions.get(id);
    if (!entry) continue;
    if (state.minimized.has(id)) {
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
    minimized: [...state.minimized],
    theme: state.theme,
    skin: state.skin,
    fontSize: state.fontSize,
    chromeHidden: document.body.classList.contains('chrome-hidden'),
    systemMonitor: document.body.classList.contains('system-monitor-on'),
    panePrefs: state.panePrefs
  };
}

function saveUiState() {
  if (state.hydrating) return;
  setSaveState('saving');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => api('PUT', '/api/ui-state', uiPayload()).then(() => setSaveState('saved')).catch(() => setSaveState('offline')), 150);
}

function flushUiState() {
  clearTimeout(state.saveTimer);
  const body = JSON.stringify(uiPayload());
  try {
    navigator.sendBeacon?.('/api/ui-state', new Blob([body], { type: 'application/json' })) || fetch('/api/ui-state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  } catch {}
}
function setLayout(layout, opts = {}) {
  state.layout = 'auto';
  applyLayoutVisibility();
  updateGridPickerActive();
  scheduleTerminalFit();
  if (opts.persist !== false) saveUiState();
}

function buildGridPicker() {
  const container = document.getElementById('gridPickerInline');
  if (!container) return;
  container.innerHTML = '<span class="layout-select-label">Desktop</span>';
}

function updateGridPickerActive() {}

/* ── Font Size ── */
function setFontSize(size, opts = {}) {
  size = Math.max(10, Math.min(24, Number(size) || 13));
  state.fontSize = size;
  for (const [, entry] of state.sessions) {
    try { entry.term.setOption('fontSize', size); } catch {}
  }
  scheduleTerminalFit();
  const slider = document.getElementById('fontSizeSlider');
  const label = document.getElementById('fontSizeLabel');
  if (slider) slider.value = size;
  if (label) label.textContent = `${size}px`;
  if (opts.persist !== false) saveUiState();
}

/* ── Minimize / Restore ── */
function getVisibleCount() {
  return state.order.filter(id => state.sessions.has(id) && !state.minimized.has(id) && !state.sessions.get(id).el.classList.contains('layout-hidden')).length;
}

function smartRestorePanel(id) {
  restorePanel(id);
  bringWindowToFront(id);
}

function minimizePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  entry.el.classList.add('minimized');
  state.minimized.add(id);
  updateMinimizedBar();
  applyLayoutVisibility();
  savePanePrefs();
  scheduleTerminalFit();
}

function restorePanel(id) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  entry.el.classList.remove('minimized');
  state.minimized.delete(id);
  ensureFreeWindow(id);
  updateMinimizedBar();
  applyLayoutVisibility();
  savePanePrefs();
  selectPanel(id, { persist: false });
  // Fit after restore — panel was display:none, needs full resize cycle.
  scheduleTerminalFit();
}

function updateMinimizedBar() {
  const bar = document.getElementById('minimizedBar');
  const tabs = document.getElementById('minimizedTabs');
  if (!bar || !tabs) return;

  if (state.minimized.size === 0) {
    bar.hidden = true;
    tabs.innerHTML = '';
    renderSwitcher();
    return;
  }
  bar.hidden = true;
  tabs.innerHTML = '';
  renderSwitcher();
}

/* ── Close Confirmation ── */
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

function setSkin(skin, opts = {}) {
  if (!['neon', 'stealth', 'prism'].includes(skin)) skin = 'neon';
  state.skin = skin;
  document.body.dataset.skin = skin;
  const select = document.getElementById('skinSelect');
  if (select) select.value = skin;
  if (opts.persist !== false) saveUiState();
}

function setChromeHidden(hidden, opts = {}) {
  document.body.classList.toggle('chrome-hidden', Boolean(hidden));
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

function formatReset(ts) {
  if (!ts) return 'reset unknown';
  const value = typeof ts === 'number' || /^\d+(\.\d+)?$/.test(String(ts))
    ? Number(ts) * 1000
    : ts;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'reset unknown';
  return `reset ${date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
}

function setCodexLimitCell(kind, limit) {
  const cell = document.querySelector(`#codexLimits [data-limit="${kind}"]`);
  if (!cell) return;
  if (!limit) {
    cell.classList.add('unavailable');
    cell.querySelector('b').textContent = '--%';
    setTooltip(cell, `${kind === 'primary' ? 'Codex 5h' : 'Codex weekly'} unavailable`);
    return;
  }
  const used = Math.max(0, Math.min(100, Math.round(Number(limit.usedPercent) || 0)));
  const left = Math.max(0, 100 - used);
  cell.classList.remove('unavailable');
  cell.style.setProperty('--v', `${left}%`);
  cell.querySelector('b').textContent = `${left}%`;
  setTooltip(cell, `${kind === 'primary' ? 'Codex 5h' : 'Codex weekly'}: ${left}% left (${used}% used) · ${formatReset(limit.resetsAt)}`);
}

function updateCodexLimits(data) {
  setCodexLimitCell('primary', data?.primary);
  setCodexLimitCell('secondary', data?.secondary);
  document.getElementById('codexLimits')?.classList.toggle('limit-reached', Boolean(data?.rateLimitReachedType));
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
  const cols = entry.term.cols;
  const rows = entry.term.rows;
  if (!force && entry.lastSentCols === cols && entry.lastSentRows === rows) return;
  entry.lastSentCols = cols;
  entry.lastSentRows = rows;
  const payload = { type: 'resize', cols, rows };
  if (entry.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify(payload));
  else api('POST', `/api/sessions/${id}/resize`, payload).catch(() => {});
}

function fitEntry(id, entry, opts = {}) {
  if (entry.el.classList.contains('layout-hidden') || entry.el.offsetParent === null) return;
  const next = entry.fit.proposeDimensions?.();
  if (!next) { entry.fit.fit(); sendResize(id, entry, opts.force); return; }
  const oldCols = entry.term.cols;
  const oldRows = entry.term.rows;
  const buffer = entry.term.buffer?.active;
  const atBottom = !buffer || buffer.viewportY >= buffer.baseY;
  const cols = Math.max(2, next.cols || oldCols || 80);
  const rows = Math.max(2, next.rows || oldRows || 24);
  const heightOnly = oldCols === cols && oldRows && oldRows !== rows;
  const targetRows = heightOnly && !opts.allowHeight ? oldRows : rows;
  const changed = oldCols !== cols || oldRows !== targetRows;
  if (changed) entry.term.resize(cols, targetRows);
  if ((opts.scrollBottom || atBottom) && changed) entry.term.scrollToBottom?.();
  sendResize(id, entry, opts.force || changed);
}

function fitAll(opts = {}) {
  for (const [id, entry] of state.sessions) {
    try { fitEntry(id, entry, opts); } catch {}
  }
}

function scheduleTerminalFit(opts = {}) {
  const options = { allowHeight: true, scrollBottom: true, ...opts };
  if (state.fitFrame) cancelAnimationFrame(state.fitFrame);
  if (state.fitTimer) clearTimeout(state.fitTimer);
  if (state.fitTimerLate) clearTimeout(state.fitTimerLate);
  state.fitFrame = requestAnimationFrame(() => {
    state.fitFrame = null;
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

function installTerminalTouchScroll(termEl, term) {
  let lastY = 0;
  termEl.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    lastY = e.touches[0].clientY;
  }, { passive: true });
  termEl.addEventListener('touchmove', e => {
    if (e.touches.length !== 1 || state.pointerDrag) return;
    const y = e.touches[0].clientY;
    const dy = y - lastY;
    lastY = y;
    const lines = Math.trunc(-dy / Math.max(8, state.fontSize * 1.2));
    if (!lines) return;
    term.scrollLines(lines);
    e.preventDefault();
  }, { passive: false });
}

function installTerminalWheelScroll(termEl, term) {
  term.attachCustomWheelEventHandler?.(e => {
    if (e.ctrlKey) return true;
    const buffer = term.buffer?.active;
    if (!buffer || buffer.baseY <= 0) return true;
    // ponytail: xterm already has wheel plumbing; force scrollback before CLI mouse mode eats it.
    const unit = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? term.rows : 1 / Math.max(8, state.fontSize * 1.2);
    const lines = Math.trunc(e.deltaY * unit);
    if (!lines) return true;
    term.scrollLines(lines);
    e.preventDefault();
    return false;
  });
}

function updateEmpty() {
  document.getElementById('emptyState').style.display = state.sessions.size ? 'none' : 'grid';
  document.getElementById('stat-active').textContent = String(state.sessions.size);
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
  if (text.length > OUTPUT_FRAME_LIMIT) text = `\r\n[PassiDeck: large replay truncated — last ${OUTPUT_FRAME_LIMIT} chars]\r\n` + text.slice(-OUTPUT_FRAME_LIMIT);
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

function loadPanePrefs(prefs = {}) {
  state.panePrefs = {
    titles: prefs.titles && typeof prefs.titles === 'object' ? prefs.titles : {},
    order: Array.isArray(prefs.order) ? prefs.order.filter(id => typeof id === 'string') : [],
    minimized: Array.isArray(prefs.minimized) ? prefs.minimized.filter(id => typeof id === 'string') : [],
    windows: prefs.windows && typeof prefs.windows === 'object' ? prefs.windows : {},
    viewport: prefs.viewport && typeof prefs.viewport === 'object' ? prefs.viewport : null
  };
}

function savePanePrefs() {
  if (state.hydrating) return;
  state.order = state.order.filter(id => state.sessions.has(id));
  state.panePrefs.order = state.order.slice();
  state.panePrefs.minimized = [...state.minimized].filter(id => state.sessions.has(id));
  state.panePrefs.windows = state.panePrefs.windows && typeof state.panePrefs.windows === 'object' ? state.panePrefs.windows : {};
  state.panePrefs.viewport = desktopSize();
  const prefs = windowPrefs();
  for (const id of Object.keys(prefs)) {
    if (!state.sessions.has(id)) delete prefs[id];
  }
  clampWindowPrefs(prefs);
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
  if (custom) return custom;
  const generated = entry?.autoTitle || session?.meta?.title || session?.title;
  if (generated) return generated;
  if (entry?.autoTitle) return entry.autoTitle;
  return 'No title';
}

function terminalViewportLines(term) {
  const buffer = term?.buffer?.active;
  if (!buffer) return [];
  const start = Math.max(0, buffer.viewportY || 0);
  const end = Math.min(buffer.length || 0, start + Math.max(1, term.rows || 30));
  const lines = [];
  for (let i = start; i < end; i += 1) {
    const line = buffer.getLine(i);
    if (line) lines.push(line.translateToString(false));
  }
  return lines;
}

function inferHermesSessionTitle(lines) {
  const visible = Array.isArray(lines) ? lines : [];
  if (!visible.some(line => /\bSessions\b/.test(line))) return '';
  for (const raw of visible) {
    const clean = String(raw || '').replace(/[│┃┆┊┌┐└┘├┤┬┴─═╭╮╰╯]/g, ' ').trim();
    if (!/(?:^|\s)(?:[▶>▸]\s*)?\d+\./.test(clean)) continue;
    const parts = clean.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    let candidate = parts[parts.length - 1] || '';
    candidate = candidate.replace(/^Start new live session$/i, '').replace(/\s+/g, ' ').trim();
    if (candidate && candidate.length <= 160 && !/^(new|draft|current\/default|\d+\s+msgs?|✓?\s*idle)$/i.test(candidate)) return candidate;
  }
  return '';
}

function applyGeneratedTitle(id, title, opts = {}) {
  const entry = state.sessions.get(id);
  const clean = String(title || '').trim();
  if (!entry || !clean || state.panePrefs.titles?.[id]) return false;
  const source = opts.source || 'terminal';
  if (entry.titleSource === 'hermes-session' && source !== 'hermes-session') return false;
  entry.autoTitle = clean;
  entry.titleSource = source;
  entry.session.meta = { ...(entry.session.meta || {}), title: clean };
  const titleEl = entry.el.querySelector('.term-title');
  if (titleEl && document.activeElement !== titleEl) titleEl.textContent = clean;
  renderSwitcher();
  updateMinimizedBar();
  return true;
}

function refreshTitleFromTerminal(id) {
  const entry = state.sessions.get(id);
  const inferred = inferHermesSessionTitle(terminalViewportLines(entry?.term));
  if (inferred) applyGeneratedTitle(id, inferred, { source: 'hermes-session' });
}

function endPointerDrag(event) {
  const d = state.pointerDrag;
  if (!d) return;
  event?.preventDefault?.();
  const suggestion = d.activeSuggestion;
  const slot = d.activeDesktopSlot;
  state.pointerDrag = null;
  document.removeEventListener('pointermove', updatePointerDrag, true);
  document.removeEventListener('pointerup', endPointerDrag, true);
  document.removeEventListener('pointercancel', endPointerDrag, true);
  document.removeEventListener('mousemove', updatePointerDrag, true);
  document.removeEventListener('mouseup', endPointerDrag, true);
  document.getElementById(`panel-${d.sourceId}`)?.classList.remove('dragging');
  document.body.classList.remove('pane-dragging');
  clearSnapSuggestions();
  clearDesktopSlotSuggestions();
  if (suggestion) applySnapSuggestion(d.sourceId, suggestion);
  else if (slot?.type === 'swap') swapWindowSlots(d.sourceId, slot.targetId, d.swapOriginRect);
  else if (slot?.type === 'free') applyFreeSlotSnap(d.sourceId, slot.rect);
  savePanePrefs();
  saveUiState();
  scheduleTerminalFit();
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
  const suggestions = snapSuggestionsAt(pt.x, pt.y);
  const active = chooseSnapSuggestionAt(pt.x, pt.y, suggestions);
  d.activeSuggestion = active;
  if (active) {
    d.activeDesktopSlot = null;
    showSnapSuggestions(suggestions, active.key);
    clearDesktopSlotSuggestions();
    applyFreeWindow(d.sourceId);
    scheduleTerminalFit({ secondPass: false, latePass: false });
    return;
  }
  clearSnapSuggestions();
  const slot = chooseDesktopSlotAt(pt.x, pt.y, d.sourceId);
  d.activeDesktopSlot = slot?.type === 'none' ? null : slot;
  showDesktopSlotSuggestions(slot);
  d.lastSwapTarget = slot?.type === 'swap' ? slot.targetId : null;
  applyFreeWindow(d.sourceId);
  scheduleTerminalFit({ secondPass: false, latePass: false });
}

function endWindowResize(event) {
  const d = state.resizeDrag;
  if (!d) return;
  event?.preventDefault?.();
  state.resizeDrag = null;
  document.removeEventListener('pointermove', updateWindowResize, true);
  document.removeEventListener('pointerup', endWindowResize, true);
  document.removeEventListener('pointercancel', endWindowResize, true);
  document.removeEventListener('mousemove', updateWindowResize, true);
  document.removeEventListener('mouseup', endWindowResize, true);
  document.body.classList.remove('window-resizing');
  document.getElementById(`panel-${d.sourceId}`)?.classList.remove('resizing');
  savePanePrefs();
  saveUiState();
  scheduleTerminalFit();
  renderSharedResizeHandles();
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
  p.w = Math.max(300, Math.min(gr.width - p.x, d.startW + (pt.x - d.startX)));
  p.h = Math.max(190, Math.min(gr.height - p.y, d.startH + (pt.y - d.startY)));
  p.z = d.z;
  applyFreeWindow(d.sourceId);
  scheduleTerminalFit({ secondPass: false, latePass: false });
}

function startSharedResize(group, event) {
  if (event.button !== 0) return;
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
  event.currentTarget?.setPointerCapture?.(event.pointerId);
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
  scheduleTerminalFit({ secondPass: false, latePass: false });
}

function endSharedResize(event) {
  if (!state.sharedResizeDrag) return;
  event?.preventDefault?.();
  document.removeEventListener('pointermove', updateSharedResize, true);
  document.removeEventListener('pointerup', endSharedResize, true);
  document.removeEventListener('pointercancel', endSharedResize, true);
  document.removeEventListener('mousemove', updateSharedResize, true);
  document.removeEventListener('mouseup', endSharedResize, true);
  document.body.classList.remove('shared-resizing-x', 'shared-resizing-y');
  state.sharedResizeDrag = null;
  savePanePrefs();
  saveUiState();
  scheduleTerminalFit();
  renderSharedResizeHandles();
}

function startWindowResize(id, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const entry = state.sessions.get(id);
  if (!entry) return;
  const p = makeFreeWindow(id, entry.el.getBoundingClientRect());
  const grid = document.getElementById('termGrid');
  p.z = nextWindowZ();
  state.resizeDrag = { sourceId: id, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, startW: p.w, startH: p.h, z: p.z };
  clearSharedResizeHandles();
  entry.el.classList.add('resizing');
  document.body.classList.add('window-resizing');
  document.addEventListener('pointermove', updateWindowResize, true);
  document.addEventListener('pointerup', endWindowResize, true);
  document.addEventListener('pointercancel', endWindowResize, true);
  document.addEventListener('mousemove', updateWindowResize, true);
  document.addEventListener('mouseup', endWindowResize, true);
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  bringWindowToFront(id);
}

function startPointerDrag(id, handle, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const entry = state.sessions.get(id);
  if (!entry) return;
  const r = entry.el.getBoundingClientRect();
  const p = makeFreeWindow(id, r);
  const swapOriginRect = { x: p.x, y: p.y, w: p.w, h: p.h };
  const grid = document.getElementById('termGrid');
  const gr = grid.getBoundingClientRect();
  const normal = defaultWindowSize();
  const restore = r.width > normal.w + 24 || r.height > normal.h + 24;
  const rx = Math.max(0.12, Math.min(0.88, (event.clientX - r.left) / Math.max(1, r.width)));
  if (restore) {
    p.w = normal.w;
    p.h = normal.h;
    p.x = Math.max(0, Math.min(gr.width - 80, event.clientX - gr.left - p.w * rx));
    p.y = Math.max(0, Math.min(gr.height - 36, event.clientY - gr.top - Math.min(18, event.clientY - r.top)));
    applyFreeWindow(id);
  }
  p.z = nextWindowZ();
  state.pointerDrag = { sourceId: id, dx: event.clientX - gr.left - p.x, dy: event.clientY - gr.top - p.y, x: event.clientX, y: event.clientY, z: p.z, activeSuggestion: null, activeDesktopSlot: null, lastSwapTarget: null, swapOriginRect };
  state.draggingId = id;
  clearSharedResizeHandles();
  entry.el.classList.add('dragging');
  document.body.classList.add('pane-dragging');
  document.addEventListener('pointermove', updatePointerDrag, true);
  document.addEventListener('pointerup', endPointerDrag, true);
  document.addEventListener('pointercancel', endPointerDrag, true);
  document.addEventListener('mousemove', updatePointerDrag, true);
  document.addEventListener('mouseup', endPointerDrag, true);
  handle.setPointerCapture?.(event.pointerId);
  bringWindowToFront(id);
}

function createPanel(session, opts = {}) {
  if (state.sessions.has(session.id) || session.meta.status === 'exited') return;
  const id = session.id;
  const grid = document.getElementById('termGrid');
  const el = document.createElement('section');
  el.className = 'term-panel';
  el.id = `panel-${id}`;
  el.dataset.paneId = id;
  el.dataset.connectionStatus = 'reconnecting';
  el.innerHTML = `
    <div class="term-header">
      <span class="connection-dot" data-tooltip="Reconnecting" aria-label="Reconnecting"></span>
      <span class="term-title" contenteditable="true" spellcheck="false" aria-label="Window name">${escapeHtml(panelTitle(session))}</span>
      <span class="term-session-desc" hidden></span>
      <div class="term-actions">
        <button class="arrange" data-tooltip="Arrange" aria-label="Arrange">▦</button>
        <button class="minimize" data-tooltip="Minimize" aria-label="Minimize">−</button>
        <button class="danger" data-tooltip="Close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="terminal" id="term-${id}"></div>
    <div class="window-resize-handle" data-tooltip="Resize" aria-hidden="true"></div>
  `;
  grid.appendChild(el);

  const titleEl = el.querySelector('.term-title');
  const descEl = el.querySelector('.term-session-desc');
  const headerEl = el.querySelector('.term-header');
  const [arrangeBtn, minBtn, closeBtn] = el.querySelectorAll('button');
  setTooltip(headerEl, sessionDescription(session));
  if (descEl && !descEl.textContent.trim()) descEl.hidden = true;
  arrangeBtn.dataset.paneId = id;
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
  arrangeBtn.addEventListener('mouseenter', () => showLayoutAssist(id, arrangeBtn));
  arrangeBtn.onclick = e => { e.stopPropagation(); showLayoutAssist(id, arrangeBtn); };
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
  headerEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.term-title, .term-actions, button')) return;
    startPointerDrag(id, headerEl, e);
  });
  el.querySelector('.window-resize-handle')?.addEventListener('pointerdown', e => startWindowResize(id, e));

  const term = new Terminal({
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: state.fontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollOnUserInput: false,
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
  term.onSelectionChange?.(() => {
    const entry = state.sessions.get(id);
    const selected = term.getSelection?.() || '';
    if (entry && selected) entry.lastSelection = selected;
  });
  termEl.addEventListener('contextmenu', e => handleTerminalContextMenu(e, id));
  installTerminalTouchScroll(termEl, term);
  installTerminalWheelScroll(termEl, term);

  // Auto-detect terminal title (vim, Codex, Hermes TUI, etc.)
  term.onTitleChange(title => {
    const entry = state.sessions.get(id);
    if (!entry) return;
    // Ignore generic/empty titles
    if (!title || /^(\s*|bash$|zsh$|\/bin\/bash$|\/bin\/zsh$)/.test(title)) return;
    // Only update if user hasn't set a custom title
    applyGeneratedTitle(id, title);
  });

  const ro = new ResizeObserver(() => {
    const p = windowPrefs()[id];
    if (!state.hydrating && p && el.classList.contains('free-window') && !state.minimized.has(id) && !el.classList.contains('layout-hidden') && el.offsetParent) {
      const r = el.getBoundingClientRect();
      if (r.width >= 300 && r.height >= 190) { p.w = r.width; p.h = r.height; savePanePrefs(); }
    }
    scheduleTerminalFit();
  });
  ro.observe(el.querySelector('.terminal'));
  term.onData(data => {
    const entry = state.sessions.get(id);
    const clean = sanitizeTerminalInput(data);
    if (clean && entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify({ type: 'input', data: clean }));
  });

  const hasSnapshot = hasTerminalSnapshot(id);
  state.sessions.set(id, { session, el, term, fit, serialize, ws: null, ro, restored: hasSnapshot, snapshotTimer: null, lastSelection: '', titleSource: '', lastSentCols: 0, lastSentRows: 0 });
  if (state.minimized.has(id)) el.classList.add('minimized');
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
  if (opts.autoPlace) windowPrefs()[id] = defaultWindowRect(Object.keys(windowPrefs()).length);

  const ws = attachSocket(id, term, el);
  state.sessions.get(id).ws = ws;

  updateEmpty();
  renderSwitcher();
  selectPanel(id, { persist: false });
  requestAnimationFrame(() => {
    fitAll({ allowHeight: true, scrollBottom: true });
    const entry = state.sessions.get(id);
    if (entry && hasSnapshot) {
      entry.restored = restoreTerminalSnapshot(id, term);
      requestAnimationFrame(() => {
        try { fitEntry(id, entry, { force: true, allowHeight: true }); } catch {}
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
  const qs = new URLSearchParams({ session: id });
  const token = authToken();
  if (token) qs.set('token', token);
  const ws = new WebSocket(`${WS_BASE}?${qs.toString()}`);
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
    if (msg.type === 'output') writeTerminalOutput(term, msg.data, () => { scheduleTerminalSnapshot(id); refreshTitleFromTerminal(id); });
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
    setConnectionStatus(id, 'live');
    scheduleTerminalFit();
  };
  ws.onerror = () => setConnectionStatus(id, 'offline');
  ws.onclose = () => {
    const entry = state.sessions.get(id);
    if (!entry?.el.classList.contains('exited')) setConnectionStatus(id, 'reconnecting');
    setTimeout(() => reconnect(id), 1000);
  };
  return ws;
}

function reconnect(id) {
  const entry = state.sessions.get(id);
  if (!entry || entry.el.classList.contains('exited')) return;
  entry.ws = attachSocket(id, entry.term, entry.el);
}

function renderSwitcher() {
  state.order = state.order.filter(id => state.sessions.has(id));
  const root = document.getElementById('activeSessionDescription');
  if (!root) return;
  const entry = state.activeId ? state.sessions.get(state.activeId) : null;
  const text = entry ? panelTitle(entry.session) : 'No session';
  root.textContent = text;
  setTooltip(root, text);
}

function selectPanel(id, opts = {}) {
  const entry = state.sessions.get(id);
  if (!entry) return;
  state.activeId = id;
  document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('active'));
  entry.el.classList.add('active');
  applyLayoutVisibility();
  if (!state.minimized.has(id)) bringWindowToFront(id);
  entry.term.focus();
  scheduleTerminalFit();
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
    createPanel(session, { replaceId, autoPlace: true });
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

function dataUrlToFile(payload, fallbackName = 'clipboard-image.png') {
  if (!payload?.data || !String(payload.data).startsWith('data:')) return null;
  const [header, raw = ''] = String(payload.data).split(',', 2);
  const type = payload.type || header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], payload.name || fallbackName, { type });
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
  if (window.passideckDesktop?.copyText) return Boolean(await window.passideckDesktop.copyText(text));
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return fallbackCopyText(text);
}

function activeDocumentSelectionText() {
  const selection = document.getSelection?.();
  const text = selection?.toString?.() || '';
  if (!text.trim()) return '';
  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode?.parentElement;
  if (anchor?.closest?.('.xterm, .terminal') || focus?.closest?.('.xterm, .terminal')) return '';
  return text;
}

function clearDocumentSelection() {
  document.getSelection?.().removeAllRanges?.();
}

function activeTerminalSelectionText() {
  const entry = activeTerminalEntry();
  return entry?.term?.getSelection?.() || entry?.lastSelection || '';
}

function clearActiveTerminalSelection() {
  const entry = activeTerminalEntry();
  entry?.term?.clearSelection?.();
  if (entry) entry.lastSelection = '';
}

async function copyActiveTerminalSelection() {
  const selected = activeTerminalSelectionText();
  if (!selected) return false;
  await copyTextToClipboard(selected);
  clearActiveTerminalSelection();
  return true;
}
window.__passideckGetSelection = activeTerminalSelectionText;
window.__passideckClearSelection = clearActiveTerminalSelection;
window.__passideckCopySelection = copyActiveTerminalSelection;

async function readTextFromClipboard() {
  if (window.passideckDesktop?.readText) return String(await window.passideckDesktop.readText() || '');
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
  const selected = entry?.term?.getSelection?.() || entry?.lastSelection || '';
  if (selected) {
    try {
      await copyTextToClipboard(selected);
      entry.term.clearSelection?.();
      entry.lastSelection = '';
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

async function handlePassiDeckContextMenu(e) {
  const target = e.target?.nodeType === Node.ELEMENT_NODE ? e.target : e.target?.parentElement;
  const terminalPanel = target?.closest?.('.term-panel');
  if (target?.closest?.('.terminal, .xterm') && terminalPanel?.dataset?.paneId) {
    await handleTerminalContextMenu(e, terminalPanel.dataset.paneId);
    return;
  }
  const selected = activeDocumentSelectionText();
  if (selected) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    await copyTextToClipboard(selected);
    clearDocumentSelection();
    return;
  }
  if (shouldLetBrowserHandlePaste(target)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
  try {
    await pasteClipboardIntoTerminalEntry(activeTerminalEntry());
  } catch (err) {
    console.warn('app right-click paste failed', err);
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
  if (window.passideckDesktop?.readImage) {
    return dataUrlToFile(await window.passideckDesktop.readImage(), 'clipboard-image.png');
  }
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
  if (!target?.closest('.terminal, .xterm') && (shouldLetBrowserHandlePaste(target) || !activeTerminalEntry())) return;
  if (window.passideckDesktop?.readText || window.passideckDesktop?.readImage) {
    e.preventDefault();
    e.stopImmediatePropagation();
    pasteClipboardIntoTerminalEntry(activeTerminalEntry()).catch(err => console.warn('terminal shortcut paste failed', err));
    return;
  }
  // xterm may otherwise turn Ctrl+V into raw ^V. Stop xterm key handling, but do not preventDefault;
  // the browser then emits a real paste event that handleTerminalPaste can route to the PTY/upload bridge.
  e.stopImmediatePropagation();
}

function handleTerminalCopyShortcut(e) {
  const key = String(e.key || '').toLowerCase();
  if (key !== 'c' || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  copyActiveTerminalSelection().catch(err => console.warn('terminal shortcut copy failed', err));
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

function eventHasFiles(e) {
  return (e.dataTransfer?.files?.length || 0) > 0;
}

function handlePassiDeckDragOver(e) {
  if (!eventHasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
}

async function handlePassiDeckDrop(e) {
  if (!eventHasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
  const target = e.target?.nodeType === Node.ELEMENT_NODE ? e.target : e.target?.parentElement;
  const panel = target?.closest?.('.term-panel');
  if (panel?.dataset?.paneId) selectPanel(panel.dataset.paneId, { persist: false });
  for (const file of [...e.dataTransfer.files]) await uploadFile(file, { pasteIntoTerminal: true });
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
  installTooltips();
  state.hydrating = true;
  const [sessions, ui] = await Promise.all([
    api('GET', '/api/sessions').catch(() => []),
    api('GET', '/api/ui-state').catch(() => null)
  ]);

  loadPanePrefs(ui?.panePrefs || {});
  scaleWindowPrefsToViewport();
  setTheme(ui?.theme || 'green', { persist: false });
  setSkin(ui?.skin || 'neon', { persist: false });
  setFontSize(ui?.fontSize || state.fontSize, { persist: false });
  setChromeHidden(Boolean(ui?.chromeHidden), { persist: false });
  setSystemMonitorVisible(Boolean(ui?.systemMonitor), { persist: false });
  startCodexLimitsPolling();
  installCloseHitLayer();
  buildGridPicker();
  sessions.forEach(createPanel);
  restorePanelOrder();

  const base = ui?.baseLayout || ui?.layout || 'auto';
  state.layout = LEGACY_LAYOUTS.has(base) ? base : 'auto';
  setLayout(state.layout, { persist: false });

  state.minimized = new Set((state.panePrefs.minimized || []).filter(id => state.sessions.has(id)));
  state.minimized.forEach(id => state.sessions.get(id)?.el.classList.add('minimized'));
  responsiveMinimizeForViewport();
  applyLayoutVisibility();
  updateMinimizedBar();

  if (ui?.activeId && state.sessions.has(ui.activeId) && !state.minimized.has(ui.activeId)) selectPanel(ui.activeId, { persist: false });
  else if (state.order[0]) selectPanel(state.order[0], { persist: false });
  updateEmpty();
  renderSwitcher();
  state.hydrating = false;
  savePanePrefs();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

document.querySelectorAll('[data-command]').forEach(btn => btn.onclick = () => launch(btn.dataset.command));
document.getElementById('settingsToggle').onclick = () => {
  const panel = document.getElementById('settingsPanel');
  panel.hidden = !panel.hidden;
  panel.classList.toggle('open', !panel.hidden);
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
document.getElementById('skinSelect').onchange = e => setSkin(e.target.value);
document.getElementById('fontSizeSlider').oninput = e => setFontSize(Number(e.target.value));
document.getElementById('systemMonitorToggle').onchange = e => setSystemMonitorVisible(e.target.checked);

// ── Close Confirmation Modal ──
let closeConfirmSessionId = null;
let closeModalOpenedAt = 0;
let closeModalReturnFocus = null;
function showCloseConfirm(sessionId, title) {
  const modal = document.getElementById('closeModal');
  closeModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById('closeModalTitle').textContent = `${title} — really close?`;

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
document.addEventListener('contextmenu', handlePassiDeckContextMenu, true);
document.addEventListener('dragover', handlePassiDeckDragOver, true);
document.addEventListener('drop', handlePassiDeckDrop, true);
document.addEventListener('keydown', handleCloseModalKeydown, true);
document.addEventListener('keydown', letBrowserOwnTerminalPasteShortcut, true);
document.addEventListener('keydown', handleTerminalCopyShortcut, true);
window.addEventListener('resize', () => { scaleWindowPrefsToViewport(); responsiveMinimizeForViewport(); applyLayoutVisibility(); savePanePrefs(); scheduleTerminalFit(); });
window.addEventListener('beforeunload', () => { savePanePrefs(); flushUiState(); saveAllTerminalSnapshots(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAllTerminalSnapshots(); });
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    const settingsPanel = document.getElementById('settingsPanel');
    if (!settingsPanel.hidden) {
      settingsPanel.hidden = true;
      settingsPanel.classList.remove('open');
      document.getElementById('settingsToggle').setAttribute('aria-expanded', 'false');
    }
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
  const res = await fetch('vendor/addon-serialize.js');
  const code = await res.text();
  Function(code).call(window);
}

ensureSerializeAddon().then(init).catch(err => {
  console.error(err);
  document.getElementById('emptyState').innerHTML = '<h2>PassiDeck error.</h2><p>Check console.</p>';
});
