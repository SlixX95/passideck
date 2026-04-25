# T3 — Optional Auth Mode

## Goal

Add a simple optional authentication layer so TermDeck can be safely exposed beyond localhost. This is NOT required for local use — it's an opt-in feature for users who want to run TermDeck on a remote machine or share it on a LAN.

## Implementation

### 1. `packages/server/src/auth.js` (new file)

Export an Express middleware factory:

```js
function createAuthMiddleware(config) {
  const token = config.auth?.token || process.env.TERMDECK_AUTH_TOKEN;
  if (!token) return null; // no auth configured — skip entirely
  
  return (req, res, next) => {
    // Allow health check without auth
    if (req.path === '/api/health') return next();
    
    const provided = req.headers['authorization']?.replace('Bearer ', '')
      || req.query.token;
    
    if (provided === token) return next();
    
    // For browser access: check cookie
    const cookie = req.headers.cookie?.split(';')
      .find(c => c.trim().startsWith('termdeck_token='));
    if (cookie && cookie.split('=')[1]?.trim() === token) return next();
    
    // No valid auth — show login page for browser, 401 for API
    if (req.accepts('html')) {
      return res.status(401).send(loginPage(config.port || 3000));
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}
```

Include a minimal `loginPage()` function that returns an HTML form posting the token as a cookie.

### 2. Wire into `packages/server/src/index.js`

After `app.use(express.json())`, add:
```js
const authMiddleware = createAuthMiddleware(config);
if (authMiddleware) {
  app.use(authMiddleware);
  console.log('[auth] Token authentication enabled');
}
```

Also add auth to WebSocket upgrade if token is set.

### 3. Config

Support in `~/.termdeck/config.yaml`:
```yaml
auth:
  token: my-secret-token  # or set TERMDECK_AUTH_TOKEN env var
```

When no token is configured, auth is completely disabled (current behavior).

## Files you own
- packages/server/src/auth.js (create)
- packages/server/src/index.js (auth middleware wiring only — coordinate with T2 if needed)

## Acceptance criteria
- [ ] No auth when token is not set (zero behavior change for existing users)
- [ ] Token auth works via header, query param, and cookie
- [ ] /api/health is accessible without auth
- [ ] WebSocket connections require token when auth is enabled
- [ ] Login page served for browser requests without valid token
- [ ] All catch blocks use catch (err) not bare catch {}
- [ ] Write [T3] DONE to STATUS.md
