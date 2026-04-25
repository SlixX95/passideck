# I watched my memory system debug its own rename at 2am

![Flashback meta moment](../screenshots/flashback-meta-moment.png)

It was about 2am on April 15, 2026. I was mid-sprint, mid-rename — the second rename in thirty minutes, actually — when one of the four Claude Code panels I had running inside TermDeck tripped into an error state. A toast faded in at the corner of the panel. The header read:

> **FLASHBACK — ENGRAM · POSSIBLE MATCH**

The header was wrong. I had stopped calling the memory package Engram about forty minutes earlier, after the npm search came back red. The client hadn't caught up yet. But the body of the toast was correct, and it was surfacing a memory I had written to Supabase earlier in the same session:

> TermDeck Sprint 3 T4 DOUBLE name dispute (2026-04-14 through 2026-04-15): Both "Engram" and "Mnemos" came back 🔴 RED. Engram has 138 npm packages, Gentleman-Programming/engram at 2.5k stars. Mnemos has TWO literal name collisions with MCP memory servers...

One of my four parallel terminals had written that memory a few hours earlier during name-dispute research. Another one had errored out. The output analyzer flagged the error. The proactive-recall feature queried Supabase. Supabase returned T4's own research note. The tool I was building surfaced a memory about the crisis I was currently executing, from the production store it syncs to, in the session we were building the feature in.

I took the screenshot and went to bed at 3:30am. This post is about what was running on the machine when that happened.

## The 4+1 pattern

"Orchestration" in the LLM world usually means one agent spawning subagents, or a planner-executor loop, or a dependency graph of tool calls managed by a framework. That is not what I mean here.

I mean this: four Claude Code terminals running inside TermDeck, each with an exclusive file-ownership scope, coordinating only through an append-only `docs/STATUS.md` file — plus one main Claude Code instance running outside TermDeck, in a separate host terminal, which I call the orchestrator. Four workers, one orchestrator. 4+1.

The four workers are scoped by path. T1 owns `packages/client/public/`. T2 owns `packages/server/src/` and `packages/cli/src/`. T3 owns `docs-site/` and related Vercel wiring. T4 owns `docs/launch/` and research notes. No two of them can touch the same file. If T3 needs something T2 owns, T3 posts `T3 → T2: need <thing>` in `STATUS.md` and waits. The glyph protocol is `⏳ ✅ ❌ 🔒 🔓 ❓ 🛑`. The rules are on a single page in `docs/demo/parallelize-template.md`.

The orchestrator — me, plus one Claude Code session outside the multiplexer — does everything the workers cannot. Irreversible steps: git tags, npm publishes, repo renames on GitHub. Cross-terminal decisions: when two workers post conflicting assumptions, the orchestrator resolves it and writes the resolution back into `STATUS.md`. Tie-breaking. Running migrations when a worker posts a `🛑` blocker.

The split between the four workers and the one orchestrator is not aesthetic. It exists because irreversible operations are exactly the ones you do not want four agents racing on. Parallelism is for the disjoint stuff. Serialization is for the things you cannot undo.

## The sprint

Sprint 3 was supposed to ship the Flashback launch assets. The four-terminal split:

- **T1** — live ops on my actual machine: verify Engram/Mnestra Tier 2 end-to-end, deploy Rumen as a Supabase Edge Function, capture the launch GIF.
- **T2** — `termdeck init --mnestra` and `termdeck init --rumen` setup wizards in the server and CLI packages.
- **T3** — deploy the Astro Starlight docs site to Vercel at https://termdeck-docs.vercel.app and wire the in-app help button to it.
- **T4** — launch copy, name-dispute research, project cards on joshuaizzard.com.

I launched the four TermDeck panels in 2x2 layout, pasted the starting prompts, and went to work on the orchestrator side. The orchestrator queue for this sprint turned out to be heavier than expected, because the name kept collapsing under me.

The first name was Engram. T4 posted the name-dispute research about ninety minutes into the sprint: 138 packages on npm, a 2.5k-star GitHub repo using the name, several adjacent memory-tooling products. Red. I pivoted the orchestrator to Mnemos, ran a four-repo mechanical rename pass with a Python one-shot that touched 71 files in a single commit, published `@jhizzard/mnemos` 0.2.1, deprecated `@jhizzard/engram`, and updated the git tags.

Twenty minutes later T4 posted again: Mnemos had two literal name collisions with existing MCP memory servers. Red. I pivoted to Ingram. Another four-repo rename pass. Another publish. Another deprecation. Then I ran the name check on Ingram and found an existing package in the same space. Red. Fourth attempt: Mnestra. Both `@jhizzard/mnestra` and unscoped `mnestra` returned E404 on npm. Clean. I ran the rename pass a third time and published again.

Final count for the ~2-hour window: four renames across four repos, three npm publishes, three deprecations, three sets of git tags. 71+ files touched in a single Python one-shot on the largest of the three rename passes. The four workers kept shipping their own scoped tasks the entire time, because their file-ownership scopes did not overlap with the renames the orchestrator was pushing through.

