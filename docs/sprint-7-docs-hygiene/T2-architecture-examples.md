# T2 — Architecture Claims + Stale CLI Examples

## Punch list items: 4, 5

### Item 4: Update stale CLI examples in orchestration blog post

Read `docs/launch/blog-post-4plus1-orchestration.md`. Find any references to old init commands (e.g., `termdeck init --engram`, `termdeck init --mnemos`). Update to current: `termdeck init --mnestra` and `termdeck init --rumen`. Also update any package name references (Engram → Mnestra, Mnemos → Mnestra) that aren't explicitly historical context.

### Item 5: Reconcile architecture claims vs actual behavior

Check if `docs-site/src/content/docs/architecture.md` exists. If it does, read it and reconcile:
- If it says "no hot-path retry queue" but the server has an outbox retry loop in `rag.js` (`_startSync` with `getUnsyncedRagEvents` + periodic retry), make the wording precise: "non-blocking hot path with eventual-consistency sync queue"
- If it describes the RAG push as fire-and-forget, clarify that it's fire-and-forget on the hot path but has a local SQLite outbox with periodic sync retry

If `docs-site/src/content/docs/architecture.md` doesn't exist, check for any architecture doc at `docs/` level and apply the same reconciliation. If no architecture doc exists at all, create a brief one at `docs/ARCHITECTURE.md` (under 100 lines) describing the current 4-tier stack accurately.

## Files you own
- docs/launch/blog-post-4plus1-orchestration.md (modify)
- docs-site/src/content/docs/architecture.md OR docs/ARCHITECTURE.md (modify or create)

## Acceptance criteria
- [ ] No stale init commands in orchestration blog post
- [ ] Architecture doc accurately describes outbox retry behavior
- [ ] No Engram/Mnemos refs outside historical context
- [ ] Write [T2] DONE to STATUS.md when complete
