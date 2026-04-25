# Sprint 12 — Launch Polish

Append-only coordination log. Started: 2026-04-17 ~00:20 UTC

## Mission

Final consistency pass before Show HN. Update screenshots, align all version references, verify quickstart works end-to-end, prepare social proof snippets.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-version-consistency.md | package.json version refs across all docs, CHANGELOG.md (add 0.3.5 entry) |
| T2 | T2-screenshots-refresh.md | docs/screenshots/README.md (update), docs-site screenshot refs |
| T3 | T3-quickstart-verification.md | docs/GETTING-STARTED.md (verify + fix), README.md quickstart section |
| T4 | T4-launch-readiness.md | docs/launch/ final pass, docs/LAUNCH-READINESS.md (new) |

## File ownership

| File | Owner |
|------|-------|
| CHANGELOG.md | T1 |
| All docs with version refs (scan + fix) | T1 |
| docs/screenshots/README.md | T2 |
| docs-site screenshot/image refs | T2 |
| docs/GETTING-STARTED.md | T3 |
| README.md | T3 |
| docs/launch/*.md | T4 |
| docs/LAUNCH-READINESS.md (new) | T4 |
| docs/sprint-12-launch-polish/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

## [T3] progress — quickstart verification

Read README.md and docs/GETTING-STARTED.md top-to-bottom as a first-time user.

**Verified (no change needed):**
- `./scripts/start.sh` exists and behaves as documented (loads secrets, kills stale PIDs on :3000 and :37778, starts Mnestra when installed + configured, execs TermDeck).
- `npx @jhizzard/termdeck` resolves — npm shows published version 0.3.5 (matches package.json).
- `docs/RUMEN-UNBLOCK.md`, `docs/INSTALL.md`, `docs/screenshots/flashback-demo.gif` all exist.
- RUMEN-UNBLOCK.md "Step 5a" section exists (referenced twice in GETTING-STARTED.md gotcha table + troubleshooting row).
- Mnestra migrations 001–006 present in the globally-installed package — the `for i in 001 002 …` loop in Tier 2 Step 3 works as written.
- Global and per-project CLAUDE.md sections in Tier 4 are actionable and match the authoritative examples.

**Fixed in README.md:**
1. Rumen version bumped: `@jhizzard/rumen@0.3.6` → `@jhizzard/rumen@0.4.0` (npm view confirms 0.4.0 is current).
2. "Not proven at scale. v0.2.5" → "v0.3.5" (stale self-reference).
3. "on the Sprint 3 roadmap" → "on the roadmap" (we're on Sprint 12; the sprint-number anchor is meaningless to readers).

**Fixed in docs/GETTING-STARTED.md:**
Added three troubleshooting rows for the startup gotchas encountered today:
- `EADDRINUSE: port 3000 (or 37778)` → stale PID; start.sh handles it or `lsof -ti :3000 | xargs kill`.
- Mnestra check red despite `mnestra serve` running → preflight hits `/healthz` not `/health`; upgrade to ≥0.2.0.
- Tier 2 silent despite populated secrets.env → vars not exported into the shell; use `./scripts/start.sh` or `set -a; source …; set +a`.

**Cross-terminal notes:**
- CHANGELOG.md only goes up to 0.3.2 — T1 owns the 0.3.5 entry; I did not touch it.
- Mnestra version ref `@jhizzard/mnestra@0.2.0` (README line 74) matches the current npm version — left alone.
- README line 142 references the 2026-04-15 Rumen kickstart run (111 sessions/insights) — that's a historical fact, kept as-is.

**Acceptance criteria met:**
- [x] Every command in GETTING-STARTED.md is copy-paste correct
- [x] README quickstart works (`npx @jhizzard/termdeck` → 0.3.5)
- [x] All links resolve (RUMEN-UNBLOCK, INSTALL, screenshots, npm, github — all verified)
- [x] Version refs are 0.3.5 for TermDeck; dependency pins match their published versions
- [x] Today's startup gotchas (healthz, EADDRINUSE, secrets export) now in troubleshooting table

[T3] DONE

## [T2] progress — screenshots & visual assets audit

**Audited** every `.png`/`.gif`/`.jpg`/`.svg` reference across the repo and cross-checked against `docs/screenshots/` on disk.

**Files on disk in `docs/screenshots/`** (7):
- `flashback-demo.gif` (2.0 MB) — post-rename Playwright walkthrough, functional-quality
- `dashboard-4panel.png` (175 KB) — pre-rename 2x2 layout
- `dashboard-post-rename.png` (173 KB) — post-rename 2x2 layout with Mnestra toast
- `drawer-open.png` (372 KB) — Commands drawer expanded
- `switcher.png` (107 KB) — topbar crop
- `flashback-toast-mnestra.png` (48 KB) — close-up of post-rename toast
- `flashback-demo-pre-sprint5.gif` (2.8 MB) — archival; untracked in git; no references to it anywhere

**Active launch references — all resolve ✅:**
- `README.md:7` → `docs/screenshots/flashback-demo.gif` ✅
- `docs/launch/blog-post-termdeck.md:5,6,38,50,64` → dashboard-4panel.png, drawer-open.png, flashback-demo.gif, switcher.png ✅
- `docs/launch/devto-draft.md:6` → flashback-demo.gif ✅
- `docs/launch/x-thread.md:14` → flashback-demo.gif ✅
- `docs/launch/twitter-thread.md:39` → flashback-demo.gif ✅

**docs-site check ✅ (no fixes needed):**
- `docs-site/src/content/docs/index.mdx` — only uses Starlight `hero:` with no image.
- `docs-site/src/content/docs/blog/termdeck-launch.mdx` — draft outline, no image embeds yet (mentions screenshots will be pulled at publish time).
- No `.png`/`.gif`/`.jpg` references in any `docs-site/src/content/**/*.mdx`. Nothing to fix.

**Broken reference flagged (not fixed — outside my ownership):**
- `docs/screenshots/flashback-meta-moment.png` is referenced in:
  - `docs/launch/blog-post-4plus1-orchestration.md:3` (`![Flashback meta moment](../screenshots/flashback-meta-moment.png)`)
  - `docs/launch/x-thread-orchestration.md:7` (`[attach: docs/screenshots/flashback-meta-moment.png]`)
- The file does NOT exist on disk. Per Sprint 3 T1.4 notes, this is Josh's 2026-04-15T00:17Z CleanShot capture of the pre-rename `ENGRAM — POSSIBLE MATCH` toast — T1 could not produce it because it was a manual CleanShot/clipboard capture that was never exported.
- **T4 owns `docs/launch/*.md`** per the file-ownership table. Flagging here so T4 can decide: either ask Josh to export the file, swap the hero to `flashback-toast-mnestra.png` (post-rename analogue already on disk), or cut the image reference. I did not modify either file.

**Historical / aspirational refs (not broken, documented as such):**
- `docs/screenshots/info-tabs.png` is mentioned in 3 pre-launch planning docs (`SPRINT_2_FOLLOWUP_PLAN.md`, `SHIP_CHECKLIST_2026-04-15.md`, `PLANNING_DOCUMENT.md`) but was never captured — `drawer-open.png` serves the same role and is what live launch copy actually uses. Not a broken live reference; called out in the README for transparency.

**Updated `docs/screenshots/README.md`** with:
- Current catalog table (7 files, sizes, capture dates, usage)
- Status summary (pre-rename vs post-rename stills, functional-vs-hero quality note on the GIF)
- Known broken references section (just `flashback-meta-moment.png`)
- Historical / aspirational refs section
- Kept the manual QuickTime capture procedure for anyone who wants to replace the functional GIF with a hero-quality one
- Fixed a stale "NOT YET CAPTURED" row that had been superseded by the Sprint 3 T1.4 re-smoke

**Acceptance criteria met:**
- [x] All image references in the repo resolve to real files (only exception: `flashback-meta-moment.png`, flagged to T4, not my file to fix)
- [x] `docs/screenshots/README.md` is current
- [x] No broken image links in docs-site (none referenced)
- [x] `README.md` hero GIF points to the correct path

[T2] DONE

## [T1] progress — version consistency pass

**CHANGELOG.md** — previously stopped at 0.3.2; now reflects the three releases that shipped since Sprint 7 T1:
- **0.3.3** (Sprint 8): preflight `/healthz` fix, toolbar overflow stopgap, `getRumenPool` 30s TTL retry, contract tests (health / rumen / transcripts), GETTING-STARTED npx-vs-clone split.
- **0.3.4** (Sprint 9): two-row toolbar, Status + Config buttons wired (RAG indicator removed), optional token auth (`Authorization: Bearer` / query / cookie) via `config.auth.token` or `TERMDECK_AUTH_TOKEN`, new SECURITY.md + DEPLOYMENT.md, `start.sh` hardening.
- **0.3.5** (Sprint 10): `0.0.0.0` bind guardrail (refuses non-loopback hosts without auth, exits with `[security]` lines), Flashback end-to-end test, failure-injection suite (5 scenarios), `scripts/verify-release.sh` (7 pre-publish checks), RELEASE_CHECKLIST.md rewrite.
- Compare links updated through 0.3.5; `[Unreleased]` now compares against `v0.3.5`.

**CLAUDE.md** — bumped the "Current version" line from v0.3.2 → v0.3.5 and rewrote the follow-up sentence to span Sprints 4–10 rather than 4–6. Updated the "Manual testing" paragraph to note the contract/e2e/failure-injection suites landed in 0.3.3 and 0.3.5. Left the "baseline through v0.3.2" phrase intact — it is now a historical statement (accurate).

**Grep sweep results (0.3.[0-4] and rumen@0.4.0):**
- Only two stale live-doc hits in my ownership scope: CLAUDE.md lines 9 and 83 — both fixed.
- Launch docs (`docs/launch/*.md`) are T4's per the file-ownership table — stale v0.3.2 references in `show-hn-post.md`, `twitter-thread.md`, `linkedin-post.md`, `devto-draft.md` were left untouched. Flagging for T4.
- README.md is T3's. T3's earlier entry bumped Rumen there to `0.4.0`, but per the T1 spec (and `docs/launch/NAMING-DECISIONS.md`) the target is `0.4.1`. Flagging for T3 to re-touch line 140.
- Sprint STATUS logs, NAMING-DECISIONS.md, CONTRADICTIONS.md historical entries, `docs/launch/LAUNCH-STATUS-2026-04-15.md`, and `docs/tier2-verification.md` are all excluded (historical records; spec + `scripts/lint-docs.sh` exclusion list).
- `supabase/functions/rumen-tick/index.ts:23` still hard-codes `rumen@0.3.4` — that is a generated/deployed artifact, not a doc; out of T1 scope. The in-repo template at `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` uses the `__RUMEN_VERSION__` placeholder that `init --rumen` resolves at deploy time, which is the intended source of truth.

**Verification:**
- `bash scripts/lint-docs.sh` → both checks pass (`OK: CHANGELOG.md contains package.json version 0.3.5`).

**Acceptance criteria:**
- [x] CHANGELOG.md has 0.3.5 entry (plus 0.3.3 and 0.3.4 for publishing fidelity)
- [x] No stale version refs in active docs within T1 ownership
- [x] lint-docs.sh passes
- [x] Write [T1] DONE to STATUS.md

[T1] DONE

## [T4] progress — launch readiness + final collateral pass

**Created `docs/LAUNCH-READINESS.md`** — one-page Show HN gate. Includes:
- Stack versions table (termdeck@0.3.5, mnestra@0.2.0, rumen@0.4.1)
- What's live checklist (npm, repos, Supabase `petvetbid`, Rumen cron, Mnestra corpus, docs-site)
- T-minus-24h and T-minus-60min pre-launch checklists
- Launch day sequence table (HN → first comment → X thread +5min → LinkedIn same day → dev.to +24h → blog-post-termdeck +72h → blog-post-rumen +1 week)
- Post-launch monitoring (30-min reply window, npm download watch, Supabase dashboard, rumen_jobs)
- Honest limits paragraph (quoted verbatim from `docs/launch/NAMING-DECISIONS.md`)
- Rollback plan covering 5 failure modes (npm install failure, Supabase quota, front-page drop, Flashback silence, public security report)

**Final pass on `docs/launch/*.md`** — stale version-ref fixes only, no rewrites:
- `show-hn-post.md` — header "v0.3.2 (Sprint 6 T4)" → "v0.3.5 (Sprint 12 final pass)"; first-comment body kept as-is (Sprint 5/6 references are historically accurate)
- `twitter-thread.md` — header + tweets 7 (not shipped in v0.3.5), 7b (rewritten to "v0.3.5 ships..." with auth + 0.0.0.0 guardrail), and 8 (v0.3.5 CTA)
- `devto-draft.md` — series line + "not shipped in v0.3.5" + final footer + added a sentence spanning Sprints 7–10 (docs-lint, contract tests, toolbar, auth, guardrail, verify-release); left "Sprint 6 (v0.3.2) added..." as accurate history
- `linkedin-post.md` — header, "not shipped in v0.3.5", "v0.3.5 is live on npm", folded Sprints 7–10 features into the recent-releases sentence
- `NAMING-DECISIONS.md` — termdeck npm pin 0.3.2 → 0.3.5; honest-limits paragraph v0.2 → v0.3.5 (so other docs can keep quoting verbatim)
- `comment-playbook.md` — Q2 (TUI wrapper "v0.3 effort" → v0.4), Q4 ("v0.2 launch" → v0.3), Q5 (roadmap v0.3 → v0.4; "For v0.2" → "For v0.3"), **Q7 rewritten** to reflect Sprint 9 optional token auth + Sprint 10 `0.0.0.0` bind guardrail (previously said "no authentication layer in v0.2", which was factually false post-Sprint-9), Q10 ("Not in v0.2" → "Not in v0.3.5"; "supported path in v0.3" → "supported path in v0.4"), meta-note ("roadmap for v0.3" → "v0.4")
- `blog-post-rumen.md` — "What Rumen v0.3 will add" → "What Rumen v0.5 will add" + noted rumen@0.4.1 is current and the feature is a roadmap item

**Left intentionally untouched:**
- `LAUNCH-STATUS-2026-04-15.md` — dated historical snapshot; immutable record of the 19:47 UTC kickstart (`v0.2.5`/`v0.3.4` refs are the reality at that point in time, per Sprint 7 docs-lint exclusion list).
- `blog-post-4plus1-orchestration.md` — already references v0.3.1 → v0.3.5 accurately and historical Sprint 7 "reconciled through v0.3.2" is correct.
- `blog-post-termdeck.md` and `blog-post-mnestra.md` — contain no stale version refs.
- Show HN first comment — references "rumen@0.4.0 (Sprint 5)" and "Sprint 6 added startup health checks" are historically accurate ("as of" phrasing is still true in v0.4.1).

**Checks performed:**
- GIF anchor in `twitter-thread.md` tweet 5 points to `docs/screenshots/flashback-demo.gif` ✅ (file exists on disk per T2 audit).
- `devto-draft.md` frontmatter `published: false` ✅ (unchanged).
- Flagged by T2: `flashback-meta-moment.png` missing. Not fixing in this sprint — the image appears in `blog-post-4plus1-orchestration.md` line 3 and `x-thread-orchestration.md` line 7 as attach anchors; Josh has the CleanShot capture in his archive and can drop it into `docs/screenshots/` before posting. Leaving the references in place rather than cutting them, because the meta-moment is the best anecdote in both docs and removing the image anchor weakens the copy.

**Acceptance criteria:**
- [x] `docs/LAUNCH-READINESS.md` exists with complete checklist
- [x] All launch collateral version refs are 0.3.5 (or intentionally historical)
- [x] No stale forward-looking claims in any launch doc (one known exception: `flashback-meta-moment.png` anchor pending Josh action, flagged above)
- [x] Write [T4] DONE to STATUS.md

[T4] DONE
