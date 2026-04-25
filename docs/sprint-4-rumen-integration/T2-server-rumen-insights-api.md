# T2 — Server exposes rumen_insights over HTTP

## Why this matters

Rumen is now writing insights to `rumen_insights` in the petvetbid Supabase database (as of 2026-04-15 at 19:47 UTC — first kickstart landed 111 insights). But TermDeck's client has no way to see them. We need a server endpoint that the client can call to fetch recent insights, surface them in the UI, and mark them as "seen."

## Scope (T2 exclusive ownership)

You own these files. Do not touch anything outside this list.

- `packages/server/src/index.js` — add routes
- `packages/server/src/database.js` — add a small query helper (read-only access to rumen_insights) if needed
- `docs/sprint-4-rumen-integration/API-CONTRACT.md` — **YOU MUST CREATE THIS FIRST** as T3 blocks on it

## Critical: write the API contract first

Before writing any code, create `docs/sprint-4-rumen-integration/API-CONTRACT.md` with the exact JSON response shape for every endpoint below. T3 is reading that file to build the client — a stable contract prevents churn.

## Endpoints to add

### GET /api/rumen/insights

Query params:
- `limit` — default 20, max 100
- `project` — optional, filters by project name (matches if any element in `projects[]` equals the param)
- `since` — optional ISO timestamp, only return insights with `created_at >= since`
- `unseen` — optional boolean (default false). If true, only return insights not yet marked seen.

Response:
```json
{
  "insights": [
    {
      "id": "uuid",
      "insight_text": "...",
      "confidence": 0.581,
      "projects": ["chopin-nashville", "pvb"],
      "source_memory_ids": ["uuid", "uuid"],
      "created_at": "2026-04-15T19:47:52.111Z",
      "acted_upon": false
    }
  ],
  "total": 111
}
```

### GET /api/rumen/status

Response:
```json
{
  "enabled": true,
  "last_job_id": "uuid",
  "last_job_status": "done",
  "last_job_completed_at": "2026-04-15T19:47:55.336Z",
  "last_job_sessions_processed": 111,
  "last_job_insights_generated": 111,
  "total_insights": 111,
  "unseen_insights": 0,
  "latest_insight_at": "2026-04-15T19:47:55.336Z"
}
```

If Rumen isn't configured (no `DATABASE_URL` in secrets.env pointing at a database with rumen tables), return `{ "enabled": false }` with a 200 status — never 500.

### POST /api/rumen/insights/:id/seen

Marks an insight as seen (uses `acted_upon = true` in the schema). Returns:
```json
{ "id": "uuid", "acted_upon": true }
```

## Implementation notes

- **Database access:** rumen_insights lives in the SAME Supabase Postgres instance as Mnestra (petvetbid project). TermDeck's server should use the existing `DATABASE_URL` from `~/.termdeck/secrets.env` — or if that's missing, gracefully return `{enabled: false}`.
- **Connection pooling:** don't create a new pg Pool per request. Use a module-level singleton. `pg` is already a dependency of TermDeck per `package.json`.
- **Error handling:** if the Postgres connection fails, the endpoint should return 503 with `{error: "rumen database unreachable"}`, never 500 stack traces.
- **CORS:** TermDeck already serves the client from the same origin, so no CORS config needed.

## Acceptance criteria

- [ ] `docs/sprint-4-rumen-integration/API-CONTRACT.md` exists with the full response shape for all three endpoints.
- [ ] `GET /api/rumen/insights?limit=10` returns the 10 most recent insights from the petvetbid database.
- [ ] `GET /api/rumen/status` returns a 200 with populated fields when Rumen is configured.
- [ ] `GET /api/rumen/status` returns `{enabled: false}` (200 not 500) when `DATABASE_URL` is missing.
- [ ] `POST /api/rumen/insights/:uuid/seen` sets `acted_upon=true` and returns the updated row.
- [ ] No existing TermDeck functionality breaks — `npm test` still passes and the server still starts cleanly with or without Rumen configured.

## Non-goals

- Do NOT touch `packages/client/public/index.html`. That's T3.
- Do NOT touch `init-rumen.js`. That's T1.
- Do NOT add any UI. This is server-only.
- Do NOT implement pagination beyond limit — v0.4 can add cursor-based pagination if users ask.
- Do NOT fetch embeddings or run Rumen jobs from the server. This endpoint is purely read + mark-seen.

## Testing

1. Start the server: `node packages/server/src/index.js`
2. Test each endpoint with curl:
   ```bash
   curl http://localhost:3000/api/rumen/status
   curl http://localhost:3000/api/rumen/insights?limit=5
   curl -X POST http://localhost:3000/api/rumen/insights/<some-uuid>/seen
   ```
3. Temporarily unset `DATABASE_URL` in secrets.env, restart server, verify status returns `enabled: false`.

## Coordination

- Append all significant progress to `docs/sprint-4-rumen-integration/STATUS.md`.
- **WRITE `API-CONTRACT.md` FIRST** — T3 is blocked until that file exists.
- When complete, write `[T2] DONE` with a summary.
