# T3 — RAG Circuit Breaker Half-Open Retry

The per-table RAG circuit breaker opens permanently until server restart. Add a half-open retry after 5 minutes.

In `packages/server/src/rag.js`:

1. Track `openedAt` timestamp when the breaker opens
2. In `_isCircuitOpen(table)`, if breaker is open AND 5 minutes have elapsed, set to half-open (allow one attempt)
3. If the half-open attempt succeeds, reset the breaker fully
4. If it fails again, re-open for another 5 minutes
5. Log `[rag] circuit breaker half-open for <table>, retrying` on retry

## Files you own
- packages/server/src/rag.js

## Acceptance criteria
- [ ] Circuit breaker retries after 5 minutes (not permanent)
- [ ] Successful retry resets the breaker
- [ ] Failed retry re-opens for another 5 minutes
- [ ] All catch blocks use catch (err)
- [ ] Write [T3] DONE to STATUS.md
