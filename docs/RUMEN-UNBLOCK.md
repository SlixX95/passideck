# Rumen Unblock Procedure

Context: Rumen is the async learning layer on top of Mnestra. It runs as a Supabase Edge Function triggered every 15 minutes by pg_cron. This doc captures the full unblock procedure after a cold start, hardened with lessons from the 2026-04-15 production deploy against the **petvetbid** Supabase project (ref `luvvbrpaopnblvxdxwzb`) — Mnestra's tables live inside that project; there is no separate "mnestra" project in the dashboard.

First successful deploy: 2026-04-15 18:45 UTC, job_id `295052b3-2328-45df-866b-fca59dfc3713`.

Target time after the gotchas below are internalized: 15–20 minutes.

---

## 🚨 READ THIS FIRST — Five gotchas that cost hours on first deploy

Every one of these cost real debugging time. Read them before you start.

1. **Supabase Connect modal has a hidden IPv4 toggle.** Under Transaction pooler there is a switch labeled "Use IPv4 connection (Shared Pooler)". It is OFF by default. If you leave it OFF you get the **Dedicated Pooler** URL (`db.<ref>.supabase.co:6543`) which is IPv6-only and fails with "Connection refused" from nearly all networks unless you pay for the IPv4 add-on. **Always toggle it ON** — the URL switches to the Shared Pooler format (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:6543`) which is IPv4 and works from anywhere. Never hand-build the URL; always copy verbatim from the modal after flipping the toggle.

2. **Supabase's password reset field takes the LITERAL string.** It does not URL-decode your input. If you type `p%40ss` thinking that's `p@ss`, your stored password is now the literal `p%40ss`. Always type the raw password into the dashboard, and URL-encode only when hand-building URIs later. Easiest escape hatch: choose alphanumeric-only passwords so no encoding is ever needed.

3. **Rumen uses `DATABASE_URL` ONLY — do NOT set `DIRECT_URL`.** Setting both causes a "Tenant or user not found" auth failure because the pooler username format clashes with direct-connection expectations. In `rumen/.env`, set only `DATABASE_URL` to the Shared Pooler URI.

4. **macOS 13 can't install Deno via Homebrew.** Brew's deno formula demands a full Xcode 15 install (not just Command Line Tools). Use Deno's official install script instead — it ships a prebuilt binary with zero build dependencies: `curl -fsSL https://deno.land/install.sh | sh`. Then add `export DENO_INSTALL="$HOME/.deno"` and `export PATH="$DENO_INSTALL/bin:$PATH"` to `~/.zshrc`.

5. **Rumen table schema may have drifted from old install attempts.** If you ran an earlier version of `termdeck init --rumen` that failed partway through, the `rumen_jobs` / `rumen_insights` / `rumen_questions` tables exist in an outdated shape. Migration 001 uses `CREATE TABLE IF NOT EXISTS`, which skips them, then tries to create indexes on missing columns and fails. Run the schema backfill in Step 5a **before** re-running the wizard.

---

## Step 1 — Refresh SUPABASE_ACCESS_TOKEN (~2 min)

1. Go to https://supabase.com/dashboard/account/tokens
2. Generate new token, name it `termdeck-rumen`
3. Edit `~/.zshrc`, replace the `export SUPABASE_ACCESS_TOKEN=...` line
4. Open a fresh shell (or `source ~/.zshrc`)
5. Verify:
   ```bash
   echo "$SUPABASE_ACCESS_TOKEN" | head -c 10
   supabase projects list
   ```
   The second command should list your projects. If it returns 401, the token is stale.

## Step 2 — Install Deno if missing (~2 min)

```bash
which deno
```

If not found:
```bash
curl -fsSL https://deno.land/install.sh | sh
```

Add to `~/.zshrc`:
```bash
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
```

Open a fresh shell and verify:
```bash
deno --version
```

**Do not use `brew install deno` on macOS 13** — it fails on the Xcode 15 requirement.

## Step 3 — Reset petvetbid DB password and build DATABASE_URL (~3 min)

1. Supabase Dashboard → petvetbid → Project Settings → Database → **Reset database password**.
2. **Use alphanumeric only** (e.g. `Rumen2026Temp`). Never paste URL-encoded characters.
3. Wait for the "Password updated" confirmation toast. If the form just re-renders silently, the reset did not take.
4. Top of dashboard → **Connect** (green button) → **Transaction pooler** tab.
5. **TOGGLE ON "Use IPv4 connection (Shared Pooler)"** — this is the critical step. The displayed URL will switch from `db.<ref>.supabase.co` to `aws-0-<region>.pooler.supabase.com` and the user will change from `postgres` to `postgres.<project_ref>`.
6. Type your raw password in the password input at the top of the modal. It live-substitutes into the displayed URL.
7. Copy the URL.
8. Edit `~/Documents/Graciella/ChopinNashville/SideHustles/Rumen/rumen/.env`:
   ```
   DATABASE_URL="<paste the copied URL here>"
   # DIRECT_URL intentionally omitted — see gotcha #3 above
   ```
   Do NOT append `?pgbouncer=true` — that is Prisma-only. libpq and node-postgres reject it.

9. Sanity check the connection:
   ```bash
   cd ~/Documents/Graciella/ChopinNashville/SideHustles/Rumen/rumen
   set -a; source .env; set +a
   psql "$DATABASE_URL" -c "select 1"
   ```
   Expect `(1 row)`.

### Troubleshooting psql errors

| Error | Cause & fix |
|-------|-------------|
| `could not connect to server ... Unix domain socket` | `$DATABASE_URL` is empty in your shell. `echo "$DATABASE_URL"` to confirm; re-source `.env`. |
| `password authentication failed for user postgres` | Password has unencoded specials, reset didn't save, or wrong user for chosen connection mode. Reset to alphanumeric-only and retry. |
| `Connection refused ... Is the server running on host "db.<ref>.supabase.co"` | You have the Dedicated Pooler URL. Go back to the Connect modal and toggle ON "Use IPv4 connection (Shared Pooler)". |
| `Tenant or user not found` | Either you have `DIRECT_URL` set (unset it) or you hand-built the URL (always copy verbatim from the dashboard). |
| `invalid URI query parameter: "pgbouncer"` | Strip `?pgbouncer=true` — it's Prisma-only, libpq rejects it. |
| `psql: command not found` | `brew install libpq && brew link --force libpq` |

## Step 4 — Enable pg_cron and pg_net extensions (~2 min)

Supabase renamed "Extensions" to **Integrations** in the new UI — same thing.

1. Dashboard → petvetbid → **Integrations** (sidebar)
2. Click **Cron** tile → Enable extension (schema: `pg_catalog`)
3. `pg_net` may not appear in the Integrations search. Enable it via **SQL Editor** instead:
   ```sql
   create extension if not exists pg_net;
   ```
4. Verify both are installed:
   ```sql
   select extname, extversion
   from pg_extension
   where extname in ('pg_cron', 'pg_net');
   ```
   Should return two rows.

## Step 5 — Add rumen_service_role_key to Supabase Vault (~2 min)

Migration 002 (pg_cron schedule) reads this secret by exact name.

1. Dashboard → petvetbid → **Settings → API** → copy the **service_role** key (NOT the anon key)
2. Dashboard → **Database → Vault** → **New secret**
3. Name: `rumen_service_role_key` (exact)
4. Secret: paste the service_role key
5. Save

## Step 5a — Schema drift backfill (~1 min, REQUIRED if you ever ran init-rumen before)

If your `rumen_jobs` / `rumen_insights` / `rumen_questions` tables exist from an earlier failed install, migration 001 will fail with `column "X" does not exist` errors. Run this one-shot backfill in **SQL Editor** before re-running the wizard:

```sql
-- rumen_jobs
ALTER TABLE rumen_jobs
  ADD COLUMN IF NOT EXISTS triggered_by         TEXT,
  ADD COLUMN IF NOT EXISTS status               TEXT,
  ADD COLUMN IF NOT EXISTS sessions_processed   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insights_generated   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_generated  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message        TEXT,
  ADD COLUMN IF NOT EXISTS source_session_ids   UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at         TIMESTAMPTZ;

-- rumen_insights
ALTER TABLE rumen_insights
  ADD COLUMN IF NOT EXISTS job_id               UUID,
  ADD COLUMN IF NOT EXISTS source_memory_ids    UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS projects             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS insight_text         TEXT,
  ADD COLUMN IF NOT EXISTS confidence           NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS acted_upon           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- rumen_questions
ALTER TABLE rumen_questions
  ADD COLUMN IF NOT EXISTS job_id               UUID,
  ADD COLUMN IF NOT EXISTS session_id           UUID,
  ADD COLUMN IF NOT EXISTS question             TEXT,
  ADD COLUMN IF NOT EXISTS context              TEXT,
  ADD COLUMN IF NOT EXISTS asked_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answer               TEXT,
  ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

Idempotent — safe to re-run. This is a temporary patch; a proper followup is to rewrite migration 001 as `CREATE TABLE IF NOT EXISTS` followed by the same `ALTER TABLE ADD COLUMN IF NOT EXISTS` block so cold installs and schema-drifted installs both converge.

## Step 6 — Ensure ~/.termdeck/secrets.env has DATABASE_URL + ANTHROPIC_API_KEY

The init-rumen wizard reads these two keys from `~/.termdeck/secrets.env`. If you already have a working TermDeck RAG setup, **do NOT run `termdeck init --mnestra`** — it applies six SQL migrations that may collide with existing memory tables. Just add the two keys manually:

```bash
cat ~/.termdeck/secrets.env  # check what's already there
```

Append any missing keys (watch out for duplicates):
```bash
cat >> ~/.termdeck/secrets.env <<'EOF'
DATABASE_URL="<same value as in rumen/.env>"
ANTHROPIC_API_KEY=sk-ant-api03-...
EOF
```

Note: the single quotes around `'EOF'` prevent shell expansion of `$` and backticks — critical for pasting secrets safely.

Verify:
```bash
grep -cE '^DATABASE_URL=' ~/.termdeck/secrets.env        # should return 1
grep -cE '^ANTHROPIC_API_KEY=' ~/.termdeck/secrets.env   # should return 1
```

## Step 7 — Run the init wizard (~3 min)

```bash
cd ~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck
node packages/cli/src/index.js init --rumen
```

(`termdeck init --rumen` only works if you've run `npm link` or installed the package globally.)

The wizard will:
1. Check for `supabase` CLI and `deno` on PATH
2. Read Mnestra config from `~/.termdeck/secrets.env`
3. Derive project ref from `SUPABASE_URL`
4. Run `supabase link --project-ref <ref>`
5. Apply rumen tables migration (001)
6. Deploy the `rumen-tick` Edge Function
7. Set function secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`)
8. POST a manual test to the function
9. Apply the pg_cron schedule (002)

