# Rumen: Tier 4 Async Learning Layer

**Status:** Planning — 2026-04-09
**Position in stack:** Tier 4, sits on top of Mnestra (Tier 3 memory store)
**Tagline:** "The LLM is stateless. Rumen isn't."

---

## The Name: Rumen

### Why Rumen

A rumen is the first chamber of a ruminant's stomach where food is continuously broken down and re-processed long after the animal stops eating. The word "ruminate" literally comes from it.

**The metaphor IS the product:** your thoughts keep getting processed after you stop working.

- **Pronunciation:** ROO-men
- **Length:** 5 letters, 2 syllables, one unambiguous pronunciation
- **Availability:** `rumen.dev`, `rumen.ai`, npm `rumen`, `github.com/jhizzard/rumen` — none are claimed as major dev tools (there is a small ruby gem and a few abandoned repos, nothing that would own the namespace)
- **Theme fit:** biological naming pairs well with Mnestra (the memory system) and aligns with the "developer brain" vibe
- **Gravity:** a real word with meaning, not a coined startup name

### Names Considered and Ruled Out

| Name | Reason ruled out |
|------|------------------|
| **Memex** | Vannevar Bush's 1945 concept of a personal augmented memory; would give strong intellectual lineage, but the name has been used by a handful of projects (crawler, search tools) over the years and is cluttered |
| **Alembic** | A distillation apparatus — would be perfect, but Python/SQLAlchemy already own it |
| **Ember** | Ember.js owns it |
| **Bole** (tree trunk) | Short and on-theme with the original LearningTree metaphor, but too obscure |
| **Cresset** (fire that keeps burning) | Too archaic |
| **LearningTree** | Original placeholder; too descriptive, no lineage, doesn't compress well |

---

## Position in the TermDeck Stack

```
Tier 1: TermDeck          (browser UI, PTY, layouts)
Tier 2: Local SQLite      (session buffer, commands, events)
Tier 3: Mnestra            (Supabase memory store, hybrid search)
Tier 4: Rumen             (async synthesis + follow-up learning)
```

Each tier reinforces the ones below it:

- TermDeck captures everything that happens in your terminals
- Mnestra stores it durably with semantic search
- Rumen learns from it asynchronously and writes new insights back into Mnestra
- TermDeck surfaces those insights proactively in your next session

The loop gets smarter about **you specifically** the longer you use it.

---

## The Rumen Loop

```
  [recent sessions in Mnestra]
            |
            v
  1. EXTRACT — pull structured events: errors hit, fixes attempted,
     commands run, files touched, questions asked but not answered,
     decisions made
            |
            v
  2. RELATE — for each extracted item, run semantic search across
     ALL historical memories (not just current project). Find
     prior art, similar patterns, previously-solved versions.
            |
            v
  3. SYNTHESIZE — use Haiku for fast extraction, Sonnet for harder
     synthesis. Produce: "the error in session X matches the pattern
     from project Y three months ago; the fix there was Z."
            |
            v
  4. QUESTION — generate follow-up questions Rumen would ask the
     developer if it could: "did the migration actually fix the
     locking issue, or did you just work around it?"
            |
            v
  5. SURFACE — write new memories with source_type='insight' or
     'question'. Tag them with a rumen_job_id. These appear in the
     next TermDeck session as notifications or proactive hints.
```

### Phase-by-Phase Details

**Extract**
- Pull the last 24–72 hours of session memories
- Filter out trivial sessions (<3 events)
- Identify structured signals: errors thrown, tests failed, migrations run, new dependencies, commands that errored then succeeded (fix patterns)

**Relate**
- For each extracted signal, run a hybrid search across all historical memories
- Use the semantic similarity score as the gate — only relate when score > 0.7
- Return top-5 candidates per signal, cross-referenced with their project and age

**Synthesize**
- Start with Haiku for cheap extraction ("what was the actual root cause of this error?")
- Escalate to Sonnet only when the relate step returned strong matches (>0.75 similarity)
- Write the synthesis as a natural-language insight: "The 500 error in PVB last week is the same pattern as the Stripe webhook race condition you solved in scheduling-saas on Feb 3."

**Question**
- For each unresolved thread in a session, generate a single focused question
- Store the question but only surface it if the user opens a relevant session again
- Questions should be answerable in <1 sentence

**Surface**
- Write new rows into `rumen_insights` and `rumen_questions` (see schema below)
- Mark source memories as "contributed to insight X" so they can be traced

---

## Data Model

