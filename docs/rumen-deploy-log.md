# Rumen Supabase Edge Function Deploy Log

**Sprint:** 3 / Terminal 1 / T1.2
**Date:** 2026-04-14
**Status:** 🛑 **BLOCKED** on Supabase credentials + required manual dashboard steps. See "Blockers" section.
**Project:** `luvvbrpaopnblvxdxwzb` (inferred from `~/.termdeck/secrets.env` → `SUPABASE_URL`)

> **Naming note:** Narrative uses **Mnestra** — the final name for the memory store after a three-stage Sprint 3 rename chain (Engram 🔴 → Mnemos 🔴 → Ingram ❌ → Mnestra 🟢). As of commit `30d04f2` the source code is fully renamed: `packages/server/src/mnestra-bridge/`, runtime log prefix `[mnestra-bridge]`, config field names `mnestraMode` / `mnestraWebhookUrl`, and the client Flashback toast at `packages/client/public/index.html:1904` renders `Mnestra — possible match`. Underlying SQL (`memory_items`, `memory_sessions`, `memory_hybrid_search`) was always naming-agnostic, so no DB changes are required.

## TL;DR

- Rumen **migration 001 (tables) is already applied** to production Supabase — `rumen_jobs`, `rumen_insights`, `rumen_questions` all exist with seed rows from a local `test-rest` run on 2026-04-13. The plan was written as if they would need to be created; they don't.
- Rumen has **never been deployed as an Edge Function**. No `triggered_by='schedule'` rows exist. The one row in `rumen_jobs` is `triggered_by='test-rest'` from the `scripts/smoke-test-rumen-rest.ts` script.
- **Two separate credential blockers prevent automated deploy:**
  1. `SUPABASE_ACCESS_TOKEN` in `~/.zshrc` returns **401 Unauthorized** against `https://api.supabase.com/v1/projects` — stale/revoked/wrong-scope. Blocks `supabase link`, `supabase functions deploy`, `supabase secrets set`.
  2. Rumen's `DATABASE_URL` / `DIRECT_URL` in `/Users/joshuaizzard/Documents/Graciella/rumen/.env` return **`FATAL: Tenant or user not found`** from the Shared Pooler and **`password authentication failed`** from the direct host — stale db password. Blocks `psql` migrations and `npm run test:local`.
- Migration 002 (`pg_cron` schedule) **also requires manual Supabase dashboard work** before it can apply cleanly (enable `pg_cron` + `pg_net` extensions, insert `rumen_service_role_key` into Supabase Vault). The SQL file contains explicit comments spelling this out.
- **A full manual deploy procedure** (no Supabase CLI auth needed — everything via the dashboard) is documented below. Josh can follow it himself in ~10 minutes.

## Current production state (queried 2026-04-14T23:40Z)

All probed via the Supabase REST API using `SUPABASE_SERVICE_ROLE_KEY` (the one secret that still works).

| Table | HTTP | Rows | Notes |
|---|---|---|---|
| `rumen_jobs` | 200 | ≥1 | `eafb64a4-…` triggered_by=`test-rest`, status=`done`, 20 sessions processed, 1 insight, 2026-04-13T00:05:51Z |
| `rumen_insights` | 200 | ≥1 | `2f2a1f01-…` insight_text=`"Pattern: \"fact\" memories appear across 2 projects (global, termdeck)..."`, confidence=0.7, projects=`[global, termdeck]` — heuristic Relate-phase insight (not Haiku Synthesize) |
| `rumen_questions` | 200 | 0 | empty (v0.3 feature) |
| `memory_items` | 200 | ~3,451 | Mnestra memory store |
| `memory_sessions` | 200 | many | Mnestra sessions |

**Conclusion:** migration 001 is applied. Migration 002 has never been applied (no `cron.job` state accessible over REST, and no `schedule`-triggered rows in `rumen_jobs`).

## Preflight tool inventory

| Tool | Present? | Notes |
|---|---|---|
| `supabase` CLI | ✅ v2.75.0 | Outdated (latest v2.90.0) but functional for this deploy if auth worked |
| `psql` | ✅ from Postgres.app | Auth fails against both Shared Pooler and direct URL |
| `deno` | ❌ | Not needed for remote deploy (Supabase builds the function on their side) |
| `ffmpeg` | ✅ | For T1.3 GIF encoding |
| `curl` | ✅ | Used for REST probes and function test |

## T1.2 step-by-step execution log

### Step 1 — Install Supabase CLI ✅ (already present)

```
$ supabase --version
2.75.0
```

### Step 2 — `supabase link --project-ref luvvbrpaopnblvxdxwzb` ❌ BLOCKED