### If the Edge Function test POST fails

- **`Could not find npm package '@jhizzard/rumen' matching 'X.Y.Z'`** → The version in `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` is not published to npm. Check the latest published version (`npm view @jhizzard/rumen version`) and update the import to match.
- **`column "X" does not exist` (e.g. `m.session_id`)** → Rumen's `extract.ts` uses a column name that doesn't match Mnestra's current schema. Patch in `~/Documents/Graciella/rumen/src/extract.ts`, bump version in `package.json`, `npm run build`, `npm publish --access public`, update the Edge Function import to the new version, re-run the wizard.
- **`operator does not exist: text = uuid`** → Type mismatch in a join. Cast the UUID side to text: `WHERE col = $1::text`.
- **`column "X" does not exist` on rumen_jobs/insights/questions** → Schema drift. Re-run the backfill script in Step 5a.

## Step 8 — Verify pg_cron schedule landed (~1 min)

```sql
select jobname, schedule, active
from cron.job
where jobname like 'rumen%';
```

Expect a row with `active = true`. The wizard schedules rumen-tick every 15 minutes.

## Step 9 — Wait for the first scheduled fire (~15 min)

```bash
cd ~/Documents/Graciella/ChopinNashville/SideHustles/Rumen/rumen
set -a; source .env; set +a
psql "$DATABASE_URL" -c "SELECT id, status, sessions_processed, insights_generated, started_at FROM rumen_jobs ORDER BY started_at DESC LIMIT 5"
```

You should see the manual test row from Step 7 plus a new row each time pg_cron fires. `status` should be `done` on success.

---

## Followups after first successful deploy

1. **Rotate the Anthropic API key** if it was ever pasted into chat logs. https://console.anthropic.com/settings/keys → revoke old, generate new, update `~/.termdeck/secrets.env`, then push to Edge Function: `supabase secrets set ANTHROPIC_API_KEY=<new>`.

2. **Upstream the schema backfill.** Rewrite migration 001 in `~/Documents/Graciella/rumen/migrations/001_rumen_tables.sql` and `packages/server/src/setup/rumen/migrations/001_rumen_tables.sql` to include the `ALTER TABLE ADD COLUMN IF NOT EXISTS` block after each `CREATE TABLE IF NOT EXISTS`. This makes the migration self-healing for future drift.

3. **Fix the hardcoded import version.** The Edge Function source pins `npm:@jhizzard/rumen@X.Y.Z`. Whenever rumen is republished, `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` must be updated and TermDeck redeployed. Consider reading the version from rumen's package.json at wizard build time instead.

4. **Add the schema drift check to the wizard itself.** `init-rumen.js` should run the backfill script before attempting migration 001 — that would have saved us from re-running the wizard 3 times.
