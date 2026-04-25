# T2 — TranscriptWriter Pool TTL Retry

The TranscriptWriter has the same permanent `_poolFailed` latch that was already fixed in getRumenPool. All 5 auditors flagged this.

In `packages/server/src/transcripts.js`, find the pool creation code. Add a 30-second TTL retry pattern matching what getRumenPool uses:

1. Track `_poolFailedAt` timestamp alongside any pool failure flag
2. On next access after 30s, reset the flag and retry pool creation
3. Log `[transcript] retrying pool creation after 30s cooldown` on retry

## Files you own
- packages/server/src/transcripts.js

## Acceptance criteria
- [ ] Pool creation retries after 30s instead of permanently failing
- [ ] All catch blocks use catch (err)
- [ ] Write [T2] DONE to STATUS.md
