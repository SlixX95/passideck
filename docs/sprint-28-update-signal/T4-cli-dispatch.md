# T4 — CLI Dispatch: Wire `doctor` Subcommand + Update-Check Banner

## Goal

Two small additions to `packages/cli/src/index.js`:
1. Route `termdeck doctor` to T2's `packages/cli/src/doctor.js`.
2. After the existing `runPreflight(config)` call in the listen callback, fire-and-forget T3's `checkAndPrintHint(config)`.

That's it. Don't refactor anything else in this file.

## Files you own

- `packages/cli/src/index.js`

## Files you must NOT touch

- `packages/cli/src/doctor.js` (T2)
- `packages/cli/src/update-check.js` (T3)
- `tests/cli-doctor.test.js` (T2)
- `tests/cli-update-check.test.js` (T3)
- `README.md` / `docs/SEMVER-POLICY.md` (T1)

## Implementation

### 1. `doctor` subcommand dispatch

Add right after the existing `stack` subcommand block (around line 70):

```js
// `termdeck doctor` — Sprint 28: version-check the whole stack.
if (args[0] === 'doctor') {
  const doctor = require(path.join(__dirname, 'doctor.js'));
  doctor(args.slice(1)).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] doctor failed:', err && err.stack || err);
    process.exit(2);
  });
  return;
}
```

Keep the pattern identical to `forge` and `stack` for code-grep regularity. Add `'doctor'` to the `KNOWN_SUBCOMMANDS` set so the auto-orchestrate detection skips it.

### 2. Help text update

In the `--help` block (around line 110), add one line:

```
    termdeck doctor             Check whether the stack packages are up to date
```

### 3. Update-check call in listen callback

In the `server.listen(port, host, async () => { ... })` callback, after `runPreflight(config).then(printHealthBanner)`, before the auto-open block:

```js
// Sprint 28 T3: fire-and-forget update-check banner. Lazy-required so users
// who never start the server don't pay the require cost. Errors are swallowed
// inside the module; never blocks startup.
try {
  const { checkAndPrintHint } = require(path.join(__dirname, 'update-check.js'));
  checkAndPrintHint(config).catch(() => { /* swallowed inside the module too */ });
} catch (_e) { /* never block startup on a hint module load failure */ }
```

The double-protection (try/catch around the require + the swallowed `.catch`) is deliberate — if T3's module is missing or a parse error sneaks in, startup must not break.

### 4. KNOWN_SUBCOMMANDS update

```js
const KNOWN_SUBCOMMANDS = new Set(['init', 'forge', 'stack', 'doctor']);
```

This prevents the v0.5.0 auto-orchestrate detection from intercepting `termdeck doctor`.

## Acceptance criteria

- [ ] `node packages/cli/src/index.js doctor --help` (or just `doctor`) routes through T2's module and exits with the right code.
- [ ] `--help` text includes the new `doctor` line.
- [ ] On a normal `termdeck` startup (no subcommand), the listen callback fires `checkAndPrintHint` after `runPreflight`. If T3's module is missing entirely, startup still succeeds with no error.
- [ ] `node --check packages/cli/src/index.js` clean.
- [ ] `KNOWN_SUBCOMMANDS` includes `'doctor'`.
- [ ] Existing 13 Sprint 24 tests still pass: `node --test tests/cli-default-routing.test.js tests/cli-stack-detection.test.js`.
- [ ] Append `[T4] DONE` to STATUS.md.
- [ ] Do not commit — orchestrator only.

## Sign-off format

```
### [T4] CLI dispatch — doctor + update-check

- doctor subcommand routed in packages/cli/src/index.js using the same
  pattern as forge and stack. Added to KNOWN_SUBCOMMANDS.
- --help text gains the new line.
- Listen callback fires checkAndPrintHint(config) fire-and-forget after
  runPreflight. Double-protected against module load and runtime errors.
- node --check clean. Sprint 24 tests still 13/13.

[T4] DONE
```
