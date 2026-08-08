const express = require('express');
const compression = require('compression');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const https = require('https');

let pty = null;
try { pty = require('@homebridge/node-pty-prebuilt-multiarch'); } catch {}

const { SessionManager, WS_BACKPRESSURE_MAX_BYTES, sendJson } = require('./session');
const { loadConfig, configDir, normalizeTitleGenLlm, writeTitleGenLlm } = require('./config');
const { version: PASSIDECK_VERSION } = require('../../../package.json');

let Database = null;
let db = null;
let dbModule = null;
try {
  Database = require('better-sqlite3');
  dbModule = require('./database');
} catch (err) {
  console.warn('[db] SQLite not available:', err.message);
}

function ensureDatabase() {
  if (db || !Database || !dbModule) return db;
  try { db = dbModule.initDatabase(Database); }
  catch (err) { console.warn('[db] SQLite not available:', err.message); }
  return db;
}

const UI_THEMES = new Set(['blue', 'green', 'emerald', 'cyan', 'amber', 'purple', 'red', 'mono']);
const UI_SKINS = new Set(['neon', 'stealth', 'prism']);
const UPLOAD_RETENTION_DAYS = 7;
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_JSON_LIMIT = '72mb';
const TERMINAL_MAX_INPUT_BYTES = 1024 * 1024;
const TERMINAL_MAX_DIMENSION = 1000;
const UPLOAD_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'text/plain',
  'application/pdf'
]);
const TMUX_CMD = process.env.PASSIDECK_TMUX_CMD || 'tmux';
const TMUX_ARGS = process.env.PASSIDECK_TMUX_SOCKET
  ? ['-L', process.env.PASSIDECK_TMUX_SOCKET]
  : (process.env.PASSIDECK_TMUX_ARGS || '-L passideck').split(/\s+/).filter(Boolean);
const TMUX_HISTORY_REPLAY_LINES = 2000;
const TMUX_HISTORY_REPLAY_MAX_BYTES = Math.floor(WS_BACKPRESSURE_MAX_BYTES / 2);
const TMUX_COMMAND_TIMEOUT_MS = 3000;
const TMUX_HYDRATION_SETTLE_MS = 100;
const TMUX_HYDRATION_MAX_MS = 15000;
const TMUX_HYDRATION_MAX_ATTEMPTS = 20;
const TERMINAL_OWNER_VIEWPORT = 'viewport';
const TERMINAL_OWNER_APPLICATION = 'application';
const TERMINAL_APPLICATION_COMMANDS = new Set(['vi', 'vim', 'nvim', 'nano', 'emacs', 'less', 'more', 'man', 'top', 'htop', 'btop', 'atop', 'glances', 'watch', 'mc', 'nnn', 'ranger', 'lf', 'lazygit', 'fzf', 'tmux', 'screen', 'ssh', 'mosh', 'codex']);
const TERMINAL_REPLAY_DISABLED = '\r\n[PassiDeck reconnect: output replay disabled; live session still running]\r\n';
const tmuxArgs = (args) => [...TMUX_ARGS, ...args];
const execFileAsync = promisify(execFile);

let lastCpuSample = null;
let lastNetSample = null;
let codexLimitsCache = { at: 0, data: null };
const CODEX_LIMITS_CACHE_MS = 60000;
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 300;
const UPLOAD_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_DESKTOPS = 3;

const UI_STATE_DEFAULT = { revision: 0, activeId: null, theme: 'blue', skin: 'neon', fontSize: 13, notifyBlinking: true, performanceMode: false, chromeHidden: false, systemMonitor: false, panePrefs: { titles: {}, order: [], desktopOrder: ['desktop-1'], paneDesktop: {}, desktops: { 'desktop-1': { name: 'Desktop 1', minimized: [], windows: {}, viewport: null } } }, updatedAt: null };

function uiStatePath() {
  return path.join(configDir(), 'ui-state.json');
}


function cleanIdList(v) {
  return Array.isArray(v) ? v.filter(id => typeof id === 'string' && id.length <= 100).slice(0, 100) : [];
}

function sanitizePanePrefs(input) {
  const src = input && typeof input === 'object' ? input : {};
  const titles = {};
  if (src.titles && typeof src.titles === 'object') {
    for (const [k, v] of Object.entries(src.titles)) {
      if (typeof k === 'string' && k.length <= 100 && typeof v === 'string') titles[k] = v.slice(0, 160);
    }
  }
  const windows = {};
  if (src.windows && typeof src.windows === 'object') {
    for (const [layout, items] of Object.entries(src.windows)) {
      if (typeof layout !== 'string' || layout.length > 40 || !items || typeof items !== 'object') continue;
      windows[layout] = {};
      for (const [id, r] of Object.entries(items)) {
        if (typeof id !== 'string' || id.length > 100 || !r || typeof r !== 'object') continue;
        windows[layout][id] = {
          x: Math.max(-20000, Math.min(20000, Number(r.x) || 0)),
          y: Math.max(-20000, Math.min(20000, Number(r.y) || 0)),
          w: Math.max(120, Math.min(20000, Number(r.w) || 640)),
          h: Math.max(120, Math.min(20000, Number(r.h) || 400)),
          z: Math.max(1, Math.min(9999, Number(r.z) || 10))
        };
      }
    }
  }
  const vp = src.viewport && typeof src.viewport === 'object' ? { w: Math.max(1, Math.min(20000, Number(src.viewport.w) || 0)), h: Math.max(1, Math.min(20000, Number(src.viewport.h) || 0)) } : null;
  const desktops = {};
  if (src.desktops && typeof src.desktops === 'object') {
    for (const [id, desktop] of Object.entries(src.desktops)) {
      if (typeof id !== 'string' || !id || id.length > 40 || !desktop || typeof desktop !== 'object') continue;
      const desktopWindows = sanitizePanePrefs({ windows: { desktop: desktop.windows } }).desktops['desktop-1'].windows;
      const desktopViewport = desktop.viewport && typeof desktop.viewport === 'object'
        ? { w: Math.max(1, Math.min(20000, Number(desktop.viewport.w) || 0)), h: Math.max(1, Math.min(20000, Number(desktop.viewport.h) || 0)) }
        : null;
      desktops[id] = {
        name: String(desktop.name || 'Desktop').trim().slice(0, 40) || 'Desktop',
        minimized: cleanIdList(desktop.minimized),
        windows: desktopWindows,
        viewport: desktopViewport
      };
    }
  }
  if (!Object.keys(desktops).length) {
    desktops['desktop-1'] = { name: 'Desktop 1', minimized: cleanIdList(src.minimized), windows: windows.desktop || {}, viewport: vp };
  }
  const requestedOrder = cleanIdList(src.desktopOrder).filter(id => desktops[id]);
  const desktopOrder = [...new Set([...requestedOrder, ...Object.keys(desktops)])].slice(0, MAX_DESKTOPS);
  const retainedDesktops = new Set(desktopOrder);
  for (const id of Object.keys(desktops)) if (!retainedDesktops.has(id)) delete desktops[id];
  const usedDesktopNames = new Set();
  for (const id of desktopOrder) {
    const desktop = desktops[id];
    let name = desktop.name;
    if (usedDesktopNames.has(name.toLowerCase())) {
      let number = 1;
      while (usedDesktopNames.has(`desktop ${number}`)) number += 1;
      name = `Desktop ${number}`;
      desktop.name = name;
    }
    usedDesktopNames.add(name.toLowerCase());
  }
  const fallbackDesktop = desktopOrder[0];
  const paneDesktop = {};
  if (src.paneDesktop && typeof src.paneDesktop === 'object') {
    for (const [paneId, desktopId] of Object.entries(src.paneDesktop)) {
      if (typeof paneId === 'string' && paneId.length <= 100 && desktops[desktopId]) paneDesktop[paneId] = desktopId;
    }
  }
  for (const paneId of cleanIdList(src.order)) if (!paneDesktop[paneId]) paneDesktop[paneId] = fallbackDesktop;
  return { titles, order: cleanIdList(src.order), desktopOrder, paneDesktop, desktops };
}

function sanitizeUiState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...UI_STATE_DEFAULT };
  out.revision = Math.max(0, Math.floor(Number(src.revision) || 0));
  if (typeof src.activeId === 'string' && src.activeId.length <= 100) out.activeId = src.activeId;
  if (UI_THEMES.has(src.theme)) out.theme = src.theme;
  if (UI_SKINS.has(src.skin)) out.skin = src.skin;
  out.fontSize = Math.max(10, Math.min(24, Number(src.fontSize) || UI_STATE_DEFAULT.fontSize));
  out.notifyBlinking = src.notifyBlinking !== false;
  out.performanceMode = src.performanceMode === true;
  out.chromeHidden = Boolean(src.chromeHidden);
  out.systemMonitor = Boolean(src.systemMonitor);
  out.panePrefs = sanitizePanePrefs(src.panePrefs);
  if (typeof src.updatedAt === 'string') out.updatedAt = src.updatedAt;
  return out;
}

function readUiState() {
  try { return sanitizeUiState(JSON.parse(fs.readFileSync(uiStatePath(), 'utf8'))); }
  catch { return { ...UI_STATE_DEFAULT }; }
}

function writeUiState(input) {
  const state = sanitizeUiState(input);
  state.revision += 1;
  state.updatedAt = new Date().toISOString();
  const file = uiStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
  return state;
}

function uploadsRoot() {
  return path.join(configDir(), 'uploads');
}

