const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

let pty = null;
try { pty = require('@homebridge/node-pty-prebuilt-multiarch'); } catch {}

const { SessionManager } = require('./session');
const { loadConfig } = require('./config');

const UI_LAYOUTS = new Set(['1x1', '1x2', '2x1', '1x3', '3x1', '2x2', '3x2', '2x3', '2x4', '4x2', '3x3', 'focus', 'half']);
const UI_THEMES = new Set(['blue', 'green', 'amber', 'purple', 'red', 'mono']);
const UI_STATE_DEFAULT = { layout: '2x1', baseLayout: '2x1', focusedId: null, primaryId: null, activeId: null, theme: 'blue', updatedAt: null };

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

function createServer(config = loadConfig()) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new SessionManager();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', '..', 'client', 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.getAll().length }));
  app.get('/api/config', (_req, res) => res.json({ projects: config.projects || {}, defaultTheme: config.defaultTheme || 'tokyo-night' }));
  app.get('/api/ui-state', (_req, res) => res.json(readUiState()));
  app.put('/api/ui-state', (req, res) => {
    try { res.json(writeUiState(req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/sessions', (_req, res) => res.json(sessions.getAll()));

  app.post('/api/sessions', (req, res) => {
    if (!pty) return res.status(500).json({ error: 'PTY support not available' });
    const { command, cwd, label, project, cols, rows } = req.body || {};
    const resolvedCwd = resolveCwd(config, cwd, project);
    const launch = splitCommand(command || config.shell || '/bin/bash', config.shell || '/bin/bash');
    const session = sessions.create({ command: command || config.shell || '/bin/bash', cwd: resolvedCwd, label, cols, rows });

    try {
      const term = pty.spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: Number(cols) || 120,
        rows: Number(rows) || 30,
        cwd: resolvedCwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', PASSIDECK_SESSION: session.id }
      });
      session.pty = term;
      session.pid = term.pid;
      session.meta.status = 'active';
      term.onData((data) => {
        const normalized = normalizeTerminalOutput(data);
        session.appendOutput(normalized);
        if (session.ws?.readyState === 1) session.ws.send(JSON.stringify({ type: 'output', data: normalized }));
      });
      term.onExit(({ exitCode, signal }) => {
        session.meta.status = 'exited';
        session.meta.exitCode = exitCode;
        session.meta.statusDetail = `Exited ${exitCode}${signal ? ` ${signal}` : ''}`;
        if (session.ws?.readyState === 1) session.ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      });
      if (launch.initialInput) setTimeout(() => term.write(launch.initialInput), 150);
      console.log(`[pty] ${session.id} pid=${session.pid} command=${session.meta.command}`);
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
    const removed = sessions.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Session not found' });
    res.json({ ok: true });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const session = sessions.get(url.searchParams.get('session'));
    if (!session) return ws.close(4001, 'Session not found');
    session.ws = ws;
    ws.send(JSON.stringify({ type: 'meta', session: session.toJSON() }));
    if (session._outputBuffer) {
      ws.send(JSON.stringify({ type: 'output', data: session._outputBuffer }));
    }

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
  const { server } = createServer(config);
  const port = config.port || 3000;
  const host = config.host || '127.0.0.1';
  server.listen(port, host, () => console.log(`PassiDeck http://${host}:${port}`));
}
