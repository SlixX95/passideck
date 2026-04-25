# Sprint 14 — Final Check + Launch Channel Strategy

Append-only coordination log. Ready to execute when Josh wakes up.

## Mission

Two objectives:
1. Final verification pass — run verify-release.sh, lint-docs.sh, contract tests, and a fresh start.sh boot against 0.3.7. Fix anything that breaks.
2. Launch channel strategy — Josh has strong FB/IG presence but zero HN/X/Medium audience. Plan an automated publishing pipeline that leverages existing reach and bootstraps new channels.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-verify-037.md | scripts/ (run only, no edits unless broken) |
| T2 | T2-post-launch-debt.md | docs/POST-LAUNCH-ROADMAP.md (new) |
| T3 | T3-channel-strategy.md | docs/launch/CHANNEL-STRATEGY.md (new) |
| T4 | T4-publish-pipeline.md | docs/launch/PUBLISH-PIPELINE.md (new), scripts/publish-launch.sh (new) |

## File ownership

| File | Owner |
|------|-------|
| scripts/* (run verification only) | T1 |
| docs/POST-LAUNCH-ROADMAP.md (new) | T2 |
| docs/launch/CHANNEL-STRATEGY.md (new) | T3 |
| docs/launch/PUBLISH-PIPELINE.md (new) | T4 |
| scripts/publish-launch.sh (new) | T4 |
| docs/sprint-14-final-check/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

---

## [T3] 2026-04-17 — Channel strategy drafted

Created `docs/launch/CHANNEL-STRATEGY.md` (93 lines, under the 150-line cap).

Key decisions:
- **Inverted the default HN-first playbook.** Josh's real reach is FB/IG/DMs, so Tier 1 = own reach (seeds the first 15–30 stars + primes friends to comment on HN), Tier 2 = HN/dev.to/Reddit (bootstrap), Tier 3 = X/LinkedIn cross-post (zero organic, exists as link targets).
- **HN prep:** account warmup starts today — 3–4 genuine comments on devtool posts over 3 days before Show HN so the post isn't shadow-filtered as a throwaway. Timing locked to Tue/Wed 08:00 PT (2026-04-21 or -22).
- **Friend seeding framed correctly:** ask David / Jonathan / Yasin for *comments*, not upvotes. HN ranks on early comment quality; coordinated voting trips the ring detector.
- **Hour-by-hour table** covers T-24h (DMs) through T+7d (retro). IG Reel at T-12h, Show HN at T+0, FB at T+5min, dev.to T+24h, Reddit T+48h.
- **Explicit skips:** Medium (paywall penalty), Product Hunt (needs landing page), r/programming (auto-removed), vote buying, feature over-promising in HN comments.
- **Realistic success tiers:** Floor 50–100 stars (70% confidence), Mid HN front-page 300–800 stars (20%), Ceiling 1500+ stars (10%) — so Josh has a yardstick that isn't "we must hit HN front page or it failed."

Handoff note: T4's `PUBLISH-PIPELINE.md` + `scripts/publish-launch.sh` is the executable counterpart to this strategy doc. Didn't touch those files.

No code files touched. No other terminals' files touched.

[T3] DONE

---

## [T4] Publish pipeline — 2026-04-17

Created two deliverables:

1. **`docs/launch/PUBLISH-PIPELINE.md`** (new, ~220 lines)
   - Channel map with strength assessment (FB/IG flagged as Josh's primary reach).
   - Pre-launch checklist (T-24h) covering npm version, docs site, GIF, repo, HN account warmup, drafts saved in composers.
   - Launch sequence (T=0) in 7 numbered steps: Show HN → Twitter thread → LinkedIn → **Facebook** → **Instagram story** → dev.to → personal channels. Each step names its source file and URL.
   - Full Facebook post template (personal tone, no jargon, GIF-first, pinned-comment pattern for the install command).
   - Full Instagram story template as a 3-frame sequence (hook → magic-moment GIF → CTA) with "TermDeck" highlight to persist past 24h.
   - Post-launch playbook T+1h / T+3h / T+6h / T+24h including the r/commandline + r/selfhosted timing rule (post after HN has a score, not before).
   - Failure modes + rollback table (broken npm, GIF 404, HN [dead], LinkedIn spam flag, IG link sticker rejection).

2. **`scripts/publish-launch.sh`** (new, executable)
   - Three modes: `--check` (default), `--launch`, `--monitor`.
   - `--check` verifies: npm version == 0.3.7, docs site 200, GIF 200, repo 200, launch source files present, git tag v0.3.7. Non-zero exit on any failure.
   - `--launch` opens composer URLs for HN, Twitter, LinkedIn, Facebook, dev.to in posting order; prints Instagram instructions (mobile-only) and the copy-paste source index.
   - `--monitor` opens HN newest, Twitter analytics, GitHub traffic, npm package page; prints the T+1h/T+3h/T+6h/T+24h checklist.
   - Uses `open` on macOS, falls back to `xdg-open` on Linux, and prints URLs if neither is available.
   - No `set -e` so individual check failures still produce a full report.

Aligns with T3's CHANNEL-STRATEGY.md (Tier 1 own-reach first, then HN/dev.to, then X/LinkedIn as link targets). The launch-sequence ordering in the pipeline matches T3's hour-by-hour table.

Acceptance criteria:
- [x] PUBLISH-PIPELINE.md has pre-launch, launch, and post-launch sections
- [x] scripts/publish-launch.sh runs the pre-checks and opens URLs
- [x] Facebook and Instagram included (Josh's strongest channels) — both get dedicated templates and are called out in the channel map and launch-step commentary
- [x] Script syntax-checked (`bash -n`) and `--help` verified

No server or client code touched. No other terminals' files touched.

[T4] DONE

---

## [T2] 2026-04-17 — Post-launch roadmap consolidated

Created `docs/POST-LAUNCH-ROADMAP.md` (107 lines, under 150-line cap).

Inputs read:
- All 4 Sprint 12 audits (Claude Opus 4.6, Gemini 3.1 Pro, Grok 4.20 Heavy, ChatGPT GPT-5.4 Pro)
- `docs/SPRINT-13-READINESS-REASSESSMENT.md` (Codex)
- `docs/CONTRADICTIONS.md`
- `CHANGELOG.md` v0.3.7 + v0.3.6 entries to prune already-closed items

Structure:
- **Already closed in v0.3.7** — CLI guardrail bypass (ChatGPT), health badge false-green (ChatGPT), version-truth drift + stale `v0.2.0` banner (Codex, Claude, Gemini). Pruned from the roadmap body so it isn't re-worked.
- **v0.4.0 (30 days)** — 6 items, all with 3+ auditor consensus OR security/test-coverage severity: V4-1 Rumen embedding tests (4 auditors, longest-deferred), V4-2 TranscriptWriter TTL retry (3 auditors), V4-3 Mnestra direct-bridge 8-vs-10 arg drift (ChatGPT + CONTRADICTIONS #1), V4-4 client `ws://` hardcode (ChatGPT, blocks HTTPS), V4-5 auth rate limiting (3 auditors), V4-6 security/deploy doc drift (ChatGPT).
- **v0.5.0 (90 days)** — 8 items: user's 3 roadmap entries from `CHANGELOG [Unreleased]` (fully-local path, multi-user validation, control-panel dashboard) + 5 architectural items flagged 1–2 times (app.js split, MCP bridge test coverage, duplicate `/healthz` probes, CI skip-to-fail flag, RAG breaker telemetry).
- **Backlog** — 9 nice-to-haves as a single table to keep line count down.

Consensus tiebreakers applied:
- Grok's "make RAG flush synchronous on destroy" — dropped: Claude S12 confirms it was fixed in Sprint 10 (`index.js` L874–886, 5s budget).
- Grok's "TranscriptWriter no hard cap" — demoted to B-7 (spill-to-disk enhancement only): 10K-chunk cap already shipped in commit `1f1d1e6`.
- Kept `"Flagged by:"` citations on every item so Josh can re-check severity against the source audits.

No code files touched. Only created `docs/POST-LAUNCH-ROADMAP.md`.

Acceptance criteria:
- [x] Every open item from all 5 audits captured (or explicitly marked closed in v0.3.7)
- [x] Prioritized by auditor consensus (3+ = v0.4, 1-2 = v0.5/backlog)
- [x] Every item cites auditor(s)
- [x] Under 150 lines (107)

[T2] DONE

---

## [T1] 2026-04-17 — Docs site audit + redeploy

Scope clarification: T1 spec in the filesystem is `T1-verify-037.md` (docs-site audit), not the `scripts/ verify` role shown in the STATUS table. Worked the spec that was actually in the sprint folder.

Actions:
- **Deleted** `docs-site/src/content/docs/engram/` (legacy pre-rename section — 6 stale files: `index.md`, `changelog.md`, `docs/{integration,rag-fixes-applied,schema,source-types}.md`).
- **Renamed** `docs-site/src/content/docs/blog/engram-deep-dive.mdx` → `mnestra-deep-dive.mdx` (title/body already used "Mnestra" correctly).
- **Updated** `docs-site/.gitignore`: swapped the stale `src/content/docs/engram/` ignore line for `src/content/docs/mnestra/` so the autogenerated mnestra content stays untracked after the rename.
- **Verified** `docs-site/astro.config.mjs` sidebar already listed Mnestra (no engram entry) — no edit needed.
- **Grep-audited** `docs-site/src/content/docs/` for `Engram|Mnemos|engram|/engram/` — 0 hits remaining after cleanup.
- **Re-synced content** with `MNESTRA_REPO=/Users/joshuaizzard/Documents/Graciella/engram npm run sync-content` (the sync script's default resolves to `~/Documents/Graciella/mnestra` which does not exist; legacy on-disk dir is still `engram/`). Synced 37 termdeck files, 6 mnestra files, 3 rumen files.
- **Built** with `npm run build`: **53 pages** generated, 0 errors, pagefind index built cleanly.
- **Deployed** with `vercel deploy --prod --yes` → https://termdeck-docs.vercel.app (deployment `dpl_FLsLXQ3jAQG148mLePTpnoJifq3H`, READY, 17s alias).

Versions observed in live content:
- termdeck 0.3.7 (matches target)
- mnestra 0.2.0 (matches target)
- rumen 0.1.0 on disk — the spec's target of `rumen@0.4.1` is not reflected in the source repo at `~/Documents/Graciella/rumen/CHANGELOG.md`. Out of T1 scope (rumen repo is not owned here); flagging for follow-up.

Acceptance criteria:
- [x] No `/engram/` section in rendered site
- [x] All content references Mnestra, not Engram/Mnemos
- [x] termdeck@0.3.7 and mnestra@0.2.0 current
- [ ] rumen@0.4.1 — source repo still at 0.1.0 (upstream fix needed; noted above)
- [x] No broken internal links (build clean)
- [x] Site builds clean (53 pages)
- [x] Deployed to production

Did not touch `packages/`, `docs/` (other than this STATUS.md append), or the termdeck sync scripts.

[T1] DONE
