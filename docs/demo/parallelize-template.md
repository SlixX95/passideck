# Parallelize a sprint across 4 terminals

This is how TermDeck was built. The entire v0.2 release — 10 commits across 3 repos, ~70 tasks, ~2 hours of actual coding — shipped through the pattern below, running four Claude Code agents simultaneously in four TermDeck panels. This document is both a user-facing demo and a reusable recipe.

---

## What the pattern is

Four Claude Code terminals, each with an exclusive file-ownership scope, coordinating only through a shared append-only status file. No two agents touch the same file. No chat between agents. All communication flows through one document on disk.

The result is a ~4× speedup on any non-trivial refactor or feature sprint. The speedup comes from the lack of coordination overhead: agents work in parallel because their file ownership is disjoint, so there are no merges, no blocks, no "wait for B to finish Y before A can start X."

```
┌─────────────────────────────────────────────────────────────────┐
│                    docs/STATUS.md (shared)                      │
│  append-only | glyph protocol | cross-terminal requests queue   │
└─────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴───┐     ┌────┴───┐     ┌────┴───┐     ┌────┴───┐
    │   T1   │     │   T2   │     │   T3   │     │   T4   │
    │ scope A│     │ scope B│     │ scope C│     │ scope D│
    └────────┘     └────────┘     └────────┘     └────────┘
```

---

## The four-rule contract

Every terminal starts with this understanding. Break any of these and the pattern fails.

1. **Exclusive file ownership.** Each terminal has a list of paths it may write. If a file is not in your list, you cannot touch it. If you need a file owned by another terminal, post a `T3 → T2: need <thing>` entry in `STATUS.md` and wait.
2. **`STATUS.md` is append-only.** Never rewrite or delete another terminal's entries. Use ISO timestamps. Use the glyph protocol (`⏳ ✅ ❌ 🔒 🔓 ❓ 🛑`).
3. **No commits without approval.** Stage changes, write diff summary to `STATUS.md`, stop. The human reviews and commits.
4. **File locks for ambiguous territory.** Before editing a shared-ish file (README.md, package.json in a monorepo root), post `🔒 claiming: <path>` in STATUS.md, do the edit, release with `🔓`.

---

## Step 1 — Generate your planning document

The planning document is where the work gets split. Do not ask the agents to split their own work — ambiguity is expensive. Use a single upfront Claude session with the meta-prompt below to produce `docs/PLANNING_DOCUMENT.md`. Then four fresh terminals each execute only their assigned section.

### Meta-prompt for generating a planning document

Paste this into one Claude Code panel (not one of the four worker terminals — a fifth planning panel). Fill in the `<<…>>` fields.

```
You are planning a parallel build sprint that will execute across exactly four
Claude Code terminals running in TermDeck. Each terminal will be told:
"You are Terminal N, referenced in docs/PLANNING_DOCUMENT.md. Execute the
instructions related to you and only you."

Write that planning document now. It should contain:

1. A short context section listing what currently works and what does not, based
   on reading the following files:
     <<list of files / docs to read first — e.g. README.md, docs/FOLLOWUP.md, recent commits>>

2. A comprehensive outstanding-work inventory — every real item that needs to
   ship in this sprint, derived from the context section.

3. An exclusive file-ownership split of the inventory across Terminal 1 through
   Terminal 4. NO two terminals may write the same file. List each terminal's
   owned paths explicitly.

4. For each terminal: a task list in priority order with acceptance criteria
   for each task.

5. Subagent delegation guidance per terminal: which tasks should fan out to
   general-purpose subagents for further parallelization within that terminal.

6. A dependency graph showing which tasks block which other tasks across
   terminals, so the critical path is obvious.

7. A coordination protocol section referencing docs/STATUS.md as the single
   coordination surface, including the glyph protocol (⏳ ✅ ❌ 🔒 🔓 ❓ 🛑) and
   the append-only rule.

8. Four ready-to-paste starting prompts, one per terminal. Each prompt must:
   - name the terminal and the planning document path
   - tell the terminal to read the planning doc + docs/STATUS.md before starting
   - tell the terminal which section of the planning doc to execute (and only
     that section)
   - warn against editing files outside its owned paths
   - warn against committing or pushing without explicit approval
   - start with the highest-priority task in its list

9. An end-of-session protocol: stage changes, append `— end of session —` to
   the terminal's STATUS.md header, summarize shipped/in-progress/failed, leave
   working tree staged for human review.

10. An explicit out-of-scope list of items parked for the next sprint.

Write the document as docs/PLANNING_DOCUMENT.md. Be specific. File paths and
line numbers beat prose. The sprint goal is: <<one-line goal>>.
```

The output is a ~500-line planning document. Review it carefully, edit where you disagree, then it is the source of truth.

---

## Step 2 — Launch four TermDeck panels

Open four panels in TermDeck using the **shell** or **claude** quick-launch buttons in the top toolbar, or the prompt bar. For the four-agent pattern you want four Claude Code panels.

Arrange in **2x2** layout via the layout buttons. Optionally switch to **control** layout to see an aggregate activity feed across all four panels.

---

## Step 3 — Paste the four starting prompts

The planning document's section 8 will contain four starting prompts. Paste one into each panel. Example shape (from the TermDeck v0.2 Sprint 1 planning doc):

