# 4+1 Orchestration — Operating Guide

The operating pattern we use to ship a TermDeck sprint in 15–20 minutes. Four Claude Code workers run in parallel, each with exclusive file ownership; a fifth terminal — the orchestrator — writes the specs, injects prompts, watches STATUS.md, and owns every irreversible operation.

This guide is the source of truth. If you read one doc before running a sprint, read this one.

## What 4+1 is

- **4 workers.** Each worker is a Claude Code session in its own TermDeck panel. Each worker owns a disjoint set of files. Workers never talk to each other directly.
- **+1 orchestrator.** A human (or a Claude Code session in a separate terminal) that writes the specs, injects the starting prompt, monitors progress, unblocks workers, and handles commits, pushes, and releases.
- **STATUS.md is the bus.** Workers coordinate exclusively through an append-only STATUS.md inside the sprint directory. No Slack, no chat, no cross-panel pings. Append your progress, append your blockers, append `[Tn] DONE`.

The win is not "four terminals" — it's **disjoint ownership + append-only coordination**. Those two invariants eliminate merge conflicts and keep the orchestrator's reviewing load bounded.

## How to run a sprint

### 1. Create the sprint directory

```
docs/sprint-N-<name>/
├── STATUS.md
├── T1-<name>.md
├── T2-<name>.md
├── T3-<name>.md
└── T4-<name>.md
```

`N` is the next sprint number. `<name>` is a short kebab-case handle (e.g. `reliability`, `toolbar-security`).

### 2. Write STATUS.md first

STATUS.md has four sections before the log begins:

1. **Mission** — one paragraph. Why this sprint exists.
2. **Terminals table** — `ID | Spec | Primary file ownership`.
3. **File ownership table** — every file that will be touched, mapped to exactly one owner.
4. **Rules** — the four canonical rules (append only, no cross-editing, flag blockers with `[Tn] BLOCKED`, sign off with `[Tn] DONE`).

End the header with `---` and a `(append below)` marker. Everything after is append-only.

### 3. Write one spec per worker

Each spec (`Tn-<name>.md`) contains: goal, scope (files you own), step-by-step content, acceptance criteria, and the sign-off rule. Keep specs small enough that a worker reads it, executes it, and finishes in 10–15 minutes. If a spec needs a third page, split it.

### 4. Open four Claude Code panels

In TermDeck, create four panels and start `claude` in each with the project selected. Note the session IDs — the orchestrator needs them for injection.

```bash
curl -s http://127.0.0.1:3000/api/sessions | jq '.[] | {id, name, cwd}'
```

### 5. Inject the starting prompt

TermDeck exposes `POST /api/sessions/:id/input` specifically for this. The body is `{ text, source }`. `\n` is normalized to `\r` so Enter fires.

```bash
inject() {
  local sid=$1; local msg=$2
  curl -s -X POST "http://127.0.0.1:3000/api/sessions/$sid/input" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg t "$msg"$'\n' --arg s ai '{text:$t, source:$s}')"
}

inject "$T1_ID" "You are T1 in Sprint 11. Read docs/sprint-11-orchestration/T1-orchestration-guide.md and STATUS.md. Begin now."
```

A rate limit of 10 writes/sec per session is enforced server-side; one injection per worker is all you need.

### 6. Workers execute

Each worker reads its spec, does the work, appends a dated section to STATUS.md, and ends with `[Tn] DONE`. Workers **do not commit, do not push, do not publish**.

### 7. Orchestrator lands the sprint

When all four write DONE:

1. Skim each worker's STATUS.md section.
2. Run the tests / type checks / verifiers the specs demanded.
3. `git add -p`, one coherent commit (or a small commit per terminal if the work is logically separate).
4. Push. Publish. Tag. Whatever the sprint graduates to.

## File ownership rules

- **Every file has exactly one owner.** If two terminals need to touch the same file, split it, or serialize the work behind a signal.
- **Ownership is declared up front.** Before injection, STATUS.md lists every file and its owner. No implicit ownership.
- **Shared files are append-only.** STATUS.md is the only file all four workers write, and they only ever append.
- **Violations surface as conflicts.** When two workers edit the same file, git will tell you. Treat every cross-ownership edit as a bug in the spec, not a merge to resolve.

## Dependency management

Most sprints have independent workers. When they don't, encode the dependency explicitly.

