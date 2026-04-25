# Sprint 25 — Supabase MCP in the Setup Wizard

Append-only coordination log.

## Mission

Drive the credential-paste step of the Tier 2 setup wizard down to zero by letting the wizard talk to Supabase directly through `@supabase/mcp-server-supabase`. After Sprint 23 the wizard already validates pasted credentials and runs all 7 migrations. After this sprint, a user with a Supabase Personal Access Token (PAT) clicks one button and the wizard:

1. Asks Supabase to list their projects (or create a new one)
2. Reads the project URL, anon key, service role key, and database URL via the MCP
3. Hands those credentials to the existing `POST /api/setup/configure` endpoint
4. Triggers the existing `POST /api/setup/migrate` flow

The current 4-credential paste step collapses to "select a project from a dropdown."

## Why this sprint

The IDEAS-AND-STATUS overview names this as item #11 — the single biggest simplification we haven't shipped. Brad's onboarding hit it: even after we walked him through SSH tunneling, he still has to make a Supabase project, find the service role key (3 clicks deep), find the database URL (a different 3 clicks), and paste both. Anyone less patient than Brad bounces at this step. Supabase MCP is the lever that moves "create + connect Supabase" from a 15-minute Tier 2 install down to ~30 seconds.

Sprint 23's wizard infrastructure (`POST /api/setup/configure`, `POST /api/setup/migrate`, the credential form) is the foundation. This sprint just feeds it from a different source.

## Out of scope

- Auto-creating Supabase projects via the MCP. v1 just lists existing projects and connects to one. Project creation can come in v2 once we know the PAT-scopes story.
- Replacing the manual paste flow. Both paths must coexist — some users won't want to share a PAT.
- Migrating away from `@supabase/supabase-js` for runtime work. The MCP is wizard-time only; runtime stays on the existing webhook + direct paths.

## Approach

Two viable architectures:

### A. MCP as a server-side helper (recommended)
- TermDeck server spawns `@supabase/mcp-server-supabase` as a subprocess on demand (when the wizard calls `POST /api/setup/supabase/projects`).
- Server passes user-provided PAT via env var.
- Server reads project list, returns shaped JSON to the wizard.
- On project selection, server reads the credentials via MCP, then plumbs them into the existing `/api/setup/configure` validator + writer.

Pros: User never holds the MCP. Single PAT lives in the wizard request body, never persisted. Reuses every Sprint 23 validator and writer.

Cons: New dependency. We need to detect whether the MCP binary is installed (or bundle it).

### B. MCP as a Claude Code MCP integration
- User adds `@supabase/mcp-server-supabase` to `~/.claude/mcp.json` themselves.
- TermDeck wizard tells the user to ask Claude Code "set up my TermDeck stack."
- Claude Code (the agent, not TermDeck) drives the MCP, the migrations, and the writes.

Pros: Zero new TermDeck code. Just docs.

Cons: Hard fail when the user doesn't have Claude Code, and the experience now depends on the agent's reliability instead of TermDeck's. Brad's case (testing TermDeck in isolation) breaks here.

**Recommend (A).** Option B is fine for the Claude Code crowd but isn't the simplification we're after.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-mcp-bridge.md | `packages/server/src/setup/supabase-mcp.js` (new) — spawn + JSON-RPC envelope |
| T2 | T2-wizard-endpoints.md | `packages/server/src/index.js` — `POST /api/setup/supabase/connect`, `/projects`, `/select` |
| T3 | T3-wizard-ui.md | `packages/client/public/app.js` — PAT field + project picker + "back to manual paste" escape |
| T4 | T4-mcp-detection.md | `packages/cli/src/index.js` — preflight check that warns if `@supabase/mcp-server-supabase` isn't on PATH (non-blocking) |

**Note:** The Flashback regression task previously listed here as T5 has moved to Sprint 26 T1 — it's a parallel concern (memory-layer quality) that doesn't share file ownership with this sprint's Supabase MCP wizard work. Run Sprint 26 separately or in parallel.

## Acceptance criteria

- [ ] User pastes Supabase PAT in the wizard → projects load within 5s.
- [ ] User selects a project → existing migrations + config write fire automatically.
- [ ] On any MCP failure, wizard falls back to the manual paste form with a clear error.
- [ ] PAT is never persisted — held only in the request lifetime.
- [ ] No regression for users who skip the PAT path and paste credentials manually.
- [ ] Tests cover: MCP-not-installed, PAT invalid, PAT valid + zero projects, PAT valid + multiple projects, project selection success, project selection failure mid-migration.
- [ ] CHANGELOG entry under v0.5.x with explicit "no breaking changes for manual-paste users."

## Open questions

- **MCP binary distribution.** Do we add `@supabase/mcp-server-supabase` to TermDeck's deps, or detect-and-prompt-install? Probably detect — it's a heavy dep for users who never use it.
- **PAT scope.** Does Supabase let you mint a read-only-projects PAT, or is it all-or-nothing? If all-or-nothing, the wizard should warn loudly.
- **Project creation.** Defer to v2 unless the MCP makes it trivial.

