# Sprint 2 — FOLLOWUP Parallel Build Plan

**Date:** 2026-04-13 (same day, evening)
**Owner:** Joshua Izzard
**Goal:** Close every remaining item in `docs/FOLLOWUP.md` (except API key rotation, which is a human-only task) using four parallel Claude Code terminals, same protocol as Sprint 1.

Sprint 1 shipped 23 items in ~2 hours. Sprint 2 has ~15 items, most smaller, so the budget is ~45–60 minutes.

---

## 0. Protocol — reuse Sprint 1's rules

Everything in **Sprint 1's `PLANNING_DOCUMENT.md` sections 0–2 and 9** still applies:

- File ownership is exclusive per terminal.
- `docs/STATUS.md` is the single coordination surface. **Append a new `# Sprint 2` header at the top of the file** and add per-terminal headers under it. Do not delete Sprint 1 entries — they are history.
- Glyphs: `⏳ ✅ ❌ 🔒 🔓 ❓ 🛑`.
- Never commit without Josh's go-ahead. Stage, write diff summary to STATUS.md, stop.
- Scope every `git add` carefully. Never `git add -A` inside the TermDeck repo.

Only the *ownership list* and the *task list* change. Everything else is identical.

---

## 1. Four-terminal split

| Terminal | Repo | Exclusive file ownership |
|---|---|---|
| **T1 — TermDeck Client UI** | `termdeck` | `packages/client/public/**` (only this directory) |
| **T2 — TermDeck Server / Config / Secrets / Packaging** | `termdeck` | `packages/server/src/**`, `packages/cli/src/**`, `config/**`, any new `~/.termdeck/secrets.env.example`, root `package.json` |
| **T3 — Mnestra** | `mnestra` | entire `/Users/joshuaizzard/Documents/Graciella/mnestra/` repo |
| **T4 — Rumen + docs-site + release prep** | `rumen` + `termdeck/docs-site/` | entire `/Users/joshuaizzard/Documents/Graciella/rumen/` repo, plus `termdeck/docs-site/` for the one-line sitemap fix |

**Hard rule reminder:** if a file isn't in your list, you cannot touch it. Post cross-terminal requests in STATUS.md if you need something from another terminal.

---

## 2. Terminal 1 — TermDeck Client UI

**Working dir:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns:** `packages/client/public/**`

**Context to load:**
1. `docs/FOLLOWUP.md` — your "T1 — client UI bugs surfaced in review" section.
2. `packages/client/public/index.html` — specifically the handler around line 942 (askAI), the switcher handler (search for `altKey`), and `refreshReplyTargets` around line 1569.
3. `docs/STATUS.md` — confirm no one else has claimed `packages/client/public/index.html`.

### F1.1 — macOS Alt key fix (HIGHEST, 5 minutes)

The switcher's `Alt+1..9` chord uses `e.key`, which on macOS produces `¡` instead of `1` when Option is held. Swap to `e.code`.

```
grep -n "altKey" packages/client/public/index.html
```

Replace the handler block. Pattern:

```js
// BEFORE
if (e.altKey && e.key >= '1' && e.key <= '9') { ... }

// AFTER
if (e.altKey && e.code >= 'Digit1' && e.code <= 'Digit9') {
  const n = parseInt(e.code.slice(5), 10);
  ...
}
// Also accept Alt+0 for the cycle chord if that was in there
```

**Acceptance:** open 4 panels, press `Option+1` / `Option+2` / etc. on macOS — focus switches. Verify vim in a panel still works after pressing Option.

### F1.2 — Switcher reparent + z-index fix (10 minutes)

The switcher mounts inside a `.panel` container and overlaps PTY content. Re-parent it to `document.body` (or the top toolbar) with `position: fixed; top: 8px; right: 12px; z-index: 1000`.

```
grep -n "switcher\|panel-switcher\|terminal-switcher" packages/client/public/index.html
```

Find the DOM build site, move it out of the per-panel template into either:
- a top-level `#global-switcher` div injected once into `<body>` on init, or
- a mount inside the existing top toolbar (preferred — keeps it in the dashboard chrome).

