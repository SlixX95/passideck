# Rumen Pre-Deployment Checklist

> Derived from Podium's deploy pain (2026-04-10/11). Every item below was a debug cycle Podium had to suffer through. Doing them in order prevents Rumen from inheriting the same gotchas.

## Architectural Decisions Made Up Front

### Use raw `pg`, NOT Prisma

Rumen v0.1 will use raw `pg` (node-postgres) NOT Prisma. Reasoning:

1. Rumen has a fixed schema (3 tables: `rumen_jobs`, `rumen_insights`, `rumen_questions`). No evolving models.
2. Prisma's value (type safety + migrations + relations) is wasted on three flat tables.
3. The Prisma + Vercel + Supabase chain has at least 6 known gotchas that take a full day to learn.
4. Rumen will run as a Supabase Edge Function (Deno runtime). Prisma's Deno support is poor.
5. Raw `pg` with parameterized queries is ~50 lines vs ~500 lines of Prisma scaffold.

If a future Rumen feature needs evolving relational models, revisit. For v0.1 through v0.4, raw `pg` wins.

### Use Supabase Shared Pooler IPv4 — never Dedicated Pooler

Supabase Pro projects offer a "Dedicated Pooler" URL by default. It is IPv6-only. Vercel serverless functions are IPv4-only. The connection silently fails with "Can't reach database server."

**Always use the Shared Pooler URL.** Never even put the Dedicated Pooler URL in `.env` so we can't accidentally pick the wrong one.

Shared Pooler URL pattern:
```
postgresql://postgres.<project-ref>:<encoded-pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Three distinguishing features of the Shared Pooler URL (use these to verify you have the right one):
- Hostname is `aws-0-<region>.pooler.supabase.com` (NOT `db.<ref>.supabase.co`)
- Username is `postgres.<project-ref>` (with a dot, not just `postgres`)
- Must append `?pgbouncer=true&connection_limit=1` for transaction-mode compatibility

### Maintain two env vars: DATABASE_URL and DIRECT_URL

| Var | Purpose | Connection type |
|---|---|---|
| `DATABASE_URL` | Runtime queries from Edge Functions | Shared Pooler IPv4 (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Migrations from laptop | Direct connection (port 5432) |

Even though we're not using Prisma, the Supabase CLI and `psql` migration scripts need both. `DATABASE_URL` for runtime, `DIRECT_URL` for `supabase db push`.

## Pre-Deployment Steps

### 1. URL-encode the database password

Special characters in DB passwords (`@`, `:`, `/`, `#`, `!`, `+`) break URL parsing. Encode locally before building the connection string:

```bash
python3 -c "import urllib.parse, getpass; p=getpass.getpass('Password: '); print(urllib.parse.quote(p, safe=''))"
```

`getpass` ensures the password isn't echoed to your shell history. NEVER paste passwords into a browser-based encoder — they get cached.

### 2. Set env vars locally and verify connection

```bash
export DATABASE_URL='postgresql://postgres.xxx:encoded@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1'
export DIRECT_URL='postgresql://postgres.xxx:encoded@db.xxx.supabase.co:5432/postgres'

# Test the runtime connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Test the direct connection
psql "$DIRECT_URL" -c "SELECT 1;"
```

Both must succeed before going further. If either fails, do not proceed — fix the URL.

### 3. Apply migrations via plain SQL

No Prisma, no ORM. Write the three Rumen tables as plain `.sql` files in `migrations/` and apply via:

```bash
psql "$DIRECT_URL" -f migrations/001_rumen_tables.sql
```

Schema reference (from `docs/RUMEN-PLAN.md`):
- `rumen_jobs` — job tracking
- `rumen_insights` — synthesized cross-project knowledge
- `rumen_questions` — follow-up questions

### 4. Configure Supabase Edge Function with Service Role key

Edge Functions need service-role access to read across project namespaces in the memory store. Never expose this key client-side. Set as a Supabase Function secret:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
```

The Edge Function reads it via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

### 5. Adopt the `[rumen-*]` logging convention

Mirroring TermDeck's `[tag]` convention, every Rumen log statement must use a phase-specific tag:

- `[rumen-extract]` — pulling structured events from session memories
- `[rumen-relate]` — semantic search for prior art
- `[rumen-synthesize]` — LLM synthesis step
- `[rumen-question]` — follow-up question generation
- `[rumen-surface]` — writing insights/questions back to DB

Format: `console.error('[rumen-extract] failed for session', sessionId + ':', err);`

This makes Edge Function logs in the Supabase dashboard trivially greppable.

### 6. Test with one trivial query before deploying logic

Before deploying any Rumen pipeline code, deploy a stub Edge Function that just runs `SELECT NOW()` against the database via `pg`. Confirm it returns a timestamp via the function URL. Only then start adding pipeline phases.

This catches all six deploy gotchas in one trivial test instead of debugging them one at a time inside complex code.

### 7. Set up cost guardrails before the first real run

Before letting Rumen run on real data:
- Hard cap of 500 LLM calls per day
- Soft cap of 100/day with warning log
- Skip sessions with <3 events
- Max 10 sessions per run
- Use Haiku for 80% of work, Sonnet only on >0.75 similarity matches

These caps live in environment variables so they can be tightened without redeploying.

### 8. Schedule via `pg_cron`, not external cron

Supabase has `pg_cron` built in. Use it to trigger the Rumen Edge Function every 15 minutes. No external cron service required. Less infrastructure, lower cost, more reliable.

```sql
SELECT cron.schedule(
  'rumen-tick',
  '*/15 * * * *',
  $$ SELECT net.http_post('https://<project-ref>.supabase.co/functions/v1/rumen-tick', '{}'::jsonb) $$
);
```

## Post-Deployment Verification

After the first deploy:
1. Tail Edge Function logs in Supabase dashboard
2. Manually trigger one job via the function URL
3. Verify a row appears in `rumen_jobs` with `status='done'`
4. Verify at least one row in `rumen_insights` (or document why zero is correct)
5. Check the LLM call count against the cost guardrails

If any of these fail, the `[rumen-*]` tagged logs should make it obvious which phase broke.

## Production Database Safety

CRITICAL: Rumen v0.1 runs only against TermDeck's embedded Supabase instance, NOT the production Mnestra database with ~1000 existing memories. The production DB stays untouched until Rumen has been validated for at least two weeks of clean runs.

When Rumen graduates to the production Mnestra DB, the migration is non-destructive: it only ADDS new memories with `source_type='insight'` or `'question'`. Existing memories are never modified or deleted.

## Reference

- Architecture: `docs/RUMEN-PLAN.md`
- Lessons that drove this checklist: `docs/LESSONS_FROM_PODIUM.md`
- Full analysis: `docs/CROSS-PROJECT-ANALYSIS-2026-04-11.md`
- RAG memories: search for "Rumen pre-deployment checklist" or "Rumen architecture decision"
