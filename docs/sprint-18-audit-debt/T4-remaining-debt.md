# T4 — Update POST-LAUNCH-ROADMAP + Close Misc Debt

1. Read `docs/POST-LAUNCH-ROADMAP.md`. Mark all items being closed in this sprint (ws://, TranscriptWriter TTL, RAG half-open) as resolved.

2. In `packages/server/src/index.js`, the health endpoint `/api/health` reveals detailed operational info (memory counts, DB latency, project paths) without auth. Add a comment noting this is intentional for local use but should be scoped for beyond-localhost deployment. Not a code change — just a documentation comment.

3. Update `docs/CONTRADICTIONS.md` — mark any items resolved by this sprint.

## Files you own
- docs/POST-LAUNCH-ROADMAP.md
- docs/CONTRADICTIONS.md
- packages/server/src/index.js (comment only)

## Acceptance criteria
- [ ] POST-LAUNCH-ROADMAP reflects current state
- [ ] CONTRADICTIONS updated
- [ ] Write [T4] DONE to STATUS.md
