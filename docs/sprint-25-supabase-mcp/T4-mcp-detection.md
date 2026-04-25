# T4 — CLI Preflight: Supabase MCP Install Detection

## Goal

When `termdeck` (or `termdeck stack`) starts, surface a non-blocking warning if the user has Mnestra/RAG configured but `@supabase/mcp-server-supabase` isn't installed. The message should point at `@jhizzard/termdeck-stack --tier 4` as the one-line fix.

## Why this terminal exists

T3's wizard handles MCP-not-installed inline, but only after the user clicks the auto-connect button. Power users who never open the wizard never discover the Supabase MCP exists. A one-line preflight nudge bridges that.

## Scope

You touch **one file**: `packages/cli/src/index.js`. Add a small async check that runs after the existing `runPreflight` block but before the post-listen banner. Print one line if the MCP is missing; otherwise stay silent.

## Implementation

### 1. Detection helper

Use T1's `detectMcp()` from `packages/server/src/setup/supabase-mcp.js`. Lazy-require so users without RAG don't pay the cost:

```js
async function checkSupabaseMcpHint(config) {
  // Only nudge if RAG is configured. Tier 1 users don't need this.
  if (!config.rag || config.rag.enabled !== true) return null;
  try {
    const { detectMcp } = require(path.join(__dirname, '..', '..', 'server', 'src', 'setup', 'supabase-mcp.js'));
    const result = await detectMcp();
    if (result.available) return null;
    return 'Supabase MCP not installed — wizard auto-fill unavailable. Install with: npx @jhizzard/termdeck-stack --tier 4';
  } catch (_e) {
    return null; // Don't surface internal errors as warnings
  }
}
```

### 2. Wire into the listen callback

After `runPreflight(config).then(printHealthBanner)` and before any browser-open code, add:

```js
checkSupabaseMcpHint(config).then((msg) => {
  if (msg) console.log(`  \x1b[33m[hint]\x1b[0m ${msg}`);
}).catch(() => { /* silent */ });
```

Yellow `[hint]` prefix matches the existing `[health]` style for visual coherence.

### 3. Don't break Tier 1 users

The existing CLI startup must remain silent for users who have no `~/.termdeck/config.yaml` or have `rag.enabled: false`. The early-return on `config.rag.enabled !== true` covers this — verify by running `node packages/cli/src/index.js --no-stack --port 0 --no-open` against a fresh `HOME` dir and confirming no `[hint]` line appears.

### 4. Don't double-nudge

If the user already added `supabase` to their `~/.claude/mcp.json` (the `npx @jhizzard/termdeck-stack` flow does this), they presumably know about the MCP. Skip the nudge in that case. Detection: read `~/.claude/mcp.json`, parse, check `mcpServers.supabase`. If present, return null.

## Files you own

- `packages/cli/src/index.js` (the new helper + the listen-callback hook)

## Files you must NOT touch

- `packages/server/src/setup/supabase-mcp.js` (T1 — you only `require` it)
- `packages/server/src/index.js` (T2)
- `packages/client/public/app.js` (T3)
- The existing `runPreflight` / `printHealthBanner` logic — your hint runs alongside, not inside

## Acceptance criteria

- [ ] `checkSupabaseMcpHint(config)` exists and returns `null | string`.
- [ ] The yellow `[hint]` line prints exactly once on startup when RAG is enabled and the MCP isn't installed and `~/.claude/mcp.json` has no `supabase` entry.
- [ ] Tier 1 users (no config or `rag.enabled !== true`) see no `[hint]` output.
- [ ] `node --check packages/cli/src/index.js` clean.
- [ ] Append `[T4] DONE` to `docs/sprint-25-supabase-mcp/STATUS.md`.

## Sign-off format

```
### [T4] CLI preflight Supabase MCP hint

- checkSupabaseMcpHint added to packages/cli/src/index.js, lazy-requires supabase-mcp.js (T1's module).
- Wired into the server-listen callback alongside runPreflight. Prints yellow [hint] line only when RAG is enabled, MCP is missing, and ~/.claude/mcp.json has no supabase entry. Otherwise silent.
- Verified Tier 1 silent path with empty HOME fixture.
- node --check clean.

[T4] DONE
```
