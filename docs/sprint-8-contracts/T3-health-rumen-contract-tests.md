# T3 — Health + Rumen Insights Contract Tests

## Goal

Write contract tests for the health and Rumen insights endpoints.

### Test file: tests/health-contract.test.js

1. Test `GET /api/health`:
   - Response has `passed` (boolean), `checks` (array), `timestamp` (string)
   - Each check has `name` (string), `passed` (boolean), `detail` (string)
   - Known check names: mnestra_reachable, mnestra_has_memories, rumen_recent, database_url, project_paths, shell_sanity

### Test file: tests/rumen-contract.test.js

1. Test `GET /api/rumen/insights`:
   - Response has `insights` (array), `total` (number)
   - When no DATABASE_URL: response has `enabled: false`
2. Test `GET /api/rumen/status`:
   - Response is JSON with status information
3. Test `PATCH /api/rumen/insights/:id/seen` with a fake UUID:
   - Returns 404 or appropriate error (not 500)

If the server isn't running, tests should skip gracefully.

## Files you own
- tests/health-contract.test.js (create)
- tests/rumen-contract.test.js (create)

## Acceptance criteria
- [ ] Health endpoint contract verified (passed, checks array, check shape)
- [ ] Rumen insights contract verified
- [ ] Graceful skip when server unavailable
- [ ] Write [T3] DONE to STATUS.md
