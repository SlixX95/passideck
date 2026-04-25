# T2 — Fix Stale Version Numbers in Docs Site

## Goal

Fix 8 files with stale version references. Current published versions: termdeck@0.3.7, mnestra@0.2.0, rumen@0.4.1.

## Files to fix

| File | What's stale | Fix |
|------|-------------|-----|
| `architecture.md` | Line 71: "Rumen v0.2" | → "Rumen v0.4.1" |
| `mnestra/index.md` | Install section lists only 3 migrations (001-003) | List all 6 (001-006) |
| `mnestra/docs/rag-fixes-applied.md` | Fix 6: "A future v0.2 will add an HTTP webhook server" | → "v0.2.0 added the HTTP webhook server (`mnestra serve`)" |
| `rumen/changelog.md` | All v0.2-v0.4 work under [Unreleased], only 0.1.0 dated | Add dated entries for 0.2.0, 0.3.0, 0.4.0, 0.4.1 |
| `termdeck/docs/getting-started.md` | Line 249: "It's v0.2" | → "It's v0.3.7" |
| `termdeck/docs/flashback-launch-angle.md` | "v0.2, validated against 3,397 real memories" | → "v0.3.7, validated against ~3,855 memories" |
| `termdeck/docs/npm-packaging-plan.md` | Entire doc says "Status: planned, not started" | Add banner: "> **Historical:** This plan was completed in Sprint 2. Kept for reference." |
| `termdeck/docs/promotion-drafts.md` | Written for v0.1.1, old install path | Add banner: "> **Superseded:** See docs/launch/ for current launch materials." |

## Files you own
- All 8 files listed above

## Acceptance criteria
- [ ] All version refs updated to current
- [ ] Superseded docs have clear banners
- [ ] Write [T2] DONE to STATUS.md
