# Sprint 6 — Reliability: Launch Health + Session Transcripts

Append-only coordination log. Each terminal writes its own progress. Do NOT delete or rewrite entries — append only.

Started: 2026-04-16 ~10:45 UTC

## Mission

The 2026-04-16 live demo to Unagi (Jonathan + David) failed catastrophically:
- Claude Code inside TermDeck couldn't find the Rumen project
- Shell panel fell back to bash 3.2 with zsh profile errors
- The three-tier memory system appeared completely non-functional

The 2026-04-15 terminal crash lost all session state from Sprint 5 — recovery required 45+ minutes of file auditing and memory recall.

These two failures demand two new features before public launch:

1. **Launch health script**: TermDeck startup must verify Mnestra and Rumen are reachable and serving knowledge. If anything is broken, say so loudly — never silently degrade.
2. **Session transcript backup**: Every PTY byte gets archived to Supabase in real-time. Written constantly, read on crash recovery. Work is never lost.

## Terminals

| ID | Owner | Spec | Primary file ownership |
|----|-------|------|------------------------|
| T1 | Sprint 6 | [T1-preflight-health.md](T1-preflight-health.md) | `packages/server/src/preflight.js` (new), `packages/cli/src/index.js` (health check integration) |
| T2 | Sprint 6 | [T2-transcript-schema.md](T2-transcript-schema.md) | `packages/server/src/transcripts.js` (new), `config/transcript-migration.sql` (new), migration in `packages/server/src/setup/` |
| T3 | Sprint 6 | [T3-transcript-writer.md](T3-transcript-writer.md) | `packages/server/src/index.js` (hook PTY stdout), `packages/server/src/session.js` (transcript buffer) |
| T4 | Sprint 6 | [T4-client-health-ui.md](T4-client-health-ui.md) | `packages/client/public/app.js` (health badge + transcript viewer), `packages/client/public/style.css` (health styles) |

## File ownership — CRITICAL, read before touching any file

| File | Owner | Notes |
|------|-------|-------|
| `packages/server/src/preflight.js` (new) | T1 | Health check module. Exports `runPreflight()`. |
| `packages/cli/src/index.js` | T1 | Integrate preflight into CLI startup. |
| `packages/server/src/transcripts.js` (new) | T2 | Transcript DB client. Exports `TranscriptWriter`. |
| `config/transcript-migration.sql` (new) | T2 | DDL for `termdeck_transcripts` table. |
| `packages/server/src/index.js` | T3 | Hook PTY stdout to transcript writer. T3 ONLY touches the PTY data handler + server startup (transcript init). |
| `packages/server/src/session.js` | T3 | Add transcript buffer to Session class. |
| `packages/client/public/app.js` | T4 | Health status badge in top bar + transcript crash recovery UI. |
| `packages/client/public/style.css` | T4 | Styles for health badge and transcript panel. |
| `docs/sprint-6-reliability/STATUS.md` | All (append-only) | |

## Cross-terminal dependencies

- **T1 is independent.** Preflight runs before server fully starts; no overlap with T2/T3/T4.
- **T2 → T3:** T2 creates the TranscriptWriter module; T3 wires it into the server. T3 should wait for T2's `[T2] SCHEMA READY` before importing.
- **T4 depends on T1 + T3:** T4 reads health status from T1's `/api/health` endpoint and transcript data from T3's transcript endpoints. T4 should start with the health badge (T1 is independent) and add transcript UI after T3 signals ready.

## Coordination rules

1. **Append only to STATUS.md.** Use the format below.
2. **Never edit another terminal's files.** Ownership table is law.
3. **Flag blockers immediately** with `[Tn] BLOCKED` + reason.
4. **Sign off** with `[Tn] DONE` when your acceptance criteria are met.
5. **Keep commits atomic to your ownership.**

## Progress log format

```
## [Tn] HH:MM UTC — <short summary>
<details, 1-3 sentences>
Files touched: path/a, path/b
Next: <what's next OR DONE OR BLOCKED>
```

---

(append below)

## [T3] 10:47 UTC — Planning complete, waiting for T2
Read spec + both owned files (index.js, session.js). Reviewed T2 spec for TranscriptWriter API surface. Plan:
1. Add `transcriptChunkIndex` + `getNextChunkIndex()` to Session class
2. Import TranscriptWriter in index.js, init singleton at startup
3. Tap PTY onData to call `transcriptWriter.append()` non-blocking
4. Wire 3 REST endpoints (session transcript, search, recent)
5. Add graceful shutdown flush on SIGINT/SIGTERM
6. Config support for `transcripts.*` settings
Files touched: (none yet — waiting for T2)
Next: WAITING for [T2] SCHEMA READY

## [T2] 10:50 UTC — Migration SQL and TranscriptWriter module complete
Created both deliverables:
- `config/transcript-migration.sql` — idempotent DDL with table, 3 indexes (session order, created_at DESC, GIN FTS), RLS enabled. Apply with `psql -f`.
- `packages/server/src/transcripts.js` — `TranscriptWriter` class with: batched non-blocking `append()`, interval flush (2s default), ANSI stripping (no new deps), circuit breaker (3 errors → 60s cooldown), lazy pg.Pool, `getSessionTranscript()`, `search()` (FTS via `websearch_to_tsquery`), `getRecent(minutes)` for crash recovery, graceful `close()`.