## Rules

1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`. 4. Sign off with `[Tn] DONE`.

---
(append below)

### [T1] Supabase MCP bridge

- New `packages/server/src/setup/supabase-mcp.js`, ~165 LOC, zero new deps. Uses `child_process` + `JSON` only — no entry added to any `package.json`.
- `callTool(pat, method, params, opts)` — spawns `@supabase/mcp-server-supabase` as a child (binary if on PATH, else `npx -y @supabase/mcp-server-supabase@latest`), passes the PAT via `SUPABASE_ACCESS_TOKEN` env var only (never argv → never visible in `ps`), writes a single JSON-RPC 2.0 `tools/call` envelope to stdin, parses newline-delimited stdout, matches by request id, and SIGKILLs the child + clears the timeout in a single `cleanup()` whether the call resolves, rejects, or times out (default 8000ms).
- Error surface: `mcp not installed: <hint>` (when `detectMcp` reports unavailable), `mcp timeout`, `mcp spawn failed: <msg>` (ENOENT/EACCES at spawn or stdin-write), `mcp exited (code=N|signal=X): <stderr tail>` (early child exit with last 512B of stderr), or the raw RPC `error.message` on a JSON-RPC error response. Non-JSON stdout lines (banners, log noise) are skipped, not fatal.
- `detectMcp()` — `which`/`where` for the global binary first, `spawnSync('npx', ['--no-install', PACKAGE_SPEC, '--version'], { timeout: 5000 })` second so we never trigger a surprise multi-MB install during a probe, structured `{ available: false, mode: null, error: 'not installed; run: npm install -g @supabase/mcp-server-supabase' }` third.
- Smoke tests on this machine:
  - `node -e "require('./packages/server/src/setup/supabase-mcp.js').detectMcp().then(r => console.log(JSON.stringify(r)))"` → `{"available":false,"mode":null,"error":"not installed; run: npm install -g @supabase/mcp-server-supabase"}`.
  - `callTool('sb_pat_fake', 'list_projects', {}, { timeoutMs: 1500 })` → rejects with `mcp not installed: …` instead of dangling for 1.5s, confirming the early-exit guard fires before any spawn attempt.
- No high-level wrappers, no PAT validation, no caching, no retries — kept dumb per spec so T2 can compose `listProjects` / `readCredentials` on top.
- Files I did NOT touch: `packages/server/src/index.js` (T2), `packages/client/public/app.js` (T3), `packages/cli/src/index.js` (T4). `packages/server/src/setup/index.js` aggregator was also left alone — T2 can `require('./setup/supabase-mcp')` directly.

[T1] DONE

### [T4] CLI preflight Supabase MCP hint

- `checkSupabaseMcpHint(config)` added to `packages/cli/src/index.js`. Lazy-requires T1's `packages/server/src/setup/supabase-mcp.js` inside a try/catch so Tier 1 users (and pre-T1 races) pay nothing and stay silent.
- Wired into the `server.listen` callback as a separate `.then` chain alongside `runPreflight(config).then(printHealthBanner)` — not nested inside it. Existing preflight/banner bodies untouched.
- Conditions for printing the yellow `\x1b[33m[hint]\x1b[0m` line (all three required, evaluated in order):
  1. `config.rag && config.rag.enabled === true`
  2. `~/.claude/mcp.json` does not declare `mcpServers.supabase` (read + parsed inline; malformed JSON falls through to step 3 rather than crashing)
  3. T1's `detectMcp()` returns `available: false`
- Outer try/catch swallows any internal errors so hints never become noise.
- Verified Tier 1 silence: fresh `HOME=$(mktemp -d)`, `node packages/cli/src/index.js --no-stack --port 3997 --no-open` — default config writes `rag.enabled: false`, listen callback fires (6 `[health]` lines confirm it), 0 `[hint]` lines.
- Verified positive path: fresh HOME with `rag.enabled: true` and no `~/.claude/mcp.json`, MCP not installed → exactly 1 yellow `[hint]` line: `Supabase MCP not installed — wizard auto-fill unavailable. Install with: npx @jhizzard/termdeck-stack --tier 4`.
- `node --check packages/cli/src/index.js` clean.
- No edits to `packages/server/src/setup/supabase-mcp.js` (T1, only `require`d), `packages/server/src/index.js` (T2), `packages/client/public/app.js` (T3), or the `runPreflight`/`printHealthBanner` bodies.

[T4] DONE

### [T2] Wizard endpoints for Supabase MCP

- POST `/api/setup/supabase/{connect,projects,select}` added in `packages/server/src/index.js` (right above `/api/sessions`).
- T1's bridge module is loaded via a defensive conditional `require('./setup/supabase-mcp')` that swallows ENOENT — endpoints surface that case as `400 { code: 'mcp_not_installed' }` at request time, so the file boots cleanly even before T1 lands. (T1 has since signed off as DONE; the conditional require remains for the `mcp-server-supabase not installed` runtime case that T1's `detectMcp()` also surfaces.)
- `/select` chains to the existing Sprint 23 flows via in-process **self-fetch** to `http://127.0.0.1:<config.port>/api/setup/configure` and `/api/setup/migrate`. This keeps Sprint 23's validation and writers as the single source of truth (no duplicated logic, no risky refactor of the existing handlers). The spec explicitly permits self-fetch as the small-diff alternative to function extraction.
- Step-failure mapping: configure rejection → `code: 'configure_failed'`, migrate rejection → `code: 'migrate_failed'`. Original status code is forwarded when available.
- MCP error mapping (`_mapMcpError`) covers all four envelopes the spec requires: `mcp_not_installed` (400), `pat_invalid` (401, default for any auth/HTTP failure surfaced by the MCP), `mcp_timeout` (504), plus `configure_failed` / `migrate_failed` for the chained-step path.
- `/select` includes a defensive fallback path: tries the bundled `fetch_project_credentials` tool first, falls back to four single-field calls (`get_project`, `get_anon_key`, `get_service_role_key`, `get_database_url`) if the bridge raises `unknown_tool`. T1's bridge is a generic JSON-RPC pass-through, so the available tool names are whatever the upstream MCP server exposes — this fallback insulates the wizard from upstream tool churn.
- Module-scoped `_supabaseSelectInFlight` boolean returns `409 { code: 'select_in_flight' }` on concurrent `/select` calls — mirrors the `_migrateInFlight` pattern at line ~361.
- PAT not logged anywhere. Confirmed: `grep -nE "console\\..*pat" packages/server/src/index.js` returns empty (no `pat` token inside any `console.*` call). The PAT only ever appears as the first positional argument to `_supabaseMcp.callTool(...)` and in the inbound request body, never in a log line.
- `node --check packages/server/src/index.js` clean.
- Untouched per ownership table: `packages/server/src/setup/supabase-mcp.js` (T1), `packages/client/public/app.js` (T3), `packages/cli/src/index.js` (T4). The existing `/api/setup/configure` and `/api/setup/migrate` handlers were not refactored — `/select` self-fetches them instead.

[T2] DONE

### [T3] Wizard UI for Supabase MCP

- Auto-flow section added to `renderSetupTiers` in `packages/client/public/app.js` (~210 LOC across new helpers + ~3 LOC of integration). It renders **above** the Sprint 23 manual credential form, separated by a small "— or paste credentials manually below —" divider, only when `tier.id === '2' && (status === 'not_configured' || status === 'partial')`. The manual paste form below is preserved unchanged.
- Three states wired:
  1. PAT entry — a single `<input type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" autocorrect="off">` plus a Connect button. Enter in the field also triggers Connect.
  2. Project picker — a `<select>` of `name — region` options + "Use this project" button + "Use a different token" escape that drops the PAT and re-renders the PAT entry.
  3. Zero-projects edge case — accepted-but-empty: shows a link to `supabase.com/dashboard` plus the "Use a different token" escape.
- Inline error messages for the four spec-required failure modes (codes returned by T2's `/api/setup/supabase/connect`):
  - `mcp_not_installed` → "The Supabase MCP isn't installed on this machine. Run `npx @jhizzard/termdeck-stack --tier 4` to install it, or paste credentials manually below."
  - `pat_invalid` → "Token rejected: <detail>. Mint a fresh PAT and try again."
  - `mcp_timeout` → "Supabase didn't respond in time. Try again or paste credentials manually below."
  - configure/migrate failure (from `/select`) → "Couldn't finish setup: <detail>. Paste credentials manually below if this keeps failing."
- Closure-only PAT storage: module-scope `let supabaseAutoState = null` (declared next to `setupModalOpen`), holds `{ pat, projects, picking, error }`. Snapshot read into a local `patSnapshot` inside `handleSupabaseAutoSelect` so module state can be nulled out the moment `/select` returns ok, before any further processing. The PAT never lands on `state`, `window`, any DOM data attribute, or any `console.*` log line. `grep -nE "console\\..*pat" packages/client/public/app.js` returns empty.
- Re-render robustness: a sibling `let lastSetupData = null` caches the most recent `/api/setup` payload. `rerenderSetupTiersFromCache()` re-renders the picker without re-fetching, so a `/connect` success → picker transition happens without round-tripping through `refreshSetupStatus`. If `supabaseAutoState.picking` is true at render time, the picker renders; otherwise the PAT entry. A re-fetch via `refreshSetupStatus()` (e.g. the user hitting "re-check") leaves `supabaseAutoState` intact and the picker survives.
- Inline styles only — no edits to `packages/client/public/style.css` (Sprint 23 T1's file). Confirmed: `git diff --name-only packages/client/public/style.css` is empty.
- `node --check packages/client/public/app.js` clean.
- Untouched per ownership table: `packages/server/src/setup/supabase-mcp.js` (T1), `packages/server/src/index.js` (T2), `packages/cli/src/index.js` (T4), `packages/client/public/style.css` (Sprint 23 T1).

[T3] DONE
