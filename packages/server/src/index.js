const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

let pty = null;
try { pty = require('@homebridge/node-pty-prebuilt-multiarch'); } catch {}

const { SessionManager } = require('./session');
const { loadConfig } = require('./config');

let db = null;
let dbModule = null;
try {
  const Database = require('better-sqlite3');
  dbModule = require('./database');
  db = dbModule.initDatabase(Database);
} catch (err) {
  console.warn('[db] SQLite not available:', err.message);
}

const UI_LAYOUTS = new Set(['auto', '1x1', '1x2', '2x1', '1x3', '3x1', '1x4', '4x1', '2x2', '3x2', '2x3', '2x4', '4x2', '3x3', 'focus', 'half']);
const UI_THEMES = new Set(['blue', 'green', 'amber', 'purple', 'red', 'mono']);
const UPLOAD_RETENTION_DAYS = 7;

let lastCpuSample = null;
let lastNetSample = null;

const UI_STATE_DEFAULT = { layout: 'auto', baseLayout: 'auto', focusedId: null, primaryId: null, activeId: null, minimized: [], theme: 'blue', updatedAt: null };

function uiStatePath() {
  return path.join(os.homedir(), '.passideck', 'ui-state.json');
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
  return path.join(os.homedir(), '.passideck', 'uploads');
}

function safeFileName(name) {
  const base = path.basename(String(name || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'upload.bin';
}

function saveUploadedBlob(input) {
  const src = input && typeof input === 'object' ? input : {};
  const raw = String(src.data || src.base64 || '');
  const match = raw.match(/^data:([^;,]+)?;base64,(.*)$/);
  const mime = String(src.type || (match && match[1]) || 'application/octet-stream');
  const b64 = match ? match[2] : raw;
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Empty upload');
  if (buffer.length > 50 * 1024 * 1024) throw new Error('Upload too large');

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
  const cutoff = Date.now() - maxDays * 86400000;
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
  // Keep TUI output in xterm's main buffer. Alternate-screen mode kills
  // browser scrollback and makes reload reconstruction look empty/broken.
  return String(data).replace(/\x1b\[\?(?:47|1047|1048|1049)[hl]/g, '');
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

  return {
    ok: true,
    at: new Date().toISOString(),
    cpu: percent(cpu),
    ram: percent(ram),
    net,
    load: os.loadavg()[0],
    memory: { used: totalMem - freeMem, total: totalMem, free: freeMem },
    network: { rxPerSec: Math.round(rxPerSec), txPerSec: Math.round(txPerSec) }
  };
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
  try { execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function tmuxNew(name, cwd, launch) {
  if (tmuxHas(name)) return;
  execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', cwd, launch.file, ...launch.args], { stdio: 'ignore' });
}

function tmuxKill(name) {
  try { execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' }); } catch {}
}

function attachTmux(session) {
  if (!pty) throw new Error('PTY support not available');
  const name = tmuxName(session.id);
  const term = pty.spawn('tmux', ['attach-session', '-t', name], {
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

  app.use(express.json({ limit: '64mb' }));
  app.use('/uploads', express.static(uploadsRoot()));
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
  app.get('/api/config', (_req, res) => res.json({ projects: config.projects || {}, defaultTheme: config.defaultTheme || 'tokyo-night' }));
  app.get('/api/ui-state', (_req, res) => res.json(readUiState()));
  app.put('/api/ui-state', (req, res) => {
    try { res.json(writeUiState(req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/sessions', (_req, res) => res.json(sessions.getAll()));

  app.post('/api/uploads', (req, res) => {
    try { res.json(saveUploadedBlob(req.body || {})); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.post('/api/uploads/cleanup', (req, res) => {
    const maxDays = Number(req.body?.maxDays) || UPLOAD_RETENTION_DAYS;
    const result = cleanupOldUploads(maxDays);
    res.json({ ok: true, ...result });
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

module.exports = { createServer, loadConfig };

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
