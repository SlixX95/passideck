# T3 — Benchmark Framing

## Goal

Create `docs/BENCHMARKS.md` documenting the observed sprint performance from tonight's session. This is evidence for the "orchestration as a moat" claim in launch materials.

## Content (under 100 lines)

### Raw data from 2026-04-16 session

| Sprint | Scope | Terminals | Wall clock | Commits |
|--------|-------|-----------|------------|---------|
| 6 | Health checks + transcript backup | 4 | ~30 min | 5 |
| 7 | Docs hygiene (10-item punch list) | 4 | ~15 min | 7 |
| 8 | Contract tests + reliability fixes | 4 | ~20 min | 6 |
| 9 | Toolbar redesign + security hardening | 4 | ~20 min | 7 |
| 10 | Reliability proof (e2e + failure injection) | 4 | ~20 min | 6 |

### Throughput analysis
- 5 sprints in ~105 minutes
- 31 commits
- ~3,500 lines of code + docs added
- Average: 21 minutes per sprint, 6.2 commits per sprint

### What this means
- Serial execution of the same work: estimated 6-8 hours
- 4x parallelization: ~1.75 hours (actual)
- Efficiency multiplier: ~4-5x
- Bottleneck: orchestrator verification and git operations, not coding

### Caveats
- Single developer's machine, familiar codebase
- Workers share the same model (Claude Opus 4.6)
- No cross-terminal merge conflicts observed (file ownership discipline)
- Wall-clock times are approximate (measured from STATUS.md timestamps)

## Files you own
- docs/BENCHMARKS.md (create)

## Acceptance criteria
- [ ] Raw data table with all 5 sprints
- [ ] Throughput analysis with concrete numbers
- [ ] Honest caveats section
- [ ] Under 100 lines
- [ ] Write [T3] DONE to STATUS.md
