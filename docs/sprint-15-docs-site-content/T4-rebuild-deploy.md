# T4 — Rebuild + Redeploy Docs Site

## Goal

After T1, T2, T3 finish their content fixes, rebuild and redeploy the docs site.

## Steps

1. **WAIT** for [T1] DONE, [T2] DONE, and [T3] DONE in STATUS.md
2. While waiting, verify the sync script paths are correct:
   - `MNESTRA_REPO` should point to `~/Documents/Graciella/engram` (legacy dir name)
   - `RUMEN_REPO` should point to `~/Documents/Graciella/rumen`
3. Run sync: `cd docs-site && MNESTRA_REPO=/Users/joshuaizzard/Documents/Graciella/engram RUMEN_REPO=/Users/joshuaizzard/Documents/Graciella/rumen node scripts/sync-content.mjs`
4. Build: `npm run build`
5. Deploy: `vercel deploy --prod`
6. Verify every page loads with real content (not stubs)
7. Check: no "No README.md was found" messages anywhere

## Files you own
- docs-site/ (build and deploy commands only)

## Acceptance criteria
- [ ] Sync completes with file counts for all 3 repos
- [ ] Build completes with zero errors
- [ ] Deployed to production
- [ ] All 3 blog posts show real content (not stubs)
- [ ] No "No README.md was found" on any page
- [ ] Write [T4] DONE to STATUS.md with the deployment URL and page count
