# T1 — 0.0.0.0 Bind Guardrail + DEPLOYMENT.md Fix

## Goal

Prevent TermDeck from binding to non-localhost addresses without auth enabled. Fix the stale claim in DEPLOYMENT.md that was flagged by T3 in Sprint 9.

## Implementation

### 1. Bind guardrail in `packages/server/src/index.js`

In the `server.listen()` call, before binding:

```js
const host = config.host || '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
  const authToken = config.auth?.token || process.env.TERMDECK_AUTH_TOKEN;
  if (!authToken) {
    console.error('[security] Refusing to bind to ' + host + ' without auth.token set.');
    console.error('[security] Set auth.token in ~/.termdeck/config.yaml or TERMDECK_AUTH_TOKEN env var.');
    console.error('[security] To bind locally only, remove the host setting or set host: 127.0.0.1');
    process.exit(1);
  }
}
```

This makes the DEPLOYMENT.md claim true: the server refuses to start on 0.0.0.0 without auth.

### 2. Fix DEPLOYMENT.md

Read `docs/DEPLOYMENT.md`. The Sprint 9 T3 terminal flagged that it claims the server refuses to bind without auth but the guardrail wasn't implemented. Now that you're implementing it, verify the doc accurately describes the behavior. If the wording is slightly off, fix it to match the exact implementation.

### 3. Update auth.js if needed

If the auth module needs any adjustment to work with the guardrail (e.g., exposing a `hasAuth()` check), make it in `packages/server/src/auth.js`.

## Files you own
- packages/server/src/index.js (bind guard section only)
- packages/server/src/auth.js (if needed)
- docs/DEPLOYMENT.md (fix the stale claim)

## Acceptance criteria
- [ ] Server exits with clear error when host != localhost and no auth.token
- [ ] Server starts normally on 127.0.0.1 without auth (current behavior preserved)
- [ ] Server starts on 0.0.0.0 when auth.token is set
- [ ] DEPLOYMENT.md accurately describes the guardrail
- [ ] All catch blocks use catch (err)
- [ ] Write [T1] DONE to STATUS.md
