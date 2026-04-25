# T2 — Screenshots & Visual Assets Audit

## Goal

Verify all screenshot references in the repo point to files that exist and are current.

## Steps

1. Read `docs/screenshots/README.md` if it exists. Update it with the current file list.

2. Run `ls docs/screenshots/` and catalog what's there.

3. Grep across the repo for image references: `flashback-demo.gif`, `dashboard-4panel.png`, etc. Verify each referenced file exists. Flag any broken references.

4. Check the docs-site for image/screenshot references: `docs-site/src/content/docs/**/*.mdx`. Verify referenced images exist or are valid URLs.

5. Check if the hero GIF in README.md points to the correct file (should be `docs/screenshots/flashback-demo.gif`).

6. Update `docs/screenshots/README.md` with a catalog of all screenshots, what they show, and when they were last captured.

## Files you own
- docs/screenshots/README.md
- docs-site image reference fixes (if any broken refs found)

## Acceptance criteria
- [ ] All image references in the repo resolve to real files
- [ ] docs/screenshots/README.md is current
- [ ] No broken image links in docs-site
- [ ] Write [T2] DONE to STATUS.md
