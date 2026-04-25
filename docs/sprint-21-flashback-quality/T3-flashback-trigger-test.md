# T3 — Flashback End-to-End Verification

## Goal

After T1 fixes Flashback, verify it works end-to-end. Update the trigger script and e2e test.

## Steps

1. **WAIT for T1 to write [T1] DONE** before testing.

2. Read `scripts/trigger-flashback.sh`. Update it if needed to work with the current server version (port, API paths, etc.)

3. Manually test Flashback:
   - Ensure Mnestra is running (`curl -s http://localhost:37778/healthz`)
   - Ensure TermDeck is running on :3000
   - Create a shell terminal via `POST /api/sessions`
   - Send an error command: `POST /api/sessions/:id/input` with `{"text": "cat /nonexistent/path\n"}`
   - Wait 5 seconds
   - Check server logs for `[flashback]` diagnostic lines
   - Check if a `proactive_memory` WebSocket message was sent

4. If Flashback fires successfully, document what happens. If it doesn't, document exactly where the pipeline breaks (error detected? query sent? query returned results? WS message sent? client rendered toast?)

5. Update `tests/flashback-e2e.test.js` if the test needs changes to match the fixed behavior.

## Files you own
- scripts/trigger-flashback.sh
- tests/flashback-e2e.test.js

## Acceptance criteria
- [ ] Flashback pipeline verified end-to-end (or failure point documented)
- [ ] trigger-flashback.sh works with current server
- [ ] Write [T3] DONE to STATUS.md with verification results
