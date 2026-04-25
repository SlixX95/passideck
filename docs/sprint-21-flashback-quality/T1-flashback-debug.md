# T1 — Debug Why Flashback Never Fires

## Goal

Flashback hasn't fired in 15 sprints of active use. Find and fix the root cause.

## Investigation steps

1. Read `packages/server/src/index.js` — find the `onErrorDetected` callback wiring. Trace the full path:
   - session.js `_detectErrors()` → calls `this.onErrorDetected(this, ctx)`
   - index.js sets `session.onErrorDetected = (sess, ctx) => { ... }`
   - The callback calls `mnestraBridge.queryMnestra(...)` 
   
2. Check if the callback is actually being set. Read the PTY spawn section in index.js where `session.onErrorDetected` is assigned. Is it inside the right scope? Is it after the session is created?

3. Check the rate limiter in session.js — `_lastErrorFireAt` with 30s cooldown. Is this too aggressive? During sprints, errors might fire rapidly but never get a second chance.

4. Check the mnestra-bridge query. When `onErrorDetected` fires, what does it actually query? Read `mnestra-bridge/index.js` — the `queryMnestra` function. Does it:
   - Have the right Mnestra URL?
   - Use the right mode (direct/webhook/mcp)?
   - Actually send the query and handle the response?
   - Send the result back via WebSocket as a `proactive_memory` message?

5. Check if the error detection itself works. In session.js, the `errorLineStart` pattern (Sprint 16 fix) may be TOO strict for Claude Code sessions. The old broad pattern caught more errors; the new line-start pattern might not match real errors that appear mid-line.

6. Add diagnostic logging: when `onErrorDetected` fires, log `[flashback] error detected in session ${id}, querying Mnestra...` and when the result comes back, log `[flashback] query returned ${results.length} matches`.

## The most likely root causes (ranked)

1. **The `onErrorDetected` callback is set but `mnestraBridge.queryMnestra` silently fails** because the bridge mode is 'direct' and the direct query posts `recency_weight`/`decay_days` args that the bundled SQL function doesn't accept (ChatGPT flagged this as CONTRADICTIONS #1)
2. **The `errorLineStart` regex is too strict** and never matches real errors in Claude Code sessions
3. **The rate limiter fires once, the query fails, and subsequent errors within 30s are suppressed**
4. **The WebSocket `proactive_memory` message is sent but the client doesn't render it** (the toast handler has a bug)

## Fix

Whatever the root cause, fix it and verify by:
1. Creating a shell terminal
2. Running `cat /nonexistent/file`
3. Confirming "Error detected in output" appears in the panel header
4. Confirming a Flashback toast appears (or diagnostic log shows the query fired)

## Files you own
- packages/server/src/index.js (onErrorDetected wiring)
- packages/server/src/mnestra-bridge/index.js (query path)
- packages/server/src/session.js (error detection — ONLY if the regex is the problem)

## Acceptance criteria
- [ ] Root cause identified and documented in STATUS.md
- [ ] Fix applied
- [ ] Diagnostic logging added ([flashback] prefix)
- [ ] `cat /nonexistent/file` triggers an error detection
- [ ] Mnestra query fires (visible in logs)
- [ ] Write [T1] DONE to STATUS.md with the root cause
