const path = require('path');
const fs = require('fs');
const { configDir } = require('./config');

function initDatabase(Database) {
  const dbPath = path.join(configDir(), 'passideck.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      label TEXT,
      command TEXT,
      cwd TEXT,
      created_at TEXT NOT NULL,
      exited_at TEXT,
      exit_code INTEGER,
      reason TEXT,
      dynamic_title TEXT,
      title_source TEXT,
      hermes_session_id TEXT,
      title_generation TEXT
    );
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name));
  for (const [name, type] of [['dynamic_title', 'TEXT'], ['title_source', 'TEXT'], ['hermes_session_id', 'TEXT'], ['title_generation', 'TEXT']]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
  }
  return db;
}

function upsertSession(db, session) {
  const meta = session.meta || {};
  db.prepare(`
    INSERT INTO sessions (id, label, command, cwd, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label=excluded.label, command=excluded.command, cwd=excluded.cwd, exited_at=NULL, exit_code=NULL, reason=NULL
  `).run(session.id, meta.label || '', meta.command || '', meta.cwd || '', meta.createdAt || new Date().toISOString());
}

function markSessionExited(db, sessionId, exitCode, reason) {
  db.prepare(`UPDATE sessions SET exited_at = ?, exit_code = ?, reason = ? WHERE id = ?`).run(new Date().toISOString(), exitCode || null, reason || '', sessionId);
}

function saveDynamicTitle(db, sessionId, title, titleSource, hermesSessionId, titleGeneration) {
  db.prepare(`UPDATE sessions SET dynamic_title = ?, title_source = ?, hermes_session_id = ?, title_generation = ? WHERE id = ?`)
    .run(title || '', titleSource || '', hermesSessionId || '', titleGeneration || '', sessionId);
}

function getActiveSessions(db) {
  return db.prepare(`SELECT * FROM sessions WHERE exited_at IS NULL ORDER BY created_at DESC`).all();
}

module.exports = { initDatabase, upsertSession, markSessionExited, saveDynamicTitle, getActiveSessions };