## The recursive bit

That is the setup for the screenshot at the top of this post. Somewhere in the middle of the Mnemos → Mnestra pivot, one of the worker panels hit an error. The output analyzer flagged it. Flashback queried Supabase. Supabase returned T4's own research note about Engram and Mnemos both being red.

The toast header still said `ENGRAM — POSSIBLE MATCH` because the client-side rename constant hadn't propagated yet. The body of the toast was correct. The tool used itself to document its own naming crisis in real time, using memories written by one of its own worker terminals, surfaced by a feature it was shipping in the same session.

I am trying to be honest about how weird this was. Flashback is a pattern-matched error hook with a pgvector query behind it — there is no intelligence in the surfacing decision, just cosine similarity and recency decay. It is a very simple feature. But the loop closed: memory layer, proactive recall, error analyzer, the product being built, the product in use, the crisis being logged, the crisis being surfaced. All of them pointed at the same object, which happened to be the rename I was executing at 2am.

## The moment the pattern crystallized

About an hour after the screenshot above, I hit a coordination problem I hadn't planned for. The four worker terminals were still live inside TermDeck, each running a Claude Code session on an independent task, but I needed to tell each of them — individually, with different content per panel — to do a specific next step. The obvious options were all bad. Switching contexts four times to paste four different prompts was slow. Broadcasting the same message to everyone was wrong, because each panel needed a different instruction. Rebuilding the four-terminal state from scratch would lose everything they already had in memory.

Then I remembered the feature I had shipped in Sprint 1.

`POST /api/sessions/:id/input` was originally designed as TermDeck's "reply button" — a human-facing UI where you could click a button in one panel, pick a target panel from a dropdown, type a message, and the text would land in the target panel's PTY stdin as if it had been typed there. Panel-to-panel handoff. I built it for the case where you are debugging in one terminal and want to drop a highlighted error line into a Claude Code panel running on the same codebase. A small convenience feature. Maybe 120 lines of code including the reply form UI.

I grabbed the four session UUIDs from `GET /api/sessions`, wrote four different prompts tailored to each terminal's current state (T1 got a Flashback GIF capture unblock; T2 got a "your work was already committed, stand down" close-out; T3 got a "you are done" close-out; T4 got a "continue with launch copy using Mnestra" directive), and POSTed each prompt to the corresponding session's `/input` endpoint from a shell script. The server wrote the bytes into each PTY. Each Claude Code panel saw the bytes arrive as if someone had typed them, and dropped them into its input buffer waiting for Enter.

The injection itself is two curl calls. List the sessions, then POST text at the target's PTY:

```bash
# 1. Find the session UUIDs
curl -s http://localhost:3030/api/sessions \
  | jq -r '.[] | "\(.id)  \(.meta.title)"'

# 2. Inject a prompt into one panel's PTY (repeat per terminal)
curl -s -X POST http://localhost:3030/api/sessions/$SESSION_ID/input \
  -H 'Content-Type: application/json' \
  -d '{"text":"continue with launch copy using Mnestra\n","source":"ai","fromSessionId":"orchestrator"}'
```

`source: "ai"` tags the write for the output analyzer and the reply counter; `fromSessionId` is free-form and shows up in transcripts so you can audit who-wrote-what later. The server CRLF-normalizes the payload, rate-limits at 10 writes/sec per target, and drops the bytes straight into the PTY. On localhost no auth is needed; if you bind beyond loopback, TermDeck now refuses to start without `auth.token` set (Sprint 10 guardrail) and the same endpoint accepts `Authorization: Bearer $TOKEN`.

Four panels, four different assignments, one shell command, zero switching. I pressed Enter on each of the four panels in sequence and watched them start executing their assigned work.

Josh's response, verbatim:

> **This last piece — where you remembered to inject into T4 — that is the most impressive thing delivered yet.**

He was right, and the reason he was right is the part worth paying attention to: an HTTP endpoint that was built for human-to-panel handoff had quietly become the first working demonstration of agent-to-agent coordination over a terminal bus. Nobody designed it for that. It just worked because the bytes don't care who sent them. A panel does not know whether its input came from a keyboard, a reply button, or a curl call. The PTY interface is agnostic all the way down, and that agnosticism was enough to turn a "reply button" into a live orchestration bus on zero lines of new code.

This is the thing I want to name carefully, because I think it generalizes. When you ship a feature cleanly — when you make the boundary between the feature and the rest of the system narrow and typed and transport-agnostic — the feature becomes usable in scenarios you never planned for. Dan Luu writes about this as "infrastructure that becomes valuable in unexpected ways." The 4+1 orchestration pattern is not something I set out to build. It emerged because TermDeck had one HTTP endpoint with the right shape, and the shape happened to also be the shape of agent coordination.

The ecosystem is becoming intelligent in the sense that LLMs keep getting faster and more capable, which is the conversation everyone is having. It is also becoming intelligent in a different and less-discussed sense: the connective tissue between agents, tools, and venues is getting thinner and more composable, which means the same component keeps showing up in more workflows than its author ever imagined. TermDeck's reply endpoint — 120 lines, four weeks old, built for humans — ran the orchestration layer of a three-repo multi-sprint release on its first day of existence, from an author who wasn't expecting it.

