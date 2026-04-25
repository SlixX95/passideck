# T5 — Flashback Regression Audit

## Goal

Flashback was fixed in Sprint 21 T1 (root cause: `queryDirect` sent `recency_weight` / `decay_days` to an 8-arg SQL function, causing silent failures for 15 sprints). It was verified end-to-end at the close of Sprint 21. Josh reports on 2026-04-25 that Flashback is "not firing at all" again. This terminal owns finding what regressed and fixing it.

## What we know

- Sprint 21 T1 commit: `dc6c2b1` — "Sprint 21 T1: fix Flashback — remove recency_weight/decay_days from direct bridge RPC (8-arg SQL mismatch)"
- Sprint 21 T3 commit: `c306261` — "145 noise insights deleted, chopin-nashville→termdeck, Flashback verified end-to-end"
- Since Sprint 21, work landed in Sprints 22 (Mnestra 0.2.1 work + `start.sh` rewrite + Rumen re-kickstart) and 23 (responsive layouts + wizard credential write + auto-migrate).
- Mnestra v0.2.1 has uncommitted changes in `~/Documents/Graciella/engram/` (CHANGELOG, README, mcp-server/index.ts, package.json, src/webhook-server.ts) — never committed, never published. The local v0.2.1 binary may have a different SQL signature than the v0.2.0 binary published to npm.

## First places to look

1. **Bridge mode mismatch.** `~/.termdeck/config.yaml` has `rag.mnestraMode`. If Sprint 22's start.sh rewrite or Sprint 23's wizard write changed the default, queries may be going through a different path than the one Sprint 21 fixed. Confirm: tail TermDeck server logs at error time for `[mnestra]` / `[rag]` lines.
2. **SQL signature drift.** Mnestra v0.2.1 (uncommitted in the engram repo) may have updated `mnestra_hybrid_search` or whichever RPC the bridge calls. If Josh's local Mnestra was rebuilt off uncommitted v0.2.1 source while TermDeck still calls the v0.2.0 contract, the 8-arg/N-arg drift returns. Check: `psql $DATABASE_URL -c "\df mnestra_hybrid_search"` for current arity vs. what `packages/server/src/mnestra-bridge/index.js` sends.
3. **Trigger never fires.** The output analyzer regex in `session.js PATTERNS.error` may have been narrowed in a later sprint (Sprint 16 / 21 fixed false positives). Verify that an obvious error in a panel still triggers the `onErrorDetected` event. Check: server stdout for `[analyzer]` / `[flashback]` log lines.
4. **Toast renders but is empty.** Sprint 21 also flagged Flashback toast UX issues. If the bridge IS returning hits but the client doesn't render them, the user sees "nothing firing." Check: Flashback toast div in app.js and the Memory tab in the panel drawer.

## Reproduction recipe

1. Start the stack with `termdeck stack` (or `./scripts/start.sh`).
2. In the dashboard, open a shell panel.
3. Trigger an obvious failure: `cat /no/such/file`.
4. Within 30s, expect: a Flashback toast top-right OR a `[flashback]` log line on the server.
5. Either log "Flashback fired" with the hit count or log "no matches" — silent both ways means a regression in the trigger or bridge.

## Acceptance criteria

- [ ] Root cause identified — write a one-paragraph diagnosis at the top of T5 status update.
- [ ] Flashback fires end-to-end again on the repro recipe (hit OR explicit "no matches" log).
- [ ] If Mnestra v0.2.1 is the cause, file a follow-up issue in the engram repo and pin TermDeck's expected SQL contract version.
- [ ] Add a contract test in `tests/flashback-e2e.test.js` (already exists) that catches this class of regression — assert the bridge gets a non-error response, even when the result is empty.
- [ ] Write `[T5] DONE` to STATUS.md.

## Files you might touch

- `packages/server/src/mnestra-bridge/index.js`
- `packages/server/src/rag.js`
- `packages/server/src/session.js` (only if the trigger regex regressed)
- `tests/flashback-e2e.test.js`

## Files you must not touch

- The Sprint 25 T1–T4 wizard / MCP files (those terminals own them).
- `packages/client/public/app.js` Flashback toast UX — Sprint 21 already flagged that as a separate issue; only touch it if root cause is client-side.
