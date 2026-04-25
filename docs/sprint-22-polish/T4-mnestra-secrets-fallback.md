# T4 — Mnestra Auto-Read Secrets

## Goal

Make `mnestra serve` automatically read `~/.termdeck/secrets.env` when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY aren't set in the environment. This eliminates the #1 recurring startup friction: starting Mnestra without sourcing secrets first.

## Implementation

In the Mnestra repo at `~/Documents/Graciella/engram/`:

1. Read `dist/mcp-server/index.js` (or the source at `mcp-server/index.ts` if TypeScript source exists) — find where the `serve` subcommand starts the webhook server.

2. Before the server starts, add a fallback: if `SUPABASE_URL` is not set, check for `~/.termdeck/secrets.env`. If it exists, parse it (simple line-by-line key=value) and set the env vars.

```js
// Fallback: read ~/.termdeck/secrets.env if SUPABASE_URL not in env
if (!process.env.SUPABASE_URL) {
  const secretsPath = path.join(os.homedir(), '.termdeck', 'secrets.env');
  if (fs.existsSync(secretsPath)) {
    const lines = fs.readFileSync(secretsPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
    console.log('[mnestra] Loaded secrets from ~/.termdeck/secrets.env');
  }
}
```

3. Run `npm run build` to compile TypeScript → dist/
4. Test: `mnestra serve` without sourcing secrets first — verify it reads them automatically
5. Bump version to 0.2.1 in package.json
6. Run `npm publish --access public` (user will need to provide OTP)

## Files you own
- ~/Documents/Graciella/engram/ (entire Mnestra repo)

## Acceptance criteria
- [ ] `mnestra serve` works without manually sourcing secrets.env
- [ ] Falls back gracefully when secrets.env doesn't exist
- [ ] Doesn't override env vars that are already set
- [ ] Version bumped to 0.2.1
- [ ] Builds clean
- [ ] Write [T4] DONE to STATUS.md
