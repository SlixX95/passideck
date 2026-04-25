# T2 — Setup Wizard Modal

Create a setup wizard modal accessible from the "config" button (or auto-shown on first run).

The modal shows:
- 4 tiers as a vertical progress bar (green = active, amber = partial, gray = not configured)
- Current status of each tier with actionable next-step text
- Copy-paste commands for each unconfigured tier
- "I've done this, re-check" button that re-fetches /api/setup

The wizard does NOT write config files (that's Phase 2). It detects and guides.

Layout: full-screen overlay modal, dark theme, matches existing TermDeck aesthetic.

## Files you own
- packages/client/public/app.js (setup modal)
- packages/client/public/style.css (setup styles)

## Acceptance criteria
- [ ] Config button opens setup wizard
- [ ] Auto-opens on first run (when /api/setup returns firstRun: true)
- [ ] Shows 4 tiers with correct status
- [ ] "Re-check" button refreshes status
- [ ] Copy-paste commands for each tier
- [ ] Write [T2] DONE to STATUS.md