**Acceptance:** in a 4-panel layout the switcher tiles do not overlap any PTY text. Panels at maximum density (4x2) still show their full last-line.

### F1.3 — Reply target dropdown unique names (10 minutes)

`refreshReplyTargets` around line 1569 labels options as `${typeLabel} · ${project}`. Two panels of the same type in the same project collide.

**Minimal fix:** append a stable per-panel index derived from insertion order, so duplicate labels become `Claude Code · termdeck #2`, `Claude Code · termdeck #3`, etc.

Implementation: in `refreshReplyTargets`, after filtering out the current panel, group candidates by label and only suffix `#N` where the group has ≥2 panels. `#N` numbering should be by the order panels were opened (use the existing `state.sessions` insertion order — `Map` preserves it).

**Do not** implement editable labels in this sprint — that requires server support (`meta.label` + `PATCH /api/sessions/:id` extension) and is tracked for a future sprint.

**Acceptance:** open two Claude Code panels on the same project, open the reply form on a third panel, dropdown shows two distinct labels with `#1` and `#2` suffixes.

### F1.4 — T1.7 screenshots (10–15 minutes, last)

After F1.1–F1.3 land and the UI is stable, capture three PNGs for the README and docs site:

1. `docs/screenshots/dashboard-4panel.png` — 4 panels in 2x2 doing real work (one `claude`, one `htop`, one `node server`, one `ls`)
2. `docs/screenshots/info-tabs.png` — close-up of the info-tabs drawer open on one panel
3. `docs/screenshots/switcher.png` — switcher overlay visible with ≥4 panels

**Subagent delegation:** spawn a `general-purpose` subagent with Playwright or Puppeteer to automate the capture. Prompt the subagent with:
- "Connect to http://localhost:3000"
- "Create 4 sessions via `POST /api/sessions`"
- "Take a viewport screenshot at 1920x1080"
- "Open the info-tabs drawer on one panel and take a focused crop"
- "Close the drawer, verify switcher is visible, take a third crop"

**Coordinate with T2:** if T2 is mid-session-logs work when you run this, post `🛑 T1 → T2: need 5 min of server stability for F1.4 screenshots` in STATUS.md and wait for T2's ack. The screenshots must run against an unmodified server.

**Acceptance:** three PNGs exist in `docs/screenshots/`, each ≤500KB, each clearly shows the feature described.

---

## 3. Terminal 2 — TermDeck Server / Config / Secrets / Packaging

**Working dir:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns:** `packages/server/src/**`, `packages/cli/src/**`, `config/**`, `packages/server/package.json`, `packages/cli/package.json`, root `package.json`

**Context to load:**
1. `docs/FOLLOWUP.md` — sections "T2 — server deferred items" and "Security".
2. `packages/server/src/session-logger.js` — T2.5 session log summarizer.
3. `packages/server/src/mnestra-bridge/index.js` — T2.1 bridge module.
4. `packages/server/src/index.js` — config loading near the top.
5. `config/config.example.yaml` — current config shape.
6. `docs/STATUS.md` — post Sprint 2 start entry.

### F2.1 — Credential leak audit (5 minutes, run FIRST)

Non-exhaustive repo scan to confirm `~/.termdeck/config.yaml` secrets haven't leaked into any committed repo.

```
grep -rI 'sk-proj-\|sb_secret_' ~/Documents/Graciella 2>/dev/null | grep -v node_modules | grep -v '\.log:' | grep -v 'memory_items'
```

If any hits: post `🛑 T2: credential leak at <path>` in STATUS.md. Otherwise post `✅ F2.1 no leaks detected`. Do this before any other work.

### F2.2 — Secrets migration to `~/.termdeck/secrets.env` (25 minutes, HIGHEST)

Refactor config loading so secrets live in `~/.termdeck/secrets.env` (dotenv format) rather than `~/.termdeck/config.yaml`. Plaintext secrets in YAML are the root cause of the credential-surface issue.

