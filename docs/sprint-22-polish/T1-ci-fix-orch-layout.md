# T1 — Fix CI Failures + Redesign Orchestrator Layout

## Fix 1: CI lint failures

Every push triggers "Run failed" emails. Read `.github/workflows/ci.yml` and `scripts/lint-docs.sh`. Run `bash scripts/lint-docs.sh` locally to see if it passes. If it passes locally but fails in CI, the issue is likely a path or environment difference. Common causes:
- CI runs from a clean checkout (no `docs-site/src/content/` synced content)
- The lint script searches paths that only exist after `npm run sync-content`

Fix: either exclude docs-site synced content from the lint search, or skip the lint step if the synced content directory doesn't exist.

## Fix 2: Orchestrator layout redesign

The current "orch" layout is wrong. It puts 1 large panel on the LEFT and workers on the RIGHT.

**Josh wants:** 4 worker panels across the TOP (60% height), 1 large orchestrator panel spanning the entire BOTTOM (40% height).

New CSS grid:
```css
.grid-container.layout-orch {
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 3fr 2fr;
}
.grid-container.layout-orch .term-panel:nth-child(n+5) {
  /* 5th panel (orchestrator) spans all 4 columns on row 2 */
}
.grid-container.layout-orch .term-panel:last-child {
  grid-column: 1 / -1;
  grid-row: 2;
}
```

This gives: 4 equal panels in row 1 (top 60%), 1 full-width panel in row 2 (bottom 40%).

Handle edge cases:
- With fewer than 5 panels, the layout should still look reasonable
- With exactly 2 panels, first goes top, second goes bottom (full width each)
- The last panel is always the orchestrator (bottom full-width)

Also update the keyboard shortcut tooltip text to describe the new layout.

## Files you own
- .github/workflows/ci.yml
- scripts/lint-docs.sh (if changes needed)
- packages/client/public/style.css
- packages/client/public/app.js (layout handler text only)
- packages/client/public/index.html (button tooltip only)

## Acceptance criteria
- [ ] `bash scripts/lint-docs.sh` passes locally
- [ ] CI lint job passes on push (or is fixed to handle clean checkout)
- [ ] Orchestrator layout: 4 panels top 60%, 1 full-width panel bottom 40%
- [ ] Works with 2, 3, 4, and 5 panels
- [ ] Write [T1] DONE to STATUS.md
