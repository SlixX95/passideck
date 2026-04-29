// Database layer - SQLite for session persistence and command history

const path = require('path');
const os = require('os');

function initDatabase(Database) {
  const dbPath = path.join(os.homedir(), '.passideck', 'passideck.db');

  // Ensure directory exists
  const fs = require('fs');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'shell',
      project TEXT,
      label TEXT,
      command TEXT,
      cwd TEXT,
      created_at TEXT NOT NULL,
      exited_at TEXT,
      exit_code INTEGER,
      reason TEXT,
      theme TEXT DEFAULT 'tokyo-night'
    );

    CREATE TABLE IF NOT EXISTS command_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      command TEXT NOT NULL,
      output_snippet TEXT,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS rag_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      project TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      default_theme TEXT DEFAULT 'tokyo-night',
      default_command TEXT DEFAULT 'bash',
      rag_namespace TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
    CREATE INDEX IF NOT EXISTS idx_commands_session ON command_history(session_id);
    CREATE INDEX IF NOT EXISTS idx_rag_synced ON rag_events(synced);
    CREATE INDEX IF NOT EXISTS idx_rag_project ON rag_events(project);
  `);

  // Migration: add command_history.source on existing databases
  try {
    const cols = db.prepare(`PRAGMA table_info(command_history)`).all();
    const hasSource = cols.some((c) => c.name === 'source');
    if (!hasSource) {
      db.exec(`ALTER TABLE command_history ADD COLUMN source TEXT NOT NULL DEFAULT 'user'`);
      db.exec(`UPDATE command_history SET source = 'user' WHERE source IS NULL`);
      console.log("[db] Migrated command_history: added 'source' column");
    }
  } catch (err) {
    console.warn('[db] command_history.source migration failed:', err.message);
  }

  return db;
}

function logCommand(db, sessionId, command, outputSnippet, source) {
  db.prepare(`
    INSERT INTO command_history (session_id, command, output_snippet, timestamp, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, command, outputSnippet || null, new Date().toISOString(), source || 'user');
}

function logRagEvent(db, sessionId, eventType, payload, project) {
  db.prepare(`
    INSERT INTO rag_events (session_id, event_type, payload, project, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, eventType, JSON.stringify(payload), project, new Date().toISOString());
}

function getUnsyncedRagEvents(db, limit = 50) {
  return db.prepare(`
    SELECT * FROM rag_events WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?
  `).all(limit);
}

function markRagEventsSynced(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE rag_events SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
}

function getSessionHistory(db, sessionId) {
  return db.prepare(`
    SELECT * FROM command_history WHERE session_id = ? ORDER BY timestamp DESC LIMIT 50
  `).all(sessionId);
}

function getProjectSessions(db, project) {
  return db.prepare(`
    SELECT * FROM sessions WHERE project = ? ORDER BY created_at DESC
  `).all(project);
}

function upsertSession(db, session) {
  const meta = session.meta || {};
  db.prepare(`
    INSERT INTO sessions (id, type, label, command, cwd, created_at, theme)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET command=excluded.command, cwd=excluded.cwd
  `).run(
    session.id, 'shell', meta.label || '', meta.command || '', meta.cwd || os.homedir(),
    meta.createdAt || new Date().toISOString(), meta.theme || 'tokyo-night'
  );
}

function markSessionExited(db, sessionId, exitCode, reason) {
  db.prepare(`
    UPDATE sessions SET exited_at = ?, exit_code = ?, reason = ? WHERE id = ?
  `).run(new Date().toISOString(), exitCode || null, reason || '', sessionId);
}

function markAllActiveInterrupted(db) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sessions SET exited_at = ?, reason = 'interrupted'
    WHERE exited_at IS NULL
  `).run(now);
}

function getActiveSessions(db) {
  return db.prepare(`
    SELECT * FROM sessions WHERE exited_at IS NULL ORDER BY created_at DESC
  `).all();
}

function cleanupStaleSessions(db, maxAgeHours = 48) {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600000).toISOString();
  const stale = db.prepare(`
    SELECT id FROM sessions WHERE exited_at IS NULL AND created_at < ?
  `).all(cutoff);
  if (stale.length) {
    const placeholders = stale.map(() => '?').join(',');
    db.prepare(`UPDATE sessions SET exited_at = ?, reason = 'stale' WHERE id IN (${placeholders})`).run(new Date().toISOString(), ...stale.map(s => s.id));
    console.log(`[db] Marked ${stale.length} stale sessions as exited`);
  }
  return stale.length;
}

module.exports = {
  initDatabase,
  logCommand,
  logRagEvent,
  getUnsyncedRagEvents,
  markRagEventsSynced,
  getSessionHistory,
  getProjectSessions,
  upsertSession,
  markSessionExited,
  markAllActiveInterrupted,
  getActiveSessions,
  cleanupStaleSessions
};
