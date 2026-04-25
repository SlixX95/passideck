# T2 — Transcript Schema + Writer Module

## Goal

Create the Supabase table schema and a server-side writer module for real-time session transcript backup. Every byte of PTY output gets archived. Written constantly, read on crash recovery.

## Context

On 2026-04-15, a terminal crash killed all sessions and lost the final state of Sprint 5. Recovery took 45+ minutes of file auditing and memory recall. A raw transcript backup would have made recovery instant.

## Deliverables

### 1. `config/transcript-migration.sql` (new file)

```sql
-- termdeck_transcripts: append-only log of all PTY output
CREATE TABLE IF NOT EXISTS termdeck_transcripts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT NOT NULL,              -- TermDeck session UUID
  chunk_index   BIGINT NOT NULL,            -- monotonic per session, for ordering
  content       TEXT NOT NULL,              -- raw PTY output (ANSI stripped)
  raw_bytes     BIGINT NOT NULL DEFAULT 0,  -- byte count before stripping
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for session replay (ordered chunks)
CREATE INDEX IF NOT EXISTS idx_transcripts_session_order
  ON termdeck_transcripts (session_id, chunk_index);

-- Index for time-range queries (crash recovery: "what happened in the last hour?")
CREATE INDEX IF NOT EXISTS idx_transcripts_created
  ON termdeck_transcripts (created_at DESC);

-- Full-text search for finding specific output across all sessions
ALTER TABLE termdeck_transcripts
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_transcripts_fts
  ON termdeck_transcripts USING GIN (fts);

-- RLS: service-role only (no anon access to raw terminal output)
ALTER TABLE termdeck_transcripts ENABLE ROW LEVEL SECURITY;

-- Cleanup policy: transcripts older than 30 days get purged
-- (implemented as a pg_cron job, not in this migration)
```

Also add to `packages/server/src/setup/rumen/migrations/` as a numbered migration if init-rumen handles transcript setup, OR document manual application via `psql -f`.

### 2. `packages/server/src/transcripts.js` (new file)

Export a `TranscriptWriter` class:

```js
class TranscriptWriter {
  constructor(databaseUrl, options = {}) {
    // options: { batchSize: 50, flushIntervalMs: 2000, enabled: true }
  }
  
  // Queue a chunk for writing. Non-blocking. Returns immediately.
  append(sessionId, content, rawByteCount) { }
  
  // Flush pending chunks to Supabase. Called on interval and on shutdown.
  async flush() { }
  
  // Retrieve transcript for crash recovery.
  async getSessionTranscript(sessionId, { limit, since } = {}) { }
  
  // Search across all transcripts (FTS).
  async search(query, { sessionId, since, limit } = {}) { }
  
  // Graceful shutdown — flush remaining buffer.
  async close() { }
}
```

Key design decisions:
- **Batch writes**: Buffer chunks in memory, flush every 2 seconds (configurable). Never block the PTY data path.
- **ANSI stripping**: Strip escape sequences before storing `content` (keep `raw_bytes` count for diagnostics). Use a simple regex — no new deps.
- **Circuit breaker**: If Supabase returns 3 consecutive errors, disable writes for 60 seconds then retry. Log `[transcript] circuit breaker open` once. Never crash the server.
- **Connection**: Use the same `DATABASE_URL` from `~/.termdeck/secrets.env` that Rumen uses. Lazy pg.Pool creation (same pattern as index.js `getRumenPool()`).

### 3. REST endpoints (define the contract, T3 will wire them)

Document these endpoints for T3 and T4 to consume:

- `GET /api/transcripts/:sessionId` — returns ordered chunks for a session
- `GET /api/transcripts/search?q=...&since=...` — FTS across all sessions
- `GET /api/transcripts/recent?minutes=60` — everything from the last N minutes (crash recovery)

## Files you own
- `config/transcript-migration.sql` (create)
- `packages/server/src/transcripts.js` (create)

## Files you must NOT touch
- `packages/server/src/index.js` (T3 wires the endpoints)
- `packages/server/src/session.js` (T3 hooks the PTY)
- `packages/client/public/*` (T4)

## Acceptance criteria
- [ ] Migration SQL is idempotent (CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS)
- [ ] TranscriptWriter buffers and batch-flushes (never blocks PTY data path)
- [ ] ANSI sequences stripped from stored content
- [ ] Circuit breaker prevents cascade failure on Supabase outage
- [ ] `getSessionTranscript()` returns ordered chunks
- [ ] `search()` uses the FTS index
- [ ] `close()` flushes remaining buffer
- [ ] No new npm dependencies (pg already available)

## Signal to other terminals
Write `[T2] SCHEMA READY` to STATUS.md when the migration SQL and TranscriptWriter module are both done. T3 depends on this.
