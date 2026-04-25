# T3 — Wire Transcript Writer into Server

## Goal

Hook the TranscriptWriter (built by T2) into the TermDeck server so every PTY output chunk gets archived in real time. Add REST endpoints for transcript retrieval.

## Context

T2 builds the `TranscriptWriter` module and the Supabase schema. T3's job is to integrate it into the live server: hook it into the PTY data pipeline, expose REST endpoints, and ensure graceful shutdown flushes the buffer.

**WAIT for T2's `[T2] SCHEMA READY` signal in STATUS.md before starting integration work.** You can read the spec and plan while waiting.

## Deliverables

### 1. Server startup integration in `packages/server/src/index.js`

At server startup (inside `createServer()`):
- Import `TranscriptWriter` from `./transcripts.js`
- Read `DATABASE_URL` from process.env (already loaded from secrets.env)
- Check config for `transcripts.enabled` (default `true` if DATABASE_URL is set)
- Create a singleton `TranscriptWriter` instance
- On SIGINT/SIGTERM, call `transcriptWriter.close()` before process exit

### 2. PTY output hook in `packages/server/src/index.js`

In the WebSocket handler where PTY data flows to the client, add a tap:

```js
// Existing: pty.onData → ws.send
// Add: pty.onData → transcriptWriter.append(sessionId, data, data.length)
```

This must be:
- **Non-blocking**: `append()` returns immediately, buffering internally
- **Failure-safe**: If the writer is disabled or errored, skip silently
- **Ordered**: Pass a monotonic chunk_index per session so replay is deterministic

### 3. Session-level chunk counter in `packages/server/src/session.js`

Add a `transcriptChunkIndex` counter to the Session class:
```js
this.transcriptChunkIndex = 0;
// Increment each time PTY data is captured
getNextChunkIndex() { return this.transcriptChunkIndex++; }
```

### 4. REST endpoints in `packages/server/src/index.js`

Wire the three endpoints T2 defined:

```
GET /api/transcripts/:sessionId
  → transcriptWriter.getSessionTranscript(sessionId, { limit, since })

GET /api/transcripts/search?q=...&since=...&limit=20
  → transcriptWriter.search(q, { since, limit })

GET /api/transcripts/recent?minutes=60
  → transcriptWriter.getSessionTranscript(null, { since: Date.now() - minutes*60000 })
```

### 5. Config support

In `~/.termdeck/config.yaml`, recognize:
```yaml
transcripts:
  enabled: true          # default true if DATABASE_URL is set
  flushIntervalMs: 2000  # how often to batch-write
  batchSize: 50          # max chunks per INSERT
  retentionDays: 30      # for future pg_cron cleanup
```

## Files you own
- `packages/server/src/index.js` (modify — add transcript hooks + endpoints)
- `packages/server/src/session.js` (modify — add chunk counter)

## Files you must NOT touch
- `packages/server/src/preflight.js` (T1)
- `packages/server/src/transcripts.js` (T2)
- `packages/client/public/*` (T4)
- `packages/cli/src/index.js` (T1)

## Acceptance criteria
- [ ] Every PTY output chunk is passed to `transcriptWriter.append()` without blocking the WebSocket
- [ ] Chunk ordering is deterministic per session (monotonic index)
- [ ] Server shutdown flushes transcript buffer before exit
- [ ] `GET /api/transcripts/:sessionId` returns ordered chunks
- [ ] `GET /api/transcripts/search` returns FTS results
- [ ] `GET /api/transcripts/recent` returns time-windowed results
- [ ] Transcript feature degrades gracefully when DATABASE_URL is unset
- [ ] No new npm dependencies

## Signal to other terminals
Write `[T3] ENDPOINTS READY` to STATUS.md when the REST endpoints are wired. T4 depends on this for the transcript viewer UI.
