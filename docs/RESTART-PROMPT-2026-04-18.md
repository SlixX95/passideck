# TermDeck Restart Prompt — Fresh Session 2026-04-19+

Paste this (or point a fresh Claude Code session at it) to resume work without re-loading context. `memory_recall` fills in the rest — start with `memory_recall("TermDeck Sprint 21 session preservation")` and `memory_recall("TermDeck launch status")` in project `termdeck`.

---

## Current versions (as of 2026-04-18)

| Package | Version | npm | Notes |
|---------|---------|-----|-------|
| `@jhizzard/termdeck` | 0.4.3 | published | Tier 1/2 — PTY multiplexer + local SQLite |
| `@jhizzard/mnestra` | 0.2.0 | published | Tier 3 — pgvector + MCP server |
| `@jhizzard/rumen` | 0.4.1 | published | Tier 4 — async learning loop (Supabase Edge Fn) |
| SkillForge (no pkg) | — | in-repo | Tier 5 — skill generator, shipped Sprint 20 |

Node baseline: 20 LTS. Shell baseline: zsh on darwin.

## What shipped (Sprints 6-21 summary)

- **S6** — Preflight + transcripts (`/healthz`, transcript API, Sprint 6 DDL).
- **S7** — Two-row toolbar, optional auth, non-loopback bind guardrail.
- **S8** — Release-verification scripts, npm publish pipeline, contract tests for `/api/health`, `/api/rumen/*`, transcripts.
- **S9** — Onboarding tour polish (13 steps), replay button, first-visit auto-fire.
- **S10** — CSS/JS extraction from single-file HTML, add-project modal, panel drawer tabs (Overview/Commands/Memory/Status), Flashback toasts.
- **S11-S14** — Rumen v0.1-v0.4: Supabase Edge Function, pg_cron 15-min schedule, insight extraction, question generation, `termdeck init --rumen` wizard.
- **S15** — Mnestra bridge modes (direct HTTP / webhook / MCP). Three-layer memory (session → project → developer).
- **S16** — Session-logger (`--session-logs`), markdown session logs on PTY exit.
- **S17** — Launch-readiness docs: Show HN post, Twitter thread, dev.to draft, LinkedIn post, blog post for Rumen, comment playbook.
- **S18** — docs-site (54 pages) deployed to termdeck-docs.vercel.app. joshuaizzard.com portfolio tagline fix (Silicon Valley).
- **S19** — Flashback demo hardening, launch health script planning, orchestrator layout fix (explicit 4-row grid).
- **S20** — SkillForge: (T1) `termdeck forge` CLI with live Mnestra cost projection, (T2) 4-phase Opus prompt template (audit → extract → generate → self-critique), (T3) skill installer writing to `~/.claude/skills/`, (T4) SKILLFORGE.md user docs.
- **S21** — Flashback resurrection + data quality: (T1) wire `onErrorDetected` through to Mnestra bridge, (T2) backfill `chopin-nashville` mis-tags in petvetbid, (T3) `scripts/trigger-flashback.sh` + `tests/flashback-e2e.test.js`, (T4) session preservation (this prompt).

## What's next

1. **HN karma grind** — jhizzard account sits at 1 karma, 3 comments. Need 15+ to post Show HN without green-account filter. Spend a day commenting thoughtfully on dev-tools / terminal / RAG threads.
2. **Show HN launch** — targeting Wed 2026-04-22 or Thu 2026-04-23, 8-9am PT. Draft lives in `docs/launch/show-hn-post.md`.
3. **Tester follow-up** — David Zhao, Jonathan (Unagi), Yasin have the getting-started guide but no written feedback yet. Chase them after Sprint 21 lands.
4. **Sprint 22+ candidates** (pick based on tester feedback):
   - In-browser install wizard (auto-detect tier state, guide through Mnestra/Rumen provisioning).
   - Express 5 migration (currently pinned to 4.x).
   - Zod 4 migration (Mnestra on Zod 3).
   - Drag-and-drop layout mode (requested since S19).
   - SkillForge v0.5: wire autonomous Opus 4.7 invocation (template + installer already exist; invocation loop does not).
   - Output analyzer false-positive fix (`PATTERNS.error` in `session.js` matches too broadly).
   - Flashback toast click handler UX polish.

## Key paths

```
termdeck/
├── packages/server/src/
│   ├── index.js            # Express + WS + PTY entry
│   ├── session.js          # Session + output analyzer (PATTERNS.*)
│   ├── rag.js              # Mnestra sync layer
│   ├── mnestra-bridge/     # direct | webhook | mcp modes
│   └── setup/              # first-run bootstrap
├── packages/client/public/ # index.html + style.css + app.js (vanilla)
├── packages/cli/src/       # termdeck CLI + init-mnestra + init-rumen + forge
├── docs/sprint-N-*/        # Sprint logs + STATUS.md per sprint
├── docs/launch/            # Show HN, Twitter, dev.to, LinkedIn drafts
└── scripts/trigger-flashback.sh
```

