---
title: "7 sprints in 135 minutes: the night TermDeck built itself"
published: false
description: "I ran 7 development sprints in 2 hours and 15 minutes using 4 parallel Claude Code terminals orchestrated through the product I was building. 50+ commits, ~4,000 lines. Here is exactly what happened."
tags: ai, devtools, productivity, opensource
cover_image: /docs/screenshots/flashback-demo.gif
series: TermDeck v0.3.8 launch
---

## The starting state

On the evening of April 16, 2026, TermDeck was at v0.3.1. The core multiplexer worked. The memory stack (Mnestra for storage, Rumen for async learning) had closed its loop the night before. Two independent audits — Claude Opus 4.6 at 9.25/10 and Gemini 3.1 Pro at 9.5/9.0/8.5 — had scored the stack and flagged the same gaps: no health checks, no session transcripts, no contract tests, a toolbar that scrolled off-screen, no auth story, no deployment docs.

The product functioned but was not shipworthy. The gap between "works on my machine" and "strangers can install this from npm" was about 4,000 lines of reliability, security, docs, and polish work.

I had one evening. And I had the tool itself.

## The pattern: 4+1

The development model I use is not complicated. It is four Claude Code terminals running inside TermDeck, each with an exclusive file-ownership scope, plus one orchestrator session that writes specs, injects prompts, and handles every irreversible operation.

**Four workers.** Each worker is a Claude Code session in its own TermDeck panel. Each owns a disjoint set of files, declared in a STATUS.md table before any work begins. T1 might own `packages/server/src/preflight.js`. T2 might own `packages/server/src/transcripts.js`. T3 owns `packages/server/src/index.js` for one specific section. T4 owns `packages/client/public/app.js`. No overlaps.

**One orchestrator.** Me, plus a Claude Code session outside the multiplexer. I write the sprint specs, inject each worker's starting prompt via `POST /api/sessions/:id/input`, tail STATUS.md, and own every `git commit`, `git push`, and `npm publish`. Workers never commit. Workers never push. Workers never talk to each other.

**STATUS.md is the bus.** Each worker appends progress and signs off with `[Tn] DONE`. That is the entire coordination protocol. No Slack, no chat, no cross-panel pings. The append-only constraint eliminates merge conflicts on the one shared file.

The injection itself is two curl calls:

```bash
# List sessions
curl -s http://127.0.0.1:3000/api/sessions | jq '.[] | {id, name}'

# Inject a prompt into one panel
curl -s -X POST http://127.0.0.1:3000/api/sessions/$SID/input \
  -H 'Content-Type: application/json' \
  -d '{"text":"You are T1 in Sprint 8. Read your spec. Begin.\n","source":"ai"}'
```

By Sprint 8, this was mechanical. Inject four prompts, press Enter four times, wait for DONE.

## What shipped: sprint by sprint

| Sprint | Wall clock | Scope | Commits |
|--------|-----------|-------|---------|
| 6 | ~30 min | Startup health checks (6 parallel probes), session transcript backup to Supabase, health badge UI | 5 |
| 7 | ~15 min | 10-item docs punch list: CHANGELOG, CONTRADICTIONS register, lint-docs CI, CLAUDE.md + README refresh | 7 |
| 8 | ~20 min | Contract tests for health/transcript/Rumen APIs, toolbar overflow fix, Rumen pool 30s TTL retry | 6 |
| 9 | ~20 min | Two-row toolbar redesign, wired all stub buttons, optional Bearer token auth, SECURITY.md + DEPLOYMENT.md | 7 |
| 10 | ~20 min | 0.0.0.0 bind guardrail, Flashback end-to-end test, 5 failure-injection scenarios, verify-release.sh | 6 |
| 11 | ~15 min | ORCHESTRATION.md operating guide, sprint template directory, BENCHMARKS.md with real numbers | 4+ |
| 12 | ~15 min | Version consistency pass, screenshot audit, quickstart verification, launch readiness checklist | 4+ |
| **Total** | **~135 min** | | **50+** |

Sprint 6 was the slowest because it was the first — orchestrator warm-up cost. Sprint 7 was the fastest because docs-only work parallelizes trivially: CHANGELOG, CLAUDE.md, README, and the CI lint script are four files with zero dependencies between them.

The serial estimate for the same scope — one Claude Code session grinding through all seven sprints in order — is 8-12 hours. The observed run took 2 hours and 15 minutes. That is roughly a 4-5x multiplier, and the bottleneck was not the agents. It was me reading diffs and running verification.

## The meta moment

Here is the part that still feels strange: TermDeck was the forge.

The four Claude Code panels ran inside TermDeck. The metadata overlays showed each worker's status — `thinking`, `editing`, `idle`, `errored` — without me cycling through tmux panes. The prompt injection API (`POST /api/sessions/:id/input`) that I built in Sprint 1 as a "reply button" between panels turned out to be the entire orchestration bus. I did not design it for agent coordination. It just worked because the PTY does not care who sent the bytes.

During Sprint 6, one of the workers was building the health check system. Another was writing the transcript backup. A third was hooking the transcript writer into the server's PTY stdout handler. A fourth was adding the health badge to the client. All four of these features were being built inside the product that would run them. The health badge that T4 was coding would, once deployed, appear in the same top bar that T4 was currently looking at in its TermDeck panel.

