-- termdeck_transcripts: append-only log of all PTY output
-- Run with: psql -f config/transcript-migration.sql "$DATABASE_URL"
-- Idempotent — safe to re-run.

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
-- (implement as a pg_cron job or scheduled function, not in this migration)