**Design:**

1. Add `dotenv` as a dependency in `packages/server/package.json`.
2. In `packages/server/src/index.js` (or a new `packages/server/src/config.js` module), load `~/.termdeck/secrets.env` **first**, then merge with `config.yaml`. Secrets take precedence. Support env var substitution in yaml values: `supabaseKey: ${SUPABASE_SERVICE_ROLE_KEY}`.
3. Ship a `~/.termdeck/secrets.env.example` via a new config file `config/secrets.env.example` that lists the expected keys with placeholder values:
   ```
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   ```
4. Update `config/config.example.yaml` to reference the env vars instead of hardcoding:
   ```yaml
   rag:
     enabled: true
     supabaseUrl: ${SUPABASE_URL}
     supabaseKey: ${SUPABASE_SERVICE_ROLE_KEY}
     openaiApiKey: ${OPENAI_API_KEY}
   ```
5. Add a one-time migration hint on server startup: if `config.yaml` has inline secrets AND `secrets.env` doesn't exist, log `[config] WARNING: secrets in config.yaml are deprecated — move them to ~/.termdeck/secrets.env` and continue.
6. **Do not auto-migrate Josh's existing `config.yaml`** — that's his file, and the backward-compat warning above is enough.

**Acceptance:**
- Server starts with secrets-only in `secrets.env` and `supabaseUrl: ${SUPABASE_URL}` in yaml.
- Server still starts with Josh's existing inline-secret `config.yaml` (backward compat, just logs a deprecation warning).
- `config/secrets.env.example` is committed; `secrets.env` itself is in `.gitignore` (verify).

### F2.3 — Session-logs investigation + fix (10 minutes)

During Sprint 1 review, `~/.termdeck/sessions/` did not appear after running with `--session-logs`. Three possible causes listed in FOLLOWUP.md. Investigate, find the actual cause, fix.

```
grep -n "session-logs\|sessionLogs\|SessionLogger\|~/.termdeck/sessions" packages/server/src/*.js packages/cli/src/*.js
```

Likely culprits:
- CLI flag `--session-logs` doesn't flip a config key the server reads.
- Session logger writes to a different path than what the docs claim.
- The summarize call is blocking on a missing `ANTHROPIC_API_KEY` and silently no-oping without writing the markdown skeleton.

**Acceptance:** with `ANTHROPIC_API_KEY` set in `~/.termdeck/secrets.env`, starting `termdeck --session-logs`, opening a shell panel, running commands, closing the panel, and checking `ls ~/.termdeck/sessions/` returns a dated markdown file with frontmatter, command list, and a Haiku-generated summary paragraph.

### F2.4 — Docker prebuild verification (subagent-delegated, 15 minutes)

Delegate to a `general-purpose` subagent. Prompt:

> "Run `docker run --rm -v /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck:/app -w /app node:24-alpine sh -lc 'rm -rf node_modules && npm install --no-save'` and report whether the install succeeds without a C++ compiler. If it fails, capture the failing package and error. If Docker isn't running, say so."

While the subagent runs the Docker command, continue with F2.3.

**Acceptance:**
- If Docker succeeds → post `✅ F2.4 prebuilds verified on alpine` in STATUS.md, mark T2.6 in FOLLOWUP.md as done.
- If Docker fails → capture the failing package, open F2.4a to pin a different prebuild-capable version, retry.
- If Docker isn't available → post `❌ F2.4 Docker not available, requires manual run later` and move on.

---

## 4. Terminal 3 — Mnestra

**Working dir:** `/Users/joshuaizzard/Documents/Graciella/mnestra`

**Owns:** entire Mnestra repo.

**Context to load:**
1. `docs/FOLLOWUP.md` — "T3 — Mnestra deferred items" section, and the webhook defects surfaced in Sprint 1 Phase D.
2. `src/webhook-server.ts`, `src/status.ts`, `src/remember.ts`, `src/recall.ts`.
3. `mcp-server/index.ts` — where you'll add the `serve` subcommand.
4. `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/STATUS.md` — the one and only STATUS file, cross-repo.

