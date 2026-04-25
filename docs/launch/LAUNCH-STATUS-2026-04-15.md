# TermDeck Launch Status — 2026-04-15

**As of:** 2026-04-15, ~20:05 UTC (about 18 minutes after the first full Rumen kickstart cron-generated 111 insights at 19:47 UTC).
**Author:** Sprint 4 Terminal 4 (launch doc synthesis).
**Status:** Authoritative snapshot. Supersedes scattered claims in earlier docs about when Rumen would go live and what "shipped" means today. Does not supersede `docs/launch/NAMING-DECISIONS.md` on naming — that file is still the canonical record.

---

## 1. TL;DR

TermDeck is a browser-based terminal multiplexer with a persistent memory layer (Mnestra) and an async learning layer (Rumen) that turns raw session logs into insights while you're away. As of today the three-tier stack is end-to-end live for the first time: Rumen's Supabase Edge Function was unblocked this afternoon, the `pg_cron` schedule fired, and the first full-kickstart run at 19:47 UTC produced **111 insights** against the Mnestra store of ~3,527 memories. Nothing has been publicly launched yet — `@jhizzard/termdeck` is at `0.2.5` on npm, the Show HN post and launch GIF still don't exist, and the memory-store rename from Engram to Mnestra was only finalized 19 hours ago. The audience is solo developers who lose real hours re-debugging problems they already fixed on a different project.

## 2. What's built (grounded in code)

Every item below is verifiable today, with a file path or a query result cited. No forward-looking claims.

