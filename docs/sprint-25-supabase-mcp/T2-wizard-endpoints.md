# T2 — Wizard Endpoints for Supabase MCP

## Goal

Three new server endpoints that the in-browser setup wizard (T3) will call. Each one is a thin orchestrator over `supabase-mcp.callTool` (T1's module) plus the existing Sprint 23 endpoints.

## Scope

You touch **one file**: `packages/server/src/index.js`. Add three endpoints; don't refactor anything else.

## Endpoints

### `POST /api/setup/supabase/connect`

Body: `{ pat: string }`.

1. Call `supabaseMcp.callTool(pat, 'list_projects', {}, { timeoutMs: 6000 })` — even though the user only needs auth verification, listing projects is the simplest non-destructive auth check.
2. On success, respond `{ ok: true, projectCount: <n> }`. Do NOT echo the PAT or the project list (T3 fetches projects via the next endpoint).
3. On MCP not installed, respond `400 { ok: false, code: 'mcp_not_installed', detail: 'run: npm install -g @supabase/mcp-server-supabase' }`.
4. On auth failure, respond `401 { ok: false, code: 'pat_invalid', detail: <mcp error message> }`.
5. On timeout, respond `504 { ok: false, code: 'mcp_timeout' }`.

### `POST /api/setup/supabase/projects`

Body: `{ pat: string }`. Returns `{ ok: true, projects: [{ id, name, region, createdAt }] }`. Same error envelope as `/connect`.

Map the MCP response to a stable shape — don't pass raw MCP output to the wizard. If a future MCP version renames a field, this endpoint absorbs the change.

### `POST /api/setup/supabase/select`

Body: `{ pat: string, projectId: string }`. The full chain:

1. Use `supabaseMcp.callTool` to fetch project URL, anon key, service role key, database URL for the given project.
2. **Hand off to the existing `/api/setup/configure` flow.** Do not re-implement credential validation or file writing — T3 (Sprint 23) already does that. The cleanest path: refactor the existing `configure` handler so its body becomes a callable function `runConfigureFlow(creds)` that both endpoints share. Keep the diff small — extract the function, call it from both places. If that's not feasible inside this task's time budget, just `await fetch('http://localhost:<this port>/api/setup/configure', ...)` — yes, the server calling itself, but it works and avoids duplicating validation logic.
3. After configure succeeds, also kick `/api/setup/migrate` (the Sprint 23 T3 migration runner). Same options: extract a function or self-fetch.
4. Respond `{ ok: true, configured: true, migrated: true, validation: <pass-through>, applied: <count> }`.
5. On any failure, return the same error envelope as `/connect`. Include which step failed: `code: 'configure_failed' | 'migrate_failed'`.

### Concurrency guard

Add a module-scoped `_supabaseSelectInFlight` boolean. Return 409 on concurrent `/select` calls — the existing `/api/setup/migrate` already does this; mirror the pattern.

## Files you own

- `packages/server/src/index.js` (the three new endpoints + any minimal refactor of `/configure` and `/migrate` to expose internal functions)

## Files you must NOT touch

- `packages/server/src/setup/supabase-mcp.js` (T1)
- `packages/client/public/app.js` (T3)
- `packages/cli/src/index.js` (T4)
- The existing Sprint 23 endpoint **logic** — only refactor surface (extract-to-function) if you need to share. Don't rewrite validation rules.

## Acceptance criteria

- [ ] Three endpoints registered, return correctly-shaped JSON for the four error envelopes (`mcp_not_installed`, `pat_invalid`, `mcp_timeout`, `configure_failed | migrate_failed`).
- [ ] No PAT logged anywhere. Verify by grepping for `pat` in any console.log.
- [ ] `node --check packages/server/src/index.js` clean.
- [ ] Append `[T2] DONE` to `docs/sprint-25-supabase-mcp/STATUS.md`.

## Sign-off format

```
### [T2] Wizard endpoints for Supabase MCP

- POST /api/setup/supabase/{connect,projects,select} added in packages/server/src/index.js.
- /select chains to existing configure+migrate flows via <function extraction | self-fetch>.
- Module-scoped _supabaseSelectInFlight guard returns 409 on concurrent calls.
- PAT not logged. Confirmed via grep.
- node --check clean.

[T2] DONE
```
