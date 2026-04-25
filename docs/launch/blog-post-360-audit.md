---
title: "I had 5 AI systems independently audit my codebase. Here's what they agreed on — and where they didn't."
published: false
description: "Five independent AI auditors scored the TermDeck + Mnestra + Rumen stack. Average: 9.53/10. The hardest grader found the most important bugs. All five audit reports ship with the code."
tags: ai, opensource, codereview, devtools
cover_image: /docs/screenshots/flashback-demo.gif
series: TermDeck v0.3.8 launch
---

## The experiment

Before shipping TermDeck — a terminal multiplexer with a three-tier developer memory system — I wanted a code review that was harder to dismiss than "my AI said it's fine." So I ran the same audit prompt against five different AI systems, independently, with no system seeing any other system's output. Each received the full codebase (~14,000 lines across three packages), every prior sprint document, and identical instructions: score across four dimensions, flag every bug you find, recommend post-launch priorities.

The auditors:

| System | Composite Score |
|--------|----------------|
| Claude Opus 4.6 | 9.95 / 10 |
| Gemini 3.1 Pro | 9.75 / 10 |
| Grok 4.20 Heavy | 9.70 / 10 |
| Codex | 9.30 / 10 |
| ChatGPT GPT-5.4 Pro | 8.95 / 10 |
| **Average** | **9.53 / 10** |

The full audit reports are checked into the repository. You can read them alongside the code they evaluate. That is the point.

## Why five, and why independently

One AI reviewer is a rubber stamp. Two is a conversation. Five, isolated from each other, is a signal extraction problem.

The independence constraint is what makes this useful. If Claude and Gemini both flag the same `getRumenPool` permanent failure latch without coordinating, that bug is real. If only one system catches a bind guardrail bypass that four others missed, the bug is still real — but you also learn something about the reviewer that missed it.

I did not cherry-pick models. I used the strongest available model from each major provider at the time of the audit. I did not tune the prompt between runs. Same codebase dump, same instructions, same day.

## What all five agreed on

**The architecture is clean.** Every auditor scored architectural sophistication between 8.9 and 9.7. The four-layer stack — PTY terminals, SQLite outbox, Mnestra pgvector memory, Rumen async learning loop — was consistently called out as well-decoupled and correctly layered.

**The RAG outbox fix was correct.** A prior audit (Sprint 6) found that `rag.js` was marking events as synced before confirming the push succeeded — a data-loss vector. All five confirmed the fix was implemented correctly: sync IDs are only appended after `_pushEvent` returns success.

**The test suite is credible.** The Flashback end-to-end test (full chain from PTY error through analyzer through `rag_events` to the Mnestra bridge) and the failure injection suite (5 scenarios including SIGKILL recovery and rapid create/destroy leak checks) were called "enterprise-grade" by two auditors independently.

**The 4+1 orchestration methodology is novel.** Four parallel Claude Code terminals with strict file ownership, coordinated by an append-only status log plus one human orchestrator. Every auditor noted that using TermDeck to build TermDeck — 7 sprints in 135 minutes — was the strongest possible dogfooding evidence.

**The project is launch-ready.** All five said ship. Even the lowest scorer.

## Where they diverged

The scoring spread was 1.0 points (8.95 to 9.95). That spread is the interesting part.

**Claude Opus 4.6 (9.95)** gave the highest score but was precise about the 0.05 gap: two specific items (Rumen embedding test coverage and a TranscriptWriter pool permanent failure flag). It tracked every issue from every prior audit and produced a definitive closure table — 12 of 14 issues closed, 2 remaining with exact file references.

**Gemini 3.1 Pro (9.75)** independently identified the same TranscriptWriter issue as Claude and added a concern no other auditor raised: brute-force vulnerability on the auth token if the server is exposed beyond localhost. It was the only auditor to flag rate limiting as a concrete post-launch priority.

**Grok 4.20 Heavy (9.70)** cross-referenced all six prior audits and confirmed the closure claims. It flagged two risks "missed by all prior auditors" — though one (TranscriptWriter buffer cap) had actually been addressed in an earlier commit. An honest mistake that shows even careful auditors can miss state in a large context dump.