```
$ cd /Users/joshuaizzard/Documents/Graciella/rumen
$ supabase link --project-ref luvvbrpaopnblvxdxwzb
Unexpected error retrieving remote project status: {"message":"Unauthorized"}
```

**Diagnosis:**

- `SUPABASE_ACCESS_TOKEN` is exported from `~/.zshrc` (value `sbp_…`, 44 chars).
- `supabase login --token $SUPABASE_ACCESS_TOKEN` succeeds ("You are now logged in. Happy coding!") and stores the token under the CLI's "supabase" profile.
- But every subsequent management-API call returns `{"message":"Unauthorized"}`.
- Direct probe: `curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects` → **HTTP 401**.

**Conclusion:** the token in `~/.zshrc` is stale, revoked, or scoped wrong. **Josh needs to refresh it** (see Blockers → Fix 1 below).

### Step 3 — `psql "$DATABASE_URL" -f migrations/001_rumen_tables.sql` ⏭ skipped (already applied)

Not run — table state probe confirmed `rumen_jobs`, `rumen_insights`, `rumen_questions` already exist. Running 001 idempotently would have been fine but unnecessary.

Attempted `psql` anyway just to sanity-check the `.env` credentials before planning migration 002:

```
$ psql "$DIRECT_URL" -c "SELECT 1;"
psql: error: FATAL:  password authentication failed for user "postgres.luvvbrpaopnblvxdxwzb"

$ psql "$(echo $DATABASE_URL | sed 's/?.*//')" -c "SELECT 1;"
psql: error: FATAL:  Tenant or user not found
```

**Diagnosis:** both Rumen URLs in `/Users/joshuaizzard/Documents/Graciella/rumen/.env` are stale. The Shared Pooler rejects the user, and the direct-host URL has a mis-shaped user (`postgres.luvvbrpaopnblvxdxwzb` is the pooler user format, not the direct user format — `postgres` without the suffix is what the direct host expects). Even after normalizing the username, the password itself appears not to match.

**Conclusion:** Josh needs to refresh Rumen's `.env` with the current connection strings (see Blockers → Fix 2 below).

### Step 4 — `supabase functions deploy rumen-tick --no-verify-jwt` ❌ BLOCKED

Not attempted — same `Unauthorized` as step 2 would apply.

Edge function source reviewed at `rumen/supabase/functions/rumen-tick/index.ts`. It is straightforward: imports `runRumenJob` + `createPoolFromUrl` from `npm:@jhizzard/rumen@0.1.0` (**note:** version pin is 0.1.0, not 0.2.0 — on deploy, npm will resolve the latest 0.1.x, which means the Deno function runs the **v0.1** code path without the Synthesize phase until this pin is bumped. Flagging as a follow-up).

The function reads `DATABASE_URL` from `Deno.env`, runs `runRumenJob(pool, { triggeredBy: 'schedule' })`, and returns a JSON summary. Minimal surface area, low deploy risk.

### Step 5 — Test the function ❌ BLOCKED (requires step 4)

Not attempted — the function doesn't exist yet on Supabase's side.

### Step 6 — `psql "$DATABASE_URL" -f migrations/002_pg_cron_schedule.sql` ❌ BLOCKED

Not attempted. This step is blocked on **three** separate things, not just credentials:

1. **`psql` auth** — see step 3 diagnosis.
2. **`pg_cron` extension must be enabled** in the Supabase dashboard (Database → Extensions). Cannot be done over REST.
3. **`pg_net` extension must be enabled** the same way.
4. **Vault secret `rumen_service_role_key` must be inserted** before the `cron.schedule()` SQL can reference it. The current migration SQL reads `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumen_service_role_key')`, which returns NULL if the secret doesn't exist, which would silently produce a broken `Authorization: Bearer ` header on every cron tick.

### Step 7 — Wait 15 minutes, verify `rumen_jobs` ⏭ deferred

Blocked on steps 4–6.

### Step 8 — `npm run test:local` (warm insight pool) ❌ BLOCKED

```
$ cd /Users/joshuaizzard/Documents/Graciella/rumen
$ npm run test:local
```

Not run. Would use the same broken `DATABASE_URL` from rumen/.env → would fail on connect.

### Step 9 — Write this doc ✅

You are reading it.

---

## Blockers

### 🛑 Blocker 1 — Supabase Personal Access Token is 401

**Symptom:** Every Supabase CLI management-API call (`supabase link`, `supabase functions list`, `supabase projects list`, `supabase secrets set`) returns `{"message":"Unauthorized"}`.

**Root cause:** `SUPABASE_ACCESS_TOKEN` in `~/.zshrc` (export line, `sbp_…`) is stale or revoked. Direct curl to `https://api.supabase.com/v1/projects` with the token returns HTTP 401.