**Live docs site:** [termdeck-docs.vercel.app](https://termdeck-docs.vercel.app) (Astro + Starlight, deployed via `vercel --prod` on 2026-04-15, content synced from the three source repos via `docs-site/scripts/sync-content.mjs`). The TermDeck `help` button in the top toolbar opens this site in a new tab.

**Dual independent audits (2026-04-15 afternoon + evening):**
- **Claude Opus 4.6 post-Sprint-4 audit** (`termdeck_post_sprint_audit.md`) — composite **9.25 / 10** (up from 9.0 pre-Sprint-4). Verdict: "You executed directly against the prior audit's findings. The synthesize module's three-stage JSON repair and citation validation are genuinely impressive engineering."
- **Gemini 3.1 Pro post-Sprint-4 audit** (`termdeck_sprint4_audit.md`) — Novelty **9.5**, Mnestra robustness **9.0**, Rumen integration **8.5**. Verdict: "The core novelty — the 4-tier cognitive stack — has transitioned from an ambitious architectural diagram into a fully operational reality. TermDeck is no longer just a slick terminal multiplexer; it's a closed-loop autonomous learning engine."
- Both audits converged on the **same three remaining gaps** (Rumen tests, client file split, vector embeddings in Rumen Relate), all of which are being closed in Sprint 5 before the v0.3 tag.

### TermDeck core — v0.2.6 on npm

- **PTY multiplexing** via `@homebridge/node-pty-prebuilt-multiarch` in `packages/server/src/index.js`. Prebuilds verified on Debian slim + macOS — Sprint 2 F2.6 swapped the pty fork and eliminated C++ compile on `npm install`. Alpine/musl not supported (documented limitation).
- **Seven grid layouts + focus + half modes**, CSS-Grid driven, in `packages/client/public/index.html`. 2x2 / 3x2 / 2x4 / 4x2 all work. Keyboard shortcuts `Cmd+Shift+1–6`, `Option+1` panel focus, `Ctrl+Shift+N` prompt bar.
- **Eight themes** in `packages/server/src/themes.js` — Tokyo Night, Rosé Pine Dawn, Catppuccin Mocha, GitHub Light, Dracula, Solarized Dark, Nord, Gruvbox Dark. Per-panel state, persisted via `PATCH /api/sessions/:id`.
- **Output analyzer** in `packages/server/src/session.js` — regex-based status detection for Claude Code, Gemini CLI, Python servers, shells. Port detection, last-command capture, status transitions (thinking / editing / idle / listening / errored / exited). This is the hook Flashback fires off.
- **Reply button** (`POST /api/sessions/:id/input`) — writes bytes into a target panel's PTY stdin. Built for human-to-panel handoff in Sprint 1. The Sprint 3 2am 4+1 orchestration anecdote (the T1/T2/T3/T4 injection moment) runs on this endpoint unchanged. No design for agent-to-agent, just bytes down a pipe.
- **Onboarding tour** — 13 steps covering every button, auto-fires first run, replayable from `how this works`. Shipped Sprint 3.
- **First-run config + secrets split** — `~/.termdeck/config.yaml` for projects/themes, `~/.termdeck/secrets.env` for credentials (Sprint 2 F2.2). `${VAR}` interpolation supported.

### Mnestra — shipped, `@jhizzard/mnestra@0.2.0`

- **MCP server** (stdio) and HTTP webhook server (`mnestra serve` subcommand, port 37778) in the `mnestra` repo. Sprint 2 F3.1 added the CLI entry.
- **Hybrid search** over `memory_items` via the `memory_hybrid_search` SQL function (pgvector + tsvector). Works with Claude Code, Cursor, Windsurf, Cline, Continue.
- **Production store:** ~3,527 memory items in the `petvetbid` Supabase project (ref `luvvbrpaopnblvxdxwzb`). Verified today by Rumen extracting 111 sessions' worth of signal out of it.
- **`memory_status_aggregation()` RPC** (migration 006) — returns accurate GROUP BY totals server-side, bypassing the PostgREST 1000-row cap that was silently truncating status reports pre-Sprint 2.
- **Flashback trigger path** — `packages/server/src/mnestra-bridge/` in the termdeck repo is the server-side client that queries Mnestra on `errored` transitions. The toast renders in `packages/client/public/index.html:1904` as `Mnestra — possible match`.
- **25+ unit tests** green on the Sprint 2 tip.

### Rumen — freshly live, `@jhizzard/rumen@0.3.4` on npm

- **Tier 4 async learning loop** per `docs/RUMEN-PLAN.md`: Extract → Relate → Synthesize (Haiku) → (Question, v0.3) → Surface, writing back into Mnestra with `source_type='insight'`.
- **Runtime:** Supabase Edge Function `rumen-tick` deployed into the petvetbid project, triggered by `pg_cron` every 15 minutes via a `net.http_post` + vault-stored service-role bearer (migration 002). First successful deploy at **2026-04-15 18:45 UTC**, job_id `295052b3-2328-45df-866b-fca59dfc3713`, per `docs/RUMEN-UNBLOCK.md`.
- **First full kickstart** at **19:47 UTC**: 111 sessions processed, 111 insights generated. The `GET /api/rumen/insights` contract in `docs/sprint-4-rumen-integration/API-CONTRACT.md` is sized around these exact numbers (`total: 111`). This is the milestone today's doc is anchored to.
- **Schema:** `rumen_jobs`, `rumen_insights`, `rumen_questions` in `packages/server/src/setup/rumen/migrations/001_rumen_tables.sql`, with the drift-backfill `ALTER TABLE ADD COLUMN IF NOT EXISTS` sequence documented in `docs/RUMEN-UNBLOCK.md` step 5a.
- **Cost controls:** Haiku-first, escalate-on-similarity, soft cap 100 LLM calls/day/dev, hard cap 500, falls back to placeholder insights (no Synthesize) when `ANTHROPIC_API_KEY` is missing.

### The 4+1 orchestration pattern — documented, not yet shipped as a product

- Written up in `docs/launch/blog-post-4plus1-orchestration.md` — four worker Claude Code panels with exclusive file scopes coordinating only via an append-only `docs/STATUS.md`, plus one orchestrator outside the multiplexer for irreversible operations. The pattern is real — this very sprint (Sprint 4) is running under it, with T1/T2/T3/T4 specs in `docs/sprint-4-rumen-integration/` and this file is the T4 deliverable.
- The template lives at `docs/demo/parallelize-template.md` (referenced by the blog post; not verified inline here).
- Not a packaged product. No `termdeck orchestrate` command. It's a pattern + a template + a blog post.

## 3. What's launched, what's blocking launch

**What's actually public today:** `@jhizzard/termdeck@0.2.5`, `@jhizzard/mnestra@0.2.0`, `@jhizzard/rumen@0.3.4` exist on npm (anyone could `npx` them). Three GitHub repos exist. That's it. No Show HN, no dev.to post, no X thread, no landing page traffic, no announced URL. A stranger could technically install the stack, but nobody has been told to.

**Real blockers** (ranked by honest risk, not by "it would be nice"):

1. **Flashback demo GIF does not exist.** Every launch plan (`LAUNCH_STRATEGY_2026-04-15.md`, `SHIP_CHECKLIST_2026-04-15.md`, `FLASHBACK_LAUNCH_ANGLE.md`, `show-hn-post.md`) hard-requires `docs/screenshots/flashback-demo.gif` as the hero asset. It hasn't been captured. The Show HN post embeds a path to a file that isn't there. This is the #1 blocker, not a "nice-to-have."
2. **Docs site is not deployed.** The repo has `docs-site/` scaffolded with Astro Starlight; `vercel deploy --prod` has not been run. The `help` button in `packages/client/public/index.html` still points at the GitHub README. Launch copy references `https://termdeck-docs.vercel.app` as if it were live.
3. **Rumen is live for one developer, with zero external validation.** Today's kickstart ran against Josh's own 3,527-item store inside the `petvetbid` Supabase project. No second user has deployed Rumen. The `RUMEN-UNBLOCK.md` procedure lists five gotchas each of which cost hours — the install is not yet a one-command story for anyone else.
4. **Pre-launch tester outreach has not happened.** The strategy requires 5 developer friends to install quietly before Show HN and post early testimonial replies. None of that has started. Cold-launching without pre-seeded testimonials is the single biggest Show HN failure mode for zero-audience authors.
5. **Installation instructions in each repo are inconsistent with reality.** The monorepo `README.md` is still the pre-Flashback structure (per item 4.3 of `SHIP_CHECKLIST_2026-04-15.md` — still `[ ]`). The rumen repo's README still references `@jhizzard/rumen@0.1.0` in the Edge Function source template in one place. Mnestra's README predates the v0.2 webhook CLI.
6. **No pricing, no LLC, no Tax ID on the Supabase account.** The Supabase billing banner about Tax ID for the petvetbid project is unresolved. At launch scale (even 90th-percentile Show HN ≈ 250 installs) this is a cost exposure, not just paperwork.
7. **Name ink is 19 hours dry.** Per `docs/launch/NAMING-DECISIONS.md`, the memory package finalized as **Mnestra** at 2026-04-15T00:42Z after a four-candidate cascade (Engram 🔴 → Mnemos 🔴 → Ingram ❌ → Mnestra 🟢). USPTO TESS check was recommended but not verified. The risk of a fifth rename post-launch is small but non-zero.

**What looks like a blocker but isn't:**

- **Version numbers being "early."** `0.2.5`/`0.3.4` doesn't block anything. The claude-mem v6.5 comparison will come up — the honest answer is "two sprints of work, one developer, no prior OSS scaffolding." Real launches win on novelty and concrete demo, not version arithmetic.
- **Windows support.** Sprint 3 FIRST-USER-GAP-ANALYSIS flagged this as Tier 2. Not a launch blocker — HN audience is macOS/Linux heavy, document it as known.
- **Claude Code plugin distribution.** TermDeck is a browser product, not a Claude Code plugin. Matching claude-mem on this surface is a Sprint 4+ nice-to-have, not a launch gate.

## 4. The narrative we want to tell

The 4+1 orchestration post (`docs/launch/blog-post-4plus1-orchestration.md`, edited 2026-04-14) is built around a concrete 2am moment: during the Sprint 3 rename cascade, a Flashback toast fired with the stale header `ENGRAM — POSSIBLE MATCH` but surfaced T4's own research note (from Supabase) about Engram being red. The memory system documented its own naming crisis in real time, using memories written by one of its own worker terminals, in the session it was being built in. That's the hook. It's specific, it's weird, it's a screenshot people will forward.

Does the blog post accurately represent what TermDeck is **today** after the Rumen kickstart? Mostly yes, but it has two gaps now:

1. **The post is Flashback-centric and says almost nothing about Rumen.** Rumen is mentioned once, in passing, as "the async learning layer." Today, Rumen is no longer a plan — it's 111 live insights in production, generated by the pg_cron run that fired 18 minutes before this doc was written. The post under-sells the "loop is closed" claim that the earlier FIRST-USER-GAP-ANALYSIS (item 11) specifically flagged as unsupported. That claim is now supportable. The post could add a one-paragraph coda: "While I was writing this, the async layer started shipping its own insights back into the store without me." That's the first time the loop has actually closed on live data.
2. **The Mnestra naming paragraph is thin.** The four-rename chain is a better story than the post uses it as. One concrete line on the 4:00am rename pass would harden the credibility.

The hook remains: **"the tool used itself to debug its own rename at 2am."** Everything else is scaffolding for that. The `show-hn-post.md` draft leads with the Tuesday CORS story instead — that story is a placeholder and T4 of Sprint 3 flagged it as generic. The Show HN body should either (a) be swapped to the 2am rename moment, which is real and already on the record, or (b) Josh has to cite a specific real CORS Tuesday of his own.

## 5. Stale or contradictory doc flags

Every doc below has at least one assertion that's wrong as of today. Recommended actions are flags, not actions — this task is read-only.

| File | What's stale | Recommendation |
|---|---|---|
| `docs/RUMEN-PLAN.md` | Status reads `Planning — 2026-04-09`. Data model / cron plan are accurate, but the whole "will run as Supabase Edge Function triggered by pg_cron" section is now past tense. Also says Rumen's critical safety rule is "runs only against TermDeck's embedded Supabase instance, not production Mnestra" — today's kickstart ran against the real petvetbid Mnestra store with 3,527 items. That safety rail has been waived and the doc doesn't record it. | **UPDATE** — flip status to "Live v0.3.4" + append the waiver decision + link to `RUMEN-UNBLOCK.md` and today's kickstart row. |
| `docs/rumen-deploy-log.md` | The whole file is dated 2026-04-14 and says `🛑 BLOCKED` in the header, with two stale-credential blockers and a "never deployed" TL;DR. It was accurate 24 hours ago and is now false: Rumen deployed at 18:45 UTC today. | **ARCHIVE** to `docs/archive/2026-04-14-rumen-deploy-blocked.md`. Don't delete — it's a genuinely useful log of the cred-rotation debugging. Superseded by `RUMEN-UNBLOCK.md` + this file. |
| `docs/LAUNCH_STRATEGY_2026-04-15.md` | Dated today but written before the Rumen deploy. Says "Rumen v0.2 live deployment" is a Sprint 3 item. Says the docs site is "scaffolded + built; not yet deployed" which is still true. The claude-mem comparison table lists Rumen as "a Sprint 3 feature worth mentioning as what's coming" — it's no longer "coming." Pricing/LLC still absent. | **UPDATE** — change "what's coming" to "what started shipping today," add a row about the Rumen kickstart, keep the rest. Don't archive; this is still the playbook for the next 48 hours. |
| `docs/SHIP_CHECKLIST_2026-04-15.md` | Phase 1 / Phase 2 items are mostly blank (`- Status:`). Phase 3 list assumes today = launch day, which it isn't. Mentions capturing GIF as item 2.2 but doesn't reflect that Rumen is now live and should be in the GIF. | **UPDATE** — add a 1.13 "Rumen insights top-bar badge via `GET /api/rumen/insights`" check (the T2/T3 Sprint 4 work), and add a Phase 2 item for "re-shoot GIF with Rumen badge visible." |
| `docs/FIRST-USER-GAP-ANALYSIS.md` | Dated 2026-04-12. Item 7 says "Rumen insights don't surface in TermDeck UI" — still true today (T2/T3 are building it), so this is accurate. Item 11 says the blog's "loop is closed" claim is not supported — this was accurate then, is now *actually supported* by the 19:47 UTC kickstart, so the line needs updating. Item 13 says "Rumen src/ uses pg but REST API is what works" — out of date, the Edge Function uses pg via the Shared Pooler now. | **UPDATE** — item 11 flip to ✅, item 13 strike through, leave the rest. |
| `docs/FOLLOWUP.md` | Large bucket of Sprint 3 items. Several Flashback-launch rows (top-bar counter, history drawer, silence toggle, telemetry) are still `[ ]`. None of them block launch, but the doc reads as if Sprint 3 is still in flight when it isn't. | **UPDATE** — split into a Sprint 3 epilogue section (what actually shipped) + a Sprint 4 active list + a deferred backlog. |
| `docs/name-dispute-analysis.md` / `name-dispute-addendum-rapid-verifications.md` / `name-dispute-quick-assessment.md` | Explicitly flagged as corrupted by find/replace passes during the rename chain, per `NAMING-DECISIONS.md`. Their package counts and star counts may be factually wrong. | **ARCHIVE** all three to `docs/archive/name-dispute-raw/` with a README.md pointing at `NAMING-DECISIONS.md` as the canonical record. Do not delete. |
| `docs/launch/show-hn-post.md` | Body leads with a generic "Tuesday CORS" story that T4 itself flagged as a placeholder in the notes section at the bottom. Says `@jhizzard/rumen` does Haiku synthesis — today it ran in placeholder mode because the insights text still reads `Placeholder insight generated from 3 source memories.` per the API contract example. | **UPDATE** — swap the cold-open to the 2am rename Flashback (real), soften the Haiku claim to "ran its first 111 synthesized insights today, some via Haiku, some via placeholder fallback until the Anthropic key is set in the Edge Function secrets." |
| `docs/launch/blog-post-4plus1-orchestration.md` | Missing the Rumen coda. The loop-is-closed claim is now hardenable against a specific cron job id and timestamp; the post predates that evidence. | **UPDATE** — one paragraph added. Otherwise keep — it's the strongest narrative asset in the repo. |
| `docs/RELEASE_CHECKLIST.md` | References `v0.2.0` as the target everywhere; the repo is actually shipping `termdeck@0.2.5`, `mnestra@0.2.0`, `rumen@0.3.4`. The "order of publish" (Mnestra → Rumen → TermDeck) is still correct for future releases. | **UPDATE** — bump example version strings to current; convert the linear "do this once" text into a reusable template. |
| `docs/SPRINT_3_PLAN.md` | Sprint 3 is done. | **ARCHIVE**. |
| `docs/launch/blog-post-rumen.md` / `blog-post-mnestra.md` / `blog-post-termdeck.md` | Not re-read in this synthesis. Likely Engram→Mnestra drift and pre-kickstart status. | **UPDATE** (low priority — blog posts can be rewritten inline before publish). |

Not flagged as stale: `docs/launch/NAMING-DECISIONS.md` (final, authoritative), `docs/sprint-4-rumen-integration/API-CONTRACT.md` (frozen today, sized to 111 insights), `docs/RUMEN-UNBLOCK.md` (written from today's actual deploy and already battle-tested).

## 6. Next-48h critical path (exactly five, prioritized)

1. **Capture the Flashback + Rumen hero GIF.** Target: `docs/screenshots/flashback-demo.gif`. 4-panel TermDeck dashboard in Tokyo Night, trigger a Flashback fire on a real failing command (one where Mnestra has a matching memory), show the toast click-through, and — crucially, now that Rumen is live — include a moment where the Rumen insights badge or top-bar counter is visible. Target 10–14 seconds, <4 MB, 15 fps. Re-shoot is required because the pre-Sprint-4 GIF storyboard didn't include Rumen at all.
2. **Ship the T2/T3 Sprint 4 work** (`GET /api/rumen/insights`, `GET /api/rumen/status`, `POST /api/rumen/insights/:id/seen`, and the morning-briefing modal in `packages/client/public/index.html`) per `docs/sprint-4-rumen-integration/API-CONTRACT.md`. Without this, the 111 insights generated today are invisible from inside TermDeck, which is the visible proof point for the "loop is closed" claim.
3. **Write `install.md` in the rumen repo root, transcribed from `docs/RUMEN-UNBLOCK.md`**, specifically calling out the five gotchas in a `🚨 READ THIS FIRST` box — the hidden IPv4 toggle in the Supabase Connect modal, the literal-string password bug, `DATABASE_URL` only (no `DIRECT_URL`), the macOS-13/Homebrew/Deno incompatibility, and the schema drift backfill. This is the single highest-leverage documentation write: without it, no second user will successfully deploy Rumen.
4. **Deploy `docs-site/` to Vercel.** `cd docs-site && vercel link && vercel deploy --prod`. Pin the resulting URL into the `help` button href in `packages/client/public/index.html`, tag the change as TermDeck `v0.2.6`, republish. Without a live docs site the Show HN credibility bar isn't met.
5. **Rewrite `README.md` Flashback-first with the three-tier stack diagram and a Rumen paragraph** that links to both sibling repos and the docs-site. Hero GIF from item 1, one-line pitch `The terminal that remembers what you fixed last month`, quickstart with `npx @jhizzard/termdeck`, "How Flashback works" in four sentences, "What Flashback is not" honest-limits (quoting the `NAMING-DECISIONS.md` canonical limits paragraph verbatim), Rumen added as the third tier with a line about the 19:47 UTC first kickstart.

Items #4 and #5 must be done before items #1 and #3 can be referenced. Item #2 is independent; it's the only item the parallel T2/T3 terminals are already working on while this doc is being written.

### Post-launch hygiene followups (NOT critical path)

These are logged after the 2026-04-15 evening session surfaced them but do NOT block launch. File in a followup issue tracker after Show HN ships.

- **Apply `config/supabase-migration.sql` to petvetbid** to create the `engram_session_memory` / `engram_project_memory` / `engram_developer_memory` / `engram_commands` tables that TermDeck's `packages/server/src/rag.js` pushes telemetry into. The tables have never been created in the production Supabase project, so every 2-second `status_broadcast` tick produces a `[mnestra] Push failed: Supabase responded 404` line in the server log. **Workaround applied 2026-04-15 20:XX UTC:** `rag.enabled: false` set in `~/.termdeck/config.yaml` to silence the spam — TermDeck telemetry layer dormant, Mnestra (MCP memory) and Rumen unaffected. **Proper fix options (pick one before flipping `rag.enabled` back on):**
  1. Read `config/supabase-migration.sql` carefully, confirm it doesn't collide with Mnestra's `memory_items` / `memory_sessions` / `memory_relationships`, confirm RLS policies don't target a `developer_id` JWT claim you aren't minting, then apply it via `supabase db push` or `psql -f`. Re-enable `rag.enabled: true`.
  2. Rewrite `rag.js` to push telemetry into Mnestra's existing `memory_items` schema with `source_type='termdeck_telemetry'` so the two systems share one store.
  3. Add a 404 circuit-breaker in `rag.js` that disables further pushes to a given table after N consecutive 404s, logs once, and resumes only on server restart. Cheapest defensive engineering, doesn't fix the underlying schema gap.
  - **Why this isn't urgent:** TermDeck's own telemetry layer (session_created / command_executed / status_changed events) is observability, not load-bearing. Mnestra and Rumen are what matter today, and they're on an independent path. Fix this after launch when you want the TermDeck side of the stack to contribute to the memory store.

## 7. Launch channels recommendation

Ranked for TermDeck specifically (a visual devtool, CLI-adjacent, memory-for-agents angle, MIT, zero audience, one-developer story):

1. **Hacker News Show HN** — highest leverage. Audience matches exactly (devtool-curious, skeptical-of-memory-hype, rewards concrete demos). The Flashback GIF is the only asset that can cold-carry the first hour. Tuesday or Wednesday 8:00am PT.
2. **`r/commandline`** — second-best native fit. Headline should lead with the multiplexer angle (`tmux in the browser, with memory`), not the memory angle. Lower ceiling than HN but much friendlier to "solo dev built this."
3. **X thread with the GIF embedded on tweet 1** — posted 5 minutes after HN. Amplifies whatever HN gives you. Not a standalone channel for a zero-audience author, but free upside.
4. **dev.to crosspost of the 4+1 orchestration blog post** — 24 hours after Show HN. The post is already the strongest asset in the repo; dev.to's algorithm favors long-form "I built this" stories.
5. **`r/selfhosted`** — the "runs locally if you want it to" angle. Caveat: Mnestra's local-only path isn't shipped in v0.2, so the headline has to be honest about the Supabase dependency. Still a reasonable fit.
6. **Targeted DMs to ~5 devs tweeting in the memory-for-agents space** — no ask, just the GIF. Low volume, high signal if any of them quote it.
7. **JavaScript Weekly / Node Weekly / Changelog News** — submit the week after Show HN, once there's a point total to cite. Curators favor posts that already have signal.
8. **LinkedIn / Facebook** — skip. Wrong audience, dilutes signal.
9. **`r/programming`** — skip, anti-self-promo rules.
10. **Product Hunt** — skip for v0.2. PH is the wrong wave for devtools without a website; revisit when the docs-site is live and there's paid anything.

The discipline is: one launch day, one hero asset (the GIF), one story (the 2am rename Flashback), one question answered in the first reply on every channel. Everything else is amplification.

---

**End of LAUNCH-STATUS-2026-04-15.md.**
