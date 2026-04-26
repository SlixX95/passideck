const { v4: uuidv4 } = require('uuid');
const os = require('os');

const OUTPUT_REPLAY_LIMIT = 128 * 1024;
const REPLAY_LINE_LIMIT = 160;

function stripAnsiForReplay(data) {
  return String(data || '')
    // Drop OSC strings, DCS/APC/PM strings, and CSI/ESC controls. Replaying raw
    // terminal control streams into a fresh xterm after browser reload corrupts
    // pane contents when the original stream contained TUI/alternate-screen/cursor
    // movement state. Show a plain reconnect snapshot instead.
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[P_^][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

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
    if (this._outputBuffer.length > OUTPUT_REPLAY_LIMIT) {
      this._outputBuffer = this._outputBuffer.slice(-OUTPUT_REPLAY_LIMIT);
    }
  }

  replayOutput() {
    return this._outputBuffer.slice(-OUTPUT_REPLAY_LIMIT);
  }

  replaySnapshot() {
    const plain = stripAnsiForReplay(this._outputBuffer)
      .split('\n')
      .map(line => line.slice(-240))
      .filter((line, index, lines) => line.trim() || index === lines.length - 1)
      .slice(-REPLAY_LINE_LIMIT)
      .join('\r\n');
    return plain ? `\r\n[PassiDeck reconnect: plain snapshot, live session still running]\r\n${plain}\r\n` : '';
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

module.exports = { Session, SessionManager, stripAnsiForReplay };