**Fix — Josh to run:**

1. Open https://supabase.com/dashboard/account/tokens in a browser.
2. Click "Generate new token", name it `termdeck-sprint3` (or similar), copy the `sbp_…` value.
3. Update `~/.zshrc`:
   ```sh
   export SUPABASE_ACCESS_TOKEN="sbp_<NEW_TOKEN_HERE>"
   ```
4. `source ~/.zshrc` in every shell, or open a new TermDeck panel.
5. Sanity check: `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects` should print `200`.
6. Post `✅ T1 → T1: supabase token refreshed` in STATUS.md, and I'll retry the deploy from step 2.

### 🛑 Blocker 2 — Rumen `.env` Postgres credentials are stale

**Symptom:** Both `DATABASE_URL` (Shared Pooler, port 6543) and `DIRECT_URL` (direct host, port 5432) in `/Users/joshuaizzard/Documents/Graciella/rumen/.env` fail auth:

```
psql: error: FATAL: Tenant or user not found            (pooler)
psql: error: FATAL: password authentication failed       (direct)
```

**Root cause:** Either the db password was rotated, or the URL-encoded password in `.env` is malformed, or the pooler tenant URL format changed.

**Fix — Josh to run:**

1. Open https://supabase.com/dashboard/project/luvvbrpaopnblvxdxwzb/settings/database in a browser.
2. Under "Connection string":
   - Copy the **Shared Pooler** IPv4-compatible URL (NOT the Dedicated Pooler — it's IPv6-only and fails silently from serverless runtimes). This goes in `DATABASE_URL`.
   - Copy the **Session Mode** (port 5432) direct URL. This goes in `DIRECT_URL`.
3. If the password isn't already filled into the copied URL, click "Reset database password" to generate a new one, URL-encode any special characters.
4. Update `/Users/joshuaizzard/Documents/Graciella/rumen/.env` with the new URLs.
5. Sanity check: `psql "$DIRECT_URL" -c "SELECT count(*) FROM rumen_jobs;"` should print `1` (the existing test-rest row).
6. Post `✅ T1 → T1: rumen .env refreshed` in STATUS.md.

### 🛑 Blocker 3 — Manual Supabase dashboard steps for migration 002

These cannot be automated via CLI even with working auth:

1. **Enable `pg_cron` extension** — https://supabase.com/dashboard/project/luvvbrpaopnblvxdxwzb/database/extensions → search `pg_cron` → toggle on.
2. **Enable `pg_net` extension** — same page → search `pg_net` → toggle on.
3. **Insert a vault secret** `rumen_service_role_key` containing the service-role JWT:
   ```sql
   -- Run this in the Supabase SQL editor, replacing <secret> with the
   -- current service_role key from Project Settings → API → service_role.
   INSERT INTO vault.secrets (name, secret)
   VALUES ('rumen_service_role_key', '<secret>')
   ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;
   ```

### ⚠ Note — `ANTHROPIC_API_KEY` missing

Not a blocker, but:

Josh's `~/.termdeck/secrets.env` and Rumen's `.env` both lack `ANTHROPIC_API_KEY`. Per Sprint 2 T4.1, Rumen's Synthesize phase gracefully falls back to placeholder insights when the key is missing (logs once, then silently writes placeholders). So Rumen will run and produce rows — just not full Haiku-synthesized insights — until Josh adds a key.

When/if Josh adds one:
- Add `ANTHROPIC_API_KEY=sk-ant-…` to `~/.termdeck/secrets.env` (already referenced in `config.yaml` as `${ANTHROPIC_API_KEY}`).
- After re-deploy: `supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"` (once blocker 1 is resolved).

### ⚠ Note — Edge function pins `@jhizzard/rumen@0.1.0`

`rumen/supabase/functions/rumen-tick/index.ts:23` imports `npm:@jhizzard/rumen@0.1.0`. The Rumen package published last sprint is `0.2.0` which adds the Haiku Synthesize phase, cost guardrails, and citation IDs. The current pin means the Edge Function will run v0.1 behavior — heuristic insights only, no synthesize — even after deploy. **Bump to `@0.2.0`** before deploying to get full v0.2 behavior. Source edit belongs in Terminal 2 or a Rumen-repo followup, not T1.

---

## Manual deploy procedure (for Josh, once unblocked)

Given that the CLI path is multiply blocked, the **fastest path to green** is to deploy entirely through the Supabase dashboard. This avoids fixing blocker 1 and 2 entirely for the one-shot deploy, though Josh should still fix them for future automation.

### A. Deploy the edge function via dashboard upload

1. Log in to https://supabase.com/dashboard/project/luvvbrpaopnblvxdxwzb/functions .
2. Click "New Function", name it `rumen-tick`.
3. Copy-paste the contents of `/Users/joshuaizzard/Documents/Graciella/rumen/supabase/functions/rumen-tick/index.ts` into the editor.
4. **Before saving**, change line 23 from `npm:@jhizzard/rumen@0.1.0` to `npm:@jhizzard/rumen@0.2.0` so the deployed code runs the synthesize phase.
5. Toggle **"Verify JWT"** OFF so pg_cron can invoke it with the vault-stored service-role bearer.
6. Click "Deploy Function".
7. Copy the resulting URL — it will be `https://luvvbrpaopnblvxdxwzb.supabase.co/functions/v1/rumen-tick`.

### B. Set function secrets via dashboard

Same page → "Manage secrets" → add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Shared Pooler IPv4 URL from Project Settings → Database → Connection string |
| `ANTHROPIC_API_KEY` | *(skip if none — Rumen falls back to placeholders)* |

### C. Test the function via curl

Use the **anon** key (not service_role — anon is enough because Verify JWT is off):

```sh
curl -i -X POST "https://luvvbrpaopnblvxdxwzb.supabase.co/functions/v1/rumen-tick" \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `HTTP 200` with a JSON body like:

```json
{
  "ok": true,
  "summary": {
    "job_id": "<uuid>",
    "status": "done",
    "sessions_processed": <N>,
    "insights_generated": <M>
  }
}
```

Then verify a new row landed in `rumen_jobs`:

```sh
curl -s "https://luvvbrpaopnblvxdxwzb.supabase.co/rest/v1/rumen_jobs?select=id,triggered_by,status,started_at&order=started_at.desc&limit=3" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: a row with `triggered_by` = `schedule` (because the function defaults to `triggeredBy: 'schedule'` per the source).

### D. Enable extensions and apply migration 002 via the SQL editor

1. Go to https://supabase.com/dashboard/project/luvvbrpaopnblvxdxwzb/database/extensions
2. Search `pg_cron`, toggle on.
3. Search `pg_net`, toggle on.
4. Go to https://supabase.com/dashboard/project/luvvbrpaopnblvxdxwzb/sql/new
5. First, insert the vault secret:
   ```sql
   INSERT INTO vault.secrets (name, secret)
   VALUES ('rumen_service_role_key', '<paste current service_role key>')
   ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;
   ```
6. Then paste this **project-ref-substituted version of migration 002**:
   ```sql
   SELECT cron.unschedule('rumen-tick')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumen-tick');

   SELECT cron.schedule(
     'rumen-tick',
     '*/15 * * * *',
     $$
       SELECT net.http_post(
         url     := 'https://luvvbrpaopnblvxdxwzb.supabase.co/functions/v1/rumen-tick',
         headers := jsonb_build_object(
           'Content-Type',  'application/json',
           'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumen_service_role_key')
         ),
         body    := '{}'::jsonb
       );
     $$
   );

   -- Verify
   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'rumen-tick';
   ```
7. Click "Run". The final `SELECT` should return one row with `active = true`.

### E. Wait 15–30 minutes and verify

```sh
curl -s "https://luvvbrpaopnblvxdxwzb.supabase.co/rest/v1/rumen_jobs?select=id,triggered_by,status,started_at&order=started_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: 1–2 new rows with `triggered_by = schedule`.

### F. Inspect insights

```sh
curl -s "https://luvvbrpaopnblvxdxwzb.supabase.co/rest/v1/rumen_insights?select=insight_text,confidence,projects&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: insights from recent cron runs. If they are all placeholder-shaped ("Pattern: 'fact' memories appear across N projects…"), that's the no-ANTHROPIC_API_KEY fallback working. Add the key + redeploy for Haiku synthesis.

---

## What happens next for T1.2

Two possible paths:

**Path A — Josh unblocks automation.** Fixes blockers 1 and 2 (refresh token + refresh rumen/.env), posts `✅ T1 → T1: both creds refreshed` in STATUS.md. I resume and execute steps 2, 4, 6, 8 via CLI. Migration 002 manual dashboard pieces (extensions + vault secret) still need a human hand regardless.

**Path B — Josh deploys manually.** Follows the procedure above. Posts `✅ Rumen deployed via dashboard, edge function URL: …, first schedule run at: …`. I then append verification queries to this log and move on.

Either way, this log is updated in place with the resolution.

## Recommendation

Path B is faster and has no downside — the CLI blockers don't affect the edge function itself, only the tooling around it, and those tooling blockers still need fixing eventually for anyone writing `termdeck init --rumen` (T2's wizard). Josh can do the dashboard deploy in 10 minutes, and fixing the CLI creds becomes a Sprint 4 follow-up that doesn't block launch.