function safeFileName(name) {
  const base = path.basename(String(name || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'upload.bin';
}

function normalizeMime(type) {
  return String(type || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
}

function detectedUploadMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  return null;
}

function requireAllowedUploadMime(mime) {
  if (!UPLOAD_MIME_ALLOWLIST.has(mime)) throw new Error(`Upload type not allowed: ${mime}`);
}

function setUploadHeaders(res, filePath) {
  const name = safeFileName(path.basename(filePath));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || (req.socket?.encrypted ? 'https' : 'http');
    const expected = `${String(protocol).replace(/:$/, '')}://${req.headers.host}`;
    return new URL(origin).origin === expected;
  } catch { return false; }
}

function tokenFromRequest(req, urlObj = null) {
  return req.headers['x-passideck-token'] || req.query?.token || urlObj?.searchParams?.get('token') || '';
}

function authTokenRequired() {
  return String(process.env.PASSIDECK_AUTH_TOKEN || '');
}

function requestGuard(req, res, next) {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origin rejected' });
  const required = authTokenRequired();
  if (!required || req.path === '/health' || req.originalUrl?.startsWith('/api/health')) return next();
  if (tokenFromRequest(req) !== required) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function websocketAllowed(req, urlObj) {
  if (!sameOrigin(req)) return false;
  const required = authTokenRequired();
  return !required || tokenFromRequest(req, urlObj) === required;
}

function saveUploadedBlob(input) {
  const src = input && typeof input === 'object' ? input : {};
  const raw = String(src.data || src.base64 || '');
  const match = raw.match(/^data:([^;,]+)?;base64,(.*)$/);
  let mime = normalizeMime(src.type || (match && match[1]) || 'application/octet-stream');
  if (mime !== 'application/octet-stream') requireAllowedUploadMime(mime);
  const b64 = match ? match[2] : raw;
  if (b64.length > Math.ceil(UPLOAD_MAX_BYTES / 3) * 4 || !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(b64)) {
    throw new Error('Invalid base64 upload');
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Empty upload');
  if (buffer.length > UPLOAD_MAX_BYTES) throw new Error('Upload too large');
  if (mime === 'application/octet-stream') {
    mime = detectedUploadMime(buffer) || mime;
    requireAllowedUploadMime(mime);
  }

  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(uploadsRoot(), day);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}-${safeFileName(src.name)}`;
  const file = path.join(dir, filename);
  fs.writeFileSync(file, buffer);
  const rel = `/${day}/${filename}`;
  return {
    ok: true,
    name: filename,
    originalName: src.name || filename,
    type: mime,
    size: buffer.length,
    path: file,
    url: `/uploads${rel}`
  };
}

function cleanupOldUploads(maxDays = UPLOAD_RETENTION_DAYS) {
  const root = uploadsRoot();
  if (!fs.existsSync(root)) return { removed: 0, bytes: 0 };
  const days = Math.max(1, Math.min(365, Number(maxDays) || UPLOAD_RETENTION_DAYS));
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;
  let bytes = 0;
  for (const dayDir of fs.readdirSync(root)) {
    const dirPath = path.join(root, dayDir);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) continue;
    if (stat.mtimeMs >= cutoff) continue;
    // Delete entire day folder
    for (const file of fs.readdirSync(dirPath)) {
      const filePath = path.join(dirPath, file);
      try {
        const fStat = fs.statSync(filePath);
        bytes += fStat.size;
        fs.unlinkSync(filePath);
        removed++;
      } catch {}
    }
    try { fs.rmdirSync(dirPath); } catch {}
  }
  return { removed, bytes };
}

function resolveCwd(cwd) {
  return path.resolve(String(cwd || os.homedir()).replace(/^~/, os.homedir()));
}

function unwrapShellCommand(command) {
  let argv = Array.isArray(command) ? [...command] : String(command || '').trim().split(/\s+/).filter(Boolean);
  if (path.basename(String(argv[0] || '')) === 'exec') argv.shift();
  const wrapper = path.basename(String(argv[0] || '')).toLowerCase();
  if (wrapper === 'env') {
    argv.shift();
    while (argv.length) {
      if (argv[0] === '--') { argv.shift(); break; }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]) || ['-i', '--ignore-environment'].includes(argv[0]) || /^(?:--unset|--chdir)=/.test(argv[0])) argv.shift();
      else if (['-u', '--unset', '-C', '--chdir'].includes(argv[0])) argv.splice(0, 2);
      else break;
    }
  } else if (wrapper === 'sudo') {
    argv.shift();
    const valued = new Set(['-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt', '-C', '--close-from', '-r', '--role', '-t', '--type']);
    const flags = new Set(['-E', '--preserve-env', '-H', '--set-home', '-n', '--non-interactive', '-S', '--stdin', '-k', '--reset-timestamp', '-K', '--remove-timestamp']);
    while (argv.length) {
      if (argv[0] === '--') { argv.shift(); break; }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]) || flags.has(argv[0]) || /^--(?:user|group|host|prompt|close-from|role|type)=/.test(argv[0])) argv.shift();
      else if (valued.has(argv[0])) argv.splice(0, 2);
      else break;
    }
  }
  return argv;
}

function isPlainShellCommand(command) {
  const originalEmpty = Array.isArray(command) ? command.length === 0 : !String(command || '').trim();
  const [file = '', ...args] = unwrapShellCommand(command);
  if (!file) return originalEmpty;
  const shell = path.basename(file).replace(/^-/, '').toLowerCase();
  return new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'tcsh', 'ksh', 'csh', 'pwsh', 'powershell']).has(shell) &&
    args.every(arg => /^-(?:[a-z]+|-?[a-z][a-z-]*(?:=.*)?)$/i.test(arg));
}

function normalizeTerminalOutput(data) {
  return String(data);
}

function cpuSample() {
  const cpus = os.cpus();
  const totals = cpus.reduce((acc, cpu) => {
    for (const value of Object.values(cpu.times)) acc.total += value;
    acc.idle += cpu.times.idle;
    return acc;
  }, { idle: 0, total: 0 });
  return { ...totals, at: Date.now() };
}

function networkSample() {
  const sample = { rx: 0, tx: 0, at: Date.now() };
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    for (const line of lines) {
      const [ifaceRaw, restRaw] = line.trim().split(':');
      if (!restRaw) continue;
      const iface = ifaceRaw.trim();
      if (!iface || iface === 'lo') continue;
      const fields = restRaw.trim().split(/\s+/).map(Number);
      sample.rx += fields[0] || 0;
      sample.tx += fields[8] || 0;
    }
  } catch {}
  return sample;
}

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hermesHome() {
  return process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
}

function codexAuthPath() {
  return process.env.PASSIDECK_HERMES_AUTH_PATH || path.join(hermesHome(), 'auth.json');
}

function legacyCodexAuthPath() {
  return process.env.PASSIDECK_CODEX_AUTH_PATH || path.join(os.homedir(), '.codex', 'auth.json');
}

function readAuthFile(authPath, label) {
  try { return JSON.parse(fs.readFileSync(authPath, 'utf8')); }
  catch (err) { throw new Error(`${label} unavailable at ${authPath}: ${err.message}`); }
}

function authResult(store, state, authPath, source, metadata = {}) {
  const tokens = state?.tokens || state;
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token.trim() : '';
  const refreshToken = typeof tokens?.refresh_token === 'string' ? tokens.refresh_token.trim() : '';
  return accessToken && refreshToken
    ? { store, state, tokens: { ...tokens, access_token: accessToken, refresh_token: refreshToken }, authPath, source, ...metadata }
    : null;
}

function readHermesCodexAuths() {
  const authPath = codexAuthPath();
  const store = readAuthFile(authPath, 'Hermes Codex auth');
  const pool = store.credential_pool?.['openai-codex'];
  if (Array.isArray(pool)) {
    const pooled = pool
      .filter(entry => entry && typeof entry === 'object')
      .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
      .map((entry, offset) => authResult(store, entry, authPath, 'hermes-pool', {
        credentialId: entry.id,
        index: offset + 1,
        label: entry.label || `#${offset + 1}`
      }))
      .filter(Boolean);
    if (pooled.length) {
      const active = pooled.find(auth => !['exhausted', 'dead'].includes(String(auth.state?.last_status || '').toLowerCase()));
      return pooled.map(auth => ({ ...auth, active: auth === active }));
    }
  }
  const state = store.providers?.['openai-codex'] || store['openai-codex'];
  const hermesAuth = authResult(store, state, authPath, 'hermes', { index: 1, label: state?.label || '#1' });
  if (hermesAuth) return [{ ...hermesAuth, active: true }];

  const fallbackPath = legacyCodexAuthPath();
  const fallbackStore = readAuthFile(fallbackPath, 'Codex auth');
  const fallbackAuth = authResult(fallbackStore, fallbackStore, fallbackPath, 'codex', { index: 1, label: '#1' });
  if (fallbackAuth) return [{ ...fallbackAuth, active: true }];
  throw new Error(`Codex auth at ${fallbackPath} is missing access_token or refresh_token`);
}

function readHermesCodexAuth() {
  return readHermesCodexAuths()[0];
}