- Independent terminals **start immediately**.
- A dependent terminal writes `[Tn] WAITING for [Tm] <SIGNAL>` to STATUS.md and polls it.
- The upstream terminal writes an **explicit signal line** when its artifact is ready — `[T2] SCHEMA READY`, `[T3] ENDPOINTS READY`, `[T1] MIGRATION APPLIED`.

Signals are one line, uppercase, in STATUS.md. That's the entire protocol.

If a sprint has more than one or two cross-terminal signals, the sprint is designed wrong — refactor the specs so ownership is cleaner.

## The orchestrator's role

The orchestrator is not a fifth worker. The job is:

1. **Design the sprint.** Pick the scope, carve the file ownership, write the specs.
2. **Inject.** Send the starting prompt to each worker.
3. **Monitor.** Tail STATUS.md. Watch for `BLOCKED`, watch for silent hangs.
4. **Nudge.** If a worker stalls, inject a short follow-up via the input API. Don't rewrite the spec mid-flight — if the spec is wrong, kill the terminal and restart with a fixed spec.
5. **Verify.** Before committing, read the diff, run the tests the specs required, run any integration check the sprint implied.
6. **Land the irreversible operations.** `git commit`, `git push`, `npm publish`, CI triggers, release notes. **Workers never do these.** The orchestrator is the single gate between local work and the outside world.

## Observed performance

From Sprints 6–10 (real data from 2026-04-16):

- **15–20 minutes per sprint**, end to end, from injection to `git push`.
- **4 workers × ~5 sub-agents each ≈ 20 parallel Claude workers** on a single sprint.
- **Bottleneck is verification, not coding throughput.** Four workers produce a diff faster than one human can read it; the orchestrator's review pace sets the sprint's true clock.
- **Quality debt compounds.** Four parallel workers can each land code that individually looks fine and collectively drifts from docs/tests/contracts. Each sprint must carry a docs-hygiene or contract-check task, or debt accumulates faster than features.

## A real example — Sprint 10 (Reliability Proof Pass)

Sprint 10 shipped in ~20 minutes on 2026-04-16. Ownership:

| Terminal | Owned files |
|----------|-------------|
| T1 | `packages/server/src/index.js` (bind guard), `packages/server/src/auth.js` (guardrail), `docs/DEPLOYMENT.md` (one line) |
| T2 | `tests/flashback-e2e.test.js` (new) |
| T3 | `tests/failure-injection.test.js` (new) |
| T4 | `scripts/verify-release.sh` (new), `docs/RELEASE_CHECKLIST.md` |

Zero dependencies — every worker started immediately on injection. All four appended a dated block to STATUS.md and signed off with `[Tn] DONE`. The orchestrator ran `node --test tests/`, confirmed the guardrail exit path manually, and landed commit `bad6ed1` ("v0.3.5: bind guardrail, Flashback e2e, failure injection, release verification").

Total human wall-clock time on the orchestrator side: ~20 minutes, of which ~12 were verification.

## Anti-patterns

- **Workers editing each other's files.** Always a spec bug. Fix the ownership, not the diff.
- **Workers committing, pushing, or publishing.** Breaks the single-gate invariant and makes review impossible.
- **Orchestrator skipping verification before committing.** The whole point of 4+1 is that the orchestrator is the gate. Skip the gate, ship the bug.
- **Starting a sprint without a file ownership table.** Implicit ownership always collides.
- **Specs that assume a worker can see another worker's progress.** Workers only see STATUS.md. If T3 needs something from T2, put a signal line in the spec.
- **Overlong specs.** If a worker has to make architectural decisions mid-task, the orchestrator didn't do enough design. Pre-design every decision the spec leaves open.
- **Chatty STATUS.md.** The log is a record, not a conversation. One section per terminal per phase, bullets not paragraphs.

## Checklist for the orchestrator

Before injection:

- [ ] Sprint directory exists at `docs/sprint-N-<name>/`
- [ ] STATUS.md has mission, terminals table, file ownership table, rules
- [ ] One spec per worker, each with clear files-owned and acceptance criteria
- [ ] Every file mentioned in any spec appears in the ownership table
- [ ] Dependencies (if any) are encoded as explicit signals
- [ ] TermDeck has four Claude Code panels ready, session IDs noted

After all DONE:

- [ ] Read each worker's STATUS.md section
- [ ] `git diff` — no cross-ownership edits
- [ ] Ran the tests/checks the specs demanded
- [ ] Ran any sprint-level integration check
- [ ] One commit (or one per terminal) with a clear message
- [ ] Pushed, published, or tagged as the sprint requires
