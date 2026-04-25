# TermDeck Restart Prompt — Fresh Session 2026-04-20+

Paste this (or point a fresh Claude Code session at it) to resume work without re-loading context. `memory_recall` fills in the rest.

---

## Current versions (as of 2026-04-19)

| Package | Version | npm | Notes |
|---------|---------|-----|-------|
| `@jhizzard/termdeck` | 0.4.5 | published | Tier 1/2 — PTY multiplexer + local SQLite |
| `@jhizzard/mnestra` | 0.2.1 | published | Tier 3 — pgvector + MCP server + auto-read secrets.env |
| `@jhizzard/rumen` | 0.4.1 | published | Tier 4 — async learning loop (Supabase Edge Fn) |
| SkillForge (no pkg) | — | in-repo | Tier 5 — skill generator skeleton, shipped Sprint 20 |

Node baseline: 20 LTS. Shell: zsh on darwin.

## What shipped (Sprints 6-23 summary)

### Sprints 6-21 (2026-04-16 to 2026-04-18) — see previous restart prompt for details

### Sprint 22 (2026-04-19)
- **CI lint fixed** — docs-lint job handles clean checkouts
- **Orchestrator layout v2** — 2x2 workers top + full-width orchestrator bottom (equal thirds)
- **Bulletproof start.sh** — numbered steps, smart Mnestra handling (kills/restarts if 0 memories), first-run config creation
- **Rumen re-kickstart** — 166 insights generated with hybrid embeddings, 44 PVB-specific (up from 13). Cross-project pattern discovery confirmed.
- **Mnestra 0.2.1** — auto-reads ~/.termdeck/secrets.env as fallback when SUPABASE_URL not in env

### Sprint 23 (2026-04-19)
- **Responsive layouts** — media queries for 13" laptops through 27" iMacs, min panel dimensions, toolbar compaction, resize debounce
- **Setup wizard Phase 2** — user pastes Supabase credentials in browser, wizard validates, saves secrets.env + config.yaml, runs all 7 migrations automatically
- **Auto-migration runner** — POST /api/setup/migrate runs 6 Mnestra + 1 transcript migrations from the browser
- **Welcome-back flow** — returning users see a brief status toast, first-run users see the full wizard
- **Orchestrator-in-TermDeck demo** — Sprint 23 was orchestrated by a 5th Claude Code terminal inside TermDeck itself during a live Google Meet

## What's next

### TermDeck priorities (ranked)
1. **Show HN launch** — HN account jhizzard has ~1 karma, needs 15+ before posting. X account @joshuaizzard created. Target: Tue/Wed April 22-23 at 10am ET.
2. **New hero GIF** — current one doesn't show the new UI (2-row toolbar, orch layout, setup wizard)
3. **Flashback real-world verification** — Sprint 21 fixed the root cause but needs observation during normal use
4. **Express 5 migration** — high risk, deferred
5. **Zod 4 migration** (Mnestra) — high risk, deferred
6. **SkillForge Opus wiring** — connect forge CLI to actual Opus API (currently stubbed, v0.5)

### Parallel projects (separate Claude Code sessions)
- **WhatsApp Dispatch** — repo at github.com/jhizzard/chopin-dispatch, being cleaned up from Viktor build. React + Vite + Convex + wa.me deep links.
- **High Ticket Business** — project at ~/Documents/Graciella/ChopinNashville/SideHustles/HighTicket/. Brook Hiddink methodology. OpenClaw + DOR + Mnestra for automation. Shopify stores, supplier outreach, automated customer service. Tag all memories project="high-ticket" category="business".
- **The Harness** — vision doc at ~/Documents/Graciella/ChopinNashville/SideHustles/TheHarness/VISION.md. Deferred — OpenClaw is the faster path. Revisit after High Ticket generates revenue.

## Key paths

```
termdeck/
├── packages/server/src/          # Express + WS + PTY (11 modules)
├── packages/client/public/       # index.html + style.css + app.js (vanilla)
├── packages/cli/src/             # CLI + init-mnestra + init-rumen + forge
├── docs/IDEAS-AND-STATUS.md      # Full backlog of all surfaced ideas
├── docs/ORCHESTRATOR-PROMPT.md   # Paste-ready prompt for orchestrator terminal
├── docs/SPRINT-17-18-PLAN.md     # Tier 5 SkillForge vision
├── docs/sprint-N-*/              # Sprint logs + STATUS.md per sprint
├── docs/launch/                  # Show HN, Twitter, dev.to, LinkedIn, blog posts
├── scripts/start.sh              # One-command full stack launcher
├── scripts/bump-version.sh       # Version bump across all docs
├── scripts/publish-launch.sh     # Launch day URL opener
└── scripts/verify-release.sh     # Pre-publish checks
```

Secrets and config:
- `~/.termdeck/config.yaml` — project defs, RAG settings, theme defaults, mnestra.autoStart
- `~/.termdeck/secrets.env` — API keys (Mnestra 0.2.1 auto-reads this)
- `~/.termdeck/termdeck.db` — SQLite WAL, local source of truth

Sibling repos:
- Mnestra: `~/Documents/Graciella/engram` (folder predates rename)
- Rumen: `~/Documents/Graciella/rumen`
- DOR: `~/Documents/DOR` (Rust binary at target/release/dor, port 8741)
- Supabase project: **petvetbid** (ref `luvvbrpaopnblvxdxwzb`)

## 4+1 orchestration pattern

- **4 terminals (T1-T4)** — disjoint file ownership, append-only STATUS.md
- **+1 orchestrator** — reviews, unblocks, commits
- **Orchestrator layout**: click "orch" — 2x2 workers top, full-width orchestrator bottom
- **Injection**: `POST /api/sessions/:id/input` with `{"text": "prompt"}`
- Sprint specs: `docs/sprint-N-slug/T1-*.md` through `T4-*.md`
- 23 sprints shipped across 3 days using this pattern

## 5-auditor 360 review (post-Sprint 12)

| Auditor | Score | Verdict |
|---------|-------|---------|
| Claude Opus 4.6 | 9.95/10 | Ship it |
| Gemini 3.1 Pro | 9.75/10 | Ship it |
| Grok 4.20 Heavy | 9.7/10 | Ship it |
| Codex | 9.3/10 | Ship after trust-surface fix |
| ChatGPT GPT-5.4 Pro | 8.95/10 | Ship for localhost |

Average: 9.53/10. All critical findings fixed through Sprint 23.

## API costs

$2.64 total for April 2026 across 23 sprints. Claude Code runs on Max subscription. The $2.64 is from Mnestra MCP calls (Haiku summaries) and Rumen Edge Function (Haiku synthesis).

## Known open issues

- HN karma too low for Show HN (need 15+, currently ~1)
- Rumen JSON parse hardening (19% placeholder rate)
- Rumen confidence score normalization
- app.js growing (3K+ lines — next major UI addition should split it)

## First thing to do in the fresh session

1. `memory_recall("TermDeck sprint 23 responsive wizard")` — latest sprint results
2. `memory_recall("TermDeck launch status HN X")` — launch channel state
3. `memory_recall("high ticket OpenClaw DOR")` — parallel project context
4. Read `docs/IDEAS-AND-STATUS.md` for the full backlog
5. Ask the user which priority to tackle
