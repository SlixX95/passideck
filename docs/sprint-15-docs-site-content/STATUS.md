# Sprint 15 — Docs Site Content Fill + Version Cleanup

Append-only coordination log. Started: 2026-04-17

## Mission

The docs site has 3 blog post stubs visible in the sidebar, 8 stale version refs, and stale cross-references. Fix all of it, rebuild, and redeploy so the docs site is launch-ready.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-blog-stubs.md | docs-site/src/content/docs/blog/*.mdx (3 stubs) |
| T2 | T2-version-refs.md | docs-site/src/content/docs/ (version number fixes across 8 files) |
| T3 | T3-crossrefs-stale.md | docs-site/src/content/docs/termdeck/docs/ (stale cross-refs, superseded docs, security cookie) |
| T4 | T4-rebuild-deploy.md | docs-site/ (build + deploy after T1-T3 signal DONE) |

## File ownership

| File | Owner |
|------|-------|
| docs-site/src/content/docs/blog/mnestra-deep-dive.mdx | T1 |
| docs-site/src/content/docs/blog/rumen-deep-dive.mdx | T1 |
| docs-site/src/content/docs/blog/termdeck-launch.mdx | T1 |
| docs-site/src/content/docs/architecture.md | T2 |
| docs-site/src/content/docs/mnestra/index.md | T2 |
| docs-site/src/content/docs/mnestra/docs/rag-fixes-applied.md | T2 |
| docs-site/src/content/docs/rumen/changelog.md | T2 |
| docs-site/src/content/docs/termdeck/docs/getting-started.md | T2 |
| docs-site/src/content/docs/termdeck/docs/flashback-launch-angle.md | T2 |
| docs-site/src/content/docs/termdeck/docs/npm-packaging-plan.md | T2 |
| docs-site/src/content/docs/termdeck/docs/promotion-drafts.md | T2 |
| docs-site/src/content/docs/termdeck/docs/contradictions.md | T3 |
| docs-site/src/content/docs/termdeck/docs/docs-hygiene-roadmap-to-10.md | T3 |
| docs-site/src/content/docs/termdeck/docs/security.md | T3 |
| docs-site/src/content/docs/termdeck/docs/sprint-13-readiness-reassessment.md | T3 |
| docs-site/ (build + deploy) | T4 |
| docs/sprint-15-docs-site-content/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

## 2026-04-17 — T4 started

[T4] READY — verified sync source repos exist (engram, rumen) and sync-content.mjs present. Waiting for T1/T2/T3 DONE signals before running sync/build/deploy.

## 2026-04-17 — T1

Replaced stub content in all 3 blog posts with 400-600 word real content.

- `mnestra-deep-dive.mdx` — rewrote around the "Fresh sessions, not cold sessions" angle. Covers pgvector hybrid search (keyword + semantic + recency), the 9 MCP tools (including the 3-layer progressive-disclosure trio), Claude Code / Cursor / Windsurf integration, current store size (~3,855 memories), and GitHub + npm links.
- `rumen-deep-dive.mdx` — covers the 4-phase loop (Extract → Relate → Synthesize → Surface), Supabase Edge Function on 15-min pg_cron, hybrid embeddings with text-embedding-3-large (0.6 semantic / 0.4 keyword), first-kickstart result (111 insights from 3,527 memories), cost controls (Haiku-first, soft cap 100/day, hard cap 500), and GitHub + npm links.
- `termdeck-launch.mdx` — cold-open Tuesday story, three-tier stack (TermDeck → Mnestra → Rumen), Flashback mechanics, 4+1 orchestration pattern, 5-auditor 360 review (9.53 avg), npx quickstart, and GitHub + npm links.

All stub language removed. Frontmatter titles/descriptions updated to match rewritten bodies.

[T1] DONE

## 2026-04-17 — T3

Fixed all 4 owned files.

- `security.md` line 80: cookie name `termdeck_auth` → `termdeck_token` (verified against `packages/server/src/auth.js` lines 9, 30, 107, 112).
- `docs-hygiene-roadmap-to-10.md`: bullet for stale pre-rename names — `blog/engram-deep-dive.mdx` → `blog/mnestra-deep-dive.mdx`. (Other entries in that bullet, `termdeck-launch.mdx` and `rumen-deep-dive.mdx`, were already correct.)
- `contradictions.md`: marked items #6 and #8 as **Resolved (Sprint 14)** with strikethrough; updated #6's location column from `engram/**` to `mnestra/**`. Spec only called out #6, but #8 also referenced the deleted `engram/` directory and the acceptance criterion was "no references to deleted engram/ directory" — so resolved together.
- `sprint-13-readiness-reassessment.md`: lines 130 and 154 — current-version refs `0.3.6` → `0.3.7`. Left line 235 (`Add a 0.3.6 release entry to CHANGELOG.md`) as historical Sprint 13 priority recommendation. Left lines 131-134 (refs to `0.3.5` in stale docs) and line 236 as historical context.

[T3] DONE

## 2026-04-17 — T2

Fixed all 8 owned files. Current versions locked to termdeck@0.3.7, mnestra@0.2.0, rumen@0.4.1.

- `architecture.md` line 71: `Rumen v0.2` → `Rumen v0.4.1`.
- `mnestra/index.md` install section: rewrote "three SQL files" → "six SQL files" and listed all of 001–006 (verified against `~/Documents/Graciella/engram/migrations/`: 001_mnestra_tables, 002_mnestra_search_function, 003_mnestra_event_webhook, 004_mnestra_match_count_cap_and_explain, 005_v0_1_to_v0_2_upgrade, 006_memory_status_rpc).
- `mnestra/docs/rag-fixes-applied.md` Fix 6: "A future v0.2 will add an HTTP webhook server (`/api/memory/event`)" → "v0.2.0 added the HTTP webhook server (`mnestra serve`)".
- `rumen/changelog.md`: demoted `[Unreleased]` block to `[0.2.0] - 2026-04-14` (it was the Haiku synthesize phase work) and added dated entries for `[0.3.0] - 2026-04-15` (Mnestra rename / publish pipeline iterations), `[0.4.0] - 2026-04-16` (hybrid embeddings in Relate, self-healing migration, 41-test suite), and `[0.4.1] - 2026-04-16` (install guide, kickstart script, README refresh, hybrid Relate docs). Dates sourced from `~/Documents/Graciella/rumen` git log and npm publish times.
- `termdeck/docs/flashback-launch-angle.md`: "v0.2, validated against 3,397 real memories" → "v0.3.7, validated against ~3,855 real memories". (Left the unrelated "live Mnestra store of 3,397 memories" earlier in the file as historical Sprint 1 context — spec only targeted the v0.2 line.)
- `termdeck/docs/npm-packaging-plan.md`: added banner `> **Historical:** This plan was completed in Sprint 2. Kept for reference.` above the existing "Status: planned" blockquote.
- `termdeck/docs/promotion-drafts.md`: added banner `> **Superseded:** See docs/launch/ for current launch materials.` under the v0.1.1 heading.
- `termdeck/docs/getting-started.md`: spec pointed at line 249 "It's v0.2", but that string actually lives in `termdeck/docs/install.md` line 248 (not getting-started.md; no v0.2 anywhere in getting-started.md). Fixed install.md to read "It's v0.3.7." instead. install.md is not explicitly claimed by any terminal in the ownership table — flagging in case T3/T4 want to revisit. If strict adherence to the ownership table is required, this one edit is the only boundary crossing in my batch.

[T2] DONE

## 2026-04-17 — T4 build + deploy

All three terminals signed off. Ran the pipeline.

- **Sync**: `MNESTRA_REPO=…/engram RUMEN_REPO=…/rumen node scripts/sync-content.mjs` — copied 37 from termdeck, 6 from mnestra, 3 from rumen.
- **Build**: `npm run build` completed in 7.45s, 53 pages (Pagefind index over 53 HTML files).
- **First deploy attempt** (`vercel deploy --prod`) built on Vercel's server where the sibling `engram`/`rumen` repos don't exist, producing only 17 pages (mnestra/rumen dirs got wiped to stubs). Caught by comparing Vercel's build log (17 pages) vs. the local build (53 pages).
- **Recovery**: `vercel pull --yes --environment production`, then `MNESTRA_REPO=…/engram RUMEN_REPO=…/rumen vercel build --prod` locally to produce `.vercel/output` with the full 53 pages, then `vercel deploy --prebuilt --prod` to push the already-built output.
- **Final production**: `dpl_BS7wkoxjwN6cuV71Bx5nAVERHW63` — https://termdeck-docs.vercel.app (alias) / https://termdeck-docs-hsyp2xxt9-joshua-izzards-projects-1da4003a.vercel.app.
- **Verification**: spot-checked 9 URLs (home, 3 blog posts, mnestra/rumen indexes, termdeck/getting-started, termdeck/security, architecture) — all 200, zero "No README.md was found" stubs. Confirmed T1's rewritten content is live: termdeck-launch has "Tuesday/Flashback/4+1/9.53/three-tier"; mnestra-deep-dive has "Fresh sessions/cold sessions/pgvector/3,855/progressive-disclosure"; rumen-deep-dive has "Extract/Relate/Synthesize/Surface/text-embedding-3-large/pg_cron/111 insights".

Followup note for future deploys: Vercel's buildCommand (`npm run sync-content && npm run build`) only works when invoked from a machine with the sibling `engram`/`rumen` repos checked out alongside. Deploys from CI or any machine without those repos must use the local `vercel build --prod` → `vercel deploy --prebuilt --prod` flow to ship mnestra/rumen content.

Acceptance criteria:
- [x] Sync completes with file counts for all 3 repos (37 / 6 / 3)
- [x] Build completes with zero errors (53 pages)
- [x] Deployed to production (dpl_BS7wkoxjwN6cuV71Bx5nAVERHW63)
- [x] All 3 blog posts show real content (not stubs)
- [x] No "No README.md was found" on any checked page
- [x] Deployment URL + page count recorded: https://termdeck-docs.vercel.app, 53 pages

[T4] DONE — production https://termdeck-docs.vercel.app, 53 pages, dpl_BS7wkoxjwN6cuV71Bx5nAVERHW63.
