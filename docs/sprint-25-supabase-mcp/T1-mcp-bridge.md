# T1 — Supabase MCP Bridge Module

## Goal

Build a thin server-side bridge that spawns `@supabase/mcp-server-supabase` as a subprocess on demand and speaks JSON-RPC to it on stdio. T2's wizard endpoints depend on this module. Keep the bridge dumb — list/get methods only, no business logic.

## Scope

You write **one new file**: `packages/server/src/setup/supabase-mcp.js`. Nothing else.

## What the bridge does

The Supabase MCP exposes management-API tools (`list_projects`, `get_project_details`, `get_project_url`, `get_anon_key`, `get_service_role_key`, `get_database_url`, …). Speaking to it directly in TermDeck means we don't need to bundle the @supabase npm SDK ourselves.

## Implementation

### Public API

```js
// packages/server/src/setup/supabase-mcp.js
//
// Spawn @supabase/mcp-server-supabase as a child process, send JSON-RPC
// requests over stdio, return parsed responses. One-shot per call —
// process spawned, request sent, response parsed, process closed.

module.exports = {
  /**
   * @param {string} pat — Supabase Personal Access Token (sb_pat_...)
   * @param {string} method — MCP method name (e.g. 'list_projects')
   * @param {object} params — method params
   * @param {object} opts — { timeoutMs = 8000 }
   * @returns {Promise<object>} parsed result, or throws on timeout / non-200 / mcp error
   */
  callTool(pat, method, params, opts) { ... },

  /**
   * Detect whether @supabase/mcp-server-supabase is available on PATH or
   * via npx. Returns { available: bool, mode: 'binary'|'npx'|null, error?: string }.
   */
  async detectMcp() { ... },
};
```

### How `callTool` works

1. Build the spawn args: `['-y', '@supabase/mcp-server-supabase@latest']` for the npx path, or `['mcp-server-supabase']` for a global install (use whichever `detectMcp()` returned).
2. Spawn with `env: { ...process.env, SUPABASE_ACCESS_TOKEN: pat }`.
3. Construct a JSON-RPC 2.0 envelope: `{ jsonrpc: '2.0', id: <random>, method: 'tools/call', params: { name: method, arguments: params } }`. Append `\n`. Write to child stdin.
4. Buffer child stdout. Try to parse each newline-terminated chunk as JSON-RPC response. On match (id == request id), resolve with `response.result`.
5. Timeout via `setTimeout` — kill the child and reject with `Error('mcp timeout')`.
6. Always close stdin and SIGKILL the child when done. No leaks.

### How `detectMcp` works

1. Try `which mcp-server-supabase` (or `where` on Windows). If non-empty, return `{ available: true, mode: 'binary' }`.
2. Otherwise probe npx: `spawnSync('npx', ['--no-install', '@supabase/mcp-server-supabase', '--version'])`. If exit 0, return `{ available: true, mode: 'npx' }`.
3. Otherwise `{ available: false, mode: null, error: 'not installed; run: npm install -g @supabase/mcp-server-supabase' }`.

### What you don't do

- No high-level wrappers like `listProjectsForUser(...)`. T2 builds those.
- No PAT validation. T2 handles auth-error UX.
- No caching. Every call spawns fresh.
- No retries. Caller decides.

## Files you own

- `packages/server/src/setup/supabase-mcp.js` (new)

## Files you must NOT touch

- `packages/server/src/index.js` (T2)
- `packages/client/public/app.js` (T3)
- `packages/cli/src/index.js` (T4)

## Acceptance criteria

- [ ] `supabase-mcp.js` exists and exports `callTool` + `detectMcp`.
- [ ] `node -e "require('./packages/server/src/setup/supabase-mcp.js').detectMcp().then(r => console.log(JSON.stringify(r)))"` runs without error and prints a sensible result on a machine without the MCP installed (`{ available: false, ... }`).
- [ ] No external deps added to package.json — uses `child_process` and `JSON` only.
- [ ] Append `[T1] DONE` to `docs/sprint-25-supabase-mcp/STATUS.md`.

## Sign-off format

```
### [T1] Supabase MCP bridge

- New packages/server/src/setup/supabase-mcp.js, ~120 LOC, zero new deps.
- callTool(pat, method, params, opts) — spawns child, JSON-RPC over stdio, timeout-protected, kills child on resolve/reject.
- detectMcp() — `which` first, npx probe second, structured failure third.
- Smoke test confirms detectMcp returns { available: false } on this machine.

[T1] DONE
```
