# T4 — Freshness Metadata + Contradictions Register + CI Guardrails

## Punch list items: 8, 9, 10

### Item 8: Add doc freshness stamps

Add `Last updated`, `Owner`, and `Status` metadata to the top of these files:
- README.md (add after the title, before content)
- CLAUDE.md (add after the title)

Use this format:
```
> Last updated: 2026-04-16 | Owner: @jhizzard | Status: Active
```

Don't add stamps to sprint STATUS.md files (they're append-only logs) or launch collateral (they're drafts).

NOTE: T3 owns README.md and CLAUDE.md. You add ONLY the freshness stamp line — coordinate with T3 by writing your stamp text in STATUS.md and letting T3 include it, OR wait for T3 to finish and add the stamp after. Simplest: write [T4] STAMPS READY with the exact lines, and T3 can include them if still working — otherwise you add them after [T3] DONE.

### Item 9: Create contradictions register

Create `docs/CONTRADICTIONS.md`:

```markdown
# Known Contradictions & Temporary Drift

Ledger of known inconsistencies between code, docs, and launch assets. Each entry has a target resolution sprint.

| # | What | Where | Target |
|---|------|-------|--------|
| 1 | Mnestra hybrid_search takes 8 args in bundled migration, 10 args in Rumen relate.ts | config/supabase-migration.sql vs rumen/src/relate.ts | Sprint 8 |
| 2 | Preflight probes /health, Mnestra docs reference /healthz | packages/server/src/preflight.js vs mnestra docs | Sprint 8 |
| 3 | engram_* table names in config.yaml RAG tables section | ~/.termdeck/config.yaml | Sprint 8 |
| 4 | getRumenPool failure flag is permanent (no TTL retry) | packages/server/src/index.js | Sprint 8 |
| 5 | Rumen relate embedding path has zero unit test coverage | rumen/tests/relate.test.ts | Sprint 8 |
```

Add more entries if you find them while reading other files. This is a living document.

### Item 10: Add CI docs guardrails

Read `.github/workflows/ci.yml` (if it exists). Add a new job or step that:

1. Fails if any `.md` or `.mdx` file outside `docs/launch/NAMING-DECISIONS.md` contains bare "Engram" or "Mnemos" (not in a "formerly" or "renamed from" context). Use grep with a simple regex.
2. Fails if the version in `package.json` doesn't appear in `CHANGELOG.md`.

Keep it simple — a bash script at `scripts/lint-docs.sh` that the CI job calls. No new dependencies.

## Files you own
- docs/CONTRADICTIONS.md (create)
- scripts/lint-docs.sh (create)
- .github/workflows/ci.yml (modify — add docs lint step)

## Acceptance criteria
- [ ] CONTRADICTIONS.md exists with at least 5 known drift items
- [ ] scripts/lint-docs.sh runs and passes on the current repo
- [ ] CI workflow includes docs lint job
- [ ] Write [T4] DONE to STATUS.md when complete
