# T4 — Reliability Fixes

## Goal

Close the two highest-priority reliability items from the 360 audit.

### Fix 1: getRumenPool permanent failure flag (no TTL retry)

In `packages/server/src/index.js`, find `_rumenPoolFailed`. Currently if pool creation fails once, it stays failed forever until server restart. Add a TTL:

- Track `_rumenPoolFailedAt` timestamp alongside `_rumenPoolFailed`
- In `getRumenPool()`, if `_rumenPoolFailed` is true but more than 30 seconds have elapsed since `_rumenPoolFailedAt`, reset both flags and retry pool creation
- Log `[rumen] retrying pool creation after 30s cooldown` on retry

### Fix 2: start.sh should also handle the npx bin issue

If `npx @jhizzard/termdeck` doesn't work for users who haven't cloned the repo, they need `npx` to work. Check that `scripts/start.sh` documents this fallback clearly for repo-clone users vs npm users.

Update the GETTING-STARTED.md Tier 1 section to clarify:
- npm users: `npx @jhizzard/termdeck` (if bin is fixed by T1) 
- repo clone users: `./scripts/start.sh` (always works)

## Files you own
- packages/server/src/index.js (getRumenPool only)
- docs/GETTING-STARTED.md (Tier 1 section only)

## Acceptance criteria
- [ ] getRumenPool retries after 30s instead of permanently failing
- [ ] GETTING-STARTED.md has clear npx vs clone instructions
- [ ] All catch blocks use catch (err) not bare catch {}
- [ ] Write [T4] DONE to STATUS.md
