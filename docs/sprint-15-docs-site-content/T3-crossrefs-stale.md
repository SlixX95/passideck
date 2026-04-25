# T3 — Fix Stale Cross-References + Security Doc

## Goal

Fix stale cross-references, the security doc cookie name, and update the contradictions register mirror.

## Files to fix

| File | What's stale | Fix |
|------|-------------|-----|
| `termdeck/docs/contradictions.md` | Item #6 references `docs-site/src/content/docs/engram/` | Update: directory renamed to `mnestra/`, mark item as resolved |
| `termdeck/docs/docs-hygiene-roadmap-to-10.md` | References `blog/engram-deep-dive.mdx` | Update: file renamed to `blog/mnestra-deep-dive.mdx` |
| `termdeck/docs/security.md` | Line 82: cookie name `termdeck_auth` | → `termdeck_token` (matches actual code in auth.js) |
| `termdeck/docs/sprint-13-readiness-reassessment.md` | References "0.3.6" throughout | → "0.3.7" where referring to current version (keep historical refs) |

## Files you own
- All 4 files listed above

## Acceptance criteria
- [ ] No references to deleted `engram/` directory
- [ ] Security doc cookie name matches code
- [ ] Sprint 13 doc version refs updated
- [ ] Write [T3] DONE to STATUS.md