function saveHermesCodexAuth(auth, tokens) {
  const now = new Date().toISOString();
  if (auth.source === 'hermes-pool') {
    const latestStore = readAuthFile(auth.authPath, 'Hermes Codex auth');
    const pool = latestStore.credential_pool?.['openai-codex'];
    const entry = Array.isArray(pool) ? pool.find(item => item?.id === auth.credentialId) : null;
    if (!entry) throw new Error(`Codex pool credential ${auth.credentialId || auth.index} no longer exists`);
    entry.access_token = tokens.access_token;
    entry.refresh_token = tokens.refresh_token;
    entry.last_refresh = now;
    latestStore.updated_at = now;
    const tmp = `${auth.authPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(latestStore, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, auth.authPath);
    return;
  }
  if (auth.source === 'codex') {
    const nextStore = { ...auth.store, tokens: { ...(auth.state?.tokens || {}), ...tokens }, last_refresh: now, auth_mode: 'chatgpt' };
    fs.writeFileSync(auth.authPath, `${JSON.stringify(nextStore, null, 2)}\n`, { mode: 0o600 });
    return;
  }
  const nextState = { ...(auth.state || {}), tokens: { ...(auth.state?.tokens || {}), ...tokens }, last_refresh: now, auth_mode: 'chatgpt' };
  if (!auth.store.providers || typeof auth.store.providers !== 'object') auth.store.providers = {};
  auth.store.providers['openai-codex'] = nextState;
  auth.store['openai-codex'] = { auth_mode: 'chatgpt', tokens: nextState.tokens, last_refresh: now };
  auth.store.updated_at = now;
  const pool = auth.store.credential_pool?.['openai-codex'];
  if (Array.isArray(pool)) {
    for (const entry of pool) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.source === 'device_code') {
        entry.access_token = nextState.tokens.access_token;
        entry.refresh_token = nextState.tokens.refresh_token;
        entry.last_refresh = now;
        entry.last_status = null;
        entry.last_error_code = null;
        entry.last_error_message = null;
      }
    }
  }
  fs.writeFileSync(auth.authPath, `${JSON.stringify(auth.store, null, 2)}\n`, { mode: 0o600 });
}

function jwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return null; }
}

function codexAccessTokenExpiring(token, skewSeconds = CODEX_ACCESS_TOKEN_REFRESH_SKEW_SECONDS) {
  const payload = jwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

function requestJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = json?.error?.message || json?.error_description || json?.message || text.slice(0, 240) || `HTTP ${res.statusCode}`;
          const err = new Error(`${method} ${url} failed: ${res.statusCode} ${message}`);
          err.statusCode = res.statusCode;
          err.body = json || text;
          reject(err);
          return;
        }
        resolve(json);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${method} ${url} timeout`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshHermesCodexAuth(auth) {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.tokens.refresh_token,
    client_id: CODEX_OAUTH_CLIENT_ID
  }).toString();
  const body = await requestJson(CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    timeoutMs: 20000
  });
  const accessToken = typeof body?.access_token === 'string' ? body.access_token.trim() : '';
  if (!accessToken) throw new Error('Hermes Codex token refresh returned no access_token');
  const refreshToken = typeof body?.refresh_token === 'string' && body.refresh_token.trim() ? body.refresh_token.trim() : auth.tokens.refresh_token;
  const tokens = { ...auth.tokens, access_token: accessToken, refresh_token: refreshToken };
  saveHermesCodexAuth(auth, tokens);
  return tokens;
}

function parseWhamWindow(window) {
  if (!window || typeof window !== 'object') return null;
  const resetAtSeconds = Number(window.reset_at || 0);
  return {
    usedPercent: percent(Number(window.used_percent || 0)),
    windowDurationMins: Math.round(Number(window.limit_window_seconds || 0) / 60),
    resetsAt: resetAtSeconds ? new Date(resetAtSeconds * 1000).toISOString() : null,
    resetAfterSeconds: Number(window.reset_after_seconds || 0),
    allowed: window.allowed ?? null,
    limitReached: window.limit_reached ?? null
  };
}

function normalizeCodexWindows(primary, secondary) {
  const windows = [primary, secondary].filter(Boolean);
  if (!windows.length || windows.some(window => !(Number(window.windowDurationMins) > 0))) return { primary, secondary };
  windows.sort((a, b) => Number(a.windowDurationMins) - Number(b.windowDurationMins));
  if (windows.length === 1) {
    return Number(windows[0].windowDurationMins) >= 1440
      ? { primary: null, secondary: windows[0] }
      : { primary: windows[0], secondary: null };
  }
  return { primary: windows[0], secondary: windows[windows.length - 1] };
}

function parseCodexLimits(body, cached) {
  if (body.error) throw new Error(body.error.message || 'Codex rate limit error');
  const rl = body.rate_limit || body.result?.rateLimits || {};
  const windows = normalizeCodexWindows(
    body.rate_limit ? parseWhamWindow(rl.primary_window) : (rl.primary || null),
    body.rate_limit ? parseWhamWindow(rl.secondary_window) : (rl.secondary || null)
  );
  return {
    ok: true,
    at: new Date().toISOString(),
    cached,
    source: body.rate_limit ? 'hermes-openai-codex-auth' : 'codex-app-server',
    planType: body.plan_type || rl.planType || null,
    rateLimitReachedType: rl.rateLimitReachedType || (rl.limit_reached ? (windows.primary ? 'primary' : 'secondary') : null),
    primary: windows.primary,
    secondary: windows.secondary,
    credits: rl.credits || null
  };
}

async function fetchCodexUsageWithHermesAuth(tokens) {
  return requestJson(CODEX_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
      'User-Agent': 'passideck/0 codex-limits'
    },
    timeoutMs: 12000
  });
}

async function readCodexLimits() {
  const now = Date.now();
  if (codexLimitsCache.data && now - codexLimitsCache.at < CODEX_LIMITS_CACHE_MS) return { ...codexLimitsCache.data, cached: true };
  const auths = readHermesCodexAuths();
  const accounts = [];
  for (const auth of auths) {
    try {
      const limits = await readCodexLimitsForAuth(auth);
      accounts.push({ ...limits, index: auth.index, label: auth.label, active: auth.active });
    } catch (err) {
      accounts.push({ ok: false, index: auth.index, label: auth.label, active: auth.active, primary: null, secondary: null, error: err.message });
    }
  }
  if (!accounts.some(account => account.ok)) throw new Error(accounts[0]?.error || 'Codex limits unavailable');
  const active = selectActiveCodexAccount(accounts);
  for (const account of accounts) account.active = account === active;
  const first = accounts[0] || {};
  const data = { ...first, ok: true, at: new Date().toISOString(), cached: false, accounts };
  codexLimitsCache = { at: now, data: { ...data, cached: undefined } };
  return data;
}

function selectActiveCodexAccount(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return list.find(account => account?.active) || list[0] || null;
}

async function readCodexLimitsForAuth(auth) {
  let tokens = auth.tokens;
  if (codexAccessTokenExpiring(tokens.access_token)) tokens = await refreshHermesCodexAuth(auth);
  let body;
  try {
    body = await fetchCodexUsageWithHermesAuth(tokens);
  } catch (err) {
    if (err.statusCode !== 401 && err.statusCode !== 403) throw err;
    tokens = await refreshHermesCodexAuth({ ...auth, tokens });
    body = await fetchCodexUsageWithHermesAuth(tokens);
  }
  return parseCodexLimits(body, false);
}

function readSystemMetrics() {
  const nowCpu = cpuSample();
  const nowNet = networkSample();
  let cpu = 0;
  if (lastCpuSample) {
    const idle = nowCpu.idle - lastCpuSample.idle;
    const total = nowCpu.total - lastCpuSample.total;
    cpu = total > 0 ? (1 - idle / total) * 100 : 0;
  }
  lastCpuSample = nowCpu;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ram = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0;

  let rxPerSec = 0;
  let txPerSec = 0;
  if (lastNetSample) {
    const seconds = Math.max(0.001, (nowNet.at - lastNetSample.at) / 1000);
    rxPerSec = Math.max(0, (nowNet.rx - lastNetSample.rx) / seconds);
    txPerSec = Math.max(0, (nowNet.tx - lastNetSample.tx) / seconds);
  }
  lastNetSample = nowNet;
  const netBytes = rxPerSec + txPerSec;
  const net = percent(Math.min(100, Math.log10(netBytes + 1) * 12));
  const disk = readDiskMetrics();

  return {
    ok: true,
    at: new Date().toISOString(),
    cpu: percent(cpu),
    ram: percent(ram),
    disk: disk.percent,
    net,
    load: os.loadavg()[0],
    memory: { used: totalMem - freeMem, total: totalMem, free: freeMem },
    diskInfo: disk,
    network: { rxPerSec: Math.round(rxPerSec), txPerSec: Math.round(txPerSec) }
  };
}

function readDiskMetrics(target = '/') {
  try {
    const stats = fs.statfsSync(target);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const total = Number(stats.blocks || 0) * blockSize;
    const free = Number(stats.bavail || stats.bfree || 0) * blockSize;
    const used = Math.max(0, total - free);
    return { path: target, used, total, free, percent: total > 0 ? percent((used / total) * 100) : 0 };
  } catch (err) {
    return { path: target, used: 0, total: 0, free: 0, percent: 0, error: err.message };
  }
}

function splitCommand(command, shell) {
  const cmd = String(command || '').trim();
  const sh = shell || '/bin/bash';
  if (!cmd) return { file: sh, args: [] };
  if (isPlainShellCommand(cmd)) {
    const argv = cmd.split(/\s+/).filter(Boolean);
    if (path.basename(argv[0] || '') === 'exec') argv.shift();
    return { file: argv[0], args: argv.slice(1) };
  }

  // Run quick commands like `hermes` and `codex` inside an interactive shell.
  // Ctrl-C then interrupts the foreground CLI, not the whole PTY session, so the
  // pane drops back to a normal shell prompt instead of becoming dead.
  return { file: sh, args: ['-i'], initialInput: `${cmd}\r` };
}

function tmuxName(id) {
  return `passideck_${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`;
}

function hermesSource(id) {
  return `passideck:${id}`;
}

function normalizeIpAddress(address) {
  const value = String(address || '').trim().toLowerCase();
  const unwrapped = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  return unwrapped.startsWith('::ffff:') ? unwrapped.slice(7) : unwrapped;
}

function isLoopbackAddress(address) {
  const value = normalizeIpAddress(address);
  return value === '127.0.0.1' || value === '::1';
}

function titleBridgeHost(config = {}) {
  const host = normalizeIpAddress(config.host);
  return !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
}

function isTitleBridgeAddress(address, config = {}) {
  if (isLoopbackAddress(address)) return true;
  const remote = normalizeIpAddress(address);
  const host = normalizeIpAddress(config.host);
  return Boolean(host && host !== '0.0.0.0' && host !== '::' && remote === host);
}

