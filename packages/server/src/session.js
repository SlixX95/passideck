const { randomUUID } = require('crypto');
const os = require('os');
const WS_BACKPRESSURE_MAX_BYTES = 1024 * 1024;

function sendJson(ws, message) {
  if (ws?.readyState !== 1) return false;
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  const bytes = Buffer.byteLength(payload);
  if ((Number(ws.bufferedAmount) || 0) + bytes > WS_BACKPRESSURE_MAX_BYTES) {
    try { ws.close(1013, 'websocket backpressure'); } catch {}
    return false;
  }
  try { ws.send(payload); return true; }
  catch { return false; }
}

class Session {
  constructor(options = {}) {
    this.id = options.id || randomUUID();
    this.pty = null;
    this.pid = null;
    this.clients = new Set();
    this.hermesRunning = null;
    this.hermesWorkingTurnId = null;
    this.meta = {
      label: options.label || options.command || 'Terminal',
      command: options.command || '',
      cwd: options.cwd || os.homedir(),
      home: os.homedir(),
      createdAt: new Date().toISOString(),
      status: 'starting',
      statusDetail: '',
      exitCode: null,
      cols: options.cols || 120,
      rows: options.rows || 30
    };
  }

  broadcast(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const ws of this.clients) sendJson(ws, payload);
  }

  toJSON() {
    return {
      id: this.id,
      pid: this.pid,
      meta: this.meta
    };
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(options = {}) {
    const session = new Session(options);
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  getAll() {
    for (const [id, session] of this.sessions) {
      if (session.meta.status === 'exited' && session.clients.size === 0) this.sessions.delete(id);
    }
    return Array.from(this.sessions.values()).map(s => s.toJSON());
  }

  remove(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    for (const ws of session.clients) { try { ws.close(4000, 'closed'); } catch {} }
    session.clients.clear();
    try { session.pty?.kill(); } catch {}
    this.sessions.delete(id);
    return session;
  }
}

module.exports = { Session, SessionManager, WS_BACKPRESSURE_MAX_BYTES, sendJson };
