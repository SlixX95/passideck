# TermDeck Orchestration Benchmarks

Evidence for the "orchestration as a moat" claim: what the 4+1 pattern (one orchestrator + four worker Claude Code panels with file-ownership discipline) actually delivered in a single observed session.

## Session: 2026-04-16

Five sprints run back-to-back from a single developer's machine using TermDeck to coordinate four parallel Claude Code workers plus one orchestrator panel. All sprints landed and were committed to `main`.

### Raw data

| Sprint | Scope                                         | Terminals | Wall clock | Commits |
|--------|-----------------------------------------------|-----------|------------|---------|
| 6      | Health checks + transcript backup             | 4         | ~30 min    | 5       |
| 7      | Docs hygiene (10-item punch list)             | 4         | ~15 min    | 7       |
| 8      | Contract tests + reliability fixes            | 4         | ~20 min    | 6       |
| 9      | Toolbar redesign + security hardening         | 4         | ~20 min    | 7       |
| 10     | Reliability proof (e2e + failure injection)   | 4         | ~20 min    | 6       |
| **Total** |                                            | 4         | **~105 min** | **31** |

Wall-clock times are derived from STATUS.md timestamps for each sprint's kickoff and final `[Tn] DONE` signoff.

### Throughput analysis

- **5 sprints in ~105 minutes** of continuous orchestration
- **31 commits** to `main` across the session
- **~3,500 lines** of code + docs added (net, rough tally across packages/server, packages/client, docs/, tests/)
- **Average: 21 minutes per sprint, 6.2 commits per sprint**
- **Peak: Sprint 7 at ~15 minutes** (narrow scope, docs-only, minimal verification)

### What this means

Serial execution — one Claude Code session grinding through the same five sprints in order — is estimated at **6–8 hours** based on the complexity of each scope (contract tests alone would typically eat 60–90 minutes serially). The observed run took **~1.75 hours** of wall clock.

- **Efficiency multiplier: ~4–5x** over serial single-agent execution
- **Bottleneck is not coding.** Workers finished their tasks faster than the orchestrator could verify outputs, resolve the occasional merge edge case, and drive the git commits. The limiting reagent is orchestrator attention, not model throughput.
- **No cross-terminal merge conflicts** were observed across all five sprints. File-ownership discipline (declared in each sprint's STATUS.md header) held.

### Why this works

1. **One PTY per worker, one browser tab to see them all.** TermDeck's metadata overlays surface each worker's status (`thinking`, `editing`, `idle`, `errored`) without the orchestrator having to cycle through tmux panes.
2. **File ownership is declared up front** in the sprint STATUS.md. Workers never touch files they don't own, which eliminates the entire class of parallel-write conflicts.
3. **Append-only STATUS.md** gives workers a shared bulletin board without a coordination protocol. `[Tn] DONE` is the only signal the orchestrator needs.
4. **Flashback (Sprint 5) and preflight (Sprint 6) reduce orchestrator context-switching cost.** When a worker hits an error, the orchestrator sees past similar errors inline instead of re-diagnosing from scratch.

## Caveats (read this before citing these numbers)

- **Single developer, single machine, familiar codebase.** These are best-case numbers. Cold-start on an unfamiliar repo will not hit 4–5x.
- **All workers share the same model** (Claude Opus 4.6). Heterogeneous agents with different context will add coordination overhead.
- **Wall-clock times are approximate** — measured from STATUS.md kickoff and signoff timestamps, not from instrumented tracing. Expect ±2 minutes per sprint.
- **No cross-terminal merge conflicts observed in this session.** This is a property of the file-ownership discipline, not a guarantee. Overlapping scope can and will break it.
- **Commit counts include small fix-up commits** (formatting, lint), not just feature commits. The 31-commit total is not 31 independent features.
- **The "6–8 hour serial estimate" is a judgment call**, not a measured baseline. We did not run the same five sprints serially for comparison.
- **Sprint 6 was the slowest (~30 min)** because it was the first sprint of the session — orchestrator warm-up, not a fundamental difference in scope.

## How to reproduce

See `docs/ORCHESTRATION.md` (T1) for the 4+1 pattern itself and `docs/templates/sprint-template/` (T2) for a fill-in-the-blanks sprint scaffold. A fresh run on your own repo is the only way to validate these multipliers for your workflow.