REST endpoint contract for T3:
- `GET /api/transcripts/:sessionId` → `writer.getSessionTranscript(sessionId, {limit, since})`
- `GET /api/transcripts/search?q=...&since=...` → `writer.search(q, {sessionId, since, limit})`
- `GET /api/transcripts/recent?minutes=60` → `writer.getRecent(minutes, limit)`

Files touched: config/transcript-migration.sql (new), packages/server/src/transcripts.js (new)
Next: DONE

[T2] SCHEMA READY

[T2] DONE

## [T1] 10:55 UTC — Preflight module and CLI integration complete
Created `packages/server/src/preflight.js` with 6 independent health checks:
1. **mnestra_reachable** — HTTP GET to Mnestra /health endpoint
2. **mnestra_has_memories** — Verifies memory count > 0
3. **rumen_recent** — Queries rumen_jobs table for last successful job within 30m
4. **database_url** — pg.Pool connect + SELECT 1 against DATABASE_URL
5. **project_paths** — fs.existsSync for each project in config.yaml
6. **shell_sanity** — PTY spawn of $SHELL with echo test, 3s timeout

All checks run in parallel via Promise.all, each independently try/caught. Results cached 60s.

Exports: `runPreflight(config)`, `createHealthHandler(config)` (Express handler for GET /api/health), `printHealthBanner(result)`.

Modified `packages/cli/src/index.js` — after server.listen callback prints the banner, calls `runPreflight(config)` then `printHealthBanner()`. Non-blocking: failures warn but don't prevent startup. Colored output with ✓/✗, remediation hints for each failure.

No new npm dependencies (uses built-in `http` for health pings, `fs` for paths, node-pty for shell check).

Note for T3: wire `createHealthHandler(config)` into Express as `app.get('/api/health', createHealthHandler(config))` in index.js.

Files touched: packages/server/src/preflight.js (new), packages/cli/src/index.js (modified)
Next: DONE

[T1] DONE

## [T4] 11:02 UTC — Health badge + transcript UI complete
Implemented both deliverables in the two owned files:

**Health badge** (`app.js`):
- `setupHealthBadge()` injects badge into `topbar-stats` after rumen badge
- Polls `GET /api/health` every 30s, renders green/amber/red states
- Dropdown shows per-check detail with ✓/✗, dotted leaders, remediation hints
- Graceful degradation: 404 hides badge entirely, network error shows "offline"
- Click-outside-to-close, proper positioning below badge

**Transcript recovery panel** (`app.js`):
- `setupTranscriptUI()` injects "transcripts" button into `topbar-right`
- Probes `/api/transcripts/recent` on init — button hidden until endpoint exists
- Recent view: fetches last 60m, shows session-grouped cards with preview
- Search view: debounced text search with highlighted matches
- Replay view: full transcript with copy-to-clipboard
- Back navigation between replay and list views

**Styles** (`style.css`):
- Health badge: green/amber/red states with pulse animation
- Health dropdown: dark theme, grid layout for check rows
- Transcript modal: full-width overlay, session cards, search results, replay
- Search highlight marks in amber

Both features gracefully degrade when server endpoints return 404 — no errors, just hidden UI. No new CDN dependencies.

Files touched: packages/client/public/app.js, packages/client/public/style.css
Next: DONE (transcript UI will auto-activate when T3 wires endpoints)

[T4] DONE

## [T3] 11:05 UTC — Transcript writer wired into server + health endpoint
All 6 deliverables complete:

1. **TranscriptWriter init** in `createServer()` — singleton from `DATABASE_URL`, reads `config.transcripts.*` for batchSize/flushIntervalMs. Disabled gracefully when no DATABASE_URL.
2. **PTY output tap** — `term.onData()` calls `transcriptWriter.append(sessionId, data, byteLength)` wrapped in try/catch. Non-blocking, failure-safe.
3. **Session chunk counter** — `transcriptChunkIndex` + `getNextChunkIndex()` on Session class for monotonic ordering.
4. **REST endpoints**:
   - `GET /api/transcripts/search?q=...&since=...&limit=50` → FTS
   - `GET /api/transcripts/recent?minutes=60&limit=500` → crash recovery
   - `GET /api/transcripts/:sessionId?limit=...&since=...` → session replay
   (search + recent registered before :sessionId to avoid route collision)
5. **Graceful shutdown** — SIGINT/SIGTERM flush transcript buffer via `transcriptWriter.close()`, 5s force-exit safety net.
6. **Config support** — `transcripts.enabled`, `transcripts.batchSize`, `transcripts.flushIntervalMs` in config.yaml.

Bonus: wired T1's `createHealthHandler(config)` as `GET /api/health` per T1's request in STATUS.md.

Files touched: packages/server/src/index.js, packages/server/src/session.js
Next: DONE

[T3] ENDPOINTS READY

[T3] DONE
