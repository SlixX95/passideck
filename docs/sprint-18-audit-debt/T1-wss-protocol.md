# T1 — Protocol-Aware WebSocket URL

The client hardcodes `ws://` which blocks HTTPS deployment. Found by ChatGPT.

In `packages/client/public/app.js`, find `ws://${window.location.host}/ws` and replace with:
```js
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${wsProtocol}//${window.location.host}/ws`;
```

Also check for any other `ws://` hardcodes in app.js. Fix all of them.

### ALSO: Make start.sh source secrets BEFORE Mnestra autostart

The recurring Mnestra 0-memories bug happens because `mnestra serve` is launched without env vars. The fix in `scripts/start.sh`: move the secrets loading BEFORE the Mnestra autostart block (it should already be in the right order — verify this is the case). If mnestra.autoStart is true but secrets aren't loaded, print a clear error instead of starting with empty credentials.

## Files you own
- packages/client/public/app.js (WebSocket URL only)
- scripts/start.sh (verify secrets load order — read-only fix if needed)

## Acceptance criteria
- [ ] WebSocket URL auto-detects protocol (ws:// for http, wss:// for https)
- [ ] No hardcoded `ws://` remains in app.js
- [ ] start.sh loads secrets BEFORE attempting Mnestra autostart
- [ ] Write [T1] DONE to STATUS.md