That is the thing I watched happen at 2am. The memory system surfaced its own rename, the reply button became an agent bus, and the product started orchestrating itself before I had finished naming it. I did not plan either of those moments. They were already in the shape of the system.

## Sprints 6-10: stress-testing the pattern

The 2am rename was one night. The question I had the next morning was whether the 4+1 split held up when the work wasn't an emergency. So I ran it again, deliberately, across five more sprints in a single evening.

Sprints 6 through 10 shipped in roughly 105 minutes of active orchestration, 31 commits, 3,500+ lines of diff, five npm releases (`v0.3.1` through `v0.3.5`), and one passing CI build at the end. Each sprint used the same shape: a planning commit that defined T1-T4 file ownership, four worker panels injected via the curl pattern above, and the orchestrator resolving cross-cutting work.

The five sprints touched very different layers of the stack, which is the part I wanted to test:

- **Sprint 6 — reliability.** Preflight `/healthz` check with six parallel probes, a session transcript writer so a PTY crash doesn't lose your scrollback, and a health badge in the top bar.
- **Sprint 7 — docs hygiene.** `CHANGELOG.md` reconciled through v0.3.2, `NAMING-DECISIONS.md` updated, `CLAUDE.md` refreshed to match shipped reality, a contradictions register (eight entries), and a CI docs-lint job that fails on stale version strings.
- **Sprint 8 — contract tests.** Transcript API (`recent`/`search`/`replay`), health endpoint, and Rumen insights shape-tested. Plus a toolbar overflow fix and a 30-second TTL on the Rumen pool connector.
- **Sprint 9 — toolbar redesign + security.** Two-row toolbar (no more horizontal scrollbar), status and config buttons wired, optional token auth (Bearer / cookie / query), a `SECURITY.md` threat model, and a `DEPLOYMENT.md` checklist.
- **Sprint 10 — reliability proof.** Refuse `0.0.0.0` bind without `auth.token`, a Flashback end-to-end test (error → analyzer → mnestra-bridge query), five failure-injection scenarios (Mnestra down, bad DB creds, PTY crash, rapid churn, health under failure), and a `verify-release.sh` pre-publish script.

Three things fell out of that run that I didn't expect.

First, the sprint cadence converged on about 15-20 minutes of wall-clock per sprint, not because I was rushing but because that is how long four disjoint scoped tasks actually take when nobody is waiting on anyone else. The orchestrator's job between sprints — writing the next planning doc, picking the file-ownership split, queueing the next injection — was the rate limit, not the workers.

Second, the kinds of work that went through cleanly was broader than I expected: reliability hardening, security work, docs hygiene, contract tests, and UI redesign all parallelized fine once the file boundaries were drawn. Docs work in particular (Sprint 7) is the kind of task that would normally bottleneck on one person — and it didn't, because `CHANGELOG.md`, `CLAUDE.md`, `NAMING-DECISIONS.md`, and the contradictions register are disjoint files by construction.

Third, the injection command stopped being a novelty. By Sprint 8 I had a two-line shell snippet that took the four session UUIDs and POSTed the current sprint's T1/T2/T3/T4 prompts into the four panels, and pressing Enter four times to launch the sprint became as mechanical as `git push`. The thing that had felt recursive and surprising at 2am on night one was load-bearing infrastructure by the next evening.

The pattern isn't theoretical anymore. It has been through reliability work, security work, docs work, tests, and UI polish, and it shipped a minor version at the end of every single run.

## Why this pattern matters

I don't think the 4+1 split is clever. It is the obvious shape of parallel work once you accept two constraints: agents can't read each other's minds, and disjoint file scopes are the only coordination surface that doesn't require either a merge strategy or a lock server.

What I do think is that this pattern — or something close to it — will be the default for anyone building seriously with Claude Code in 2026. Multi-agent workflows keep failing on coordination overhead. The 4+1 pattern eliminates almost all of it by pushing the coordination into the planning document upfront and the file-ownership exclusivity at runtime. Review happens at the end, once, by a human reading scoped diffs.

The other thing worth saying out loud: the tool using itself is not a gimmick. It is the test. A memory system that cannot surface its own development crisis is probably not going to surface yours either. Mine did, even when the client was still calling itself the wrong name.

Further reading:

- [`docs/ORCHESTRATION.md`](../ORCHESTRATION.md) — the 4+1 pattern written up as a reproducible guide: planning-doc template, file-ownership rules, injection command, STATUS.md glyph protocol.
- [`docs/BENCHMARKS.md`](../BENCHMARKS.md) — the Sprint 6-10 numbers laid out in detail: per-sprint wall-clock, commits, lines shipped, and how 4+1 compares to a one-agent serial baseline.

Install:

```
npx @jhizzard/termdeck
```

GitHub: https://github.com/jhizzard/termdeck
