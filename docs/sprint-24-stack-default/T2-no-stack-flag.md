# T2 — `--no-stack` Opt-Out + `stack.js` Tier-1-Only Path

## Goal

Give every user a single-flag escape hatch back to the v0.4.6 `termdeck` behavior. Useful for diagnostics ("does this break only when Mnestra is in the picture?"), Tier-1-only testers, and anyone who just wants the multiplexer without orchestration noise.

## Implementation

### 1. Help text (in `packages/cli/src/index.js`)

Add a line under the existing `--no-open` / `--session-logs` block:

```
    termdeck --no-stack         Skip orchestrator detection (force Tier-1-only boot)
```

### 2. `stack.js` already accepts `--no-mnestra`

That flag stays — they're not the same thing. `--no-stack` is "don't run stack.js at all from the default path"; `--no-mnestra` is "I'm running stack.js but skip Step 2." T2 only adds the index-level filter; stack.js needs no changes.

### 3. Document the precedence

In the help text and in CHANGELOG: `--no-stack` is checked at the dispatch layer in index.js. T1 strips it from `args` before falling through to flag parsing so the existing parser never sees it as an unknown flag.

## Files you own

- `packages/cli/src/index.js` — help text only (T1 owns the dispatch logic)
- This doc

## Acceptance criteria

- [ ] `termdeck --help` shows the new `--no-stack` line.
- [ ] `termdeck --no-stack` on a Tier 2 machine bypasses the orchestrator and prints the bare TermDeck banner.
- [ ] `termdeck --no-stack --port 8080` works (flag parser still sees `--port 8080`).
- [ ] Write `[T2] DONE` to STATUS.md when verified.
