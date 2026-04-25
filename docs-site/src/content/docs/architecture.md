---
title: Architecture
description: How TermDeck, Mnestra, and Rumen fit together — data flow, write path, and the async learning loop.
---

The TermDeck / Mnestra / Rumen stack is three small services with one shared
storage layer (Supabase / Postgres). Each piece is useful on its own; the
combination gives you a control-room terminal that remembers and learns.

## The three tiers

- **TermDeck** — the human-facing surface. A browser dashboard of real PTY
  terminals. Each panel has live metadata (project, status, last command, AI
  agent state). TermDeck is where work happens.
- **Mnestra** — the memory store. A durable, searchable log of what happened in
  every session. Hybrid search (keyword + semantic + recency), tiered decay,
  project affinity. Exposed over MCP and over HTTP.
- **Rumen** — the learner. A scheduled worker that reads Mnestra, extracts facts,
  relates them to prior memories, synthesises insights, and writes those
  insights back for future sessions to find.

## Data flow

```
Browser ──► TermDeck server ──► Mnestra (write + recall)
                                  │
                                  ▼
                                Rumen (async: extract → relate → synthesize → surface)
```

### Write path (hot path)

1. You type into an xterm.js panel in the browser.
2. The TermDeck server writes to the PTY. PTY stdout streams back over
   WebSocket.
3. The **session analyzer** (server-side, in
   `packages/server/src/session.js`) watches stdout and classifies events:
   command start, command output, file edit, status change, error.
4. For each salient event, the analyzer first writes to a local **SQLite
   outbox** (`rag_events` table) and then attempts an immediate
   fire-and-forget HTTP POST to Mnestra. Mnestra writes to `memory_items` in
   Supabase.
5. TermDeck never blocks on the network write. The hot path is non-blocking;
   if the immediate push fails or Mnestra is unreachable, the event stays in
   the outbox and a periodic sync loop in `packages/server/src/rag.js`
   (`_startSync`, default 10s tick) drains unsynced rows on subsequent ticks.
   Net behavior: non-blocking hot path with an eventual-consistency sync
   queue, not a true drop-on-failure path.

### Read path (on demand)

1. A panel's "Ask this terminal" box calls `POST /api/ai/query` on the TermDeck
   server.
2. TermDeck calls Mnestra's `memory_recall` (over MCP or HTTP) scoped to the
   current project.
3. Mnestra runs hybrid search against `memory_items` and returns the top
   matches, already ranked with tiered recency decay and project affinity.
4. TermDeck renders the hits back into the panel.

### Async learning loop (cold path)

Rumen runs on a schedule — typically every 15 minutes via `pg_cron` triggering
a Supabase Edge Function. It does **not** sit on the critical path for any user
interaction.

1. **Extract.** Rumen reads new rows from `memory_items` since its last cursor.
   It uses deterministic rules (no LLM) to pull structured facts: commands,
   file paths, error signatures, port numbers, agent states.
2. **Relate.** For each extracted fact, Rumen searches Mnestra for similar
   prior facts and builds a lightweight graph of "seen this before" edges.
3. **Synthesize.** (Rumen v0.4.3) A cached Haiku prompt takes a cluster of
   related facts and writes a short insight — "same CORS fix as last week",
   "this error mode has happened 3 times in scheduling-saas".
4. **Surface.** Insights are written to `rumen_insights`, tagged with
   `source_memory_ids[]` and short-form citations like `[#a3c1d2e4]`. The
   next time a TermDeck session touches a related project, those insights
   ride along in the recall response.

## Storage layout

All three tiers share a single Supabase project:

- `memory_items` — the canonical memory table, owned by Mnestra.
- `memory_embeddings` — vector index for semantic search.
- `rumen_insights` — derived insights, owned by Rumen.
- `termdeck_sessions`, `termdeck_command_history` — TermDeck-local state,
  mirrored to Supabase for cross-device continuity.

The source of truth for TermDeck's own runtime state is SQLite on the
developer's machine (`~/.termdeck/termdeck.db`); Supabase is an async replica.
For memory (Mnestra) and insights (Rumen), Supabase **is** the source of truth.

## Why three services and not one

Each tier has a different latency budget and a different failure mode, and
keeping them separate makes each one easier to reason about:

- TermDeck must never block on the network. If Mnestra is slow, your terminal
  is still fast.
- Mnestra must never do expensive work on write. Indexing and decay run in the
  background; the write path is a single insert.
- Rumen can take seconds per batch. It runs on its own schedule and nothing
  waits for it.

The tiers also evolve at different speeds. TermDeck ships weekly; Mnestra ships
on a need-to-fix basis; Rumen's prompt and extraction rules iterate constantly.
Keeping them in separate repos (and on separate release cadences) avoids the
coupling trap where a tiny Rumen prompt change forces a full TermDeck release.