### F3.1 — `mnestra serve` CLI subcommand (15 minutes, HIGHEST)

`startWebhookServer()` is exported but has no CLI entry. Users have to run the bare `node -e "require('./dist/src/webhook-server.js').startWebhookServer()"` one-liner which is ugly and undiscoverable.

**Add a subcommand to `mcp-server/index.ts`:**

```ts
// At top of mcp-server/index.ts, before the default MCP stdio flow:
const arg = process.argv[2];
if (arg === 'serve') {
  const { startWebhookServer } = await import('../src/webhook-server.js');
  startWebhookServer();
  // Don't continue to the MCP stdio setup — serve is exclusive.
} else {
  // existing MCP stdio flow
}
```

(Exact import path depends on how tsc resolves — check `dist/mcp-server/index.js` after build.)

**Alternatively:** add a separate `bin` entry in `package.json`:
```json
"bin": {
  "mnestra": "./dist/mcp-server/index.js",
  "mnestra-serve": "./dist/src/webhook-cli.js"
}
```
and create a tiny `src/webhook-cli.ts` that just calls `startWebhookServer()`.

**Recommended:** the subcommand approach — `mnestra serve` reads cleaner than `mnestra-serve`.

**Acceptance:**
- `mnestra serve` on the CLI starts the webhook on `$MNESTRA_WEBHOOK_PORT` (default 37778).
- `mnestra` with no args or stdin attached still launches the MCP stdio server (backward compat).
- `mnestra --help` mentions the `serve` subcommand.
- Update `README.md` tool reference table with a "Running the webhook" section.

### F3.2 — Malformed JSON → 400 (5 minutes)

In `src/webhook-server.ts` `readJsonBody`, `JSON.parse` throws on invalid input, caught by the outer handler which sends 500. HTTP semantics say malformed request body is 400.

Wrap the parse:

```ts
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error('invalid JSON body');
    (e as Error & { httpStatus?: number }).httpStatus = 400;
    throw e;
  }
}
```

And in the outer handler, respect `httpStatus` if present before defaulting to 500. Add a unit test in `tests/webhook-server.test.ts` covering the malformed-body case.

**Acceptance:** `curl -X POST :37778/mnestra -d 'not json'` returns 400, not 500.

### F3.3 — `memoryStatus` 1000-row cap fix (20 minutes)

Sprint 1 Phase D showed `total_active: 3397` but `by_project` / `by_source_type` only summed to ~1000 each. That's the PostgREST default row cap on the SELECT the status aggregator uses.

**Investigate:**

```
grep -n "from memory_items\|memory_items'" src/status.ts
```

The current implementation probably does a `select('project, source_type, category')` with no limit, hits the PostgREST default of 1000 rows, then JS-aggregates. Fix options:

1. **Add `.limit(100000)` explicitly** — simple, works up to ~100k memories. Good enough for now.
2. **Use a Supabase RPC** — write a SQL function `memory_status_aggregation()` that does the GROUP BY server-side and returns the buckets. Proper fix. Requires a new migration.

**Recommended:** option 2. Add `migrations/006_memory_status_rpc.sql`:

```sql
create or replace function memory_status_aggregation()
returns table (
  total_active bigint,
  sessions     bigint,
  by_project   jsonb,
  by_source_type jsonb,
  by_category  jsonb
)
language sql stable
as $$
  select
    (select count(*) from memory_items where is_active and not archived) as total_active,
    (select count(*) from memory_sessions) as sessions,
    (select jsonb_object_agg(project, c) from (
      select project, count(*) as c from memory_items
      where is_active and not archived
      group by project
    ) p) as by_project,
    (select jsonb_object_agg(source_type, c) from (
      select source_type, count(*) as c from memory_items
      where is_active and not archived
      group by source_type
    ) s) as by_source_type,
    (select jsonb_object_agg(category, c) from (
      select category, count(*) as c from memory_items
      where is_active and not archived and category is not null
      group by category
    ) cat) as by_category;
$$;
```

