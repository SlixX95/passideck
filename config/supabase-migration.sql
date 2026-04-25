-- Mnestra RAG Tables
-- Multi-layer memory: session → project → developer (cross-project)
-- Run this in your Supabase SQL editor

-- Session-level memory (per terminal session)
CREATE TABLE IF NOT EXISTS mnestra_session_memory (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  project TEXT,
  developer_id TEXT NOT NULL DEFAULT 'default',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_memory_session ON mnestra_session_memory(session_id);
CREATE INDEX idx_session_memory_developer ON mnestra_session_memory(developer_id);
CREATE INDEX idx_session_memory_ts ON mnestra_session_memory(timestamp DESC);

-- Project-level memory (shared across sessions within a project)
CREATE TABLE IF NOT EXISTS mnestra_project_memory (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  project TEXT NOT NULL,
  developer_id TEXT NOT NULL DEFAULT 'default',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_memory_project ON mnestra_project_memory(project);
CREATE INDEX idx_project_memory_developer ON mnestra_project_memory(developer_id);
CREATE INDEX idx_project_memory_ts ON mnestra_project_memory(timestamp DESC);

-- Developer-level memory (cross-project patterns and context)
CREATE TABLE IF NOT EXISTS mnestra_developer_memory (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  project TEXT,
  developer_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_developer_memory_developer ON mnestra_developer_memory(developer_id);
CREATE INDEX idx_developer_memory_ts ON mnestra_developer_memory(timestamp DESC);

-- Command log (full-text searchable command history)
CREATE TABLE IF NOT EXISTS mnestra_commands (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'command_executed',
  payload JSONB NOT NULL DEFAULT '{}',
  project TEXT,
  developer_id TEXT NOT NULL DEFAULT 'default',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commands_developer ON mnestra_commands(developer_id);
CREATE INDEX idx_commands_project ON mnestra_commands(project);
CREATE INDEX idx_commands_ts ON mnestra_commands(timestamp DESC);

-- Enable full-text search on command payloads
CREATE INDEX idx_commands_fts ON mnestra_commands
  USING GIN ((payload->>'command') gin_trgm_ops);

-- Enable the trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RLS policies (enable row-level security for multi-tenant)
ALTER TABLE mnestra_session_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mnestra_project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mnestra_developer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mnestra_commands ENABLE ROW LEVEL SECURITY;

-- Allow insert from anon/authenticated for the sync process
CREATE POLICY "Allow insert for all" ON mnestra_session_memory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow insert for all" ON mnestra_project_memory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow insert for all" ON mnestra_developer_memory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow insert for all" ON mnestra_commands FOR INSERT WITH CHECK (true);

-- Read access scoped to developer_id
CREATE POLICY "Read own data" ON mnestra_session_memory FOR SELECT USING (developer_id = current_setting('request.jwt.claims', true)::json->>'sub' OR developer_id = 'default');
CREATE POLICY "Read own data" ON mnestra_project_memory FOR SELECT USING (developer_id = current_setting('request.jwt.claims', true)::json->>'sub' OR developer_id = 'default');
CREATE POLICY "Read own data" ON mnestra_developer_memory FOR SELECT USING (developer_id = current_setting('request.jwt.claims', true)::json->>'sub' OR developer_id = 'default');
CREATE POLICY "Read own data" ON mnestra_commands FOR SELECT USING (developer_id = current_setting('request.jwt.claims', true)::json->>'sub' OR developer_id = 'default');

-- Useful view: recent activity across all layers
CREATE OR REPLACE VIEW mnestra_recent_activity AS
  SELECT 'session' as layer, * FROM mnestra_session_memory
  UNION ALL
  SELECT 'project' as layer, * FROM mnestra_project_memory
  UNION ALL
  SELECT 'developer' as layer, * FROM mnestra_developer_memory
  ORDER BY timestamp DESC
  LIMIT 100;
