# Sprint 17-18 Plan + Tier 5 Architecture Vision

**Date:** 2026-04-18
**Context:** Product is launch-ready (v0.3.8, 5 auditors averaged 9.53/10). These sprints push toward product maturity and the Tier 5 autonomous skill generation vision.

---

## Sprint 17 — Pre-Launch Polish (today/tomorrow)

### T1: Merge low-risk dependency PRs
- TermDeck #2 (actions/checkout v4→v6) — CI only, drop-in
- TermDeck #5 (uuid 9→13) — verify `v4()` import style still works
- Mnestra #1 + #2 (actions/setup-node + checkout) — CI only
- Mnestra #4 (@types/node 20→25) — run `tsc --noEmit`
- Leave Express 5 and Zod 4 for Sprint 18

### T2: Orchestrator layout preset
- Add a new layout: "orchestrator" — 1 large panel on left (60%), 2-4 smaller panels stacked on right (40%)
- New CSS Grid template in style.css
- New layout button in the toolbar (between 4x2 and control)
- Keyboard shortcut: Cmd+Shift+7
- This covers the 4+1 use case without drag-and-drop complexity

### T3: Auto-start Mnestra from start.sh + config flag
- Add `mnestra.autoStart: true` setting in config.yaml
- `start.sh` reads the flag and starts `mnestra serve` automatically
- On first run (no config.yaml exists), prompt: "Start Mnestra automatically on boot? [y/n]" and save preference
- Detect if Mnestra is already running (port check) before starting

### T4: Fix remaining docs-site stale content
- The 8 stale version refs from the Sprint 15 audit that were in gitignored docs-site content
- The rumen/changelog.md that has everything under [Unreleased]
- Run sync + build + deploy after fixes

---

## Sprint 18 — Post-Launch (after tester feedback)

