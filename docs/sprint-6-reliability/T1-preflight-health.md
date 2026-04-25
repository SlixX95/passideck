# T1 — Preflight Health Check

## Goal

Create a health check module that runs at TermDeck startup and verifies the entire memory stack is operational. Expose results via a REST endpoint so the client can display status.

## Context

During a live demo on 2026-04-16, Claude Code inside TermDeck couldn't find the Rumen project at all. The shell fell back to bash 3.2. The system silently degraded into a dumb terminal multiplexer with none of the memory features working. This must never happen again.

## Deliverables

### 1. `packages/server/src/preflight.js` (new file)

Export `async function runPreflight(config)` that checks:

| Check | How | Pass condition |
|-------|-----|----------------|
| **Mnestra reachable** | HTTP GET to Mnestra webhook server (default `http://localhost:37778/health` or from config) | 200 OK |
| **Mnestra has memories** | Query `memory_status` endpoint or direct DB check via DATABASE_URL | `total > 0` |
| **Rumen Edge Function** | HTTP POST to the Supabase Edge Function URL with a dry-run flag (or query `rumen_jobs` table for last successful job) | Last job `status='done'` within 30 minutes, OR function responds 200 |
| **DATABASE_URL resolves** | `pg.Pool` connect + `SELECT 1` against DATABASE_URL from secrets.env | Returns `1` |
| **Project paths exist** | For each project in `~/.termdeck/config.yaml`, check `fs.existsSync(path)` | All paths resolve |
| **Shell sanity** | Spawn a PTY with `$SHELL -l -c 'echo OK'`, check stdout contains `OK` | `OK` in output within 3s |

Return shape:
```js
{
  passed: boolean,       // true only if ALL checks pass
  checks: [
    { name: 'mnestra_reachable', passed: true, detail: '3,527 memories' },
    { name: 'rumen_recent', passed: true, detail: 'last job 12m ago, 111 insights' },
    { name: 'database_url', passed: true, detail: 'connected in 84ms' },
    { name: 'project_paths', passed: true, detail: '14/14 paths exist' },
    { name: 'shell_sanity', passed: true, detail: 'zsh OK in 0.4s' },
  ],
  timestamp: ISO8601
}
```

Each check must be independently try/caught — one failure must not prevent other checks from running.

### 2. `GET /api/health` endpoint

Wire `runPreflight()` into the Express app. Cache results for 60 seconds (don't re-run on every request). Return the full check result as JSON.

### 3. CLI integration in `packages/cli/src/index.js`

After server starts, run preflight. Print a colored summary to the terminal:
- Green check for each passing check
- Red X for each failing check with the detail
- If any check fails, print a clear remediation hint (e.g., "Mnestra not running — start with `mnestra serve`")
- Do NOT block startup on failures — warn loudly but let the server run

### 4. Startup banner

When TermDeck prints its "listening on port X" message, append the health summary:
```
[termdeck] Listening on http://localhost:3000
[health] Mnestra .............. OK (3,527 memories)
[health] Rumen ................ OK (last job 12m ago)
[health] Database ............. OK (84ms)
[health] Project paths ........ OK (14/14)
[health] Shell ................ OK (zsh 0.4s)
[health] All checks passed.
```

## Files you own
- `packages/server/src/preflight.js` (create)
- `packages/cli/src/index.js` (modify — add preflight call after server start)

## Files you must NOT touch
- `packages/server/src/index.js` (T3 owns this)
- `packages/client/public/*` (T4 owns this)
- `packages/server/src/session.js` (T3 owns this)

## Acceptance criteria
- [ ] `runPreflight()` runs all 5+ checks independently (one failure doesn't block others)
- [ ] `GET /api/health` returns JSON with pass/fail for each check
- [ ] CLI prints colored health summary on startup
- [ ] Failing checks show specific remediation hints
- [ ] Preflight completes in < 5 seconds total (parallel where possible)
- [ ] No new npm dependencies (use built-in `http`/`net` for health pings)
