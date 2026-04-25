// Optional token authentication for TermDeck (Sprint 9 T3).
//
// When no token is configured, auth is a no-op — `createAuthMiddleware()` returns
// null and callers skip wiring. When a token is configured (config.auth.token
// OR the TERMDECK_AUTH_TOKEN env var), every request except /api/health must
// present the token via one of:
//   - Authorization: Bearer <token>
//   - ?token=<token> query parameter
//   - termdeck_token=<token> cookie
//
// Browser requests without a valid token receive a minimal HTML login page that
// stores the token in a cookie client-side and retries. API requests get a
// JSON 401.

function getConfiguredToken(config) {
  const fromConfig = config && config.auth && config.auth.token;
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim();
  const fromEnv = process.env.TERMDECK_AUTH_TOKEN;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return null;
}

function readCookieToken(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== 'termdeck_token') continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch (err) {
      return null;
    }
  }
  return null;
}

function extractToken(req) {
  const header = req.headers && req.headers['authorization'];
  if (typeof header === 'string') {
    const stripped = header.replace(/^Bearer\s+/i, '').trim();
    if (stripped) return stripped;
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token) {
    return req.query.token;
  }
  // Fallback for callers that did not parse query (e.g. WS upgrade path).
  if (!req.query && req.url) {
    try {
      const host = (req.headers && req.headers.host) || 'localhost';
      const parsed = new URL(req.url, `http://${host}`);
      const q = parsed.searchParams.get('token');
      if (q) return q;
    } catch (err) {
      // malformed URL — fall through
    }
  }
  const cookie = req.headers && req.headers.cookie;
  const fromCookie = readCookieToken(cookie);
  if (fromCookie) return fromCookie;
  return null;
}

function loginPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TermDeck — Sign in</title>
<style>
  html, body { height: 100%; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; }
  form { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 28px 32px;
    width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  h1 { margin: 0 0 6px; font-size: 18px; }
  p { margin: 0 0 18px; color: #8b949e; font-size: 13px; }
  label { display: block; font-size: 12px; margin-bottom: 6px; color: #8b949e; }
  input { width: 100%; padding: 8px 10px; border: 1px solid #30363d; border-radius: 6px;
    background: #0d1117; color: #c9d1d9; font: 13px ui-monospace, monospace; box-sizing: border-box; }
  input:focus { outline: 1px solid #1f6feb; }
  button { margin-top: 16px; width: 100%; padding: 8px; background: #238636; color: #fff;
    border: 0; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
  button:hover { background: #2ea043; }
  .err { color: #f85149; font-size: 12px; margin-top: 10px; min-height: 15px; }
</style>
</head>
<body>
<form onsubmit="return submitToken(event)">
  <h1>TermDeck</h1>
  <p>Enter the access token to continue.</p>
  <label for="t">Access token</label>
  <input id="t" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Sign in</button>
  <div class="err" id="err"></div>
</form>
<script>
function submitToken(e) {
  e.preventDefault();
  var err = document.getElementById('err');
  err.textContent = '';
  var t = document.getElementById('t').value.trim();
  if (!t) return false;
  document.cookie = 'termdeck_token=' + encodeURIComponent(t) +
    '; path=/; SameSite=Strict; Max-Age=2592000';
  var next = new URLSearchParams(location.search).get('next') || '/';
  fetch('/api/config', { credentials: 'same-origin' }).then(function(r) {
    if (r.ok) { location.href = next; return; }
    document.cookie = 'termdeck_token=; path=/; Max-Age=0';
    err.textContent = 'Invalid token.';
  }).catch(function() {
    err.textContent = 'Network error.';
  });
  return false;
}
</script>
</body>
</html>`;
}

function createAuthMiddleware(config) {
  const token = getConfiguredToken(config);
  if (!token) return null;

  return function authMiddleware(req, res, next) {
    // Health check stays open so external monitors can verify liveness
    // without being handed a secret.
    if (req.path === '/api/health') return next();

    const provided = extractToken(req);
    if (provided && provided === token) return next();

    // API clients always get JSON; browsers get the login page.
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (req.accepts && req.accepts('html')) {
      res.status(401);
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(loginPage());
    }
    return res.status(401).json({ error: 'unauthorized' });
  };
}

// Verify a WebSocket upgrade request. Used by the WS connection handler
// (Express middleware does not run on upgrades). Returns true if no token is
// configured OR the request presents a matching token.
function verifyWebSocketUpgrade(config, req) {
  const token = getConfiguredToken(config);
  if (!token) return true;
  const provided = extractToken(req);
  return !!provided && provided === token;
}

// Whether a usable auth token is configured (via config.auth.token or the
// TERMDECK_AUTH_TOKEN env var). Used by the bind guardrail in index.js to
// decide whether binding to a non-localhost interface is permitted.
function hasAuth(config) {
  return !!getConfiguredToken(config);
}

module.exports = {
  createAuthMiddleware,
  verifyWebSocketUpgrade,
  getConfiguredToken,
  hasAuth,
  loginPage
};