function passideckTitleEnv(config = {}, sessionId = '', command = '') {
  const port = Number(config.port) || Number(process.env.PASSIDECK_PORT) || 8791;
  const host = titleBridgeHost(config);
  const urlHost = host.includes(':') ? `[${host}]` : host;
  const commandText = String(command || '');
  const isHermes = /\bhermes\b/i.test(commandText);
  const isTui = isHermes && /\s--tui\b/i.test(commandText);
  return [
    `PASSIDECK_TITLE_ENDPOINT=http://${urlHost}:${port}/internal/session-title`,
    `PASSIDECK_TITLE_GEN_LLM=${normalizeTitleGenLlm(config.titleGenLlm)}`,
    `PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://${urlHost}:${port}/internal/session-title/settings`,
    ...(sessionId && isHermes ? [`PASSIDECK_WORKING_ENDPOINT=http://${urlHost}:${port}/internal/session-working`] : []),
    ...(sessionId && isTui ? [`HERMES_TUI_SIDECAR_URL=ws://${urlHost}:${port}/ws?hermesEvents=${encodeURIComponent(sessionId)}`] : [])
  ];
}

function dynamicTitlesEnabled(config = {}) {
  return normalizeTitleGenLlm(config.titleGenLlm) !== 'off';
}

function dynamicTitleSettings(config = {}) {
  return { dynamicTitles: dynamicTitlesEnabled(config), appliesAt: 'next-session' };
}

function sanitizeDynamicTitle(value) {
  return String(value || '')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function parseTitleGeneration(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^([1-9]\d{15,21}):(\d{1,12}):([01])$/);
  if (!match) return null;
  return { raw, epoch: BigInt(match[1]), revision: BigInt(match[2]), phase: Number(match[3]) };
}

function compareTitleGenerations(left, right) {
  if (left.epoch !== right.epoch) return left.epoch > right.epoch ? 1 : -1;
  if (left.revision !== right.revision) return left.revision > right.revision ? 1 : -1;
  return left.phase - right.phase;
}

function openHermesStateDb(dbPath) {
  const file = dbPath || path.join(process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'), 'state.db');
  if (!Database || !fs.existsSync(file)) return null;
  try { return new Database(file, { readonly: true, fileMustExist: true }); }
  catch (err) { console.warn('[hermes-title] state DB unavailable:', err.message); return null; }
}

function hermesResumeIdFromArgv(argv) {
  const hermesIndex = argv.findIndex(arg => path.basename(String(arg)) === 'hermes');
  if (hermesIndex < 0) return null;
  for (let i = hermesIndex + 1; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    const candidate = arg === '--resume' || arg === '-r'
      ? String(argv[i + 1] || '')
      : (arg.startsWith('--resume=') ? arg.slice('--resume='.length) : '');
    if (candidate && /^[A-Za-z0-9_.:-]{1,160}$/.test(candidate)) return candidate;
  }
  return null;
}

function hermesActiveSessionIdFromEnv(env) {
  const entry = (Array.isArray(env) ? env : []).find(value => String(value).startsWith('HERMES_TUI_ACTIVE_SESSION_FILE='));
  const file = entry ? String(entry).slice('HERMES_TUI_ACTIVE_SESSION_FILE='.length) : '';
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096) return null;
    const id = String(JSON.parse(fs.readFileSync(file, 'utf8'))?.session_id || '');
    return /^[A-Za-z0-9_.:-]{1,160}$/.test(id) ? id : null;
  } catch { return null; }
}

async function paneProcesses(session) {
  const name = String(session?.tmuxName || '');
  if (!name || process.platform !== 'linux') return [];

  let panePid;
  try {
    const { stdout } = await execFileAsync(TMUX_CMD, tmuxArgs(['list-panes', '-t', name, '-F', '#{pane_pid}']), { encoding: 'utf8', timeout: TMUX_COMMAND_TIMEOUT_MS });
    panePid = Number(String(stdout).trim().split(/\s+/)[0]);
  } catch { return null; }
  if (!Number.isInteger(panePid) || panePid < 2) return null;

  const queue = [panePid];
  const seen = new Set();
  const processes = [];
  while (queue.length && seen.size < 256) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const readProc = async (file) => {
      try { return await fs.promises.readFile(file, 'utf8'); }
      catch { return ''; }
    };
    const [envText, argvText, stat, childrenText] = await Promise.all([
      readProc(`/proc/${pid}/environ`),
      readProc(`/proc/${pid}/cmdline`),
      readProc(`/proc/${pid}/stat`),
      readProc(`/proc/${pid}/task/${pid}/children`)
    ]);
    const env = envText.split('\0');
    const argv = argvText.split('\0').filter(Boolean);
    let pgrp = 0;
    let tpgid = 0;
    if (stat) {
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      pgrp = Number(fields[2]) || 0;
      tpgid = Number(fields[5]) || 0;
    }
    processes.push({ pid, argv, env, pgrp, tpgid });
    const children = childrenText.trim().split(/\s+/).filter(Boolean).map(Number);
    for (const child of children) if (Number.isInteger(child) && child > 1) queue.push(child);
  }
  return processes.some(process => process.argv.length) ? processes : null;
}

async function paneProcessesWithRetry(session, discover = paneProcesses, retryDelay = 25) {
  let processes = await discover(session);
  if (processes !== null) return processes;
  if (retryDelay > 0) await new Promise(resolve => setTimeout(resolve, retryDelay));
  return discover(session);
}

function hermesArgvIndex(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const executable = path.basename(String(args[0] || '')).toLowerCase();
  if (executable === 'hermes') return 0;
  if (/^(?:python(?:\d+(?:\.\d+)*)?|node|sh|bash|zsh)$/.test(executable) && path.basename(String(args[1] || '')).toLowerCase() === 'hermes') return 1;
  return -1;
}

function argvHasHermes(argv) {
  return hermesArgvIndex(argv) >= 0;
}

function argvHasHermesTui(argv) {
  const index = hermesArgvIndex(argv);
  return index >= 0 && argv.slice(index + 1).includes('--tui');
}

function argvHasTerminalApplication(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const executable = path.basename(String(args[0] || '')).toLowerCase();
  if (TERMINAL_APPLICATION_COMMANDS.has(executable)) return true;
  if (/^(?:python(?:\d+(?:\.\d+)*)?|node|sh|bash|zsh)$/.test(executable)) {
    return TERMINAL_APPLICATION_COMMANDS.has(path.basename(String(args[1] || '')).toLowerCase());
  }
  return false;
}

function foregroundProcessRecords(processes = []) {
  const records = (Array.isArray(processes) ? processes : []).filter(record => Array.isArray(record?.argv) && record.argv.length);
  const foregroundPgrp = records.find(record => Number(record.tpgid) > 1)?.tpgid;
  return foregroundPgrp
    ? records.filter(record => Number(record.pgrp) === foregroundPgrp)
    : records;
}

function foregroundHasHermes(processes = []) {
  const records = (Array.isArray(processes) ? processes : []).filter(record => Array.isArray(record?.argv) && record.argv.length);
  const foregroundPgrp = records.find(record => Number(record.tpgid) > 1)?.tpgid;
  if (!foregroundPgrp) return false;
  return records.some(record => Number(record.pgrp) === foregroundPgrp && argvHasHermes(record.argv));
}

function terminalStateFromProcesses(meta = {}, processes = []) {
  const command = String(meta.command || '').trim();
  const foregroundRecords = foregroundProcessRecords(processes);
  if (foregroundRecords.some(record => argvHasHermesTui(record.argv))) return { owner: TERMINAL_OWNER_APPLICATION, mode: 'hermes-tui' };
  if (foregroundRecords.some(record => argvHasHermes(record.argv))) return { owner: TERMINAL_OWNER_VIEWPORT, mode: TERMINAL_OWNER_VIEWPORT };
  const foreground = foregroundRecords.at(-1)?.argv || [];
  if (foreground.length) {
    const owner = argvHasTerminalApplication(foreground) ? TERMINAL_OWNER_APPLICATION : TERMINAL_OWNER_VIEWPORT;
    return { owner, mode: owner };
  }
  const declaredArgv = command.split(/\s+/).filter(Boolean);
  if (argvHasHermesTui(declaredArgv)) return { owner: TERMINAL_OWNER_APPLICATION, mode: 'hermes-tui' };
  if (argvHasHermes(declaredArgv)) return { owner: TERMINAL_OWNER_VIEWPORT, mode: TERMINAL_OWNER_VIEWPORT };
  const owner = argvHasTerminalApplication(declaredArgv) ? TERMINAL_OWNER_APPLICATION : TERMINAL_OWNER_VIEWPORT;
  return { owner, mode: owner };
}

function terminalOwnerFromProcesses(meta = {}, processes = []) {
  return terminalStateFromProcesses(meta, processes).owner;
}

function terminalOwner(session) {
  return session?.terminalOwner || terminalOwnerFromProcesses(session?.meta, session?.processSnapshot || []);
}

async function refreshTerminalOwner(session, forceLatest = false) {
  if (session.terminalStatePromise) {
    const owner = await session.terminalStatePromise;
    return forceLatest ? refreshTerminalOwner(session) : owner;
  }
  let task;
  task = (async () => {
    try {
      const processes = await paneProcesses(session);
      if (processes === null) return terminalOwner(session);
      session.processSnapshot = processes;
      const next = terminalStateFromProcesses(session?.meta, processes);
      const suspendProtected = foregroundHasHermes(processes);
      if (
        session.terminalOwner !== next.owner ||
        session.terminalMode !== next.mode ||
        session.terminalSuspendProtected !== suspendProtected
      ) {
        session.broadcast({ type: 'terminal-owner', owner: next.owner, mode: next.mode, suspendProtected });
      }
      session.terminalOwner = next.owner;
      session.terminalMode = next.mode;
      session.terminalSuspendProtected = suspendProtected;
      return next.owner;
    } finally {
      if (session.terminalStatePromise === task) session.terminalStatePromise = null;
    }
  })();
  session.terminalStatePromise = task;
  return task;
}

