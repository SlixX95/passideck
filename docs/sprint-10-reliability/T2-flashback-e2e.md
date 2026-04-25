# T2 — Flashback End-to-End Validation

## Goal

Write a test that proves the Flashback path works end-to-end: trigger an error in a PTY → output analyzer detects it → mnestra-bridge queries Mnestra → toast data is returned.

## Implementation

### Test file: tests/flashback-e2e.test.js

Use `node:test`. This test requires a running server with Mnestra configured. Skip gracefully if either is unavailable.

Test flow:
1. Check server is running (`GET /api/health`)
2. Check Mnestra is reachable (health check has `mnestra_reachable: passed`)
3. Create a session via `POST /api/sessions` with command `bash`
4. Send an error-triggering command via `POST /api/sessions/:id/input`: `cat /nonexistent/file/path\n`
5. Wait 3-5 seconds for the output analyzer to detect the error and fire the Mnestra query
6. Check session metadata via `GET /api/sessions/:id` — status should be `errored`
7. Check that the mnestra-bridge attempted a query (look for proactive_memory WS message, or check server logs, or verify via `/api/sessions/:id` that Flashback metadata exists)
8. Clean up: `DELETE /api/sessions/:id`

The test doesn't need to verify Mnestra returns a match (the test store may not have a relevant memory). It just needs to prove the pipeline fires without crashing.

### Skip conditions
- Server not running → skip all
- Mnestra not reachable → skip (Flashback can't fire without Mnestra)

## Files you own
- tests/flashback-e2e.test.js (create)

## Acceptance criteria
- [ ] Test proves error detection → mnestra-bridge query pipeline works
- [ ] Test skips gracefully when server or Mnestra unavailable
- [ ] No flaky timing issues (use polling with timeout, not fixed sleep)
- [ ] Write [T2] DONE to STATUS.md
