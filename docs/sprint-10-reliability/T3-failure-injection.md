# T3 — Failure Injection Tests

## Goal

Prove the system handles failures gracefully: Mnestra unreachable, Supabase timeout, database gone, PTY crash.

## Implementation

### Test file: tests/failure-injection.test.js

Use `node:test`. These tests verify the server doesn't crash or hang when components fail. Requires a running server.

### Test cases

1. **Mnestra unreachable**: With server running, verify that terminal sessions still work when Mnestra is down. Create a session, run a command, verify output comes back. The Flashback query should fail silently (no crash, no 500s on other endpoints).

2. **Invalid DATABASE_URL**: Start a test where the transcript writer and Rumen pool get bad connection strings. Verify the circuit breakers trip and the server continues serving terminals. Check `/api/health` reports the failures correctly.

3. **PTY crash recovery**: Create a session, then kill the PTY process externally (`kill <pid>`). Verify the session transitions to `exited` status, the WebSocket closes cleanly, and the panel dims in the client (check via `GET /api/sessions/:id` status).

4. **Rapid session create/destroy**: Create 10 sessions in quick succession, immediately delete them. Verify no resource leaks (check session count returns to 0, no orphaned PTYs via `ps aux | grep -c termdeck`).

5. **Health endpoint under component failure**: With Mnestra stopped, verify `/api/health` still returns (doesn't hang), shows Mnestra as failed, and other checks still pass.

### Skip conditions
- Server not running → skip all

## Files you own
- tests/failure-injection.test.js (create)

## Acceptance criteria
- [ ] All 5 failure scenarios tested
- [ ] Server never crashes or hangs during failure injection
- [ ] Circuit breakers trip correctly
- [ ] Tests skip gracefully when server unavailable
- [ ] Write [T3] DONE to STATUS.md
