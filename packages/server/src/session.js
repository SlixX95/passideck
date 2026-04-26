const { v4: uuidv4 } = require('uuid');
const os = require('os');

class Session {
  constructor(options = {}) {
    this.id = options.id || uuidv4();
    this.pty = null;
    this.pid = null;
    this.ws = null;
    this._outputBuffer = '';
    this.meta = {
      label: options.label || options.command || 'Terminal',
      command: options.command || '',
      cwd: options.cwd || os.homedir(),
      createdAt: new Date().toISOString(),
      status: 'starting',
      statusDetail: '',
      exitCode: null,
      cols: options.cols || 120,
      rows: options.rows || 30
    };
  }

  appendOutput(data) {
    this._outputBuffer += data;
    if (this._outputBuffer.length > 1048576) {
      this._outputBuffer = this._outputBuffer.slice(-1048576);
    }
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
    return Array.from(this.sessions.values()).map(s => s.toJSON());
  }

  remove(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    try { session.ws?.close(4000, 'closed'); } catch {}
    try { session.pty?.kill(); } catch {}
    this.sessions.delete(id);
    return session;
  }
}

module.exports = { Session, SessionManager };
