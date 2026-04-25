# SkillForge

> Status: **SkillForge v0.1** — cost projection only. Full skill generation lands in v0.4.

SkillForge turns raw terminal history into durable, reusable Claude Code skills. It reads the memories TermDeck has synced to Mnestra, asks Opus to find the patterns worth crystallizing, and writes them to `~/.claude/skills/` so every future Claude Code session starts with that expertise already loaded.

The loop is: work in the terminal → Mnestra remembers → SkillForge distills → Claude Code picks it up automatically the next time the trigger fires.

## Running it

```bash
termdeck forge                 # cost projection + confirm + (soon) generate
termdeck forge --dry-run       # show projection, do not prompt
termdeck forge --max-cost 2.00 # refuse to run if projection exceeds ceiling
termdeck forge --min-confidence 0.7
```

Requires Mnestra configured (`termdeck init --mnestra`) and an `ANTHROPIC_API_KEY` in `~/.termdeck/secrets.env`.

## Cost model

Transparent — the formula is printed before anything runs:

```
tokens  = memory_count × 200 (avg input tokens per memory)
output  = tokens × 0.3       (estimated skills output)
cost    = (tokens / 1M) × $15   (Opus input)
        + (output / 1M) × $75   (Opus output)
```

A run over 500 memories projects roughly **$1.65**. You confirm before any API call fires. `--dry-run` skips the confirmation entirely.

## What a generated skill looks like

SkillForge writes markdown files with frontmatter that Claude Code already knows how to load:

```markdown
---
name: supabase-deploy-gotchas
description: Avoid the 5 known Supabase deployment gotchas
trigger: when working with Supabase deployment or Edge Functions
source: SkillForge v0.1 — generated from 12 related memories
generated: 2026-04-18T22:00:00Z
---

1. The Supabase Connect modal has a hidden IPv4 toggle. It defaults to
   IPv6-only, which fails on most home networks. Always enable IPv4 before
   copying the connection string.
2. `supabase functions deploy` requires `SUPABASE_ACCESS_TOKEN`, not the
   anon key. Export it first.
3. ...
```

Every skill carries an `evidence` block citing the memory IDs it was distilled from, so you can verify provenance before trusting it.

## How Claude Code loads skills

Claude Code auto-discovers markdown files in `~/.claude/skills/` at session start. The `description` and `trigger` fields decide when a skill fires — Claude matches them against the current task without you having to `/invoke` anything. A skill about "Supabase Edge Function deploys" only surfaces when you're actually deploying Supabase Edge Functions.

That means SkillForge is write-once, benefit-forever: the next time you hit the IPv4 toggle bug in a fresh session, Claude already knows the fix.

## The four-phase pipeline (planned for v0.4)

1. **Quality audit** — score memory clusters 0–1 on actionability. Discard sprint-process noise.
2. **Pattern extraction** — find repeated error→fix pairs, multi-step procedures, cross-project connections.
3. **Skill generation** — emit `name`, `description`, `trigger`, `body`, `evidence`, `confidence` for each validated pattern.
4. **Self-critique** — Opus re-reads each skill and discards anything a senior dev would call obvious. "Always check your config" is cut. "The Supabase IPv4 toggle dance" ships.

## Current limitations (v0.1)

- **No generation yet.** `termdeck forge` reads memory counts, shows the cost projection, and confirms. API calls to Opus and install to `~/.claude/skills/` arrive in v0.4.
- **Mnestra only.** No support for other memory backends.
- **No scheduled runs.** You trigger it manually. A nightly cron is on the roadmap.
- **No diffing.** Re-runs will overwrite by name; a "skill changelog" mode is planned.
- **Single-user.** Team-shared skill bundles are future work.

## The vision

Every engineer builds the same muscle memory in private — the Supabase gotchas, the deploy rituals, the solver formulations, the flags that always get forgotten. Today that muscle memory lives in your head and in scattered notes. Tomorrow it lives in `~/.claude/skills/` as always-available expertise, distilled from your own terminal history, auto-loaded by every future session.

SkillForge is the bridge from "I've done this before" to "Claude already knows how I do this."