Update `src/status.ts` to call `supabase.rpc('memory_status_aggregation').single()`.

**Apply the migration to Josh's production Supabase** the same way Sprint 1 applied `005_v0_1_to_v0_2_upgrade.sql` — paste into Supabase SQL editor, run, confirm "Success".

**Acceptance:**
- `op: status` on the webhook returns `by_project` that sums to `total_active` (3,397 at time of writing).
- Unit test added to `tests/webhook-server.test.ts` with a mocked aggregation RPC result.
- Migration committed and applied to production.

### F3.4 — `is_active` write-path audit (10 minutes)

During Sprint 1 Phase D, `by_source_type` showed zeros for `fact` and `preference` source types even though memories existed. Check `src/remember.ts` — does it explicitly set `is_active: true` on insert? If the DB default handles it, verify the default is `true`. Post findings to STATUS.md. Likely a no-op (F3.3 fix will reveal the real counts), but worth the 10 minutes.

### F3.5 — Bump to v0.2.0 + tag + release notes prep (5 minutes, last)

- Bump `package.json` version from whatever it currently is to `0.2.0`.
- Verify `CHANGELOG.md` has a `[0.2.0] - 2026-04-13` heading at the top (T3 already did this in Sprint 1 per the plan — verify, don't rewrite).
- Do NOT run `git tag` or `npm publish` — leave for Josh's final review.
- Post `✅ F3.5 v0.2.0 staged, ready for tag+publish` in STATUS.md.

---

## 5. Terminal 4 — Rumen + docs-site + release prep

**Working dir:** `/Users/joshuaizzard/Documents/Graciella/rumen` (primary) + `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site` (secondary)

**Owns:**
- entire Rumen repo
- `termdeck/docs-site/` directory

**Context to load:**
1. `docs/FOLLOWUP.md` — "T4 — Rumen + docs site deferred items" and "Cross-project" sections.
2. `rumen/scripts/test-rest.ts` — the mystery file.
3. `termdeck/docs-site/astro.config.mjs` — for the sitemap fix.
4. `termdeck/docs/STATUS.md`.

### F4.1 — Astro sitemap warning (2 minutes, first)

```
grep -n "site:\|integrations" termdeck/docs-site/astro.config.mjs
```

Add `site: 'https://termdeck.dev'` (or whichever domain you're planning to deploy at; use the vercel.app preview URL if no custom domain yet) as a top-level option in the config object. Rebuild and verify the `[WARN] [@astrojs/sitemap]` line is gone.

**Acceptance:** `cd docs-site && npm run build` emits no sitemap warning.

### F4.2 — `scripts/test-rest.ts` decision (5 minutes)

Read the file in full. Determine whether it's:

- **(a)** A Rumen-side integration smoke test against Mnestra's new `:37778` webhook. Keep it. Rename for clarity if needed (e.g., `scripts/smoke-test-mnestra-webhook.ts`). Add a 1-paragraph header comment explaining its purpose.
- **(b)** A generic REST helper unrelated to Rumen's job. Decide: extract to a shared package (probably overkill for v0.2) or delete.
- **(c)** Scaffolding for v0.3 question generation. The plan parked v0.3 as out-of-scope. Delete or move to a `_future/` branch.

Post the decision to STATUS.md. Execute it. Most likely outcome: option (a), keep with a clarifying header.

**Acceptance:** `scripts/test-rest.ts` is either renamed with a clear purpose comment, or deleted with a STATUS.md explanation.

### F4.3 — Rumen CI integration test monitoring (subagent-delegated, runs in background)

Spawn a `general-purpose` subagent with this prompt:

> "Monitor the latest GitHub Actions workflow run on github.com/jhizzard/rumen for commit 7e24750 (Rumen v0.2). Check status every 60 seconds for up to 10 minutes. When the run completes, report: (1) success or failure, (2) which jobs passed/failed, (3) the first error line from the integration-test job if it failed. Use `gh run list --repo jhizzard/rumen --limit 1` and `gh run view <id> --log` for investigation."

While it runs in background, continue with F4.4 and F4.5.

**Acceptance:**
- If CI green → post `✅ F4.3 rumen v0.2 CI green` in STATUS.md, mark T4.1/T4.2 in FOLLOWUP.md as done.
- If CI red → diagnose the error, fix, stage. Do not commit the fix alone — bundle with other T4 work for a single commit.

### F4.4 — Release prep checklist for all three repos (15 minutes)

Create `docs/RELEASE_CHECKLIST.md` in the TermDeck repo (yes, T4 owns `docs-site/` and `rumen/` and now gets this new cross-cutting file — post a lock in STATUS.md: `🔒 claiming: termdeck/docs/RELEASE_CHECKLIST.md`).

Content structure:

```markdown
# Release Checklist — TermDeck / Mnestra / Rumen v0.2

For each package, Josh runs these steps manually when ready to publish.

## Preflight (all repos)
- [ ] Working tree clean
- [ ] All tests green in CI
- [ ] CHANGELOG.md has a [0.2.0] heading dated today
- [ ] README.md install instructions match the package name and bin

## @jhizzard/mnestra v0.2.0
- [ ] `cd /Users/joshuaizzard/Documents/Graciella/mnestra`
- [ ] `npm run build && npm test` — expect 21+ green
- [ ] `npm version 0.2.0 --no-git-tag-version` (if not already bumped)
- [ ] `git tag v0.2.0 && git push --tags`
- [ ] `npm publish --access public`
- [ ] Verify on npmjs.com

## @jhizzard/rumen v0.2.0
- [ ] ... (same pattern)

## @jhizzard/termdeck v0.2.0 (rename)
- [ ] Verify `@jhizzard/termdeck` is actually available (not taken)
- [ ] ... (same pattern)
- [ ] Post-publish: `npx @jhizzard/termdeck` on a clean machine to smoke test
```

**Do not execute the publishes.** Only write the checklist. Josh runs it.

**Acceptance:** `docs/RELEASE_CHECKLIST.md` exists with all three packages fully specified. Josh reviews it.

### F4.5 — STATUS.md Sprint 2 epilogue (5 minutes, last)

After every other terminal has posted their `— end of session —` entry, T4 writes the Sprint 2 epilogue at the bottom of `STATUS.md`:

- Summary: items shipped ✅, items deferred to Sprint 3 ❌, total wall-clock time, per-terminal token usage.
- List any new items that surfaced mid-sprint and got added to `FOLLOWUP.md`.
- Link: commit hashes from each repo's `git log --oneline -3`.

---

## 6. Dependency graph

```
F1.4 screenshots  ──depends on──►  F2.3 session-logs stable server (soft — can also run against pre-sprint main)
F3.3 status fix   ──depends on──►  production migration applied (Josh runs it, T3 posts SQL in STATUS.md)
F4.4 release prep ──depends on──►  F3.5 mnestra version bump, F4 rumen version bump
F4.5 epilogue     ──depends on──►  T1–T3 end-of-session entries
```

Nothing blocks F1.1, F2.1, F2.2, F3.1, F3.2, F4.1, F4.2, F4.3. Start those immediately in each terminal.

---

## 7. Starting prompts — copy / paste

### Terminal 1 prompt

```
You are Terminal 1 (TermDeck Client UI) for Sprint 2, referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_2_FOLLOWUP_PLAN.md.

Execute only the section titled "2. Terminal 1 — TermDeck Client UI" and nothing else.
Do not edit any files outside packages/client/public/. Before starting, read the sprint
plan, read docs/STATUS.md, append a Sprint 2 "started" entry under a NEW "## Sprint 2 —
Terminal 1" header (do not delete Sprint 1 history). Check STATUS.md at the start of every
new task.

Start with F1.1 (macOS Alt key fix) — it's a 5-minute win. Then F1.2 → F1.3 → F1.4 in order.
Never mark a task ✅ unless acceptance criteria are met. Do not commit or push without approval.
```

### Terminal 2 prompt

```
You are Terminal 2 (TermDeck Server / Secrets) for Sprint 2, referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_2_FOLLOWUP_PLAN.md.

Execute only the section titled "3. Terminal 2 — TermDeck Server / Config / Secrets /
Packaging" and nothing else. Do not edit files under packages/client/public/, docs-site/,
or either of the mnestra or rumen repos. Read the sprint plan, read docs/STATUS.md, append a
Sprint 2 "started" entry under a NEW "## Sprint 2 — Terminal 2" header.

Run F2.1 FIRST (5-minute credential-leak audit) — it must complete before anything else in
any terminal. Then proceed with F2.2 → F2.3, delegating F2.4 to a general-purpose subagent
that you can run in parallel with F2.3. Never mark a task ✅ unless acceptance criteria are
met. Do not commit or push without approval.
```

### Terminal 3 prompt

```
You are Terminal 3 (Mnestra) for Sprint 2, referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_2_FOLLOWUP_PLAN.md.

Your working directory is /Users/joshuaizzard/Documents/Graciella/mnestra. Execute only the
section titled "4. Terminal 3 — Mnestra" and nothing else. Read the sprint plan, read
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/STATUS.md,
and append a Sprint 2 "started" entry under a NEW "## Sprint 2 — Terminal 3" header.

Start with F3.1 (mnestra serve CLI subcommand). When that's ✅, proceed with F3.2 → F3.3 →
F3.4 → F3.5 in order. F3.3 requires writing a migration that Josh must apply to production
— post the migration SQL in STATUS.md under "Cross-terminal requests" for Josh to run in the
Supabase SQL editor. Do not apply it yourself. Never mark a task ✅ unless acceptance criteria
are met. Do not commit or push without approval.
```

### Terminal 4 prompt

```
You are Terminal 4 (Rumen + docs-site + release prep) for Sprint 2, referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/SPRINT_2_FOLLOWUP_PLAN.md.

Your primary working directory is /Users/joshuaizzard/Documents/Graciella/rumen. You also
own /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site/
for the sitemap fix, and you will create /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/RELEASE_CHECKLIST.md.
Execute only the section titled "5. Terminal 4 — Rumen + docs-site + release prep" and nothing
else. Read the sprint plan, read the TermDeck STATUS.md, append a Sprint 2 "started" entry
under a NEW "## Sprint 2 — Terminal 4" header.

Start F4.1 (sitemap fix, 2 minutes) and F4.3 (subagent-delegated CI monitoring) in parallel.
Then F4.2 → F4.4 → F4.5. F4.5 is the very last task in the entire sprint — wait for T1, T2,
T3 to post their end-of-session entries before writing the epilogue. Never mark a task ✅
unless acceptance criteria are met. Do not commit or push without approval.
```

---

## 8. End-of-session protocol

Same as Sprint 1 §9:

1. Append `— end of Sprint 2 session —` to your terminal's STATUS.md header.
2. Summarize: shipped ✅, in-progress ⏳, failed ❌ with reasons.
3. Leave the working tree staged-but-not-committed. Josh reviews and commits.
4. Run `git status` one final time and log to STATUS.md.

Josh reads STATUS.md top to bottom, reviews each terminal's diffs, commits/squashes, pushes.

---

## 9. Out of scope for Sprint 2 (parked for Sprint 3)

- Editable panel labels (requires server `meta.label` + `PATCH` extension — tracked for Sprint 3).
- Claude Code lifecycle-hooks auto-capture plugin (parked since Sprint 1).
- Web viewer UI for Mnestra memories.
- Rumen v0.3 question generation.
- Rumen v0.4 self-tuning.
- Hub website.
- API key rotation (human-only task).
- Actual `npm publish` and `git tag` operations (Josh runs after reviewing `RELEASE_CHECKLIST.md`).

---

**End of SPRINT_2_FOLLOWUP_PLAN.md.**