### T1: In-browser setup wizard (`/setup` route)
- Detect current tier (what's configured vs not)
- Walk through each tier with real-time connection tests
- Write to config.yaml and secrets.env
- Guide MCP setup for Claude Code/Cursor
- "Always start Mnestra/Rumen" toggle saved to config

### T2: Express 5 migration
- Branch, apply breaking changes (req.host, res.redirect, path matching)
- Run full test suite
- Test all API endpoints manually

### T3: Zod 4 migration (Mnestra repo)
- Audit all schemas for .merge()/.extend() changes
- Run type check + test suite

### T4: Drag-and-drop layout Phase 2
- Resizable panels with splitters (split.js or custom pointer events)
- Persist custom layout to config
- Minimum panel size constraints

---

## Tier 5 Vision: Autonomous Skill Generation

### The problem

Rumen synthesizes insights, but insights are passive — they sit in the memory store and only surface via Flashback when a matching error occurs. Many insights represent **procedures** (how to deploy to Vercel correctly), **patterns** (the XGBoost hyperparameter sequence that works), or **solutions** (the OR-Tools CP-SAT constraint formulation from Maestro) that should be **always available** without bloating context.

### The vision

A new layer above Rumen:

```
Tier 5 — SkillForge (autonomous skill generation)

Input:  Mnestra memories + Rumen insights
Process: Periodic Opus 4.7 deep scan (cost-aware, user-approved)
Output:  Claude Code Skills (.md files in ~/.claude/skills/)
Effect:  Knowledge crystallized into on-demand skills that load
         ONLY when relevant, keeping base context lean
```

### How it works

1. **Trigger:** User runs `termdeck forge` or a scheduled cron fires (weekly, configurable)
2. **Cost gate:** Before running, show projected cost: "This will analyze ~3,855 memories using Opus 4.7. Estimated cost: $X.XX. Proceed? [y/n]"
3. **Scan phase:** Opus 4.7 reads the full memory corpus (or a filtered subset) and identifies:
   - Recurring error → solution pairs across projects
   - Multi-step procedures that have been executed 3+ times
   - Domain knowledge that's non-obvious and would save time if crystallized
   - Patterns that cross project boundaries (the CORS fix, the Supabase deploy dance, the CP-SAT solver formulation)
4. **Skill generation:** For each identified pattern, generate a Claude Code Skill:
   ```markdown
   ---
   name: supabase-deploy-gotchas
   description: Avoid the 5 known gotchas when deploying to Supabase (IPv4 toggle, password encoding, DIRECT_URL, Deno on macOS 13, schema drift)
   trigger: when working with Supabase deployment, Edge Functions, or database connection issues
   ---
   
   [Crystallized procedure with exact steps, commands, and error → fix mappings]
   ```
5. **Installation:** Write the skill to `~/.claude/skills/` (or wherever Claude Code reads custom skills)
6. **Notification:** Surface in TermDeck UI: "SkillForge created 3 new skills from your recent work: supabase-deploy-gotchas, xgboost-tuning-sequence, vercel-env-vars"
7. **Usage:** The skill loads into context ONLY when its trigger matches — no context bloat. When you're working on Supabase, the skill is there. When you're not, it isn't.

### Why this is different from what exists

- **Claude Code's auto-memory (MEMORY.md):** Per-project, flat notes. Not structured, not triggerable, not cross-project.
- **Mnestra/Rumen:** Store and synthesize memories. But memories are raw — they require a search query to surface. Skills are proactive and structured.
- **Manual skills:** Writing skills by hand works but doesn't scale. You won't write a skill for the Supabase IPv4 toggle — but SkillForge will, because it saw you hit it 4 times.

### Architecture

```
┌─────────────────────────────────────────┐
│  SkillForge (Tier 5)                    │
│  - Opus 4.7 deep scan                  │
│  - Pattern detection                    │
│  - Skill template generation           │
│  - Cost-gated execution                │
└─────────────────┬───────────────────────┘
                  │ reads memories + insights
                  ▼
┌─────────────────────────────────────────┐
│  Rumen (Tier 4) — insight synthesis     │
│  Mnestra (Tier 3) — memory store        │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Claude Code Skills (~/.claude/skills/) │
│  - Loaded on-demand by trigger match    │
│  - No context bloat                     │
│  - Cross-project knowledge              │
└─────────────────────────────────────────┘
```

### Implementation phases

**Phase 1 (Sprint 19-20):** Build `termdeck forge` CLI command
- Reads memories from Mnestra via the MCP or direct DB query
- Sends to Opus 4.7 with a skill-extraction prompt
- Generates .md skill files
- Installs to ~/.claude/skills/ (or equivalent)
- Cost projection + user approval gate

**Phase 2 (Sprint 21-22):** Automatic trigger + TermDeck UI
- Scheduled runs (weekly cron or after N new memories)
- TermDeck notification badge: "3 new skills forged"
- Skill management panel: view, edit, disable, delete generated skills
- Quality feedback: "This skill was useful" / "This was noise" — feeds back into the extraction prompt

**Phase 3 (v0.5+):** Skill marketplace
- Users can share generated skills
- Community-contributed skill templates
- Skill versioning (the Supabase gotchas skill updates when Supabase changes their UI)

### Cost model

Opus 4.7 pricing (estimated):
- ~$15/M input tokens, ~$75/M output tokens
- 3,855 memories × ~200 tokens avg = ~770K input tokens = ~$11.55 input
- Output: ~50K tokens (10-20 skills) = ~$3.75 output
- **Total per forge run: ~$15-20**
- Weekly runs: ~$60-80/month
- This is the user's cost, not ours — they bring their own Anthropic key

### What this means for the product

TermDeck stops being "a terminal multiplexer with memory" and becomes "a system that learns how you work and crystallizes that knowledge into always-available expertise." The terminal is the input device. Mnestra is the memory. Rumen is the synthesis. SkillForge is the knowledge crystallization. Each tier is independently valuable but the full stack is transformative.

The moat: nobody else has the pipeline from raw terminal output → vector memory → async synthesis → autonomous skill generation. Each layer feeds the next. A competitor would need to replicate all five tiers to match the value proposition.
