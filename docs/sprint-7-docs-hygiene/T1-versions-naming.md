# T1 — Version Alignment + Legacy Name Cleanup

## Punch list items: 1, 2, 3

### Item 1: Create CHANGELOG.md

Create `CHANGELOG.md` at the repo root. Cover v0.1.0 through v0.3.2. Use the git log and sprint STATUS.md files as source. Format: Keep a Changelog style. Key versions:

- 0.1.0 (2026-03-19): Initial release — 8 milestones complete
- 0.2.0-0.2.5: Sprint 2-3 work (Flashback, Mnestra branding, onboarding, prebuilds)
- 0.3.0: Sprint 4+5 (Rumen insights API, client split, vector embeddings, launch collateral)
- 0.3.1: Sprint 6 (health checks, transcript backup)
- 0.3.2: 360 audit fixes (RAG data-loss, transcript contract, health badge)

### Item 2: Fix NAMING-DECISIONS.md version table

Read `docs/launch/NAMING-DECISIONS.md`. Find the package version table and update to current published versions:
- @jhizzard/termdeck → 0.3.2
- @jhizzard/mnestra → 0.2.0
- @jhizzard/rumen → 0.4.1

### Item 3: Remove stale Engram/Mnemos in docs-site blog posts

Check these files if they exist:
- `docs-site/src/content/docs/blog/engram-deep-dive.mdx`
- `docs-site/src/content/docs/blog/termdeck-launch.mdx`
- `docs-site/src/content/docs/blog/rumen-deep-dive.mdx`

Replace "Engram" with "Mnestra" and "Mnemos" with "Mnestra" EXCEPT in historical context (e.g., "formerly known as Engram" is fine). If a file doesn't exist, skip it.

## Files you own
- CHANGELOG.md (create)
- docs/launch/NAMING-DECISIONS.md (modify)
- docs-site/src/content/docs/blog/*.mdx (modify)

## Acceptance criteria
- [ ] CHANGELOG.md exists with all versions through 0.3.2
- [ ] NAMING-DECISIONS.md version table matches npm
- [ ] No non-historical Engram/Mnemos refs in docs-site blog posts
- [ ] Write [T1] DONE to STATUS.md when complete
