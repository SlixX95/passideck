# Sprint 11 — Productize the Orchestration Moat

Append-only coordination log. Started: 2026-04-17 ~00:00 UTC

## Mission

The 4+1 orchestration pattern (master terminal + 4 worker Claude Code panels with file-ownership discipline) is TermDeck's unique operational moat. Tonight we ran Sprints 6-10 using it — each sprint completed in ~15-20 minutes. Productize this into reproducible documentation, templates, and benchmarks.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-orchestration-guide.md | docs/ORCHESTRATION.md (new) |
| T2 | T2-sprint-template.md | docs/templates/sprint-template/ (new directory) |
| T3 | T3-benchmark-framing.md | docs/BENCHMARKS.md (new) |
| T4 | T4-blog-update.md | docs/launch/blog-post-4plus1-orchestration.md (update) |

## File ownership

| File | Owner |
|------|-------|
| docs/ORCHESTRATION.md (new) | T1 |
| docs/templates/sprint-template/ (new) | T2 |
| docs/BENCHMARKS.md (new) | T3 |
| docs/launch/blog-post-4plus1-orchestration.md | T4 |
| docs/sprint-11-orchestration/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

---

[T2] Created `docs/templates/sprint-template/` with three files:
- `STATUS.md` — placeholder coordination log with `<N>`, `<Title>`, `<YYYY-MM-DD>` slots, terminal table, file ownership table, and the 4 append-only rules.
- `T-spec-template.md` — per-terminal spec scaffold (Goal / Implementation / Files you own / Acceptance criteria), with the "do not touch other files" reminder and `[Tn] DONE` sign-off.
- `README.md` — under-30-line how-to: copy directory, rename per-terminal specs, fill placeholders, and launch the 4+1 with a `termdeck inject --panel Tn "..."` injection command example.

[T2] DONE

---

## [T3] Benchmark framing — 2026-04-17

Created `docs/BENCHMARKS.md` (57 lines, under the 100-line cap).

Contents:
- Raw data table covering Sprints 6–10 (terminals, wall clock, commits) with totals row.
- Throughput analysis: 5 sprints / ~105 min / 31 commits / ~3,500 LOC added / avg 21 min per sprint / 6.2 commits per sprint.
- "What this means" section: ~4–5x efficiency multiplier vs. estimated 6–8 hr serial run; orchestrator attention identified as the bottleneck, not model throughput.
- "Why this works" section tying the numbers back to TermDeck features (metadata overlays, file-ownership discipline, append-only STATUS.md, Flashback, preflight).
- Caveats section flagging: single-dev/single-machine best case, shared model across workers, approximate timestamps (±2 min), file-ownership not a guarantee, commit count includes fixups, 6–8 hr serial estimate is a judgment call (no measured baseline), Sprint 6's ~30 min was warm-up cost.
- Cross-references to T1 (`docs/ORCHESTRATION.md`) and T2 (`docs/templates/sprint-template/`) for reproduction.

No other files touched.

[T3] DONE

---

## [T1] Orchestration operating guide — 2026-04-17

- Created `docs/ORCHESTRATION.md` (165 lines) — the definitive 4+1 operating guide.
- Sections: what 4+1 is; run-a-sprint step-by-step (directory layout, STATUS.md
  header, spec format, panel setup, injection); file ownership rules;
  dependency/signal protocol; orchestrator role; observed perf from Sprints 6–10;
  a worked example from Sprint 10 (commit `bad6ed1`); anti-patterns;
  pre-injection and post-DONE checklists.
- Included the injection command pattern — `GET /api/sessions` to list IDs and
  `POST /api/sessions/:id/input` with a `jq`-built JSON body, plus a reusable
  `inject()` shell helper. Documented the 10 writes/sec server-side rate limit.
- Anchored the "observed performance" section in real numbers from tonight:
  15–20 min per sprint, ~20 effective parallel workers with sub-agent fan-out,
  verification as the true bottleneck.

### Acceptance criteria
- [x] Guide is 150–250 lines (165)
- [x] Includes the injection command pattern (curl to `/api/sessions/:id/input`)
- [x] Includes a real example from tonight's sprints (Sprint 10, commit bad6ed1)
- [x] Practical, no fluff

### Files touched (T1 ownership only)
- docs/ORCHESTRATION.md (new, 165 lines)

[T1] DONE

---

## [T4] Blog post update — 2026-04-17

Updated `docs/launch/blog-post-4plus1-orchestration.md`. Existing 2am rename narrative, recursive-Flashback moment, and "moment the pattern crystallized" prose preserved in full — only additions.

Additions:
- **Injection command** (inside the "moment the pattern crystallized" section): two curl snippets — `GET /api/sessions` with a `jq` line to pull UUIDs, then `POST /api/sessions/:id/input` with a JSON body (`text`, `source: "ai"`, `fromSessionId: "orchestrator"`). Short paragraph explaining `source`/`fromSessionId` semantics, CRLF normalization, the 10 writes/sec rate limit, and the Sprint 10 `0.0.0.0`-without-`auth.token` guardrail plus `Authorization: Bearer` for non-loopback binds.
- **New `## Sprints 6-10: stress-testing the pattern` section** inserted after the injection story and before "Why this pattern matters". Headline numbers: ~105 min, 31 commits, 3,500+ lines, five npm releases (v0.3.1 → v0.3.5). Per-sprint bullet list covering Sprint 6 (preflight/transcripts), Sprint 7 (docs hygiene + contradictions register + CI docs-lint), Sprint 8 (contract tests + Rumen pool TTL), Sprint 9 (two-row toolbar + optional token auth + SECURITY.md + DEPLOYMENT.md), and Sprint 10 (bind guardrail + Flashback e2e + 5 failure-injection scenarios + verify-release.sh). Closes with three observations: 15-20 min cadence with the orchestrator as rate limit, breadth of work that parallelized cleanly (docs included), and injection becoming mechanical by Sprint 8.
- **"Further reading" block** before the install command: links to `docs/ORCHESTRATION.md` (T1) and `docs/BENCHMARKS.md` (T3) with one-line descriptions.

No stale forward-looking claims found in the existing post — it was already past-tense about shipped work. The Sprint 3 narrative and the "will be the default in 2026" future-tense claim at the end were left untouched (still accurate intent, no shipped-evidence conflict).

### Acceptance criteria
- [x] Sprint 6-10 evidence added with concrete numbers
- [x] Injection command shown (curl + jq, with auth note)
- [x] Links to ORCHESTRATION.md and BENCHMARKS.md
- [x] No stale forward-looking claims
- [x] Write [T4] DONE to STATUS.md

### Files touched (T4 ownership only)
- docs/launch/blog-post-4plus1-orchestration.md (update)

[T4] DONE
