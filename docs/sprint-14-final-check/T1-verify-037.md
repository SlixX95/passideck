# T1 — Docs Site Audit + Fix

## Goal

The docs site at termdeck-docs.vercel.app is a mess. Audit every page, fix the content, remove stale sections, and redeploy.

## Known problems

1. `/engram/` section still exists alongside `/mnestra/` — duplicate content with legacy branding
2. `/engram/docs/*` pages are stale mirrors of `/mnestra/docs/*`
3. `/blog/engram-deep-dive/` still named "engram" in the URL
4. Only 22 pages rendered despite 36+ docs synced
5. Content may be stale (last build was April 14, 7 sprints ago)

## Steps

1. Read the docs-site structure: `ls -R docs-site/src/content/docs/`
2. Read the Starlight config: `docs-site/astro.config.mjs` — check sidebar structure
3. **Delete the `/engram/` content directory entirely** — it's the legacy pre-rename section. `/mnestra/` is the canonical replacement.
4. **Rename `/blog/engram-deep-dive.mdx`** to `/blog/mnestra-deep-dive.mdx` and update its title/content
5. Check every `.mdx` file in `docs-site/src/content/docs/` for:
   - Stale "Engram" or "Mnemos" references (fix to "Mnestra")
   - Stale version numbers (should be termdeck@0.3.7, mnestra@0.2.0, rumen@0.4.1)
   - Broken internal links (especially links pointing to `/engram/` paths)
   - Content accuracy against current codebase
6. Update the Starlight sidebar config in `astro.config.mjs` to remove the engram section
7. Verify the home page (`index.mdx` or equivalent) is current
8. After fixes: run `npm run sync-content && npm run build` to verify it builds clean
9. Deploy: `vercel deploy --prod`

## Files you own
- docs-site/src/content/docs/**/*.mdx (all content)
- docs-site/astro.config.mjs (sidebar config)

## DO NOT touch
- packages/ (server, client, CLI code)
- docs/ (repo-level docs — separate from docs-site)
- scripts/ (except running build commands)

## Acceptance criteria
- [ ] No `/engram/` section in the rendered site
- [ ] All content references Mnestra, not Engram/Mnemos
- [ ] Version numbers are current (0.3.7 / 0.2.0 / 0.4.1)
- [ ] No broken internal links
- [ ] Site builds clean
- [ ] Deployed to production
- [ ] Write [T1] DONE to STATUS.md with page count and summary