**Codex (9.30)** was the methodologist. It focused less on individual bugs and more on process discipline: release-truth drift, stale version strings in the CLI banner, a contradictions register that existed but wasn't being maintained. Its core thesis — "quality debt accumulates faster than coding debt" in a high-velocity orchestration model — was the sharpest strategic insight any auditor produced.

**ChatGPT GPT-5.4 Pro (8.95)** was the hardest grader by a full point. And it found the most important bugs.

## The bugs ChatGPT found that others missed

Three of ChatGPT's five critical findings were real bugs that four other systems overlooked:

**1. Bind guardrail bypass via CLI path.** The security guardrail that refuses to bind to `0.0.0.0` without auth lives inside `if (require.main === module)` in `index.js`. The actual CLI entrypoint goes through `packages/cli/src/index.js`, calls `createServer()`, and binds the server — completely bypassing the guard. The headline Sprint 10 security feature did not protect the primary user-facing entrypoint. Four auditors praised this guardrail. One auditor checked whether it actually ran.

**2. Client hardcodes `ws://`, blocking HTTPS deployment.** The WebSocket URL is built with `ws://${window.location.host}/ws`. Serve this over HTTPS and browsers block the mixed-content WebSocket connection. The fix is trivial (`wss://` when `location.protocol === 'https:'`), but the bug means the deployment documentation's reverse-proxy instructions would have failed silently.

**3. Health badge false-green on configured-but-failing database.** The health badge tier filtering logic collapses to "Tier 1: OK" when the `database_url` check is not passing — which is exactly when you most need the badge to be red.

ChatGPT also caught documentation drift: `SECURITY.md` references a cookie name the code doesn't use, and `DEPLOYMENT.md` references a health endpoint that doesn't exist. These are the kind of bugs you find by reading the docs as a user would, not just the code as a developer would.

## What happened next

I fixed all five of ChatGPT's findings in the same session. The bind guardrail was moved into the shared startup path. The WebSocket URL became protocol-aware. The health badge logic was corrected. The doc strings were reconciled. The fixes shipped in the same sprint the audit was delivered.

This is the workflow I want to normalize: the audit is not a gatekeeper standing between you and the release. The audit is a same-day collaborator that finds what you missed, and you fix it before you push.

## What this teaches about AI code review

**Different models have different review personalities.** Claude tracked issue closure across audits like a project manager. Gemini thought about security posture beyond the stated scope. Grok tried to find things prior auditors missed. Codex focused on process integrity. ChatGPT read the docs as a skeptical user and found the bugs that mattered most for real-world deployment.

**The hardest grader is the most valuable grader.** ChatGPT's score was a full point below the average. It also found the only security bypass in the stack. If I had stopped at the first auditor's 9.95, I would have shipped a bind guardrail that didn't guard.

**Independence is non-negotiable.** The instruction "do not show any auditor the others' results" is what makes this work. Correlated agreement (all five say the architecture is clean) is a strong positive signal. Uncorrelated discovery (only one finds the CLI bypass) is where the real value lives.

**Ship the audits with the code.** All five audit reports are checked into the TermDeck repository, in the same directory tree as the source. Any developer, user, or future auditor can read exactly what was flagged, what was fixed, and what remains open. Radical transparency is the only kind of transparency that survives contact with users.

## Try it

```bash
npx @jhizzard/termdeck
```

The audit reports are at:
- `termdeck_sprint12_audit_claude.md`
- `termdeck_sprint12_audit_gemini.md`
- `termdeck_sprint12_audit_grok.md`
- `termdeck_sprint12_audit_chatgpt.md`
- `docs/SPRINT-13-READINESS-REASSESSMENT.md` (Codex)

Read them. Disagree with them. Run your own. That is the point.

---

*TermDeck, Mnestra, and Rumen are MIT-licensed. Solo dev. The three repos are linked from [github.com/jhizzard/termdeck](https://github.com/jhizzard/termdeck).*
