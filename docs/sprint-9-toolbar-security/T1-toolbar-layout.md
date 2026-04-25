# T1 — Toolbar Two-Row Layout

## Goal

Convert the single-row scrollable toolbar into a clean two-row layout where everything is visible without scrolling on a standard 1440px display.

## Current problem

The toolbar has: logo, stats (active/thinking/idle), RAG indicator, Rumen badge, Stack badge, layout buttons (1x1-4x2), quick-launch buttons (shell/claude/python), and right-side buttons (transcripts, status, config, how this works, help). This overflows on most screens and requires horizontal scrolling, which feels broken.

## Proposed layout

**Row 1 (primary):** Logo | Stats (active/thinking/idle) | Health badge | Rumen badge | Layout buttons (1x1 through 4x2)

**Row 2 (controls):** Quick-launch buttons (shell, claude, python) | transcripts | status | config | how this works | help

Row 2 should be slightly shorter/dimmer than row 1 — it's the secondary toolbar.

## Implementation

1. Read `packages/client/public/index.html` — find the `.topbar` section
2. Restructure into two rows: `.topbar-row-1` and `.topbar-row-2`
3. Update `packages/client/public/style.css`:
   - Remove `overflow-x: auto` from `.topbar`
   - Make `.topbar` a flex column (two rows)
   - Row 1: flex row, justify space-between
   - Row 2: flex row, smaller height (~32px vs 42px), slightly dimmer background
   - Both rows `flex-shrink: 0`
4. Total toolbar height should be ~74px (42 + 32) — still compact
5. Remove the scrollbar styles (no longer needed)

## Files you own
- packages/client/public/index.html (toolbar structure)
- packages/client/public/style.css (toolbar styles)

## Acceptance criteria
- [ ] All toolbar items visible without scrolling on 1440px screen
- [ ] Two-row layout looks clean and intentional
- [ ] No horizontal scrollbar
- [ ] Layout buttons still work after restructure
- [ ] Health/Rumen badges still positioned correctly
- [ ] Write [T1] DONE to STATUS.md