This is not a gimmick. It is the test. If a developer productivity tool cannot improve its own development productivity, it probably will not improve yours either.

## The failures

I want to be honest about what broke, because the sprint velocity numbers are meaningless without the context of what went wrong.

**The demo crash.** Sprint 6 exists because of a catastrophic live demo the same morning. I showed TermDeck to two collaborators (Jonathan and David), and it failed in front of them. Claude Code inside TermDeck could not find the Rumen project. The shell panel fell back to bash 3.2 with zsh profile errors. The three-tier memory system appeared completely non-functional. That humiliation is why Sprint 6's first feature was a preflight health check — if something is broken, say so loudly, never silently degrade.

**The startup cascade.** Sprint 12 discovered that `EADDRINUSE` on port 3000, Mnestra's `/healthz` endpoint mismatch, and unexported secrets.env variables were all real gotchas that first-time users would hit. Three troubleshooting rows were added to GETTING-STARTED.md as direct fixes. The startup script (`start.sh`) now kills stale PIDs automatically.

**Version drift.** This one is systemic. Four parallel workers produce code that individually looks correct and collectively drifts from the canonical docs. By Sprint 12, the CLI banner still printed `v0.2.0` even though npm was on `0.3.5`. CHANGELOG.md had stopped at `0.3.2`. The `LAUNCH-READINESS.md` document — the single source of truth for launch gating — was itself stale. Sprint 13's entire purpose was closing the version-truth gap that the marathon had opened. Quality debt accumulates faster than coding debt when four agents are shipping in parallel.

## The 5-auditor 360 review

After the marathon, the codebase was independently reviewed by five AI systems. None had access to each other's assessments.

| Auditor | Score | Verdict |
|---------|-------|---------|
| Claude Opus 4.6 | 9.95/10 | "Ship it. The remaining 0.05 is one mock-fetch test and one TTL retry flag." |
| Gemini 3.1 Pro | 9.75/10 | "Ship it. Run the Show HN playbook without hesitation." |
| Grok 4.20 Heavy | 9.7/10 | "One of the most sophisticated developer-memory systems I have audited." |
| Codex | 9.3/10 | "The project is stronger than it was two hours earlier, and the improvement is real." |
| ChatGPT GPT-5.4 Pro | 8.95/10 | "Ship for localhost. Found CLI bind guardrail bypass — fixed within minutes." |

**Average: 9.53/10.**

The audits found real bugs. ChatGPT discovered a CLI bind guardrail bypass that would have let someone bind to 0.0.0.0 without auth. It was fixed within the same session. The health badge had a false-green state. That was fixed too. The RAG outbox had a data-loss path. Fixed. Every critical finding from five independent reviewers was resolved before the session ended.

The range matters. ChatGPT scored lowest because it found the most actionable bugs — bugs the other auditors missed. Codex scored 9.3 because it focused on process maturity (version-truth drift, contradiction tracking) rather than code correctness. The spread tells you something about what each model optimizes for.

## What this means for developer productivity

I do not think the 4+1 pattern is clever. It is the obvious shape of parallel work once you accept two constraints: agents cannot read each other's context, and disjoint file scopes are the only coordination surface that does not require a merge strategy or a lock server.

Three things fell out of this marathon that I did not expect:

**The bottleneck shifted.** In serial development, the bottleneck is coding throughput — how fast can the agent write the code. In 4+1, four workers produce a diff faster than one human can read it. The bottleneck moved to verification. Implementation is now cheap relative to truth maintenance.

**The breadth surprised me.** Reliability hardening, security work, docs hygiene, contract tests, toolbar redesign, and launch polish all parallelized cleanly. Docs work in particular — normally a single-person bottleneck — splits trivially because CHANGELOG, README, CLAUDE.md, and DEPLOYMENT.md are disjoint files by construction.

**The injection became infrastructure.** An HTTP endpoint built for human-to-panel handoff (120 lines, four weeks old) ran the orchestration layer of a seven-sprint marathon on its first real day of load. By Sprint 8 I had a two-line shell snippet and pressing Enter four times to launch a sprint was as mechanical as `git push`. The feature that felt recursive and surprising at 2 a.m. on night one was load-bearing infrastructure by the next evening.

The ecosystem is getting more capable in the obvious sense — models keep improving. But it is also getting more capable in a less-discussed sense: the connective tissue between agents and tools is getting thinner. The same 120-line endpoint kept showing up in more workflows than I ever imagined when I wrote it. Narrow, typed, transport-agnostic interfaces compose in ways their authors never planned for.

TermDeck is at v0.3.8. It is MIT-licensed. The orchestration guide, benchmarks, and all five audit reports are in the repo.

```bash
npx @jhizzard/termdeck
```

GitHub: [github.com/jhizzard/termdeck](https://github.com/jhizzard/termdeck)

If you have tried parallel agent workflows and hit the coordination wall, I would like to hear what broke. The 4+1 pattern is not the only shape — it is just the one that survived contact with seven sprints in a row.
