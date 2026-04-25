# T1 — Orchestration Operating Guide

## Goal

Create `docs/ORCHESTRATION.md` — the definitive guide to running high-velocity sprints with the 4+1 pattern in TermDeck.

## Content

Write a practical guide (150-250 lines) covering:

### What is 4+1?
- 4 worker Claude Code terminals with exclusive file ownership
- 1 orchestrator (human or Claude Code in a separate terminal) that writes specs, injects prompts, monitors STATUS.md, and handles irreversible operations (git push, npm publish)
- Workers coordinate ONLY through an append-only STATUS.md — no direct communication

### How to run a sprint

Step-by-step:
1. Create a sprint directory: `docs/sprint-N-<name>/`
2. Write `STATUS.md` with the mission, terminal table, file ownership table, and coordination rules
3. Write one spec file per terminal: `T1-<name>.md` through `T4-<name>.md`
4. Open 4 Claude Code terminals in TermDeck (select the project)
5. The orchestrator pulls session IDs via `GET /api/sessions` and injects prompts via `POST /api/sessions/:id/input`
6. Workers read their spec, execute, append to STATUS.md, and write `[Tn] DONE`
7. Orchestrator monitors STATUS.md, intervenes on blockers, commits when all are done

### File ownership rules
- Every file has exactly one owner terminal
- Ownership is declared in STATUS.md before the sprint starts
- No terminal may edit another terminal's files — violations cause merge conflicts
- Shared files (STATUS.md) are append-only

### Dependency management
- Independent terminals start immediately
- Dependent terminals write "WAITING for [Tn] SIGNAL" and poll STATUS.md
- Signals are explicit: `[T2] SCHEMA READY`, `[T3] ENDPOINTS READY`

### The orchestrator's role
- Writes all specs before injecting prompts
- Monitors STATUS.md for progress, blockers, and cross-terminal notes
- Handles git commit/push (workers never commit)
- Handles npm publish, CI checks, and other irreversible operations
- Can nudge stuck terminals via the input API

### Observed performance
- Sprints 6-10 each completed in 15-20 minutes
- 4 workers + sub-agent fan-out can yield ~20 parallel workers
- Bottleneck is verification, not coding throughput
- Quality debt accumulates faster than code debt without continuous docs/tests/contracts

### Anti-patterns
- Workers editing each other's files
- Workers committing directly
- Workers running `npm publish` or `git push`
- Orchestrator skipping verification before committing
- Not declaring file ownership before starting

## Files you own
- docs/ORCHESTRATION.md (create)

## Acceptance criteria
- [ ] Guide is 150-250 lines, practical, no fluff
- [ ] Includes the injection command pattern (curl to /api/sessions/:id/input)
- [ ] Includes a real example from tonight's sprints
- [ ] Write [T1] DONE to STATUS.md
