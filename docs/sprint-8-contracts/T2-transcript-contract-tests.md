# T2 — Transcript API Contract Tests

## Goal

Write contract tests proving the transcript endpoints return the shapes the client expects. The ChatGPT audit found a contract mismatch that was fixed in commit bb9bfd9 — these tests prevent regression.

### Test file: tests/transcript-contract.test.js

Use `node:test` (built-in, no deps). The tests should:

1. Start the server programmatically (or use fetch against localhost:3000 if the server is running)
2. Test `GET /api/transcripts/recent?minutes=60`:
   - Response is JSON
   - Response has `sessions` array
   - Each session has `session_id` and `chunks` array
3. Test `GET /api/transcripts/search?q=test`:
   - Response is JSON
   - Response has `results` array
4. Test `GET /api/transcripts/:sessionId` with a valid session ID:
   - Response is JSON
   - Response has `content` (string), `lines` (array), `chunks` (array)
5. Test `GET /api/transcripts/:sessionId` with a nonexistent ID:
   - Response has empty `content`, empty `lines`, empty `chunks`

If the server isn't running or DATABASE_URL isn't set, tests should skip gracefully (not fail CI).

## Files you own
- tests/transcript-contract.test.js (create)

## Acceptance criteria
- [ ] Tests verify response shapes match client expectations
- [ ] Tests pass when server is running with DATABASE_URL
- [ ] Tests skip gracefully when server is unavailable
- [ ] Write [T2] DONE to STATUS.md
