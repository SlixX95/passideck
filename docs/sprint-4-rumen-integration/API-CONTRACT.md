# Sprint 4 API Contract — Rumen Insights Endpoints

Owner: T2 (server). Consumer: T3 (client). Frozen once written — changes require a coordination note in STATUS.md.

Base URL: same origin as the TermDeck dashboard (default `http://localhost:3000`).

All responses are `Content-Type: application/json`. All timestamps are ISO 8601 with timezone. All IDs are UUID v4 strings.

---

## GET /api/rumen/insights

Fetches recent Rumen insights from the petvetbid Postgres database.

### Query parameters

| Name      | Type    | Default | Notes |
|-----------|---------|---------|-------|
| `limit`   | integer | `20`    | Clamped to `[1, 100]`. Values outside that range are silently clamped. |
| `project` | string  | —       | Optional. Filters insights where `projects[]` array contains the given string (exact match on any element). |
| `since`   | string  | —       | Optional ISO 8601 timestamp. Returns only insights with `created_at >= since`. Invalid timestamps are ignored. |
| `unseen`  | boolean | `false` | Optional. If `true` (case-insensitive), only returns insights with `acted_upon = false`. |

### Success response — 200

```json
{
  "insights": [
    {
      "id": "a7c3f2e1-9b8d-4f5a-8e1c-2d3f4a5b6c7d",
      "insight_text": "Placeholder insight generated from 3 source memories.",
      "confidence": 0.581,
      "projects": ["chopin-nashville", "pvb"],
      "source_memory_ids": [
        "11111111-2222-3333-4444-555555555555",
        "66666666-7777-8888-9999-aaaaaaaaaaaa"
      ],
      "created_at": "2026-04-15T19:47:52.111Z",
      "acted_upon": false
    }
  ],
  "total": 111
}
```

- `insights` — array, sorted by `created_at DESC`. May be empty.
- `total` — total count of insights in `rumen_insights` matching the **same filters** (project / since / unseen) but **ignoring `limit`**. Used by the client to show "showing N of M".
- `confidence` — number in `[0, 1]` with up to 3 decimals.
- `projects` — string array; may be empty.
- `source_memory_ids` — UUID array; may be empty.
- `acted_upon` — boolean, server-authoritative.

### Rumen not configured — 200

If the server has no `DATABASE_URL` or rumen tables are unreachable at startup, the endpoint returns:

```json
{ "insights": [], "total": 0, "enabled": false }
```

Clients should treat the presence of `enabled: false` as "Rumen off — hide the briefing UI."

### Database unreachable — 503

If the Postgres pool errors at query time (network/auth):

```json
{ "error": "rumen database unreachable" }
```

---

## GET /api/rumen/status

Returns Rumen health + a summary of the most recent job.

### Success response — 200 (Rumen enabled)

```json
{
  "enabled": true,
  "last_job_id": "f0e1d2c3-b4a5-9687-7564-534231201fed",
  "last_job_status": "done",
  "last_job_completed_at": "2026-04-15T19:47:55.336Z",
  "last_job_sessions_processed": 111,
  "last_job_insights_generated": 111,
  "total_insights": 111,
  "unseen_insights": 0,
  "latest_insight_at": "2026-04-15T19:47:55.336Z"
}
```

Field notes:

- `last_job_status` — one of `pending | running | done | failed` (from the `rumen_jobs.status` CHECK constraint).
- `last_job_completed_at` — may be `null` if the most recent job is still running/pending.
- `last_job_id` — may be `null` if no jobs have ever run.
- `last_job_sessions_processed`, `last_job_insights_generated` — integers, `0` if no jobs.
- `total_insights` — integer, total rows in `rumen_insights`.
- `unseen_insights` — integer, count where `acted_upon = false`.
- `latest_insight_at` — ISO timestamp of the newest insight, or `null` if none.

### Rumen not configured — 200

```json
{ "enabled": false }
```

Never 500. The client uses the absence of `enabled: true` to hide Rumen UI.

### Database unreachable — 503

```json
{ "error": "rumen database unreachable" }
```

---

## POST /api/rumen/insights/:id/seen

Marks an insight as seen by flipping `acted_upon` to `true`.

### Path parameters

- `id` — UUID of the insight. If not a valid UUID, returns `400 { "error": "invalid insight id" }`.

### Request body

Empty. No body required.

### Success response — 200

```json
{ "id": "a7c3f2e1-9b8d-4f5a-8e1c-2d3f4a5b6c7d", "acted_upon": true }
```

Idempotent: calling it on an already-seen insight returns the same shape with no error.

### Not found — 404

```json
{ "error": "insight not found" }
```

### Rumen not configured — 503

```json
{ "error": "rumen not configured" }
```

### Database unreachable — 503

```json
{ "error": "rumen database unreachable" }
```

---

## Client guidance (non-normative)

- Poll `/api/rumen/status` on dashboard load and every 60s. If `enabled: false`, hide the briefing button entirely.
- Fetch `/api/rumen/insights?limit=20&unseen=true` when the user opens the briefing panel.
- After the user dismisses an insight, `POST /api/rumen/insights/:id/seen` and optimistically remove it from the panel. On 5xx, roll back the optimistic update and surface a toast.
