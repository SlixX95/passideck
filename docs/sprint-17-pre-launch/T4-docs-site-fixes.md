# T4 — Fix Remaining Docs-Site Content Issues

## Goal

Fix the remaining stale content identified in the Sprint 14 docs-site audit. The fixes are in the docs-site synced content (NOT the repo-root docs).

## Files to fix

These are all in `docs-site/src/content/docs/`:

1. **rumen/changelog.md** — All v0.2-v0.4 work is under [Unreleased]. Add dated entries for versions 0.2.0, 0.3.0, 0.4.0, 0.4.1. Check ~/Documents/Graciella/rumen/ git log for dates.

2. **mnestra/index.md** — Install section lists only 3 migrations (001-003). Should list all 6 (001-006). Check ~/Documents/Graciella/engram/migrations/ for the full list.

3. **termdeck/docs/contradictions.md** — Item #6 references `docs-site/src/content/docs/engram/` which no longer exists (renamed to mnestra/). Mark as resolved.

4. **termdeck/docs/security.md** — Line 75: cookie name should be `termdeck_token` not `termdeck_auth`. The repo-root copy was fixed but the synced copy needs fixing too.

After fixes:
5. Run sync: `MNESTRA_REPO=/Users/joshuaizzard/Documents/Graciella/engram RUMEN_REPO=/Users/joshuaizzard/Documents/Graciella/rumen node scripts/sync-content.mjs`
6. Build: `npm run build`
7. Deploy: `vercel deploy --prod`

## Files you own
- docs-site/src/content/docs/ (content fixes)
- docs-site build/deploy

## Acceptance criteria
- [ ] Rumen changelog has dated version entries
- [ ] Mnestra install lists all 6 migrations
- [ ] Contradictions #6 marked resolved
- [ ] Security doc cookie name correct
- [ ] Docs site rebuilt and deployed
- [ ] Write [T4] DONE to STATUS.md with deployment URL
