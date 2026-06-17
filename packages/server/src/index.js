const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const https = require('https');

let pty = null;
try { pty = require('@homebridge/node-pty-prebuilt-multiarch'); } catch {}

const { SessionManager } = require('./session');
const { loadConfig, configDir } = require('./config');

let db = null;
let dbModule = null;
try {
  const Database = require('better-sqlite3');
  dbModule = require('./database');
  db = dbModule.initDatabase(Database);
} catch (err) {
  console.warn('[db] SQLite not available:', err.message);
}

const UI_LAYOUTS = new Set(['auto', '1x1', '1x2', '2x1', '1x3', '3x1', '1x4', '4x1']);
const UI_THEMES = new Set(['blue', 'green', 'emerald', 'cyan', 'amber', 'purple', 'red', 'mono']);
const UI_SKINS = new Set(['neon', 'stealth', 'prism']);
const UPLOAD_RETENTION_DAYS = 7;
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_JSON_LIMIT = '72mb';
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
const tmuxArgs = (args) => [...TMUX_ARGS, ...args];

let lastCpuSample = null;
let lastNetSample = null;
let codexLimitsCache = { at: 0, data: null };
const CODEX_LIMITS_CACHE_MS = 60000;
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 300;

const UI_STATE_DEFAULT = { layout: 'auto', baseLayout: 'auto', focusedId: null, primaryId: null, activeId: null, minimized: [], theme: 'blue', skin: 'neon', fontSize: 13, chromeHidden: false, systemMonitor: false, panePrefs: { titles: {}, order: [], minimized: [], windows: {}, viewport: null }, updatedAt: null };

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
  return { titles, order: cleanIdList(src.order), minimized: cleanIdList(src.minimized), windows, viewport: vp };
}

function sanitizeUiState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...UI_STATE_DEFAULT };
  if (UI_LAYOUTS.has(src.layout)) out.layout = src.layout;
  if (UI_LAYOUTS.has(src.baseLayout) && !['focus', 'half'].includes(src.baseLayout)) out.baseLayout = src.baseLayout;
  else if (!['focus', 'half'].includes(out.layout)) out.baseLayout = out.layout;
  if (typeof src.focusedId === 'string' && src.focusedId.length <= 100) out.focusedId = src.focusedId;
  if (typeof src.primaryId === 'string' && src.primaryId.length <= 100) out.primaryId = src.primaryId;
  if (typeof src.activeId === 'string' && src.activeId.length <= 100) out.activeId = src.activeId;
  if (Array.isArray(src.minimized)) out.minimized = src.minimized.filter(id => typeof id === 'string' && id.length <= 100).slice(0, 100);
  if (UI_THEMES.has(src.theme)) out.theme = src.theme;
  if (UI_SKINS.has(src.skin)) out.skin = src.skin;
  out.fontSize = Math.max(10, Math.min(24, Number(src.fontSize) || UI_STATE_DEFAULT.fontSize));
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
  return req.headers['x-passideck-token'] || urlObj?.searchParams?.get('token') || '';
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
  const mime = normalizeMime(src.type || (match && match[1]) || 'application/octet-stream');
  requireAllowedUploadMime(mime);
  const b64 = match ? match[2] : raw;
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Empty upload');
  if (buffer.length > UPLOAD_MAX_BYTES) throw new Error('Upload too large');

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
    url: `/uploads${rel}`,
    insert: file
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

function resolveCwd(config, cwd, project) {
  const raw = cwd || config.projects?.[project]?.path || os.homedir();
  return path.resolve(String(raw).replace(/^~/, os.homedir()));
}