Secrets and config:
- `~/.termdeck/config.yaml` — project defs, RAG settings, theme defaults.
- `~/.termdeck/secrets.env` — API keys, referenced via `${VAR}` in YAML.
- `~/.termdeck/termdeck.db` — SQLite WAL, local source of truth.

Sibling repos (all under `github.com/jhizzard/`):
- Mnestra: `~/Documents/Graciella/engram` (folder name predates rename).
- Rumen: `~/Documents/Graciella/rumen`.
- Supabase project backing both: **petvetbid** (ref `luvvbrpaopnblvxdxwzb`).

## Common commands

```bash
# Dev
cd ~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck
npm run dev                               # boots server + opens browser

# First-run provisioning
termdeck init --mnestra                   # apply Mnestra migrations
termdeck init --rumen                     # deploy Rumen edge fn + pg_cron

# Publish
npm version patch -w packages/server      # bump
npm publish -w packages/server --access public

# Flashback trigger verify
bash scripts/trigger-flashback.sh
```

## 4+1 orchestration pattern reference

Used for sprints where work parallelizes cleanly across file ownership boundaries.

- **4 terminals (T1-T4)** — each owns a disjoint set of files, appends to a shared `STATUS.md`, never edits another terminal's files.
- **+1 orchestrator** — reviews `STATUS.md`, unblocks, signs sprint off.
- **Rules**: append-only STATUS.md, blockers flagged `[Tn] BLOCKED`, completion signed `[Tn] DONE`.
- **Sprint folder layout**: `docs/sprint-N-slug/` with `STATUS.md` + `T1-*.md`..`T4-*.md` specs, one file per terminal.
- **When to use**: 4+ independent workstreams with clear file boundaries (e.g. debug + data + test + docs). Don't force it when work has a linear dependency chain.

## Known open issues

- `PATTERNS.error` in `packages/server/src/session.js` flags successful sessions as errored when `error` appears in grep output.
- Flashback toast click opens Memory tab but content rendering is buried / hard to read (flagged 2026-04-17).
- Live demo to Unagi (2026-04-16) — Claude Code in panel #1 couldn't find Rumen repo by name; likely needs project-name resolution against `config.yaml` instead of directory path segments. (Same root cause as `chopin-nashville` tagging bug fixed in S21 T2 — verify fix is complete.)
- xterm.js pinned to @5.5.0 from CDN; vendoring considered for v0.5 if CDN reliability bites.
- ~~WebSocket URL hardcoded~~ — FIXED in Sprint 18 (protocol-aware `ws://` vs `wss://`)
- `memory_recall` and repeated searches still mix in 2.5k-star `Gentleman-Programming/engram` competitor context; the Engram→Mnestra rename is complete in package names but not in every doc reference. Grep for stray "Engram" before Show HN.

## Sprint 22 Plan (next session)

Sprint 22 has two objectives: re-generate high-quality Rumen insights with the fixed pipeline, and publish updated sibling packages.

### T1: Rumen re-kickstart with hybrid embeddings
- PVB has 1,599 memories in Mnestra — the largest project, never properly processed
- Previous kickstarts used keyword-only search + broken project tags
- Redeploy Edge Function: `termdeck init --rumen --yes`
- Trigger manual kickstart and verify insights reference PVB patterns (Supabase migrations, Stripe Connect, AI search, multi-portal architecture)

### T2: Publish Mnestra 0.2.1
- Make `mnestra serve` auto-read `~/.termdeck/secrets.env` as fallback when env vars aren't set (the recurring startup friction bug)
- Repo: `~/Documents/Graciella/engram/`
- Bump, test, `npm publish --access public`

### T3: Publish Rumen 0.4.2
- Verify install.md and README are current (Sprint 15 fixes)
- Bump, test, `npm publish --access public`
- Update `termdeck init --rumen` to pull the new version

### T4: Insight quality audit
- After Rumen re-kickstart, review the new insights
- Are they actionable? Do they surface real PVB patterns?
- Compare confidence scores with the pre-cleanup noise
- Document findings for SkillForge prompt tuning

## Sibling repo publish status

| Package | Published | Local | Needs publish? | Why |
|---------|-----------|-------|----------------|-----|
| `@jhizzard/termdeck` | 0.4.3 | 0.4.3 | No | Current |
| `@jhizzard/mnestra` | 0.2.0 | 0.2.0 | Yes → 0.2.1 | Add secrets.env auto-read fallback |
| `@jhizzard/rumen` | 0.4.1 | 0.4.1 | Yes → 0.4.2 | install.md + README fixes from Sprint 15 |

## First thing to do in the fresh session

1. `memory_recall("TermDeck Sprint 21 flashback quality")` — pulls every S21 decision.
2. `memory_recall("TermDeck launch status HN X testers")` — current HN/X/tester state.
3. `memory_recall("PVB memories Rumen re-kickstart")` — the 1,599 PVB memories context.
4. Read `docs/sprint-21-flashback-quality/STATUS.md` for the Sprint 21 sign-off log.
5. Read `docs/SPRINT-17-18-PLAN.md` for the Tier 5 SkillForge vision.
6. Then execute Sprint 22 (above) or ask the user for priorities.
