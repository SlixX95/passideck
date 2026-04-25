# T3 — CLAUDE.md Refresh + README Source-of-Truth

## Punch list items: 6, 7

### Item 6: Refresh CLAUDE.md to current codebase reality

Read `CLAUDE.md` at the repo root. This is the project-level CLAUDE.md (not the global one at ~/.claude/CLAUDE.md).

Problems to fix:
- The "Build sequence" section (Milestones 1-8) is written as if the milestones haven't been built yet. They were ALL completed on 2026-03-19. Either remove the build sequence entirely or convert it to a "Completed milestones" historical reference.
- The "What is already built (scaffold)" section says "Status: Fully written, needs dependency install and runtime testing" — this is stale. Everything works and is published.
- The file map may be incomplete — it predates Sprint 5 (style.css, app.js) and Sprint 6 (preflight.js, transcripts.js).
- Version references may be outdated.

Update CLAUDE.md to reflect reality as of v0.3.2:
- All milestones complete
- Sprint 4/5/6 features shipped
- Current file map including new files
- Keep the architecture decisions and coding conventions sections — those are still accurate

Be conservative: update what's stale, don't rewrite sections that are still correct.

### Item 7: Add source-of-truth hierarchy to README

Read `README.md`. Add a short section (5-10 lines) near the top (after the hero GIF / quickstart section, before detailed docs) that declares what's canonical:

```markdown
## Documentation hierarchy

- **This README** — quickstart, pitch, and links
- **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)** — full 4-tier installation guide
- **[termdeck-docs.vercel.app](https://termdeck-docs.vercel.app)** — reference docs (Astro/Starlight)
- **docs/launch/** — launch collateral (Show HN, Twitter, etc.)
- **docs/sprint-N-*/** — historical sprint logs (append-only, not maintained post-sprint)
```

## Files you own
- CLAUDE.md (modify)
- README.md (modify)

## Acceptance criteria
- [ ] CLAUDE.md reflects v0.3.2 reality (no "needs testing" language, milestones marked complete)
- [ ] CLAUDE.md file map includes style.css, app.js, preflight.js, transcripts.js
- [ ] README has documentation hierarchy section
- [ ] Write [T3] DONE to STATUS.md when complete
