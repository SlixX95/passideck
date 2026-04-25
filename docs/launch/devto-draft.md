---
title: "TermDeck: A terminal that remembers what you fixed last month"
published: false
description: "I built a closed-loop developer memory system: terminal + pgvector store + async Claude Haiku learning layer. Here is how it works and why."
tags: llm, opensource, devtools, postgres
cover_image: /docs/screenshots/flashback-demo.gif
series: TermDeck v0.4.5 launch
---

## The problem I kept hitting

I lose real hours, most weeks, re-debugging problems I already fixed on a different project.

Some of it is CORS. Some of it is a Postgres role grant I figured out in January and forgot by March. Some of it is a five-line incantation for a `pg_cron` job that I know exists in a Slack thread from a client engagement I no longer have access to. The fix is always *out there somewhere* — in a commit, in a scratchpad, in a chat I can't search. My editor's LLM never has the answer either. It's stateless. Every new chat starts from zero.

For a while I told myself the problem was discipline: write better notes, tag things, use a second-brain app. I tried four of those. None of them stuck, because the moment I'd actually want the memory is the moment I'm stressed and typing into a terminal, not the moment I have the spare attention to search an app.

I wanted the tool I'm already using to say, unprompted: "you hit this exact error on November 12, and here's what worked." TermDeck is my attempt to build that.

As of 2026-04-15 19:47 UTC, the loop closed end-to-end for the first time. This post is written the same evening.

## The cognitive stack, in four tiers

TermDeck is a browser-based terminal multiplexer — PTY + xterm.js + WebSocket, seven CSS-Grid layouts, eight themes, zero build step on the client, one `npx` command to launch. But the multiplexer is the easy part. The interesting piece is the memory stack underneath it, and the reason the stack is split into four tiers is that each one has a different *cadence*.

### Tier 1 — the terminal itself

Real PTYs via `@homebridge/node-pty-prebuilt-multiarch`, one WebSocket per session, an output analyzer that watches stdout for regex-tagged events: Claude Code prompts, Python web servers, shell prompts, error patterns. The analyzer is the hook everything else fires off. When a panel transitions from `editing` to `errored`, that transition is the event that wakes up the memory layer.

This tier is synchronous with the developer. It runs in milliseconds.

### Tier 2 — Mnestra

Mnestra is a separate npm package (`@jhizzard/mnestra`). It's a pgvector-backed memory store with an MCP server and an HTTP webhook server. Claude Code, Cursor, Windsurf, Cline and Continue all talk to it out of the box via the MCP protocol — they get six tools: `memory_remember`, `memory_recall`, `memory_search`, `memory_forget`, `memory_status`, `memory_summarize_session`. My own store holds ~3,527 memories at the time of writing (source: `docs/launch/LAUNCH-STATUS-2026-04-15.md` §2).

The core search function is `memory_hybrid_search`, a hand-written SQL function that combines `tsvector` keyword matching with `pgvector` cosine similarity. It's the thing Flashback queries when the PTY analyzer sees a red status.

This tier is reactive. It runs within hundreds of milliseconds of an event.

### Tier 3 — Rumen

Rumen (`@jhizzard/rumen`) is the async learning loop, and it's the tier I care about most. It's deployed as a Supabase Edge Function on a 15-minute `pg_cron` schedule. Every tick it reads recent session memories out of Mnestra, cross-references them with the full historical corpus via hybrid search, synthesizes higher-order insights through Claude Haiku, and writes those insights **back into Mnestra** as first-class memory items with `source_type='insight'`.

That last sentence is the whole point: the output of the learning loop is indistinguishable, at read time, from a memory I wrote myself. So when Tier 2 runs a hybrid search three weeks from now, it surfaces *synthesized* knowledge next to raw notes, and I don't have to build a separate "AI suggestions" UI.

This tier is asynchronous. It runs on wall-clock time, not on events. It's the piece that keeps thinking after I close my laptop.

### Tier 4 — the developer

That's me. I write memories explicitly when something surprises me. I read them implicitly when Flashback surfaces one. I never search.

## Rumen's cognitive loop: Extract → Relate → Synthesize → Surface

The loop has four steps, grounded in the actual code paths under `rumen/src/`.

**Extract** reads recent session memories and pulls the signal-bearing fragments: errors, resolutions, commands that succeeded after failing, file-edit sequences that correlate with a status transition. The cheap, deterministic stage.

**Relate** takes each extracted fragment and asks "have I seen anything like this before?" by calling `memory_hybrid_search` against the entire Mnestra corpus. As of rumen@0.4.5 (Sprint 5), Relate uses real pgvector embeddings — the keyword-only path (`NULL::vector`, `semantic_weight: 0.0`) that shipped in v0.3 has been replaced. This was the single biggest quality improvement on the near roadmap, and it landed.