function scheduleTerminalOwnerRefresh(session, delay = 500) {
  if (!session.clients?.size || session.terminalOwnerTimer) return;
  session.terminalOwnerTimer = setTimeout(() => {
    session.terminalOwnerTimer = null;
    void refreshTerminalOwner(session, true);
  }, delay);
  session.terminalOwnerTimer.unref?.();
}

function clearSessionTimers(session) {
  clearTimeout(session?.terminalOwnerTimer);
  clearTimeout(session?.tmuxRefreshTimer);
  if (session) {
    session.terminalOwnerTimer = null;
    session.tmuxRefreshTimer = null;
    for (const ws of session.clients || []) {
      clearTimeout(ws.hydrationTimer);
      clearTimeout(ws.hydrationDeadlineTimer);
      ws.hydrationTimer = null;
      ws.hydrationDeadlineTimer = null;
      ws.hydrating = false;
      ws.hydrationConfirming = false;
      ws.hydrationReplay = null;
      ws.hydrationStartedAt = 0;
      ws.hydrationAttempts = 0;
      ws.hydrationBusy = false;
      ws.hydrationOutput = [];
      ws.hydrationOutputBytes = 0;
      ws.finishHydration = null;
    }
    for (const publisher of session.hermesEventPublishers || []) {
      try { publisher.close(4000, 'session closed'); } catch {}
    }
    session.hermesEventPublishers?.clear();
    session.hermesEventPublisher = null;
    session.hermesEventSessionId = null;
  }
}

function activeHermesResumeId(session) {
  for (const record of session?.processSnapshot || []) {
    const activeId = hermesActiveSessionIdFromEnv(record.env);
    if (activeId) return activeId;
    const resumedId = hermesResumeIdFromArgv(record.argv);
    if (resumedId) return resumedId;
  }
  return null;
}

function syncHermesTitles(sessions, hermesDb, resolveActiveSessionId = activeHermesResumeId) {
  if (!hermesDb) return 0;
  let findLatest;
  let findById;
  try {
    findLatest = hermesDb.prepare("SELECT id, title FROM sessions WHERE source = ? AND TRIM(COALESCE(title, '')) <> '' ORDER BY started_at DESC LIMIT 1");
    findById = hermesDb.prepare('SELECT id, title FROM sessions WHERE id = ? LIMIT 1');
  } catch (err) {
    console.warn('[hermes-title] title query unavailable:', err.message);
    return 0;
  }
  let changed = 0;
  for (const session of sessions.sessions.values()) {
    const activeId = resolveActiveSessionId(session);
    const activeRow = activeId ? findById.get(activeId) : null;
    if (activeRow && !String(activeRow.title || '').trim()) continue;
    const row = activeRow || findLatest.get(hermesSource(session.id));
    if (!row) continue;
    if (session.meta.titleSource === 'passideck-retitle' && session.meta.hermesSessionId === row.id) continue;
    const title = String(row.title || '').trim().slice(0, 160);
    if (
      session.meta.hermesSessionId === row.id &&
      String(session.meta.title || '') === title &&
      session.meta.titleSource === 'hermes-db'
    ) continue;
    session.meta.hermesSessionId = row.id;
    session.meta.titleSource = 'hermes-db';
    if (title) session.meta.title = title;
    else delete session.meta.title;
    session.broadcast({ type: 'meta', session: session.toJSON() });
    changed += 1;
  }
  return changed;
}

function sanitizeHermesEvent(frame) {
  const event = frame?.method === 'event' ? frame.params : frame;
  const type = String(event?.type || '');
  const sessionId = String(event?.session_id || '').slice(0, 160);
  if (type === 'message.start' || type === 'message.complete') return { type, session_id: sessionId };
  if (type === 'session.info') {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    return {
      type,
      session_id: sessionId,
      payload: {
        ...(typeof payload.running === 'boolean' ? { running: payload.running } : {}),
        ...(payload.title ? { title: sanitizeDynamicTitle(payload.title) } : {}),
        ...(payload.stored_session_id ? { stored_session_id: String(payload.stored_session_id).slice(0, 160) } : {})
      }
    };
  }
  if (type === 'session.title') {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    return {
      type,
      session_id: sessionId,
      payload: {
        ...(payload.title ? { title: sanitizeDynamicTitle(payload.title) } : {}),
        ...(payload.session_id ? { stored_session_id: String(payload.session_id).slice(0, 160) } : {})
      }
    };
  }
  return null;
}

function acceptHermesEvent(session, event) {
  const lifecycleId = String(event?.session_id || '').trim();
  if (!lifecycleId) return !session.hermesEventSessionId;
  if (!session.hermesEventSessionId) {
    session.hermesEventSessionId = lifecycleId;
    return true;
  }
  return session.hermesEventSessionId === lifecycleId;
}

function hermesWorkingEvent(running) {
  const value = Boolean(running);
  return {
    type: value ? 'message.start' : 'message.complete',
    session_id: '',
    payload: { running: value }
  };
}

function tmuxHas(name) {
  try { execFileSync(TMUX_CMD, tmuxArgs(['has-session', '-t', name]), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS }); return true; }
  catch { return false; }
}

function tmuxSetDefaults(name = '') {
  try { execFileSync(TMUX_CMD, tmuxArgs(['set-option', '-g', 'status', 'off']), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS }); } catch {}
  try {
    const features = execFileSync(TMUX_CMD, tmuxArgs(['show-options', '-gv', 'terminal-features']), { encoding: 'utf8', timeout: TMUX_COMMAND_TIMEOUT_MS });
    const hasHyperlinks = features.split(/\r?\n/).some(line => line.startsWith('xterm*:') && line.split(':').includes('hyperlinks'));
    if (!hasHyperlinks) execFileSync(TMUX_CMD, tmuxArgs(['set-option', '-as', 'terminal-features', ',xterm*:hyperlinks']), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS });
  } catch {}
  if (name) {
    try { execFileSync(TMUX_CMD, tmuxArgs(['set-option', '-t', name, 'status', 'off']), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS }); } catch {}
  }
}

function tmuxNew(name, cwd, launch, sessionId, config = {}, command = '') {
  if (tmuxHas(name)) { tmuxSetDefaults(name); return; }
  const bridgeEnv = passideckTitleEnv(config, sessionId, command);
  const inheritedEnvCleanup = [
    ...(bridgeEnv.some(value => value.startsWith('PASSIDECK_WORKING_ENDPOINT=')) ? [] : ['-u', 'PASSIDECK_WORKING_ENDPOINT']),
    ...(bridgeEnv.some(value => value.startsWith('HERMES_TUI_SIDECAR_URL=')) ? [] : ['-u', 'HERMES_TUI_SIDECAR_URL'])
  ];
  execFileSync(TMUX_CMD, tmuxArgs(['new-session', '-d', '-s', name, '-c', cwd, 'env', ...inheritedEnvCleanup, `PASSIDECK_SESSION=${sessionId}`, `HERMES_SESSION_SOURCE=${hermesSource(sessionId)}`, ...bridgeEnv, 'PROMPT_TOOLKIT_NO_CPR=1', 'PROMPT_TOOLKIT_BELL=false', launch.file, ...launch.args]), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS });
  tmuxSetDefaults(name);
}

function tmuxKill(name) {
  try { execFileSync(TMUX_CMD, tmuxArgs(['kill-session', '-t', name]), { stdio: 'ignore', timeout: TMUX_COMMAND_TIMEOUT_MS }); } catch {}
}

async function tmuxClientsAsync() {
  try {
    const { stdout } = await execFileAsync(TMUX_CMD, tmuxArgs([
      'list-clients', '-F', '#{client_name}\t#{client_tty}\t#{client_written}'
    ]), { encoding: 'utf8', timeout: TMUX_COMMAND_TIMEOUT_MS });
    return String(stdout).trim().split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
  } catch { return []; }
}

async function tmuxOutputClientAsync(session) {
  const clients = await tmuxClientsAsync();
  const expectedTty = String(session.tmuxClientTty || '');
  const match = clients.find(([, tty]) => tty === expectedTty);
  return match?.[0] || '';
}

async function captureTmuxHistory(session, start) {
  const clientWrittenBefore = await tmuxClientWritten(session);
  if (!Number.isFinite(clientWrittenBefore)) throw Object.assign(new Error('tmux client counter unavailable'), { code: 'tmux client counter unavailable' });
  const [{ stdout: capture }, { stdout: cursorText }] = await Promise.all([
    execFileAsync(TMUX_CMD, tmuxArgs([
      'capture-pane', '-e', '-p', '-S', start, '-t', session.tmuxName
    ]), { encoding: 'utf8', maxBuffer: TMUX_HISTORY_REPLAY_MAX_BYTES, timeout: TMUX_COMMAND_TIMEOUT_MS }),
    execFileAsync(TMUX_CMD, tmuxArgs([
      'display-message', '-p', '-t', session.tmuxName, '#{cursor_x}\t#{cursor_y}'
    ]), { encoding: 'utf8', timeout: TMUX_COMMAND_TIMEOUT_MS })
  ]);
  const clientWritten = await tmuxClientWritten(session);
  if (!Number.isFinite(clientWritten)) throw Object.assign(new Error('tmux client counter unavailable'), { code: 'tmux client counter unavailable' });
  const data = String(capture).replace(/\r?\n$/, '');
  const cursor = String(cursorText).trim().split('\t').map(Number);
  const cursorX = Number.isFinite(cursor[0]) ? cursor[0] : 0;
  const cursorY = Number.isFinite(cursor[1]) ? cursor[1] : 0;
  return { data, cursorX, cursorY, clientWrittenBefore, clientWritten };
}

