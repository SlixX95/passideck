-- Rumen tables migration
-- Paste this into Supabase Dashboard → SQL Editor → New Query → Run
-- These tables are ADDITIVE — they don't modify or affect existing tables

BEGIN;

-- Track Rumen processing jobs
CREATE TABLE IF NOT EXISTS rumen_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  sessions_processed INT DEFAULT 0,
  insights_generated INT DEFAULT 0,
  questions_generated INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insights: synthesized cross-project knowledge
CREATE TABLE IF NOT EXISTS rumen_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES rumen_jobs(id),
  source_memory_ids UUID[] DEFAULT '{}',
  projects TEXT[] DEFAULT '{}',
  insight_text TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0.5,
  acted_upon BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions Rumen wants to ask
CREATE TABLE IF NOT EXISTS rumen_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES rumen_jobs(id),
  session_id UUID,
  question TEXT NOT NULL,
  context TEXT,
  asked_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rumen_jobs_status ON rumen_jobs(status);
CREATE INDEX IF NOT EXISTS idx_rumen_insights_job ON rumen_insights(job_id);
CREATE INDEX IF NOT EXISTS idx_rumen_insights_projects ON rumen_insights USING GIN(projects);
CREATE INDEX IF NOT EXISTS idx_rumen_questions_job ON rumen_questions(job_id);

COMMIT;

-- Verify
SELECT 'rumen_jobs' AS table_name, COUNT(*) FROM rumen_jobs
UNION ALL
SELECT 'rumen_insights', COUNT(*) FROM rumen_insights
UNION ALL
SELECT 'rumen_questions', COUNT(*) FROM rumen_questions;
