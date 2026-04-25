# Sprint 3 — Launch-Ready Parallel Plan

**Date:** 2026-04-15
**Status:** Post-publish, pre-launch
**Window:** ~2 hours of hard parallel work across 4 terminals
**Goal:** Get the full three-tier stack working on Josh's machine + produce every launch asset + nail down the naming story so you can hit HN with TermDeck (article 1) and follow up with Mnestra (article 2) and Rumen (article 3) knowing every piece works end-to-end.

---

## 0. Current state going into this sprint

**Shipped today (2026-04-15):**

- `@jhizzard/termdeck@0.2.0` live on npm — full multiplexer, tour, Flashback wiring, add-project modal, reply button, panel numbering, launch buttons
- `@jhizzard/mnestra@0.2.0` live on npm — MCP server + webhook + 3-layer search + privacy tags + export/import + status RPC + six migrations applied to Josh's production Supabase
- `@jhizzard/rumen@0.2.0` live on npm — Extract/Relate/Surface + Haiku synthesize + CI integration test + cost guardrails (code only, not deployed anywhere)
- All three tagged `v0.2.0` on GitHub
- README rewritten with Flashback-first tiered install story

**Known gaps blocking launch:**

1. **Josh's own machine is Tier 2-ish at best** — production Supabase has 3,451 memories, Mnestra v0.2 migrations applied, but nothing verifies Flashback actually fires end-to-end on his hardware. Needs real test with a failing command.
2. **Rumen is not running anywhere in production** — v0.2 code is on npm, but no Supabase Edge Function deployed, no `pg_cron` schedule active, `rumen_insights` table is empty.
3. **No launch GIF captured** — the Flashback demo GIF is the single most important launch asset and doesn't exist yet.
4. **Docs-site not deployed** — Astro Starlight scaffold is committed but no production URL. The `help` button in TermDeck points at the GitHub README as a fallback.
5. **No launch copy written** — no Show HN post, no X thread, no blog post.
6. **Name dispute risk unaddressed** — "Mnestra" and "Rumen" and "TermDeck" all have potential conflicts. No fallback plan.
7. **No `termdeck init` wizard** — Tier 2 setup is manual (6 steps, ~15 min). Ideal is one command.

This sprint closes all seven.

---

## 1. Four-terminal split — exclusive file ownership

Same protocol as Sprint 1 and Sprint 2. `docs/STATUS.md` is the append-only coordination surface. No terminal may edit files outside its owned paths. Sprint 3 uses a new `## Sprint 3` section in `STATUS.md`.