async function tmuxClientWritten(session) {
  const expectedTty = String(session.tmuxClientTty || '');
  const match = (await tmuxClientsAsync()).find(([, tty]) => tty === expectedTty);
  const raw = String(match?.[2] || '');
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function tmuxCapturePane(session, owner = terminalOwner(session)) {
  const mode = session?.terminalMode || owner;
  const suspendProtected = Boolean(session?.terminalSuspendProtected);
  if (owner !== TERMINAL_OWNER_VIEWPORT) return { kind: 'live-only', owner, mode, suspendProtected, data: TERMINAL_REPLAY_DISABLED };
  if (!session?.tmuxName) return { kind: 'capture-unavailable', owner, mode, suspendProtected, data: TERMINAL_REPLAY_DISABLED, reason: 'tmux pane unavailable' };
  const outputClient = await tmuxOutputClientAsync(session);
  if (!outputClient) return { kind: 'capture-unavailable', owner, mode, suspendProtected, data: TERMINAL_REPLAY_DISABLED, reason: 'tmux client not found' };
  try {
    return { kind: 'tmux-history', owner, mode, suspendProtected, ...await captureTmuxHistory(session, '-'), truncated: false };
  } catch (err) {
    try {
      return { kind: 'tmux-history', owner, mode, suspendProtected, ...await captureTmuxHistory(session, `-${TMUX_HISTORY_REPLAY_LINES}`), truncated: true };
    } catch {
      return { kind: 'capture-unavailable', owner, mode, suspendProtected, data: TERMINAL_REPLAY_DISABLED, reason: String(err?.code || 'capture failed').slice(0, 80) };
    }
  }
}

function isMouseInput(data) {
  let input = String(data || '');
  let matched = false;
  while (input) {
    const packet = input.match(/^\x1b\[<\d+;\d+;\d+[Mm]/)
      || input.match(/^\x1b\[\d+;\d+;\d+M/)
      || input.match(/^\x1b\[M(.)(.)(.)/su);
    if (!packet) return false;
    matched = true;
    input = input.slice(packet[0].length);
  }
  return matched;
}

function isJobControlSuspendInput(data) {
  return String(data || '').includes('\x1a');
}

function queueTerminalInput(session, input, delay = 0) {
  const write = async () => {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    let terminalInput = String(input || '');
    if (isJobControlSuspendInput(terminalInput)) {
      const processes = await paneProcessesWithRetry(session);
      if (processes !== null) session.processSnapshot = processes;
      if (processes !== null && foregroundHasHermes(processes)) terminalInput = terminalInput.replaceAll('\x1a', '');
    }
    if (!terminalInput) return;
    if (isMouseInput(terminalInput) && await refreshTerminalOwner(session, true) === TERMINAL_OWNER_VIEWPORT) return;
    if (!session.pty) throw new Error('Session not available');
    session.pty.write(terminalInput);
  };
  const task = (session.inputQueue || Promise.resolve()).then(write);
  session.inputQueue = task.catch(() => {});
  return task;
}

function tmuxRefreshClient(session) {
  if (!session?.tmuxName || session.tmuxRefreshTimer) return;
  const delay = Math.max(0, 100 - (Date.now() - (session.lastTmuxRefreshAt || 0)));
  session.tmuxRefreshTimer = setTimeout(() => {
    session.tmuxRefreshTimer = null;
    session.lastTmuxRefreshAt = Date.now();
    void (async () => {
      let clients = [];
      try {
        const { stdout } = await execFileAsync(TMUX_CMD, tmuxArgs(['list-clients', '-t', session.tmuxName, '-F', '#{client_name}']), { encoding: 'utf8', timeout: TMUX_COMMAND_TIMEOUT_MS });
        clients = String(stdout).split(/\r?\n/).filter(Boolean).slice(0, 4);
      } catch {}
      await Promise.allSettled(clients.map(client => execFileAsync(TMUX_CMD, tmuxArgs(['refresh-client', '-t', client]), { timeout: TMUX_COMMAND_TIMEOUT_MS })));
    })();
  }, delay);
  session.tmuxRefreshTimer.unref?.();
}

function startTerminalHydration(session, ws) {
  session.attachSequence = (session.attachSequence || 0) + 1;
  const attachId = `${session.id}:${session.attachSequence}`;
  ws.attachId = attachId;
  ws.hydrating = true;
  ws.hydrationConfirming = false;
  ws.hydrationReplay = null;
  ws.hydrationStartedAt = Date.now();
  ws.hydrationAttempts = 0;
  ws.hydrationBusy = false;
  ws.shellHistorySent = false;
  ws.hydrationStartSequence = session.outputBytes;
  ws.hydrationOutput = [];
  ws.hydrationOutputBytes = 0;

  function finish() {
    clearTimeout(ws.hydrationTimer);
    clearTimeout(ws.hydrationDeadlineTimer);
    ws.hydrationTimer = null;
    ws.hydrationDeadlineTimer = null;
    ws.hydrating = false;
    ws.hydrationConfirming = false;
    ws.hydrationReplay = null;
    ws.hydrationStartedAt = 0;
    ws.hydrationAttempts = 0;
    ws.hydrationBusy = false;
    ws.hydrationOutput = [];
    ws.hydrationOutputBytes = 0;
    ws.finishHydration = null;
  }

  function flushHydrationOutput(boundary) {
    for (const frame of ws.hydrationOutput) {
      if (frame.sequence > boundary && !sendJson(ws, { type: 'output', data: frame.data, sequence: frame.sequence })) break;
    }
    ws.hydrationOutput = [];
    ws.hydrationOutputBytes = 0;
  }

  function sendFrame(replay, sequence) {
    ws.shellHistorySent = replay.kind === 'tmux-history';
    const sent = sendJson(ws, { type: 'replay', attachId, sequence, outputBoundary: sequence, ...replay });
    if (sent) flushHydrationOutput(sequence);
    return sent;
  }

  function fallback(reason) {
    if (ws.readyState !== 1) return finish();
    const sequence = ws.hydrationStartSequence;
    const owner = terminalOwner(session);
    sendFrame({
      kind: 'capture-unavailable', owner, mode: session.terminalMode || owner,
      suspendProtected: Boolean(session.terminalSuspendProtected), data: TERMINAL_REPLAY_DISABLED,
      reason
    }, sequence);
    finish();
  }

  function scheduleSettle() {
    clearTimeout(ws.hydrationTimer);
    ws.hydrationTimer = setTimeout(() => void settle(), TMUX_HYDRATION_SETTLE_MS);
    ws.hydrationTimer.unref?.();
  }

  async function settle() {
    if (ws.readyState !== 1 || !ws.hydrating || ws.attachId !== attachId) return;
    if (Date.now() - ws.hydrationStartedAt >= TMUX_HYDRATION_MAX_MS) return fallback('tmux hydration timeout');
    const written = await tmuxClientWritten(session);
    if (ws.readyState !== 1 || !ws.hydrating || ws.attachId !== attachId) return;
    if (written === null) return fallback('tmux client counter unavailable');
    if (written !== ws.hydrationSequence || session.outputBytes !== ws.hydrationSequence) {
      ws.hydrationConfirming = false;
      if (ws.hydrationAttempts >= TMUX_HYDRATION_MAX_ATTEMPTS) return fallback('tmux hydration remained busy');
      const delay = Math.min(1000, 25 * (2 ** Math.max(0, ws.hydrationAttempts - 1)));
      ws.hydrationTimer = setTimeout(() => void hydrate(), delay);
      ws.hydrationTimer.unref?.();
      return;
    }
    if (!ws.hydrationConfirming) {
      ws.hydrationConfirming = true;
      void hydrate();
      return;
    }
    if (!ws.hydrationReplay) return fallback('tmux replay unavailable');
    sendFrame(ws.hydrationReplay.replay, ws.hydrationReplay.sequence);
    finish();
  }

  async function hydrate() {
    if (ws.readyState !== 1 || !ws.hydrating || ws.attachId !== attachId || ws.hydrationBusy) return;
    ws.hydrationBusy = true;
    try {
      const owner = ws.hydrationAttempts === 0 ? await refreshTerminalOwner(session, true) : terminalOwner(session);
      const replay = await tmuxCapturePane(session, owner);
      if (ws.readyState !== 1 || !ws.hydrating || ws.attachId !== attachId) return;
      const sequence = replay.kind === 'tmux-history' ? replay.clientWritten : ws.hydrationStartSequence;
      ws.hydrationSequence = sequence;
      ws.hydrationAttempts += 1;
      if (replay.kind !== 'tmux-history') {
        sendFrame(replay, sequence);
        finish();
        return;
      }
      if (replay.clientWrittenBefore !== replay.clientWritten) {
        ws.hydrationConfirming = false;
        if (ws.hydrationAttempts >= TMUX_HYDRATION_MAX_ATTEMPTS) return fallback('tmux hydration remained busy');
        const delay = Math.min(1000, 25 * (2 ** Math.max(0, ws.hydrationAttempts - 1)));
        ws.hydrationTimer = setTimeout(() => void hydrate(), delay);
        ws.hydrationTimer.unref?.();
        return;
      }
      ws.hydrationReplay = { replay, sequence };
      scheduleSettle();
    } finally {
      ws.hydrationBusy = false;
    }
  }

  ws.finishHydration = fallback;
  ws.hydrationDeadlineTimer = setTimeout(() => fallback('tmux hydration timeout'), TMUX_HYDRATION_MAX_MS);
  ws.hydrationDeadlineTimer.unref?.();
  void hydrate();
}

function attachTmux(session) {
  if (!pty) throw new Error('PTY support not available');
  const name = tmuxName(session.id);
  tmuxSetDefaults(name);
  const term = pty.spawn(TMUX_CMD, tmuxArgs(['attach-session', '-t', name]), {
    name: 'xterm-256color',
    cols: Number(session.meta.cols) || 120,
    rows: Number(session.meta.rows) || 30,
    cwd: session.meta.cwd || os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', PASSIDECK_SESSION: session.id }
  });
  session.pty = term;
  session.pid = term.pid;
  session.tmuxName = name;
  session.tmuxClientTty = term.ptsName;
  session.outputBytes = 0;
  session.meta.status = 'active';
  term.onData((data) => {
    const normalized = normalizeTerminalOutput(data);
    const bytes = Buffer.from(normalized);
    session.outputBytes += bytes.length;
    for (const ws of session.clients) {
      if (ws.readyState !== 1) continue;
      if (ws.hydrating) {
        ws.hydrationOutput.push({ data: normalized, sequence: session.outputBytes });
        ws.hydrationOutputBytes += bytes.length;
        if (ws.hydrationOutputBytes > WS_BACKPRESSURE_MAX_BYTES) {
          try { ws.close(1013, 'hydration output backlog'); } catch {}
        }
        continue;
      }
      sendJson(ws, { type: 'output', data: normalized, sequence: session.outputBytes });
    }
    scheduleTerminalOwnerRefresh(session);
  });
  term.onExit(({ exitCode, signal }) => {
    for (const ws of session.clients) {
      if (ws.hydrating) ws.finishHydration?.('pty exited during hydration');
    }
    session.pty = null;
    session.pid = null;
    clearSessionTimers(session);
    if (!tmuxHas(name)) {
      session.meta.status = 'exited';
      session.meta.exitCode = exitCode;
      session.meta.statusDetail = `Exited ${exitCode}${signal ? ` ${signal}` : ''}`;
      if (db && dbModule) dbModule.markSessionExited(db, session.id, exitCode, signal || '');
      session.broadcast({ type: 'exit', exitCode, signal });
    }
  });
  return term;
}

function restoreTmuxSessions(sessions) {
  if (!db || !dbModule) return 0;
  let n = 0;
  for (const row of dbModule.getActiveSessions(db)) {
    const name = tmuxName(row.id);
    if (!tmuxHas(name)) { dbModule.markSessionExited(db, row.id, null, 'missing_tmux'); continue; }
    const s = sessions.create({ id: row.id, command: row.command, cwd: row.cwd, label: row.label });
    s.meta.createdAt = row.created_at || s.meta.createdAt;
    if (row.dynamic_title) {
      s.meta.title = sanitizeDynamicTitle(row.dynamic_title);
      s.meta.titleSource = row.title_source || 'passideck-retitle';
      s.meta.hermesSessionId = row.hermes_session_id || null;
      s.meta.titleGeneration = row.title_generation || null;
    }
    attachTmux(s);
    n++;
  }
  if (n) console.log(`[tmux] restored ${n} sessions`);
  return n;
}

function createServer(config = loadConfig()) {
  ensureDatabase();
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: TERMINAL_MAX_INPUT_BYTES });
  const sessions = new SessionManager();
  const hermesDb = openHermesStateDb(config.hermesStateDb);
  const hermesTitleTimer = setInterval(() => syncHermesTitles(sessions, hermesDb), Math.max(250, Number(config.hermesTitlePollMs) || 1000));
  hermesTitleTimer.unref?.();
  const uiEventClients = new Set();
  const uploadCleanupTimer = setInterval(() => {
    try { cleanupOldUploads(); }
    catch (err) { console.warn(`[uploads] cleanup failed: ${err.message}`); }
  }, UPLOAD_CLEANUP_INTERVAL_MS);
  uploadCleanupTimer.unref?.();
  restoreTmuxSessions(sessions);

  app.set('trust proxy', 'loopback');
  app.get('/internal/session-title/settings', (req, res) => {
    if (!isTitleBridgeAddress(req.socket?.remoteAddress, config)) return res.status(403).json({ error: 'Local host only' });
    res.json({ dynamicTitles: dynamicTitlesEnabled(config) });
  });
  app.post('/internal/session-title', express.json({ limit: '8kb' }), (req, res) => {
    if (!isTitleBridgeAddress(req.socket?.remoteAddress, config)) return res.status(403).json({ error: 'Local host only' });

    const sessionId = String(req.body?.sessionId || '').trim();
    const hermesSessionId = String(req.body?.hermesSessionId || '').trim();
    const kind = String(req.body?.kind || 'model').trim();
    const title = sanitizeDynamicTitle(req.body?.title);
    const generationRaw = String(req.body?.generation || '').trim();
    const generation = parseTitleGeneration(generationRaw);
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(sessionId)) return res.status(400).json({ error: 'Invalid session id' });
    if (hermesSessionId && !/^[A-Za-z0-9_.:-]{1,160}$/.test(hermesSessionId)) return res.status(400).json({ error: 'Invalid Hermes session id' });
    if (!title && kind !== 'reset') return res.status(400).json({ error: 'Title required' });
    if (kind !== 'model' && kind !== 'provisional' && kind !== 'reset') return res.status(400).json({ error: 'Invalid title kind' });
    if (kind === 'reset' && (title || !hermesSessionId)) return res.status(400).json({ error: 'Invalid title reset' });
    if (generationRaw && !generation) return res.status(400).json({ error: 'Invalid title generation' });

    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const currentGeneration = parseTitleGeneration(session.meta.titleGeneration);
    const targetsPreviousHermesSession = hermesSessionId &&
      session.meta.titleSource === 'hermes-db' &&
      session.meta.hermesSessionId &&
      session.meta.hermesSessionId !== hermesSessionId;
    if ((targetsPreviousHermesSession && kind !== 'reset') || (currentGeneration && (!generation || compareTitleGenerations(generation, currentGeneration) <= 0))) {
      return res.status(202).json({
        ok: true,
        stale: true,
        title: session.meta.title || '',
        titleSource: session.meta.titleSource || '',
        generation: currentGeneration?.raw || null
      });
    }

    const titleSource = kind === 'reset' ? 'passideck-reset' : kind === 'provisional' ? 'passideck-provisional' : 'passideck-retitle';
    const titleGeneration = generation?.raw || null;
    const changed = session.meta.title !== title ||
      session.meta.titleSource !== titleSource ||
      session.meta.hermesSessionId !== (hermesSessionId || null) ||
      session.meta.titleGeneration !== titleGeneration;
    session.meta.title = title;
    session.meta.titleSource = titleSource;
    session.meta.hermesSessionId = hermesSessionId || null;
    session.meta.titleGeneration = titleGeneration;
    if (db && dbModule) dbModule.saveDynamicTitle(db, session.id, title, titleSource, hermesSessionId, titleGeneration);
    if (changed) session.broadcast({ type: 'meta', session: session.toJSON() });
    res.json({ ok: true, title, titleSource, generation: titleGeneration });
  });
  app.use('/internal/session-title', (err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    return next(err);
  });
  app.post('/internal/session-working', express.json({ limit: '2kb' }), (req, res) => {
    if (!isTitleBridgeAddress(req.socket?.remoteAddress, config)) return res.status(403).json({ error: 'Local host only' });
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId || typeof req.body?.working !== 'boolean') return res.status(400).json({ error: 'sessionId and boolean working are required' });
    const turnId = String(req.body?.turnId || '').trim();
    if (turnId && !/^[A-Za-z0-9_.:-]{1,160}$/.test(turnId)) return res.status(400).json({ error: 'Invalid turn id' });
    if (req.body?.reset !== undefined && typeof req.body.reset !== 'boolean') return res.status(400).json({ error: 'Invalid reset flag' });
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (req.body.reset && req.body.working !== false) return res.status(400).json({ error: 'Reset must clear working state' });
    const currentTurnId = String(session.hermesWorkingTurnId || '');
    if (!req.body.working && !req.body.reset && currentTurnId && turnId !== currentTurnId) {
      return res.status(202).json({ ok: true, stale: true, working: true, turnId: currentTurnId });
    }
    session.hermesRunning = req.body.working;
    session.hermesWorkingTurnId = req.body.working && !req.body.reset ? (turnId || null) : null;
    session.broadcast({ type: 'hermes-event', event: hermesWorkingEvent(session.hermesRunning) });
    res.json({ ok: true, working: session.hermesRunning, turnId: session.hermesWorkingTurnId });
  });
  app.use('/internal/session-working', (err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    return next(err);
  });
  app.use(express.json({ limit: UPLOAD_JSON_LIMIT }));
  app.use('/api', requestGuard);
  app.use('/uploads', express.static(uploadsRoot(), { setHeaders: setUploadHeaders }));

  app.get('/api/health', (_req, res) => {
    const mem = process.memoryUsage();
    const list = sessions.getAll();
    const activePids = list.filter(s => s.pid).length;
    res.json({
      ok: true,
      version: PASSIDECK_VERSION,
      sessions: list.length,
      activePids,
      memory: { rss: Math.round(mem.rss / 1024 / 1024), heapUsed: Math.round(mem.heapUsed / 1024 / 1024) },
      uptime: process.uptime(),
      pid: process.pid
    });
  });
  app.get('/api/settings', (_req, res) => res.json(dynamicTitleSettings(config)));
  app.put('/api/settings', (req, res) => {
    if (typeof req.body?.dynamicTitles !== 'boolean') return res.status(400).json({ error: 'dynamicTitles must be boolean' });
    if (process.env.PASSIDECK_TITLE_GEN_LLM) return res.status(409).json({ error: 'Dynamic titles are managed by PASSIDECK_TITLE_GEN_LLM' });
    try {
      config.titleGenLlm = writeTitleGenLlm(req.body.dynamicTitles ? 'host_aux_title' : 'off');
      res.json(dynamicTitleSettings(config));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/system-metrics', (_req, res) => res.json(readSystemMetrics()));
  app.get('/api/codex-limits', async (_req, res) => {
    try { res.json(await readCodexLimits()); }
    catch (err) { res.status(503).json({ ok: false, error: err.message }); }
  });
  app.get('/api/ui-state', (_req, res) => res.json(readUiState()));
  app.get('/api/ui-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    uiEventClients.add(res);
    req.on('close', () => uiEventClients.delete(res));
  });
  function saveUiStateHandler(req, res) {
    try {
      const current = readUiState();
      const revision = Math.max(0, Math.floor(Number(req.body?.revision) || 0));
      if (revision !== current.revision) return res.status(409).json(current);
      const saved = writeUiState(req.body || {});
      const event = `data: ${JSON.stringify(saved)}\n\n`;
      for (const client of uiEventClients) client.write(event);
      res.json(saved);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  app.put('/api/ui-state', saveUiStateHandler);
  app.post('/api/ui-state', saveUiStateHandler);

  app.get('/api/sessions', (_req, res) => res.json(sessions.getAll()));

  app.post('/api/uploads', (req, res) => {
    try { res.json(saveUploadedBlob(req.body || {})); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.post('/api/uploads/cleanup', (req, res) => {
    const maxDays = Math.max(1, Math.min(365, Number(req.body?.maxDays) || UPLOAD_RETENTION_DAYS));
    const result = cleanupOldUploads(maxDays);
    res.json({ ok: true, maxDays, ...result });
  });

  app.post('/api/sessions', (req, res) => {
    if (!pty) return res.status(500).json({ error: 'PTY support not available' });
    const { command, cwd, label, cols, rows } = req.body || {};
    const resolvedCwd = resolveCwd(cwd);
    const launch = splitCommand(command || config.shell || '/bin/bash', config.shell || '/bin/bash');
    const session = sessions.create({ command: command || config.shell || '/bin/bash', cwd: resolvedCwd, label, cols, rows });

    try {
      const name = tmuxName(session.id);
      tmuxNew(name, resolvedCwd, launch, session.id, config, command || config.shell || '/bin/bash');
      attachTmux(session);
      if (db && dbModule) dbModule.upsertSession(db, session);
      if (launch.initialInput) void queueTerminalInput(session, launch.initialInput, 250).catch(() => {});
      console.log(`[tmux] ${session.id} attach=${session.pid} session=${name} command=${session.meta.command}`);
      res.json(session.toJSON());
    } catch (err) {
      clearSessionTimers(session);
      tmuxKill(tmuxName(session.id));
      sessions.remove(session.id);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sessions/:id/input', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.pty) return res.status(404).json({ error: 'Session not found' });
    const text = String(req.body?.text ?? req.body?.data ?? '');
    if (Buffer.byteLength(text) > TERMINAL_MAX_INPUT_BYTES) return res.status(413).json({ error: 'Terminal input too large' });
    try { await queueTerminalInput(session, text); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/sessions/:id/resize', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.pty) return res.status(404).json({ error: 'Session not found' });
    const cols = Math.min(TERMINAL_MAX_DIMENSION, Math.max(2, Number(req.body?.cols) || 120));
    const rows = Math.min(TERMINAL_MAX_DIMENSION, Math.max(2, Number(req.body?.rows) || 30));
    session.meta.cols = cols;
    session.meta.rows = rows;
    try { session.pty.resize(cols, rows); res.json({ ok: true, cols, rows }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (s) {
      clearSessionTimers(s);
      tmuxKill(tmuxName(s.id));
    }
    const removed = sessions.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Session not found' });
    if (db && dbModule) dbModule.markSessionExited(db, req.params.id, 0, 'closed');
    res.json({ ok: true });
  });

  app.use(compression(), express.static(path.join(__dirname, '..', '..', 'client', 'public')));

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const publisherSessionId = url.searchParams.get('hermesEvents');
    if (publisherSessionId !== null) {
      if (!isTitleBridgeAddress(req.socket?.remoteAddress, config)) return ws.close(4003, 'Local host only');
      const session = sessions.get(publisherSessionId);
      if (!session) return ws.close(4001, 'Session not found');
      if (!session.hermesEventPublishers) session.hermesEventPublishers = new Set();
      for (const oldPublisher of session.hermesEventPublishers) {
        try { oldPublisher.close(4000, 'superseded'); } catch {}
      }
      session.hermesEventPublishers.clear();
      session.hermesEventPublishers.add(ws);
      session.hermesEventPublisher = ws;
      session.hermesEventSessionId = null;
      session.hermesRunning = null;
      session.broadcast({ type: 'hermes-events', connected: true, running: null });
      ws.on('message', raw => {
        if (session.hermesEventPublisher !== ws) return;
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch { return; }
        const event = sanitizeHermesEvent(frame);
        if (!event) return;
        if (!acceptHermesEvent(session, event)) return;
        if (event.type === 'message.start') {
          session.hermesRunning = true;
          session.hermesWorkingTurnId = null;
        }
        if (event.type === 'message.complete') {
          session.hermesRunning = false;
          session.hermesWorkingTurnId = null;
        }
        if (event.type === 'session.info' && typeof event.payload?.running === 'boolean') {
          session.hermesRunning = event.payload.running;
          session.hermesWorkingTurnId = null;
        }
        const title = String(event.payload?.title || '').trim();
        const storedSessionId = String(event.payload?.stored_session_id || '').trim();
        if (title && storedSessionId && !(
          session.meta.titleSource === 'passideck-retitle' && session.meta.hermesSessionId === storedSessionId
        )) {
          session.meta.title = title;
          session.meta.titleSource = 'hermes-event';
          session.meta.hermesSessionId = storedSessionId;
          session.broadcast({ type: 'meta', session: session.toJSON() });
        }
        session.broadcast({ type: 'hermes-event', event });
      });
      ws.on('close', () => {
        session.hermesEventPublishers.delete(ws);
        if (session.hermesEventPublisher === ws) {
          session.hermesEventPublisher = null;
          session.hermesEventSessionId = null;
          session.hermesRunning = null;
          session.hermesWorkingTurnId = null;
          session.broadcast({ type: 'hermes-events', connected: false });
        }
      });
      return;
    }
    if (!websocketAllowed(req, url)) return ws.close(4003, 'Unauthorized');
    const session = sessions.get(url.searchParams.get('session'));
    if (!session) return ws.close(4001, 'Session not found');
    session.clients.add(ws);
    sendJson(ws, { type: 'meta', session: session.toJSON() });
    if (session.hermesEventPublishers?.size) sendJson(ws, { type: 'hermes-events', connected: true, running: session.hermesRunning ?? null });
    else if (typeof session.hermesRunning === 'boolean') sendJson(ws, { type: 'hermes-event', event: hermesWorkingEvent(session.hermesRunning) });
    startTerminalHydration(session, ws);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'ping') return sendJson(ws, { type: 'pong' });
      if (msg.type === 'replay-ack' && msg.attachId === ws.attachId) {
        ws.shellHistorySent = false;
        return;
      }
      if (msg.type === 'input' && session.pty) {
        void queueTerminalInput(session, String(msg.data || '')).catch(() => {});
      }
      if (msg.type === 'redraw' && session.pty) {
        if (ws.shellHistorySent) {
          ws.shellHistorySent = false;
          return;
        }
        tmuxRefreshClient(session);
      }
      if (msg.type === 'resize' && session.pty) {
        const cols = Math.min(TERMINAL_MAX_DIMENSION, Math.max(2, Number(msg.cols) || 120));
        const rows = Math.min(TERMINAL_MAX_DIMENSION, Math.max(2, Number(msg.rows) || 30));
        session.meta.cols = cols;
        session.meta.rows = rows;
        try { session.pty.resize(cols, rows); } catch {}
      }
    });

    ws.on('close', () => {
      clearTimeout(ws.hydrationTimer);
      clearTimeout(ws.hydrationDeadlineTimer);
      ws.hydrationTimer = null;
      ws.hydrationDeadlineTimer = null;
      ws.hydrating = false;
      ws.hydrationConfirming = false;
      ws.hydrationReplay = null;
      ws.hydrationStartedAt = 0;
      ws.hydrationAttempts = 0;
      ws.hydrationBusy = false;
      ws.hydrationOutput = [];
      ws.hydrationOutputBytes = 0;
      ws.finishHydration = null;
      session.clients.delete(ws);
    });
  });

  async function close() {
    clearInterval(hermesTitleTimer);
    clearInterval(uploadCleanupTimer);
    for (const client of wss.clients) client.terminate();
    for (const client of uiEventClients) client.end();
    uiEventClients.clear();
    for (const session of sessions.sessions.values()) {
      clearSessionTimers(session);
      if (session.pid) try { process.kill(session.pid, 'SIGTERM'); } catch {}
    }
    await new Promise(resolve => wss.close(() => resolve()));
    if (server.listening) await new Promise(resolve => server.close(() => resolve()));
    try { hermesDb?.close(); } catch {}
    try { db?.close(); } catch {}
    db = null;
  }

  return { app, server, wss, sessions, close };
}

module.exports = { createServer, loadConfig, readCodexLimits, readHermesCodexAuth, readHermesCodexAuths, saveHermesCodexAuth, selectActiveCodexAccount, parseCodexLimits, saveUploadedBlob, normalizeMime, syncHermesTitles, hermesResumeIdFromArgv, hermesActiveSessionIdFromEnv, terminalOwnerFromProcesses, terminalStateFromProcesses, foregroundHasHermes, paneProcessesWithRetry, acceptHermesEvent, isPlainShellCommand, isMouseInput, isJobControlSuspendInput, splitCommand, isLoopbackAddress, isTitleBridgeAddress, passideckTitleEnv, dynamicTitleSettings, UPLOAD_MIME_ALLOWLIST };

if (require.main === module) {
  const config = loadConfig();
  const { server, close } = createServer(config);
  const port = config.port || 3000;
  const host = config.host || '127.0.0.1';
  const result = cleanupOldUploads();
  if (result.removed > 0) console.log(`[uploads] cleaned ${result.removed} files (${Math.round(result.bytes/1024)}KB)`);

  function gracefulShutdown(sig) {
    console.log(`[shutdown] ${sig} received, detaching tmux clients...`);
    close().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(port, host, () => console.log(`PassiDeck http://${host}:${port}`));
}
