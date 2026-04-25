# T1 — CLI Banner Fix + Output Analyzer False Positive

## Goal

Fix two issues that erode trust in the product's polish.

### Fix 1: CLI ASCII box right border

The TermDeck startup banner in `packages/cli/src/index.js` has a broken right border. The dynamic version string (`TermDeck v${...}`) isn't padding correctly to align with the box characters.

Read the banner code (around line 110-118). The issue is the template literal with `require(...).version.padEnd(14)` — the padding math doesn't account for the full string width. Fix the padding so the right `║` aligns perfectly regardless of version string length.

Test by running `node packages/cli/src/index.js --help` or just checking the banner output visually.

### Fix 2: Output analyzer false positive

In `packages/server/src/session.js`, the error detection regex (`PATTERNS.error`) matches strings like "error", "Error", "command not found" etc. anywhere in the PTY output. This causes Claude Code terminals to show "Error detected in output" in the panel header even when the session completed successfully — because Claude Code's own tool output often contains error-like strings (grep results, test output, log lines).

Fix: Add a guard that suppresses the `errored` status transition when:
- The PTY exited with code 0 (clean exit), OR
- The session type is `claude-code` and the error string appears in the middle of a line (not at the start), suggesting it's in tool output rather than a real failure

The simplest approach: after a PTY exits with code 0, retroactively clear any `errored` status and set it back to `exited`. This way the error detection still fires in real-time (useful for live sessions) but doesn't persist as a false positive after clean completion.

## Files you own
- packages/cli/src/index.js (banner only)
- packages/server/src/session.js (error detection only)

## Acceptance criteria
- [ ] CLI banner right border aligns perfectly
- [ ] Clean PTY exits (code 0) don't show "Error detected in output" persistently
- [ ] Real errors (non-zero exit) still show the error indicator
- [ ] Write [T1] DONE to STATUS.md
