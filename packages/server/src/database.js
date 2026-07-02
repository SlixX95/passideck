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
      reason TEXT
    );
  `);
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

function getActiveSessions(db) {
  return db.prepare(`SELECT * FROM sessions WHERE exited_at IS NULL ORDER BY created_at DESC`).all();
}

function cleanupStaleSessions(db, maxAgeHours = 48) {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600000).toISOString();
  const stale = db.prepare(`SELECT id FROM sessions WHERE exited_at IS NULL AND created_at < ?`).all(cutoff);
  if (stale.length) {
    const placeholders = stale.map(() => '?').join(',');
    db.prepare(`UPDATE sessions SET exited_at = ?, reason = 'stale' WHERE id IN (${placeholders})`).run(new Date().toISOString(), ...stale.map(s => s.id));
    console.log(`[db] Marked ${stale.length} stale sessions as exited`);
  }
  return stale.length;
}

module.exports = { initDatabase, upsertSession, markSessionExited, getActiveSessions, cleanupStaleSessions };