```sql
-- Track Rumen processing jobs
CREATE TABLE rumen_jobs (
  id UUID PRIMARY KEY,
  triggered_by TEXT,          -- 'schedule' | 'session_end' | 'manual'
  status TEXT,                -- 'pending' | 'running' | 'done' | 'failed'
  sessions_processed INT,
  insights_generated INT,
  questions_generated INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Insights: synthesized cross-project knowledge
CREATE TABLE rumen_insights (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES rumen_jobs(id),
  source_memory_ids UUID[],   -- which memories this was derived from
  projects TEXT[],             -- which projects are involved
  insight_text TEXT,           -- the synthesized finding
  confidence NUMERIC,
  acted_upon BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions Rumen wants to ask
CREATE TABLE rumen_questions (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES rumen_jobs(id),
  session_id UUID,              -- the session this relates to
  question TEXT,
  context TEXT,                 -- what prompted the question
  asked_at TIMESTAMPTZ,         -- when it was surfaced to user
  answered_at TIMESTAMPTZ,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Execution Model

**Runtime:** Supabase Edge Function, triggered by `pg_cron` every 15 minutes.

**Why Edge Functions:**
- Run close to the database with direct pgvector access
- Have service-role keys for cross-project memory reads
- Cost nothing until used
- Run when your laptop is closed — a cloud job, not a local daemon

**Cost Controls**
- Only process sessions with >3 events (filters out one-command sessions)
- Max 10 sessions per run
- Skip sessions that already have a completed job row
- Use Haiku for 80% of extraction work
- Escalate to Sonnet only when patterns look interesting (>0.75 similarity match)

**Rate Limiting**
- Soft cap: 100 LLM calls per day per developer
- Hard cap: 500 LLM calls per day
- If hard cap hit, fall back to Extract + Relate only (no Synthesize/Question)

---

## Integration with TermDeck UI

Three surfaces where Rumen output appears:

### 1. Top Bar Badge
A subtle "3 new insights" link next to the existing global stats. Click opens a dedicated Rumen panel showing new insights grouped by project.

### 2. Per-Terminal Hints
If an error in terminal X matches a known pattern from Rumen, a small indicator icon appears in that panel's metadata strip. Hovering shows the insight inline. One click applies the suggested fix if it's a command, or opens the related memory if it's contextual.

### 3. Morning Briefing
When you open TermDeck after being away >4 hours, a one-time modal shows:
- "Rumen looked at yesterday's work"
- N insights synthesized
- M questions it has for you
- A single "Review" button or "Dismiss"

---

## What Makes Rumen Defensible

Nothing else does this:

- **Obsidian** has plugins that index notes. They don't run when you stop editing.
- **Mem0** stores memories. It doesn't cross-reference or synthesize.
- **LangGraph** orchestrates agents. It doesn't have persistent cross-project memory.
- **Cursor / Copilot** are in-editor assistants. They forget when you close the editor.
- **tmux / screen** don't know anything about what you're doing.

None of them:
- Keep working when you stop
- Cross-reference across all your projects automatically
- Ask you follow-up questions about work you thought was done
- Synthesize insights from raw session logs

The moat is the loop: **TermDeck captures → Mnestra stores → Rumen learns → insights flow back into TermDeck**. Each tier reinforces the others. The longer you use it, the smarter it gets about you specifically.

---

## Ship Order

### v0.1 — Minimum Viable Rumen
Extract + Relate + Surface. No synthesis, no questions. Just "here are 3 past memories that match what you're doing now."
- ~200 lines of code
- 1 Supabase Edge Function
- Read-only cross-reference

### v0.2 — Synthesis
Add the Synthesize step with Haiku. Generate actual insight memories, not just pointers to old ones.
- Writes to `rumen_insights`
- Confidence scoring
- Batching for cost control

### v0.3 — Questions
Rumen starts asking you things. This is when it stops being a search tool and becomes a collaborator.
- Writes to `rumen_questions`
- Surfaces via morning briefing modal
- Tracks answered/ignored state

### v0.4 — Self-Tuning
Train a small classifier on which insights you acted upon vs ignored. Rumen learns what kind of hints you actually find useful for your specific workflow.
- Per-developer insight preference weights
- A/B testing of prompt templates
- Feedback loop into the Synthesize step

---

## Relationship to Mnestra

Rumen is **not** a replacement for Mnestra. Mnestra is the memory store; Rumen is the reasoning layer that runs on top of it.

Mnestra remains unchanged in production. Rumen writes new memories into Mnestra with special `source_type` values (`insight`, `question`), so every existing Mnestra consumer automatically benefits from Rumen's output without any code changes.

**Critical safety rule:** Rumen v0.1 runs only against TermDeck's embedded Supabase instance, not the production Mnestra database. The ~1000 existing production memories remain untouched until Rumen has been validated for at least two weeks.

---

## Open Questions for Later

1. Should Rumen's insights be versioned? (If Rumen's synthesis is wrong, can we retract without losing the source memories?)
2. How should Rumen handle contradictory memories across projects?
3. Should there be a "trust" score per memory source (some developers' notes may be more accurate than others)?
4. What's the right UI for answering Rumen's questions — modal, inline, notification?
5. Should Rumen have a kill switch per project? (e.g., "don't process my personal-finance project")

---

## File Location

This document: `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/RUMEN-PLAN.md`
