# T3 — Startup Update-Check Banner (Rate-Limited)

## Goal

A passive update-discovery layer: when `termdeck` starts, kick off a non-blocking version check for `@jhizzard/termdeck` itself. If a newer version is available, print one yellow `[hint]` line. Rate-limited to once per 24h via a JSON cache at `~/.termdeck/update-check.json`. Suppressed by `TERMDECK_NO_UPDATE_CHECK=1`. Suppressed when stdout is not a TTY (CI runs stay clean).

## Files you own

- `packages/cli/src/update-check.js` (new)
- `tests/cli-update-check.test.js` (new)

## Files you must NOT touch

- `packages/cli/src/index.js` (T4 owns the wiring)
- `packages/cli/src/doctor.js` (T2)
- `README.md` (T1)

## Module contract (per Sprint 28 STATUS)

```js
module.exports = {
  checkAndPrintHint: async (config, opts) => {
    // Side effects only: maybe prints one yellow [hint] line, maybe writes
    // ~/.termdeck/update-check.json. Always resolves; never throws.
  },
};
```

`opts` is for tests: `{ now?: Date, registryUrl?: string, packageVersion?: string, cachePath?: string }`. All optional; defaults read the real values.

## Implementation

### Cache file `~/.termdeck/update-check.json`

```json
{
  "version": 1,
  "lastCheckedAt": "2026-04-25T15:30:00Z",
  "lastSeenLatest": "0.5.1",
  "installedAtCheck": "0.5.1"
}
```

The last two fields are diagnostic — they let `termdeck doctor` show what we last saw without making a fresh network call.

### Decision flow

```
if process.env.TERMDECK_NO_UPDATE_CHECK === '1' → return
if !process.stdout.isTTY → return                      // CI / piped output
if cache exists and (now - lastCheckedAt) < 24h → return
fetch latest version of @jhizzard/termdeck (5s timeout)
if fetch failed → swallow error, write nothing, return
write cache
if installed >= latest → return
print: \x1b[33m[hint]\x1b[0m TermDeck v<latest> available — upgrade with: npm install -g @jhizzard/termdeck@latest
print:        Or run \`termdeck doctor\` for the whole stack. Suppress with TERMDECK_NO_UPDATE_CHECK=1.
```

### How to fetch latest

GET `https://registry.npmjs.org/-/package/@jhizzard%2Ftermdeck/dist-tags` with 5s timeout. Read `latest`. Same approach as T2's doctor.js. **Do not depend on T2's module** — both paths can fail independently and we don't want a doctor.js import error to break startup. Copy ~10 LOC if needed.

### Reading the installed version

```js
const installed = require(path.join(__dirname, '..', '..', '..', 'package.json')).version;
```

The CLI is bundled with the @jhizzard/termdeck package, so the package.json three levels up from `packages/cli/src/` is the source of truth for what's running.

### Comparison

Use a tiny inline `compareSemver(a, b)` helper. Don't pull `semver` as a dep. Three-way compare on `[major, minor, patch]` after splitting on `.` and `parseInt`. Return -1 / 0 / 1.

### Failure modes — all swallowed

- Cache file unreadable / malformed JSON → treat as "no cache", continue with the network check.
- Cache file unwriteable → log nothing, continue without writing.
- Network timeout / DNS / 5xx → log nothing, return.
- Latest version string unparseable → log nothing, return.

The principle: an update check that fails should be invisible. Errors reach the user only when they break startup, which they must never do.

### Run as fire-and-forget

`checkAndPrintHint` returns a promise but the caller (T4) won't `await` it — they'll dispatch and move on. The hint line might print after the boxed banner. That's fine; non-blocking is more important than perfect ordering.

## Tests (`tests/cli-update-check.test.js`)

Use the `opts` injection points (no real network):

1. **Suppression by env var.** Set `TERMDECK_NO_UPDATE_CHECK=1`, call, assert no console output and no cache write.
2. **Suppression by fresh cache.** Pre-write a cache with `lastCheckedAt: now - 1h`, call, assert no network call (use `registryUrl: 'http://invalid.invalid'` and verify no error printed).
3. **Hint prints when update available.** `installedAtCheck: 0.5.0`, `packageVersion: '0.5.0'` arg, mock fetch returns `0.5.1`, assert one console.log with the right substring.
4. **No hint when up to date.** Same setup but mock fetch returns `0.5.0`, assert no `[hint]` line.
5. **Network failure swallowed.** Mock fetch throws / times out, assert no console output and no cache write.

## Acceptance criteria

- [ ] `packages/cli/src/update-check.js` exports `checkAndPrintHint`.
- [ ] All five test cases pass.
- [ ] Cache file format matches the spec; reads/writes honor it.
- [ ] `TERMDECK_NO_UPDATE_CHECK=1` is a hard suppression of all output.
- [ ] Non-TTY stdout skips the check.
- [ ] `node --check packages/cli/src/update-check.js` clean.
- [ ] Append `[T3] DONE` to STATUS.md.
- [ ] Do not commit — orchestrator only.

## Sign-off format

```
### [T3] startup update-check banner

- New packages/cli/src/update-check.js, ~120 LOC, zero new deps.
- Cache at ~/.termdeck/update-check.json with 24h TTL.
- Suppressions: TERMDECK_NO_UPDATE_CHECK=1, non-TTY stdout, fresh cache.
- All failures swallowed (network, parse, cache write).
- tests/cli-update-check.test.js — 5 cases, all pass.

[T3] DONE
```