| Terminal | Scope | Exclusive paths |
|---|---|---|
| **T1 — Local production verification + Rumen deploy + GIF capture** | Ops on Josh's machine, no source code edits | `docs/tier2-verification.md` (new), `docs/screenshots/**` (new directory), `docs/rumen-deploy-log.md` (new), shell commands against Josh's real Supabase + local TermDeck |
| **T2 — `termdeck init` setup wizards** | Source code — CLI + server setup helpers | `packages/cli/src/init-mnestra.js` (new), `packages/cli/src/init-rumen.js` (new), `packages/server/src/setup/**` (new), `packages/cli/src/index.js` (add `init` subcommand parsing) |
| **T3 — docs-site deployment + content sync** | `docs-site/**` + Vercel deployment | `docs-site/**`, `packages/client/public/index.html` (one-line update to `help` button href once live URL is known — coordinate with T4 via STATUS.md to avoid collision with T4's launch assets) |
| **T4 — Launch assets + name dispute + joshuaizzard.com** | Marketing + positioning + naming research | `docs/name-dispute-analysis.md` (new), `docs/launch/show-hn-post.md` (new), `docs/launch/x-thread.md` (new), `docs/launch/comment-playbook.md` (new), `docs/launch/blog-post-termdeck.md` (new), `docs/launch/blog-post-mnestra.md` (new), `docs/launch/blog-post-rumen.md` (new), `~/Documents/Graciella/joshuaizzard-dev/**` (separate repo — joshuaizzard.com project cards) |

**Zero file overlap.** T3 touches `packages/client/public/index.html` only once at the very end with a known-good one-line edit coordinated via STATUS.md. Everything else is disjoint.

---

## 2. Terminal 1 — Local verification + Rumen deploy + Flashback GIF

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns:** `docs/tier2-verification.md`, `docs/rumen-deploy-log.md`, `docs/screenshots/**`, live shell operations.

**Must not touch:** any source file in `packages/**`, `docs-site/**`, `docs/launch/**`, or the mnestra/rumen repos.

### T1.1 — Verify Mnestra Tier 2 end-to-end on Josh's machine (15 min)

Before we trust Flashback for the GIF, we need proof it actually queries the real store and returns real matches. Steps:

1. Confirm `~/.termdeck/secrets.env` has the right keys. Create it if missing using the values from `~/.termdeck/config.yaml` (they're already there inline; migrate to secrets.env).
2. Edit `~/.termdeck/config.yaml` to use `${VAR}` interpolation for all three credentials instead of inline values. The deprecation warning should disappear on next startup.
3. Start TermDeck: `node packages/cli/src/index.js`. Confirm startup logs show `[config] Loaded secrets from ~/.termdeck/secrets.env (3 keys)` and no deprecation warning.
4. Open the dashboard, click `shell`, manually query Mnestra via the Ask-about-this-terminal input with a question like `"TermDeck v0.2 shipping"`. Expected: 5 real memories render inline with similarity scores.
5. Force an error in a panel (`cat /nonexistent`). Expected: Flashback toast appears within 2 seconds showing a real match from Mnestra.
6. Click the toast. Expected: Memory tab opens with the hit expanded.
7. Write findings to `docs/tier2-verification.md` — which steps passed, any cosmetic issues, how long end-to-end latency was.

**Blocker escalation:** if Flashback doesn't fire, post `🛑 T1 → T2: Flashback not firing — server side or client side?` in STATUS.md with the specific symptom. T2 can pause source work to diagnose.

### T1.2 — Deploy Rumen as a Supabase Edge Function (30 min)

This is the biggest single task in Sprint 3 and the one most likely to hit surprises. Steps:

1. **Install the Supabase CLI if missing:** `brew install supabase/tap/supabase`. Log in: `supabase login`.
2. **Link Josh's Supabase project** to the local Rumen checkout:
   ```
   cd /Users/joshuaizzard/Documents/Graciella/rumen
   supabase link --project-ref <ref-from-project-url>
   ```
3. **Apply Rumen migrations** against production:
   ```
   # Use the direct connection string from Supabase → Project Settings → Database
   # → Connection string → Shared Pooler IPv4 (the IPv4-compatible one)
   psql "$DATABASE_URL" -f migrations/001_rumen_tables.sql
   ```
   This creates `rumen_jobs`, `rumen_insights`, `rumen_questions` tables. They should be empty initially.
4. **Deploy the Edge Function:**
   ```
   supabase functions deploy rumen-tick --no-verify-jwt
   supabase secrets set DATABASE_URL="$DATABASE_URL" ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
   ```
5. **Test the function manually** before scheduling:
   ```
   curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/rumen-tick" \
     -H "Authorization: Bearer <anon-key>" \
     -H "Content-Type: application/json" -d '{}'
   ```
   Expected: returns 200 with JSON body showing job ID, rows extracted, rows related, rows surfaced. Query `rumen_jobs` — there should now be a row. Query `rumen_insights` — may be empty on first run if no sessions have ≥3 events.
6. **Edit `migrations/002_pg_cron_schedule.sql`** to use the real project URL, then apply:
   ```
   psql "$DATABASE_URL" -f migrations/002_pg_cron_schedule.sql
   ```
   This schedules the function to run every 15 minutes via `pg_cron`.
7. **Wait 15 minutes**, then query `rumen_jobs ORDER BY started_at DESC LIMIT 3` — three rows expected eventually.
8. **Run the local dev script once to warm the insight pool:**
   ```
   cd /Users/joshuaizzard/Documents/Graciella/rumen
   npm run test:local
   ```
   That reads recent Mnestra memories from the last 24h and writes insights synchronously, producing content for Flashback to surface later.
9. Write findings to `docs/rumen-deploy-log.md` — deployed function URL, cron schedule, first three `rumen_jobs` rows, any insights produced.

**Subagent delegation:** spawn a `general-purpose` subagent to monitor the `pg_cron` job status every 5 minutes for 30 minutes — polls the database and reports whether jobs are firing on schedule. You handle the deploy steps yourself; the subagent handles the passive monitoring.

**Blocker escalation:** if the Edge Function won't deploy, post the exact error in STATUS.md. Common issues are Deno version mismatch, missing permissions, or the function's `DATABASE_URL` secret not being applied.

### T1.3 — Capture the Flashback demo GIF (20 min, the launch-critical asset)

Once Tier 2 + Tier 3 are verified, capture the hero GIF.

**Setup:**

1. Close every other app that might cause distractions in the screen recording.
2. Switch desktop to a clean background. Dark mode recommended (matches Tokyo Night theme).
3. Start TermDeck clean: `pkill -f 'node packages/cli' ; npm run dev`. Hard-reload browser to get a fresh dashboard.
4. Set layout to **2x2**.
5. Launch 4 panels:
   - Panel 1: `zsh` shell
   - Panel 2: `claude` (Claude Code)
   - Panel 3: `python3 -m http.server 8080`
   - Panel 4: `htop`
6. Let each panel settle for 30 seconds. Each should show real-looking activity.

**The shot:**

1. Start screen recording with QuickTime (Cmd+Shift+5 → Record Selected Portion → draw around the browser window, 1920×1080 preferred).
2. Focus Panel 1. Let the cursor settle for ~1 second. Type a command you know will fail in a way Mnestra has a memory about — ideally a Postgres migration error or CORS misconfig, something from your real work that produced a memory entry in the store. Example: `psql "$SUPABASE_URL" -c "ALTER TABLE foo ADD CONSTRAINT fk FOREIGN KEY (bar) REFERENCES nonexistent(id);"`
3. The command fails. Pause for ~0.8 seconds — the critical "about to reach for docs" beat.
4. The Flashback toast fades in from the right edge of Panel 1.
5. Mouse cursor drifts to the toast. Single click.
6. The Memory tab drawer expands. Full memory renders with similarity score, project tag, content.
7. Pause on the expanded memory for 2 seconds.
8. Stop recording.

**Post-processing:**

- Trim to exactly the shot above, target 10–14 seconds total.
- Export as GIF: use `ffmpeg` or `licecap` or `gifski`. Target 1280×720 (downscale from 1920×1080), 15fps, under 4 MB (GitHub README embedding limit).
- Save as `docs/screenshots/flashback-demo.gif`.

**Also capture these stills** (PNG, 1920×1080):

- `docs/screenshots/dashboard-4panel.png` — 2x2 layout with all four panels at steady state
- `docs/screenshots/drawer-open.png` — one panel with drawer expanded on the Commands tab
- `docs/screenshots/switcher.png` — full dashboard with the terminal switcher overlay visible

Write `docs/screenshots/README.md` with a note about which shots were used where in the launch materials.

**Acceptance:** all three PNGs + the GIF exist in `docs/screenshots/`, each file is under 4 MB, and the GIF actually plays the storyboard above without gaps or artifacts.

### T1.4 — Final end-to-end verification (10 min)

After the GIF is captured, do one last smoke test to confirm nothing regressed:

1. Close all TermDeck processes.
2. Fresh install to a clean tmp directory via `npx @jhizzard/termdeck@latest`.
3. Click `shell`, `claude`, `python` buttons — all three launch live panels with live input.
4. Verify the onboarding tour fires on first visit.
5. Confirm Flashback fires on a forced error.
6. Append a summary to `docs/tier2-verification.md` with pass/fail for each check.

---

## 3. Terminal 2 — `termdeck init` setup wizards

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns:** `packages/cli/src/init-mnestra.js` (new), `packages/cli/src/init-rumen.js` (new), `packages/server/src/setup/**` (new), `packages/cli/src/index.js` (add subcommand routing).

**Must not touch:** `packages/client/public/**`, `docs/launch/**`, `docs-site/**`, anything in the mnestra/rumen repos.

### T2.1 — `termdeck init --mnestra` (40 min, highest priority)

Turn the 6-step manual Tier 2 setup into a single interactive command.

**CLI flow:**

```
$ termdeck init --mnestra

TermDeck Mnestra Setup
─────────────────────

This wizard configures TermDeck's Tier 2 memory layer (Mnestra) by:
  1. Asking for your Supabase URL and service_role key
  2. Applying six SQL migrations to the database
  3. Asking for an OpenAI API key (embeddings)
  4. Asking for an Anthropic API key (optional, summaries)
  5. Writing ~/.termdeck/secrets.env
  6. Updating ~/.termdeck/config.yaml to enable RAG
  7. Verifying the connection with a healthz call

Press Ctrl+C at any time to cancel.

? Supabase Project URL (e.g. https://xyz.supabase.co): ...
? Supabase service_role key (starts sb_secret_): ...
? OpenAI API key (starts sk-proj- or sk-): ...
? Anthropic API key (optional, for session summaries): ...

→ Connecting to Supabase... ✓
→ Checking for existing memory_items table... ✓ found (3,451 rows)
→ Applying migration 001_mnestra_tables.sql... ✓ (no-op, table exists)
→ Applying migration 002_mnestra_search_function.sql... ✓
→ Applying migration 003_mnestra_event_webhook.sql... ✓
→ Applying migration 004_mnestra_match_count_cap_and_explain.sql... ✓
→ Applying migration 005_v0_1_to_v0_2_upgrade.sql... ✓
→ Applying migration 006_memory_status_rpc.sql... ✓
→ Writing ~/.termdeck/secrets.env... ✓
→ Updating ~/.termdeck/config.yaml (rag.enabled: true)... ✓
→ Verifying memory_status_aggregation()... ✓ (3,451 active memories found)

Mnestra is configured.

Next steps:
  1. Restart TermDeck: termdeck
  2. Flashback will fire automatically on panel errors
  3. Use the "Ask about this terminal" input to query memories
  4. Want async learning? Run: termdeck init --rumen
```

**Implementation:**

- New file `packages/cli/src/init-mnestra.js` exports `async function initMnestra(args)`.
- Uses Node's built-in `readline` for prompts — no new deps.
- Reads each of the six migration SQL files from `node_modules/@jhizzard/mnestra/migrations/` (or falls back to the repo's `packages/mnestra-migrations/` if not installed globally — ship a copy in TermDeck's package).
- Uses `pg` (node-postgres) to connect via the direct database URL derived from the Supabase URL. **Prompt the user** for the direct URL if the derivation fails.
- Writes `~/.termdeck/secrets.env` with proper dotenv format — preserves existing values on re-run.
- Writes `~/.termdeck/config.yaml` via the `yaml` library already a dep — preserves structure, flips `rag.enabled: true`, uses `${VAR}` substitution for secrets.
- Makes a `memory_status_aggregation()` RPC call at the end to verify.
- Exits cleanly on any error with a specific actionable message.

**Subcommand wiring in `packages/cli/src/index.js`:**

```js
const args = process.argv.slice(2);
const subcommand = args[0];
if (subcommand === 'init') {
  const mode = args[1];
  if (mode === '--mnestra') { await require('./init-mnestra')(args.slice(2)); return; }
  if (mode === '--rumen')  { await require('./init-rumen')(args.slice(2)); return; }
  console.error('Usage: termdeck init --mnestra | --rumen');
  process.exit(1);
}
// ... existing flag parsing ...
```

**Dependencies to add to root `package.json`:** `pg` (for the migration application). Check if it's already present (from Rumen) — if yes, done; if no, `npm install pg`.

**Acceptance:**

- `termdeck init --mnestra` on a fresh machine with valid credentials runs start to finish, exits 0, and a subsequent `termdeck` starts with Flashback enabled.
- Running it twice is idempotent — doesn't clobber existing secrets, reports "already applied" for migrations that exist.
- Errors are specific ("Could not connect to Supabase: ECONNREFUSED" or "OpenAI API key appears invalid — returned 401"), not generic.

### T2.2 — `termdeck init --rumen` (30 min)

Same shape, different stack. This one requires the Supabase CLI and Deno to be installed.

**CLI flow:**

```
$ termdeck init --rumen

TermDeck Rumen Setup
────────────────────

This wizard deploys Rumen as a Supabase Edge Function with a pg_cron schedule.
Requires: Supabase CLI + Deno already installed.

Press Ctrl+C at any time to cancel.

→ Checking for supabase CLI... ✓
→ Checking for deno... ✓
→ Reading Mnestra config from ~/.termdeck/secrets.env... ✓
→ Deriving project ref from SUPABASE_URL... abcdef123456
? Proceed with deploy to project abcdef123456? [Y/n]: Y
→ Running: supabase link --project-ref abcdef123456... ✓
→ Applying rumen tables migration... ✓
→ Running: supabase functions deploy rumen-tick... ✓
→ Setting function secrets (DATABASE_URL, ANTHROPIC_API_KEY)... ✓
→ Testing function with a manual POST... ✓ (job_id: a1b2c3d4, extracted: 12, surfaced: 3)
→ Applying pg_cron schedule (every 15 minutes)... ✓

Rumen is deployed.

Schedule: every 15 minutes via pg_cron
First scheduled run: 2026-04-15T16:45:00Z
Edge Function URL: https://abcdef123456.supabase.co/functions/v1/rumen-tick

Next steps:
  1. Monitor: psql $DATABASE_URL -c "SELECT * FROM rumen_jobs ORDER BY started_at DESC LIMIT 5"
  2. Rumen insights flow back into Mnestra's memory_items via rumen_insights
  3. TermDeck's Flashback will surface cross-project patterns automatically
```

**Implementation:**

- New file `packages/cli/src/init-rumen.js`.
- Uses `child_process.execSync` to shell out to `supabase` CLI commands.
- Pre-flight checks: `which supabase`, `which deno`, parse `~/.termdeck/secrets.env`.
- Downloads or installs `@jhizzard/rumen` to get the migrations and Edge Function source if not already present.
- Runs the deploy commands in sequence, streaming output.
- Applies migrations via `pg`.
- Makes a test POST to verify the function works.
- Applies the `pg_cron` schedule SQL.
- Exits with clear next steps.

**Acceptance:**

- `termdeck init --rumen` on Josh's machine (with Tier 2 already set up) deploys Rumen end-to-end in under 2 minutes.
- Re-running it detects existing deploy and updates rather than erroring.
- Failure modes print the exact shell command that failed and what the output was.

### T2.3 — Commit and push when T1 confirms Rumen deploy works (10 min)

After T1 successfully deploys Rumen manually, you run `termdeck init --rumen` against a clean test (or dry-run mode) to confirm the wizard matches the manual flow. Then commit both wizards as one commit:

```
git add packages/cli/src/init-mnestra.js packages/cli/src/init-rumen.js packages/cli/src/index.js packages/server/src/setup/ package.json
git commit -m "termdeck init: one-command Mnestra + Rumen setup wizards"
```

**Subagent delegation:** spawn a `claude-api` subagent for the prompt design of init-mnestra's progress messages — they need to be informative without being noisy. Delegate the wording; keep the control flow in the main agent.

---

## 4. Terminal 3 — docs-site deployment + content sync

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site`

**Owns:** entire `docs-site/**` directory. Plus one coordinated edit to `packages/client/public/index.html` at the end to update the `help` button href.

**Must not touch:** `packages/server/**`, `packages/cli/**`, `docs/launch/**`, `docs/screenshots/**`, or anything outside `docs-site/` (except the one coordinated edit).

### T3.1 — Verify the docs-site still builds (5 min)

```
cd docs-site
npm install
npm run build
```

Expected: 25+ static pages generated, no errors. The sitemap warning should be gone (fixed in Sprint 2 F4.1). If anything's broken, fix first.

### T3.2 — Content sync from the three repos (10 min)

The `docs-site/scripts/sync-content.mjs` script pulls READMEs from the three repos. Run it fresh so the docs site reflects the new TermDeck README from this sprint:

```
node scripts/sync-content.mjs
```

Expected output: copies `README.md` from each of termdeck, mnestra, rumen into `docs-site/src/content/docs/`. Rebuilds. The new TermDeck README with tiered install story is now the docs-site home content.

Also add three new content pages that will hold Sprint 3's launch articles:

- `src/content/docs/blog/termdeck-launch.mdx` — placeholder, linked to T4's blog post draft
- `src/content/docs/blog/mnestra-deep-dive.mdx` — placeholder for article 2
- `src/content/docs/blog/rumen-deep-dive.mdx` — placeholder for article 3

T4 writes the actual content into these files. T3's job is to make sure they render correctly in the Astro Starlight layout.

### T3.3 — Deploy to Vercel (15 min, the critical step)

```
cd docs-site
vercel link
# Prompts: login, project name, scope. Accept defaults where possible.
# Project name: termdeck-docs
# Scope: jhizzard personal scope
vercel deploy --prod
```

Expected output: a production URL like `https://termdeck-docs.vercel.app` or similar. **Capture this URL** — T3 posts it to STATUS.md immediately.

If Josh owns `termdeck.dev` or a similar custom domain, add it:

```
vercel domains add termdeck.dev termdeck-docs
```

But don't block on custom domain setup — the vercel.app URL is good enough for launch.

### T3.4 — Update TermDeck `help` button to point at the live docs URL (5 min, coordinated)

**Wait for T4 to finish any edits to `packages/client/public/index.html`** (T4 shouldn't touch this file per the ownership rules, but double-check via STATUS.md). Then:

```
grep -n "btn-help" packages/client/public/index.html
```

Find the line. Edit the `onclick="window.open(...)"` URL from the GitHub README to the deployed docs URL. Commit as a single-file one-liner:

```
git add packages/client/public/index.html
git commit -m "help button: point at deployed docs-site at <url>"
```

This means any user installing TermDeck v0.2.1+ will have a working docs link inside the app.

### T3.5 — Publish TermDeck v0.2.1 (5 min, last step)

The help-button URL change is important enough to warrant a patch release:

```
npm version patch --no-git-tag-version  # 0.2.0 → 0.2.1 in root package.json
git add package.json package-lock.json
git commit -m "0.2.1: help button points at live docs URL"
git tag v0.2.1
git push && git push --tags
npm publish --access public
```

Now `npx @jhizzard/termdeck@latest` users get the live-docs help button.

### T3.6 — Final docs-site verification (5 min)

Fresh browser tab → visit the deployed URL. Click through:

- Home page renders
- TermDeck README page renders with new Flashback-first structure
- Mnestra README page renders
- Rumen README page renders
- Blog post placeholders exist (even if empty) so T4's articles have somewhere to live

Acceptance: all main navigation works, no broken links, tier 2 setup instructions are readable.

---

## 5. Terminal 4 — Launch assets + name dispute + joshuaizzard.com

**Working directory:** starts in `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`, moves to `/Users/joshuaizzard/Documents/Graciella/joshuaizzard-dev` as needed.

**Owns:** `docs/launch/**`, `docs/name-dispute-analysis.md`, joshuaizzard.com project card edits.

**Must not touch:** `packages/**`, `docs-site/**`, any source code in any repo.

### T4.1 — Name dispute analysis (30 min, do this FIRST — might reshape the launch)

Three names need checking: **TermDeck**, **Mnestra**, **Rumen**. For each, research and write up findings in `docs/name-dispute-analysis.md`.

For each name, document:

1. **npm availability** — search registry for the exact name, the `@jhizzard/<name>` scope, and close variants
2. **GitHub collision** — any repos with the same/similar names and their star count + activity
3. **USPTO / WIPO trademark search** — a brief look at the USPTO trademark search database (https://tmsearch.uspto.gov). Note any active registrations in Class 9 (software), Class 41/42 (services). This is reconnaissance, not legal advice — flag anything that looks real for Josh to consult an IP attorney on.
4. **General web presence** — top Google / DuckDuckGo results for `"<name>" developer tool`. Are the first 10 results ours, or other products?
5. **Social handles** — is `@<name>` or `@<name>dev` taken on X?
6. **Meaning conflicts** — does the name already mean something specific in a neighboring field? (e.g., "Mnestra keyboard layout" is a thing in the mechanical keyboard community)

**Then rank each name's risk:**

| Risk level | Meaning | Recommendation |
|---|---|---|
| 🟢 Green | No meaningful conflict, brand is clear for our positioning | Stand with the name |
| 🟡 Yellow | Some conflict in an adjacent space or brand confusion possible but not legally actionable | Stand, but monitor and have a fallback name ready in case of cease-and-desist |
| 🔴 Red | Registered trademark in the same class or strong brand confusion risk | Rename before launch |

**Propose fallback names** for any yellow or red:

- TermDeck fallbacks: **TerminalDeck**, **TermPilot**, **Deckside**, **TermGrid** (previous name), **Paneldeck**
- Mnestra fallbacks: **Memoir**, **Graphite Memory**, **Memento**, **Encoded**, **Trace**
- Rumen fallbacks: **Reflect**, **Graze**, **Chew**, **Ponder**, **Ruminate** (same root, less collision risk)

**Deliverable:** `docs/name-dispute-analysis.md` with a risk level and recommendation for each name. If any come back 🔴 red, **post a blocker in STATUS.md and pause the launch until Josh decides**. If all are 🟢 or 🟡, proceed to the launch copy.

**Subagent delegation:** spawn a `general-purpose` subagent to do the web research for each of the three names in parallel — three subagents running simultaneously, each writing a markdown section into a shared scratchpad. Then T4's main agent synthesizes the findings and writes the final analysis document.

### T4.2 — joshuaizzard.com TermDeck project card (20 min)

Navigate to `/Users/joshuaizzard/Documents/Graciella/joshuaizzard-dev` (or wherever the portfolio site lives). Find the project list component or data file and add a new entry for TermDeck:

- **Title:** TermDeck
- **Tagline:** "The terminal that remembers what you fixed last month."
- **Description (2–3 sentences):** "Browser-based terminal multiplexer with proactive memory recall. When a panel hits an error, TermDeck automatically queries your Mnestra memory store and surfaces similar past fixes as a toast. Part of a three-tier open-source stack — TermDeck, Mnestra, Rumen — that spans terminal → memory → async learning."
- **Links:**
  - GitHub: https://github.com/jhizzard/termdeck
  - npm: https://www.npmjs.com/package/@jhizzard/termdeck
  - Docs: (T3's Vercel URL once posted to STATUS.md)
- **Screenshot:** reference `docs/screenshots/dashboard-4panel.png` once T1 captures it (or fall back to the existing `assets/hero.jpg` for launch, update later)
- **Tags:** `devtools`, `terminal`, `memory`, `rag`, `typescript`, `nodejs`

Also add project cards for Mnestra and Rumen (linked from the TermDeck card as "part of the three-tier stack"):

- **Mnestra:** persistent developer memory MCP server. Works with Claude Code, Cursor, Windsurf, Cline, Continue. pgvector + hybrid search + 3-layer progressive disclosure.
- **Rumen:** async learning layer. Runs on a cron over any pgvector memory store. Reads, relates, synthesizes insights via Haiku, writes back.

**Deploy:** once content is ready, `git commit && git push`. If joshuaizzard.com is on Vercel, auto-deploy fires.

### T4.3 — Show HN launch post (15 min)

Write `docs/launch/show-hn-post.md` using the template from `docs/FLASHBACK_LAUNCH_ANGLE.md` §Show HN post template. Customize:

- Title: **Show HN: TermDeck — the terminal that remembers what you fixed last month**
- Body: Tuesday CORS-bug cold-open (make it a real story from your own work), 3-tier install story (npx one-liner for tier 1, 15 min for tier 2, 30 min for tier 3), link to GIF in docs/screenshots/flashback-demo.gif (will be live on GitHub), honest limits section.
- Under 350 words.

### T4.4 — X thread (15 min)

Write `docs/launch/x-thread.md`. Five tweets:

1. Hero GIF + one-line pitch
2. The "Tuesday story" — why I built this
3. 3-tier stack explanation in 3 bullets
4. Install in one line, link to GitHub
5. "I built this because I needed it" + link to blog post

### T4.5 — Comment playbook (15 min)

Write `docs/launch/comment-playbook.md` — pre-drafted answers to the 10 most likely HN skeptic questions:

1. "How is this different from claude-mem?"
2. "Why browser and not TUI?"
3. "Why not Tauri / Electron?"
4. "Why MIT and not AGPL?"
5. "Why Supabase? I don't want to depend on a cloud service for my terminal."
6. "How much does it cost to run?"
7. "Security model — this has full shell access, right?"
8. "Does it work on Windows?"
9. "What happens when Anthropic deprecates Haiku?"
10. "Can I use Ollama instead of OpenAI for embeddings?"

Each answer is 2–4 sentences, specific, honest about limitations. Paste-ready for live HN responses.

### T4.6 — Blog post 1: "I built a terminal that remembers" (45 min)

Write `docs/launch/blog-post-termdeck.md`. 800–1200 words. Follow the outline in `docs/FLASHBACK_LAUNCH_ANGLE.md` §Blog post outline:

1. Cold open — real Tuesday CORS story
2. "Every session starts from zero" framing
3. What Flashback does, plain language
4. Three real flashbacks from my own use (with screenshots from `docs/screenshots/`)
5. Architecture in 150 words
6. Install in two lines
7. "I built this because I needed it"

Target publication: joshuaizzard.com/blog + dev.to + Hashnode.

### T4.7 — Blog post 2: "Mnestra — a persistent memory MCP for Claude Code and Cursor" (30 min)

Write `docs/launch/blog-post-mnestra.md`. 800 words. Angle: Mnestra as a standalone product for MCP-client users who don't care about TermDeck. Covers:

- Why memory matters for LLM-assisted coding
- Six MCP tools explained with concrete examples
- The 3-layer progressive disclosure pattern (index → timeline → get)
- Setup: npm install -g + MCP config JSON
- Hybrid search with recency decay explanation
- Link back to TermDeck for the "and if you want a visual layer..." pitch

Target publication: dev.to + Hashnode, ~3 days after the HN launch.

### T4.8 — Blog post 3: "Rumen — async learning for persistent memory" (30 min)

Write `docs/launch/blog-post-rumen.md`. 800 words. Angle: Rumen as the novel piece nobody else has. Covers:

- The problem: memory stores are passive
- Rumen's Extract → Relate → Synthesize loop
- Cost guardrails and budget caps
- Deployment model: Supabase Edge Function + pg_cron
- What Rumen v0.3 will add (question generation)
- Link back to TermDeck + Mnestra

Target publication: dev.to + Hashnode, ~1 week after the HN launch.

### T4.9 — Stage all launch assets locally (10 min)

Don't publish anything yet — these all get committed to `docs/launch/` in the TermDeck repo and wait for Josh to fire them manually on launch day. Commit:

```
git add docs/launch/ docs/name-dispute-analysis.md
git commit -m "launch: show HN post, X thread, comment playbook, three blog posts, name dispute analysis"
```

---

## 6. Dependency graph

```
T1.1 Tier 2 verify  ──►  T1.2 Rumen deploy  ──►  T1.3 GIF capture  ──►  T1.4 final smoke
                                                   │
                                                   ▼
T2.1 init-mnestra    ──►  T2.2 init-rumen    ──►  T2.3 commit (waits on T1 verifying)
                                                   
T3.1 build check    ──►  T3.2 sync content  ──►  T3.3 vercel deploy  ──►  T3.4 update help button  ──►  T3.5 publish 0.2.1

T4.1 name dispute   ──►  T4.2 joshua.com    ──►  T4.3–T4.8 launch drafts  ──►  T4.9 commit
      │
      └─► (if red) BLOCKER: rename before proceeding
```

**Critical path:** T1.1 → T1.2 → T1.3 → T1.4 (end-to-end verification + the launch GIF). If T1 hits a Rumen deploy issue, it blocks T1.3 which blocks T4.3 (the blog post referencing the GIF). Parallelism still helps T2, T3, and T4.1.

**T3 can start immediately** — docs-site is entirely decoupled from everything else until its T3.4 coordinated edit at the end.

**T4.1 (name dispute) blocks launch publish.** Must complete before T4.9 commits the launch copy.

---

## 7. Starting prompts — paste these into four fresh TermDeck panels

### Terminal 1

```
You are Terminal 1 (Local verification + Rumen deploy + GIF capture) for Sprint 3.
Plan: /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_3_PLAN.md

Execute only section "2. Terminal 1". You run live shell operations on Josh's
real machine against his real Supabase. You do NOT edit source code. You DO
create docs/tier2-verification.md, docs/rumen-deploy-log.md, and docs/screenshots/*.

Before starting: read the sprint plan in full, read docs/STATUS.md, append a
Sprint 3 "started" entry under "## Sprint 3 — Terminal 1".

Start with T1.1 (verify Mnestra Tier 2). When ✅, proceed to T1.2 (Rumen deploy),
then T1.3 (GIF capture), then T1.4 (final smoke test). Post each task's result
to STATUS.md as you go. If you hit a blocker (especially on the Rumen deploy),
post 🛑 in STATUS.md with the exact error.

Never commit without explicit approval.
```

### Terminal 2

```
You are Terminal 2 (termdeck init setup wizards) for Sprint 3.
Plan: /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_3_PLAN.md

Execute only section "3. Terminal 2". You own:
  packages/cli/src/init-mnestra.js (new)
  packages/cli/src/init-rumen.js (new)
  packages/server/src/setup/** (new)
  packages/cli/src/index.js (subcommand routing)

Do NOT edit packages/client/public/, docs-site/, or docs/launch/.

Before starting: read the sprint plan, read docs/STATUS.md, append a Sprint 3
"started" entry under "## Sprint 3 — Terminal 2".

Start with T2.1 (init --mnestra). When ✅, proceed to T2.2 (init --rumen), then
T2.3 (commit). The commit in T2.3 waits on T1 confirming the Rumen deploy
manual flow works — watch STATUS.md for T1's "✅ T1.2 rumen deploy verified"
entry before committing.

Never commit without explicit approval.
```

### Terminal 3

```
You are Terminal 3 (docs-site deployment + content sync) for Sprint 3.
Plan: /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_3_PLAN.md

Execute only section "4. Terminal 3". You own:
  docs-site/** (entire directory)
  packages/client/public/index.html (ONLY the help button URL, coordinated
    with T4 via STATUS.md before editing)

Do NOT edit packages/server/**, packages/cli/**, docs/launch/**, or
docs/screenshots/**.

Before starting: read the sprint plan, read docs/STATUS.md, append a Sprint 3
"started" entry under "## Sprint 3 — Terminal 3".

Start with T3.1 (build check). When ✅, proceed through T3.2 → T3.6 in order.
The T3.3 Vercel deploy requires you to interactively log in to Vercel — if you
hit that prompt, pause and post a 🛑 asking Josh to paste the login credentials
or run the deploy himself. T3.4 coordinated edit of index.html waits for your
Sprint-3-only claim in STATUS.md — claim the file, do the edit, release.

Never commit without explicit approval.
```

### Terminal 4

```
You are Terminal 4 (launch assets + name dispute + joshuaizzard.com) for Sprint 3.
Plan: /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_3_PLAN.md

Execute only section "5. Terminal 4". You own:
  docs/launch/** (all launch copy)
  docs/name-dispute-analysis.md
  /Users/joshuaizzard/Documents/Graciella/joshuaizzard-dev/** (project cards)

Do NOT touch packages/**, docs-site/**, docs/screenshots/**, or any other
source code or docs files outside your owned paths.

Before starting: read the sprint plan, read docs/STATUS.md, append a Sprint 3
"started" entry under "## Sprint 3 — Terminal 4".

Start with T4.1 (name dispute analysis) FIRST. If any name comes back 🔴 red
risk, post a 🛑 blocker in STATUS.md and pause until Josh decides. If all are
🟢 green or 🟡 yellow, proceed with T4.2 → T4.9 in order. Your blog posts
reference screenshots from docs/screenshots/ — those are captured by T1, so
watch for T1.3 ✅ before finalizing the blog posts' image references.

Never commit without explicit approval.
```

---

## 8. End-of-sprint protocol

When every terminal posts `— end of Sprint 3 session —`:

1. Josh reads `docs/STATUS.md` top to bottom.
2. Reviews diffs in each scope:
   - TermDeck repo: T2 wizards, T3 docs-site, T4 launch docs, T1 screenshots
   - joshuaizzard-dev repo: T4 project cards
   - Rumen repo: no changes expected (T1 only deploys, doesn't edit source)
   - Mnestra repo: no changes expected
3. Scoped commits per terminal:
   - T1 docs + screenshots → `docs: sprint 3 verification logs and launch screenshots`
   - T2 wizards → (already committed by T2 per section 3.T2.3)
   - T3 docs-site updates → (already committed by T3)
   - T4 launch copy → `docs/launch: show HN post, X thread, playbook, three blog drafts, name analysis`
4. Push all three repos.
5. Verify Vercel docs-site is live, verify joshuaizzard.com shows new TermDeck card.
6. **Declare ship-ready.** Schedule launch for next Tuesday or Wednesday 8am PT.

---

## 9. Out of scope for Sprint 3

- Cursor-position-after-resize cosmetic fix (still FOLLOWUP)
- Theme dropdown relocation (still FOLLOWUP)
- Status/config buttons wiring (still FOLLOWUP)
- Claude bot Q&A feature (Sprint 4)
- Flashback rename propagation (Sprint 4 — `FLASHBACK · <project>` header)
- Flashback history drawer tab (Sprint 4)
- Local embeddings via Ollama (Sprint 5)
- Windows installer verification (Sprint 5)
- Translated READMEs (Sprint 5+)

---

**End of SPRINT_3_PLAN.md.**
