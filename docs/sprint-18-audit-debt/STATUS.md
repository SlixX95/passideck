# Sprint 18 — Close Remaining Audit Debt

Append-only coordination log.

## Mission

Close every remaining item flagged by the 5-auditor 360 review. After this sprint, zero open audit debt.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-wss-protocol.md | packages/client/public/app.js (WebSocket URL) |
| T2 | T2-transcript-pool-ttl.md | packages/server/src/transcripts.js (pool retry) |
| T3 | T3-rag-halfopen.md | packages/server/src/rag.js (circuit breaker half-open) |
| T4 | T4-remaining-debt.md | packages/server/src/index.js (misc), docs/POST-LAUNCH-ROADMAP.md (update) |

## Rules
1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`. 4. Sign off with `[Tn] DONE`.

---
(append below)

[T2] Added `_poolFailedAt` timestamp + `_poolRetryMs = 30_000` to TranscriptWriter constructor.
[T2] Rewrote `_getPool()` to match getRumenPool: on `_poolFailed`, check 30s elapsed, log `[transcript] retrying pool creation after 30s cooldown`, reset flag and retry. Catch block sets `_poolFailedAt = Date.now()`.
[T2] Verified all catch blocks in transcripts.js use `catch (err)`.
[T2] DONE

[T1] Read spec + STATUS. Audited `packages/client/public/app.js` for `ws://` — one occurrence at line 4 (`WS_BASE` constant); two call sites (lines 217, 1215) consume the constant.
[T1] Replaced line 4 with protocol-aware detection: `WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; WS_BASE = \`${WS_PROTOCOL}//${window.location.host}/ws\`;`. Re-grepped `ws://|wss://` in app.js → no matches remain.
[T1] Verified `scripts/start.sh`: secrets loaded lines 42-48 (before Mnestra autostart block at line 82); existing guard at lines 113-114 prints `Mnestra installed but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping` when autoStart=true but creds missing. Order correct, no edits needed.
[T1] DONE

[T3] Added 5-min half-open retry to per-table RAG circuit breaker in packages/server/src/rag.js.
  - Breaker state now tracks openedAt + halfOpen alongside count/open; `_halfOpenDelayMs = 5 * 60 * 1000`.
  - `_isCircuitOpen` flips open → half-open once 5 min elapsed and permits one attempt (logs `[rag] circuit breaker half-open for <table>, retrying`). Concurrent pushes during an in-flight half-open attempt still short-circuit.
  - Successful push in half-open → `_resetCircuit` fully clears the entry.
  - Failed push in half-open → catch block resets `openedAt`, clears `halfOpen`, keeps `open=true` → 5-min backoff restarts (logs re-open warning).
  - All catch blocks use `catch (err)`. `node --check packages/server/src/rag.js` passes.
[T3] DONE

[T4] Read spec + STATUS. Confirmed T1, T2 already DONE; T3 in flight (rag.js half-open).
[T4] index.js: added 5-line SECURITY NOTE comment above `app.get('/api/health', ...)` flagging operational-detail surface, localhost guardrail context, and remote-deploy guidance. No code change.
[T4] POST-LAUNCH-ROADMAP.md: bumped header to 0.3.9 / 2026-04-18; added "Closed in Sprint 18 (v0.3.10)" block under "Already closed in v0.3.8"; struck through V4-2 (TranscriptWriter TTL → T2), V4-4 (ws:// → T1), V5-8 (RAG half-open + telemetry → T3) with closure notes.
[T4] CONTRADICTIONS.md: dated header "(Sprint 18 closeout)"; struck #4 (`getRumenPool` permanent flag) — `index.js` already has `RUMEN_POOL_RETRY_MS = 30_000`; cross-referenced T2 closure of the parallel `TranscriptWriter._poolFailed` latch in transcripts.js.
[T4] Did NOT touch client or other server files. No edits to rag.js, transcripts.js, app.js, or any T1/T2/T3 territory.
[T4] DONE