**Synthesize** hands the related cluster to Claude Haiku with a synthesis prompt. Haiku is the default because it's cheap enough to run every 15 minutes without the cost posture falling apart. If the cluster is unusually tight — same error class, multiple independent fixes — there's an escalation rule to a stronger model. Soft cap 100 LLM calls/day/dev, hard cap 500, with a placeholder-insight fallback when the Anthropic key is missing.

**Surface** writes the synthesized insight back into Mnestra as a new memory item. No separate table, no separate namespace, no separate reader. It shows up to Flashback automatically on the next error that matches.

I ran the first full Rumen kickstart at 2026-04-15 19:47 UTC. Against 3,527 memories it produced 111 insights in a single pass — job id `295052b3-2328-45df-866b-fca59dfc3713`, per `docs/RUMEN-UNBLOCK.md`.

That was the first time the closed loop fired on live data.

## The 2 a.m. 4+1 orchestration story

TermDeck got built with TermDeck. The way I actually ship non-trivial sprints is with four parallel Claude Code terminals — T1, T2, T3, T4 — each with an exclusive file-ownership scope, coordinating only via an append-only `STATUS.md` file at the sprint root. Plus one orchestrator (me) outside the multiplexer for any action that's irreversible. Four workers, one orchestrator: 4+1.

During the Sprint 3 rename cascade, at around 2 a.m., a Flashback toast fired in one of the worker panels with the stale header `ENGRAM — POSSIBLE MATCH` and surfaced a research note *from that same sprint* about the `engram` npm name being contested. The memory system flagged its own naming crisis, using memories written by one of its own parallel worker terminals, in the same session it was being built in.

I took a screenshot. It's in the launch playbook now. It's also the single weirdest thing about this project: the system documented its own rename in real time, and the documentation itself is what convinced me the loop was working. That anecdote lives in `docs/launch/blog-post-4plus1-orchestration.md`.

## What's shipped since the first loop closed

Sprint 5 closed the three gaps that both the Claude Opus 4.6 audit (9.25/10) and the Gemini 3.1 Pro audit (9.5/9.0/8.5) flagged independently:

1. A real test suite for Rumen — the component making unsupervised LLM calls on a schedule now has unit tests.
2. The 3,957-line `index.html` client was split into `index.html` + `style.css` + `app.js`.
3. Rumen's keyword-only Relate was replaced with a real pgvector embedding call (rumen@0.4.5).

Sprint 6 (v0.3.2) added startup health checks — Mnestra reachable, Rumen cron active, embedding provider live — surfaced as a "Stack: OK" badge in the top bar, plus automatic session transcript backup. Sprints 7–10 (v0.3.3 → v0.4.5) layered docs hygiene with CI lint, contract tests for the transcript and Rumen-insights APIs, a two-row toolbar redesign, optional token auth with a refuse-to-bind-0.0.0.0-without-auth guardrail, a Flashback end-to-end test, and a `verify-release.sh` pre-publish script. The audit reports are both checked into the repo, so you can read them alongside the code.

v0.4 is a local-only path for Mnestra (SQLite + local embeddings) and an in-TermDeck morning-briefing modal for Rumen insights. Those are future tense; they are not shipped.

## How to try it

```bash
npx @jhizzard/termdeck
```

That's the Tier 1 ladder — no global install, Node 18+, opens a browser on `localhost:3000`. If you stop there, you've got a nice browser terminal multiplexer.

To move up the ladder, install Mnestra separately, run its six SQL migrations against a Postgres you control, and point your editor's MCP client at it. To move up one more rung, deploy Rumen as a Supabase Edge Function per `rumen/install.md`. The three tiers are independently adoptable — you can stop at any one of them.

## Honest limits

I care about this section more than I care about the pitch.

> Flashback fires on pattern-matched error strings from the PTY output analyzer. If the analyzer misses your error class, no flashback. It's a shortest-path to a memory *you already wrote* — if the memory isn't there, the feature does nothing. Mnestra reaches out to Supabase for storage and OpenAI for embeddings; a fully-local path (SQLite + local embeddings) is on the roadmap but not shipped in v0.4.5. Validated against 3,527 memories in one developer's store. No multi-user data yet.

Quoted verbatim from `docs/launch/NAMING-DECISIONS.md`. The earlier drafts of this paragraph were softer, and both audits called me out for it — "honest limits are a feature, not a disclaimer" is the note I'm now trying to live by.

## Links

- **TermDeck** — https://github.com/jhizzard/termdeck · https://www.npmjs.com/package/@jhizzard/termdeck
- **Mnestra** — https://github.com/jhizzard/mnestra · https://www.npmjs.com/package/@jhizzard/mnestra
- **Rumen** — https://github.com/jhizzard/rumen · https://www.npmjs.com/package/@jhizzard/rumen
- **Launch status (ground truth)** — `docs/launch/LAUNCH-STATUS-2026-04-15.md`

Solo dev, MIT, v0.4.5. If you've hit the same "my tools don't remember" wall, I'd love to hear where this does and doesn't fit.