### Terminal 1 (client UI)

```
You are Terminal 1 (TermDeck Client UI), referenced in
/absolute/path/to/docs/PLANNING_DOCUMENT.md.

Execute only the section titled "3. Terminal 1 — TermDeck Client UI" and
nothing else. Do not edit any files outside packages/client/public/.
Before starting, read docs/PLANNING_DOCUMENT.md in full, read docs/STATUS.md,
and append a "started" entry under your Terminal 1 header. Check STATUS.md at
the start of every new task.

Start with T1.1 (highest priority task). When T1.1 is ✅, proceed through your
task list in order. Never mark a task ✅ unless its acceptance criteria are met.
Do not commit or push anything without explicit approval.
```

### Terminals 2 / 3 / 4

Same shape. Different terminal number, different working directory, different exclusive-file list, different priority starting task. The structure is identical; only the scope changes.

---

## Step 4 — Watch the feed

Switch TermDeck to **control** layout to see all four agents' activity in a single aggregated feed. You will see each agent reading the planning doc, checking STATUS.md, posting a "started" entry, claiming file locks, executing tasks, and posting completion entries.

This is the moment that earns the pattern its name. Four agents working in parallel on four disjoint file-ownership scopes, with zero merge conflicts, zero blocking, zero coordination overhead — because the coordination happens on a single append-only file.

---

## Step 5 — Review and commit

When all four post `— end of session —` entries in STATUS.md, read the file top to bottom. Then scoped commits, one per terminal, one per repo if multi-repo:

```
# Example from TermDeck Sprint 1 review

git add packages/client/public/
git commit -m "T1: ..."

git add packages/server packages/cli config/
git commit -m "T2: ..."

git add docs-site/
git commit -m "docs-site: ..."

git add docs/
git commit -m "docs: sprint planning + status"
```

Never `git add -A` inside a multi-terminal repo — it would mix file-ownership scopes into a single commit, destroying the traceability benefit.

---

## When the pattern works and when it doesn't

**Works well for:**
- Feature sprints where the work naturally splits by subsystem (client / server / database / docs)
- Refactors that touch many files but in disjoint trees
- Migrations where each target can be handled independently
- Multi-repo releases (one terminal per repo)
- Scaffolding new projects (one terminal per top-level directory)

**Does not work well for:**
- Tightly coupled work where every change touches the same file
- Debugging a single production issue — one agent is enough, more agents is noise
- Work where the split isn't clear upfront — spend time on the planning doc until it is
- Critical-path sequential work — parallelism only helps when the tasks are genuinely independent

**The test:** if you cannot write down four disjoint file-ownership lists without ambiguity, the pattern is not a fit for this work. Do it sequentially.

---

## Real-world example: how TermDeck v0.2 shipped

Sprint 1 planning doc split 23 outstanding items across:

- **T1** — `packages/client/public/**` — info tabs, switcher, reply, proactive toast, first-run empty state, screenshots
- **T2** — `packages/server/src/**`, `packages/cli/src/**`, `config/**` — Mnestra bridge, POST /api/sessions/:id/input, session logs, prebuilds, npm rename
- **T3** — `/Users/.../mnestra/` (entire repo) — HTTP webhook, 3-layer MCP tools, privacy tags, export/import, match_count cap
- **T4** — `/Users/.../rumen/` + `termdeck/docs-site/` — Haiku synthesize phase, CI integration test, Astro Starlight scaffold, release prep

Wall-clock time from planning-doc complete to all 6 commits pushed: **~1 hour 45 minutes**. Human coordination effort: applying 2 Supabase migrations when T3 posted them as `🛑` blockers in STATUS.md, plus reviewing and committing diffs at the end.

Sprint 2 did the same thing with 15 items in ~50 minutes.

---

## Why TermDeck specifically helps

This pattern works on any terminal multiplexer. It works especially well in TermDeck because:

1. **Panel numbering (`#1`, `#2`)** makes it trivial to tell agents apart at a glance when they share the same type and project
2. **Status log drawer tab** on each panel shows the output analyzer's real-time reads of what that agent is doing (`thinking` / `editing` / `idle` / `errored`)
3. **Flashback** fires when any agent errors, automatically surfacing similar past errors from your Mnestra memory — frequently unblocking an agent before you notice it stalled
4. **Control layout** aggregates all four agents' activity into one feed
5. **Reply button** lets you route a correction into a specific panel without losing the agent's context
6. **Terminal switcher** with `Alt+1..9` lets you flip between agents in under 200ms

None of these are essential. All of them compound.

---

## Caveats

- **Claude Code rate limits.** Four agents quadruple your API spend. Budget accordingly.
- **Disk and memory.** Four simultaneous Claude Code sessions with 4 subagents each is 20 concurrent processes. Modern laptops handle this fine; older ones will swap.
- **Review fatigue.** At the end of each sprint you have four diff trees to review. Scope commits carefully (see Step 5) so the diffs are reviewable in linear order.
- **The planning document is the single point of failure.** If your planning doc has bad scope boundaries, the sprint compounds the mistake 4×. Spend extra time on it before launching terminals.

---

That's the recipe. Two files: the planning document (generated by the meta-prompt above) and `docs/STATUS.md` (created by the first terminal on startup). Four panels. One human reviewing at the end. Done.
