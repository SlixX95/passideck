# T4 — Launch documentation synthesis

## Why this matters

Over the past weeks, a pile of launch/marketing/planning markdown files accumulated under `docs/`, and yesterday was particularly productive — the 4+1 orchestration blog post, sprint 3 completion, the Rumen audit response, the naming cascade research. Today we hit a major milestone (Rumen deployed and learning end-to-end), and the launch narrative is now meaningfully different from what's in those docs. They need to be reconciled into one authoritative launch status doc.

This is a READ-HEAVY task. You'll read many files, then produce ONE new authoritative doc. Do not edit existing docs during this sprint — just read them.

## Scope (T4 exclusive ownership)

**Reads (inventory):**
- `docs/launch/**` — every file
- `docs/name-dispute-*.md`, `docs/NAMING-DECISIONS.md`
- `docs/SPRINT_*_PLAN.md`, `docs/SPRINT_*_FOLLOWUP_PLAN.md`
- `docs/RELEASE_CHECKLIST.md`, `docs/PLANNING_DOCUMENT.md`
- `docs/LAUNCH_STRATEGY_2026-04-15.md`
- `docs/rumen-deploy-log.md`
- `docs/RUMEN-PLAN.md`
- `docs/SESSION-STATUS-2026-04-12.md`
- `PLAN-rename-and-architecture.md` (repo root)
- `SESSION-HISTORY.md` (repo root)
- `CLAUDE.md` (for context on the project's stated purpose)

**Writes (exclusive ownership):**
- `docs/launch/LAUNCH-STATUS-2026-04-15.md` — NEW file you create

## Deliverable: one synthesized launch status document

The doc should have these sections. Each section answers a specific question a potential outside reader (e.g. a Hacker News visitor, a JS Weekly reader, an investor friend) might have.

### 1. TL;DR (~150 words)
What is TermDeck today, as of 2026-04-15? One sentence on each of: product definition, current state, the recent Rumen milestone, what's shipping next, who it's for.

### 2. What's built (grounded in code, not aspiration)
A bulleted inventory of features that ACTUALLY WORK as of today:
- TermDeck core (PTY multiplexing, 7 grid layouts, themes, status detection)
- Mnestra memory system (via MCP, 3,527 memory items, hybrid search)
- Rumen async learning (just deployed — 111 insights generated, pg_cron every 15 min)
- 4+1 orchestration pattern (documented in the blog post)

For each, link to the code location and the proof that it works (test file, successful run, whatever exists).

### 3. What's launched (nothing yet — what's BLOCKED from launching)
Be ruthlessly honest. Which items below are actually blocking launch, and which are excuses?
- Name dispute (Engram → Mnestra → ?)
- Install instructions in each repo
- Tax ID for Supabase billing (from the warning banner we saw today)
- npm package maturity (rumen is at 0.3.4, termdeck is at 0.2.5 — these are early)
- Documentation gaps
- Demo video / screencast
- Pricing / business model (none)
- Legal entity / LLC

### 4. The narrative we want to tell
Read `docs/launch/blog-post-4plus1-orchestration.md` (I edited it yesterday to include the user's "most impressive thing delivered yet" quote). Does the blog post accurately represent what TermDeck is today after the Rumen milestone? What needs updating? What's the hook?

### 5. Stale or contradictory doc flags
List every doc you read that has stale information as of today. For each, note:
- File path
- What's stale
- Whether to UPDATE, ARCHIVE, or DELETE (don't do the actual action — just recommend)

### 6. Next-48h critical path
Prioritized list of the 5 most important things to finish before any public launch. Be specific: "write install.md in rumen repo with the IPv4 toggle gotcha from RUMEN-UNBLOCK.md" not "improve documentation".

### 7. Launch channels recommendation
For the eventual launch, which channels make sense for TermDeck specifically? Consider: HN, r/programming, JS Weekly, dev.to, Twitter/X, LinkedIn, targeted Slack/Discord communities. Rank them and give a one-sentence rationale for each.

## Style guidelines

- Write to inform, not to impress. Short sentences beat long ones.
- Include file paths and line numbers when citing claims (e.g. `see packages/server/src/session.js:106 for the output analyzer`).
- No marketing language. "Revolutionary", "game-changing", "paradigm shift" are banned. Describe what it does.
- Cite prior-session context where relevant (e.g., "per the external Claude Opus audit on 2026-04-15, the composite score was 9/10").
- Use today's date (2026-04-15) as the "as of" anchor.
- No forward-looking promises ("will", "plan to") in section 2 (What's built). Those go in sections 6 and 7 only.

## Acceptance criteria

- [ ] `docs/launch/LAUNCH-STATUS-2026-04-15.md` exists and has all 7 sections.
- [ ] Every claim in section 2 (What's built) cites a specific file path.
- [ ] Section 3 (Blockers) is ruthlessly honest — at least 3 items, and the post-launch-hindsight-worth-regretting kind.
- [ ] Section 5 (Stale doc flags) has at least 5 entries OR a note saying "everything is current" (the latter is unlikely to be accurate).
- [ ] Section 6 (Next-48h critical path) has exactly 5 items, prioritized.
- [ ] The doc is 2,000-4,000 words total — concise but substantive.
- [ ] No existing docs have been modified. You CREATE one new file only.

## Non-goals

- Do NOT write the blog post or the launch copy. This is analysis and synthesis only.
- Do NOT edit existing docs during this sprint. Flag them in section 5 for future action.
- Do NOT touch code. This is pure markdown.
- Do NOT fabricate facts. If you can't find evidence for a claim, write "unverified" or omit it.

## Coordination

- Append significant progress to `docs/sprint-4-rumen-integration/STATUS.md`.
- You don't block on any other terminal. Start immediately.
- When complete, write `[T4] DONE` with a one-line summary including the final word count.
