# T2 — `termdeck doctor` Subcommand

## Goal

A new `termdeck doctor` subcommand that compares installed versions of the four stack packages against npm's latest, prints a table, and exits with a code reflecting whether updates are available.

## Files you own

- `packages/cli/src/doctor.js` (new)
- `tests/cli-doctor.test.js` (new)

## Files you must NOT touch

- `packages/cli/src/index.js` (T4 owns dispatch)
- `packages/cli/src/update-check.js` (T3)
- `README.md` / `docs/SEMVER-POLICY.md` (T1)

## Module contract (per Sprint 28 STATUS)

```js
module.exports = function doctor(argv) {
  // Returns Promise<exitCode>.
  //   0 = all current
  //   1 = at least one update available
  //   2 = network/registry failure or unrecoverable error
};
```

## Implementation

### Packages to check

```js
const STACK_PACKAGES = [
  '@jhizzard/termdeck',
  '@jhizzard/mnestra',
  '@jhizzard/rumen',
  '@jhizzard/termdeck-stack',
];
```

### How to detect installed version

Use `npm ls -g <pkg> --depth=0 --json` per package. Parse with `JSON.parse`. Treat missing entries as "not installed". Don't crash on stderr noise from npm — it logs warnings to stderr that aren't fatal.

### How to fetch latest version

Use Node's built-in `https` to GET `https://registry.npmjs.org/-/package/<encoded-pkg-name>/dist-tags`. Parse JSON, read `latest` field. 5-second timeout. If the request fails (offline, 5xx, timeout), mark that row's latest as `?` and exit code 2 wins over 1 wins over 0.

```js
async function fetchLatest(pkg) {
  // Returns string version on success, null on any failure.
  // Encode the @ and / in the package name with encodeURIComponent.
}
```

### Output format

```
TermDeck stack — version check

  Package                         Installed   Latest      Status
  ───────────────────────────────────────────────────────────────
  @jhizzard/termdeck              0.5.0       0.5.1       update available
  @jhizzard/mnestra               0.2.0       0.2.0       up to date
  @jhizzard/rumen                 (none)      0.4.3       not installed
  @jhizzard/termdeck-stack        0.1.0       0.1.0       up to date

  1 update available. Run: npx @jhizzard/termdeck-stack
  Or upgrade individually: npm install -g @jhizzard/termdeck@latest
```

Use ANSI color sparingly: green for "up to date", yellow for "update available", dim for "not installed". Mute color when stdout is not a TTY (`process.stdout.isTTY`).

### Exit codes

Compute after all four rows are resolved:

```
if (anyNetworkFailure) return 2;
if (anyUpdateAvailable) return 1;
return 0;
```

### Argv

The `argv` parameter is whatever follows `termdeck doctor` on the command line. Support:
- `--json` — emit machine-readable JSON instead of the table; same exit codes.
- `--no-color` — explicitly disable ANSI even on a TTY.

That's it. No `--package`, no `--check-only`, no flags we'll regret.

## Tests (`tests/cli-doctor.test.js`)

Use `node:test` + `node:assert/strict`. Mock the network surface by depending on a small internal `_fetchLatest` you export for tests:

```js
const doctor = require('../packages/cli/src/doctor.js');
test('exit code 0 when all up to date', async () => {
  // Stub _fetchLatest to return the same versions detectInstalled returns
  // (you can stub via dependency injection or by exporting both functions).
  ...
});
```

Three required cases:
1. All installed, all current → exit 0.
2. One installed and behind → exit 1.
3. Network failure on one → exit 2 even if others are current.

Plus one --json case asserting valid JSON output.

## Acceptance criteria

- [ ] `node packages/cli/src/doctor.js` runs (when invoked through T4's dispatch) and prints the table.
- [ ] `--json` produces parseable JSON.
- [ ] Exit codes 0/1/2 verified by `tests/cli-doctor.test.js` (4 cases).
- [ ] `node --check packages/cli/src/doctor.js` clean.
- [ ] `node --test tests/cli-doctor.test.js` passes.
- [ ] Append `[T2] DONE` to `docs/sprint-28-update-signal/STATUS.md`.
- [ ] Do not commit — orchestrator only.

## Sign-off format

```
### [T2] termdeck doctor subcommand

- New packages/cli/src/doctor.js, ~150 LOC, zero new deps.
- Detects installed via `npm ls -g`, latest via `https://registry.npmjs.org/-/package/<pkg>/dist-tags`.
- ANSI table output, --json and --no-color flags.
- Exit codes 0/1/2 per spec.
- tests/cli-doctor.test.js — 4 cases, all pass.

[T2] DONE
```