function isPlainShellCommand(command) {
  const cmd = String(command || '').trim();
  return !cmd || /^(zsh|bash|fish|sh|dash|tcsh|ksh|csh|pwsh|powershell|\/bin\/bash|\/bin\/sh)$/i.test(cmd);
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

function readHermesCodexAuth() {
  const authPath = codexAuthPath();
  let store;
  try {
    store = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  } catch (err) {
    throw new Error(`Hermes Codex auth unavailable at ${authPath}: ${err.message}`);
  }
  const state = store.providers?.['openai-codex'] || store['openai-codex'];
  const tokens = state?.tokens;
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token.trim() : '';
  const refreshToken = typeof tokens?.refresh_token === 'string' ? tokens.refresh_token.trim() : '';
  if (!accessToken) throw new Error(`Hermes Codex auth at ${authPath} is missing access_token`);
  if (!refreshToken) throw new Error(`Hermes Codex auth at ${authPath} is missing refresh_token`);
  return { store, state, tokens: { ...tokens, access_token: accessToken, refresh_token: refreshToken }, authPath };
}

function saveHermesCodexAuth(auth, tokens) {
  const now = new Date().toISOString();
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

function parseCodexLimits(body, cached) {
  if (body.error) throw new Error(body.error.message || 'Codex rate limit error');
  const rl = body.rate_limit || body.result?.rateLimits || {};
  const primary = body.rate_limit ? parseWhamWindow(rl.primary_window) : (rl.primary || null);
  const secondary = body.rate_limit ? parseWhamWindow(rl.secondary_window) : (rl.secondary || null);
  return {
    ok: true,
    at: new Date().toISOString(),
    cached,
    source: body.rate_limit ? 'hermes-openai-codex-auth' : 'codex-app-server',
    planType: body.plan_type || rl.planType || null,
    rateLimitReachedType: rl.rateLimitReachedType || (rl.limit_reached ? 'primary' : null),
    primary,
    secondary,
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
  const auth = readHermesCodexAuth();
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
  const data = parseCodexLimits(body, false);
  codexLimitsCache = { at: now, data: { ...data, cached: undefined } };
  return data;
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
  if (isPlainShellCommand(cmd)) return { file: cmd, args: [] };

  // Run quick commands like `hermes` and `codex` inside an interactive shell.
  // Ctrl-C then interrupts the foreground CLI, not the whole PTY session, so the
  // pane drops back to a normal shell prompt instead of becoming dead.
  return { file: sh, args: ['-i'], initialInput: `${cmd}\r` };
}

function tmuxName(id) {
  return `passideck_${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`;
}

function tmuxHas(name) {
  try { execFileSync(TMUX_CMD, tmuxArgs(['has-session', '-t', name]), { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function tmuxSetDefaults(name = '') {
  try { execFileSync(TMUX_CMD, tmuxArgs(['set-option', '-g', 'status', 'off']), { stdio: 'ignore' }); } catch {}
  if (name) {
    try { execFileSync(TMUX_CMD, tmuxArgs(['set-option', '-t', name, 'status', 'off']), { stdio: 'ignore' }); } catch {}
  }
}

function tmuxNew(name, cwd, launch) {
  if (tmuxHas(name)) { tmuxSetDefaults(name); return; }
  execFileSync(TMUX_CMD, tmuxArgs(['new-session', '-d', '-s', name, '-c', cwd, launch.file, ...launch.args]), { stdio: 'ignore' });
  tmuxSetDefaults(name);
}

function tmuxKill(name) {
  try { execFileSync(TMUX_CMD, tmuxArgs(['kill-session', '-t', name]), { stdio: 'ignore' }); } catch {}
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
  session.meta.status = 'active';
  term.onData((data) => {
    const normalized = normalizeTerminalOutput(data);
    session.appendOutput(normalized);
    if (session.ws?.readyState === 1) session.ws.send(JSON.stringify({ type: 'output', data: normalized }));
  });
  term.onExit(({ exitCode, signal }) => {
    session.pty = null;
    session.pid = null;
    if (!tmuxHas(name)) {
      session.meta.status = 'exited';
      session.meta.exitCode = exitCode;
      session.meta.statusDetail = `Exited ${exitCode}${signal ? ` ${signal}` : ''}`;
      if (db && dbModule) dbModule.markSessionExited(db, session.id, exitCode, signal || '');
      if (session.ws?.readyState === 1) session.ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
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
    attachTmux(s);
    n++;
  }
  if (n) console.log(`[tmux] restored ${n} sessions`);
  return n;
}

function createServer(config = loadConfig()) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new SessionManager();
  restoreTmuxSessions(sessions);

  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: UPLOAD_JSON_LIMIT }));
  app.use('/api', requestGuard);
  app.use('/uploads', express.static(uploadsRoot(), { setHeaders: setUploadHeaders }));
  app.use(express.static(path.join(__dirname, '..', '..', 'client', 'public')));

  app.get('/api/health', (_req, res) => {
    const mem = process.memoryUsage();
    const list = sessions.getAll();
    const activePids = list.filter(s => s.pid).length;
    res.json({
      ok: true,
      sessions: list.length,
      activePids,
      memory: { rss: Math.round(mem.rss / 1024 / 1024), heapUsed: Math.round(mem.heapUsed / 1024 / 1024) },
      uptime: process.uptime(),
      pid: process.pid
    });
  });
  app.get('/api/system-metrics', (_req, res) => res.json(readSystemMetrics()));
  app.get('/api/codex-limits', async (_req, res) => {
    try { res.json(await readCodexLimits()); }
    catch (err) { res.status(503).json({ ok: false, error: err.message }); }
  });
  app.get('/api/config', (_req, res) => res.json({ projects: config.projects || {}, defaultTheme: config.defaultTheme || 'tokyo-night' }));
  app.get('/api/ui-state', (_req, res) => res.json(readUiState()));
  app.put('/api/ui-state', (req, res) => {
    try { res.json(writeUiState(req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/ui-state', (req, res) => {
    try { res.json(writeUiState(req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

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
    const { command, cwd, label, project, cols, rows } = req.body || {};
    const resolvedCwd = resolveCwd(config, cwd, project);
    const launch = splitCommand(command || config.shell || '/bin/bash', config.shell || '/bin/bash');
    const session = sessions.create({ command: command || config.shell || '/bin/bash', cwd: resolvedCwd, label, cols, rows });

    try {
      const name = tmuxName(session.id);
      tmuxNew(name, resolvedCwd, launch);
      attachTmux(session);
      if (db && dbModule) dbModule.upsertSession(db, session);
      if (launch.initialInput) setTimeout(() => session.pty?.write(launch.initialInput), 250);
      console.log(`[tmux] ${session.id} attach=${session.pid} session=${name} command=${session.meta.command}`);
      res.json(session.toJSON());
    } catch (err) {
      sessions.remove(session.id);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sessions/:id/input', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.pty) return res.status(404).json({ error: 'Session not found' });
    session.pty.write(String(req.body?.text ?? req.body?.data ?? ''));
    res.json({ ok: true });
  });

  app.post('/api/sessions/:id/resize', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session?.pty) return res.status(404).json({ error: 'Session not found' });
    const cols = Math.max(2, Number(req.body?.cols) || 120);
    const rows = Math.max(2, Number(req.body?.rows) || 30);
    session.meta.cols = cols;
    session.meta.rows = rows;
    try { session.pty.resize(cols, rows); res.json({ ok: true, cols, rows }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (s) tmuxKill(tmuxName(s.id));
    const removed = sessions.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Session not found' });
    if (db && dbModule) dbModule.markSessionExited(db, req.params.id, 0, 'closed');
    res.json({ ok: true });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!websocketAllowed(req, url)) return ws.close(4003, 'Unauthorized');
    const session = sessions.get(url.searchParams.get('session'));
    if (!session) return ws.close(4001, 'Session not found');
    session.ws = ws;
    ws.send(JSON.stringify({ type: 'meta', session: session.toJSON() }));
    ws.send(JSON.stringify({ type: 'replay', data: '\r\n[PassiDeck reconnect: output replay disabled; live session still running]\r\n' }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'input' && session.pty) session.pty.write(String(msg.data || ''));
      if (msg.type === 'resize' && session.pty) {
        const cols = Math.max(2, Number(msg.cols) || 120);
        const rows = Math.max(2, Number(msg.rows) || 30);
        session.meta.cols = cols;
        session.meta.rows = rows;
        try { session.pty.resize(cols, rows); } catch {}
      }
    });

    ws.on('close', () => {
      if (session.ws === ws) session.ws = null;
    });
  });

  return { app, server, wss, sessions };
}

module.exports = { createServer, loadConfig, readCodexLimits, saveUploadedBlob, normalizeMime, UPLOAD_MIME_ALLOWLIST };

if (require.main === module) {
  const config = loadConfig();
  const { server, sessions } = createServer(config);
  const port = config.port || 3000;
  const host = config.host || '127.0.0.1';
  const result = cleanupOldUploads();
  if (result.removed > 0) console.log(`[uploads] cleaned ${result.removed} files (${Math.round(result.bytes/1024)}KB)`);

  function gracefulShutdown(sig) {
    console.log(`[shutdown] ${sig} received, detaching tmux clients...`);
    for (const session of Object.values(sessions.getAll())) {
      try { process.kill(session.pid, 'SIGTERM'); } catch {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(port, host, () => console.log(`PassiDeck http://${host}:${port}`));
}
