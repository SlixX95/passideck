# Sprint 28 — Update-Signal Mechanisms

Append-only coordination log.

## Mission

Three small mechanisms that tell users they have an update available — without being annoying. Most TermDeck users today have no signal that v0.5.0/v0.4.6/v0.4.3 of the various pieces are out. Without a nudge they stay stale, hit fixed bugs, and assume the tool is broken. Three layered touchpoints solve this: a documented "stay current" path in the README, a `termdeck doctor` subcommand for on-demand checks, and a rate-limited startup banner for passive discovery.

All three respect a single env-var kill switch (`TERMDECK_NO_UPDATE_CHECK=1`) so power users opting out flip one variable, not three.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-readme-stay-current.md | `README.md`, `docs/SEMVER-POLICY.md` (new) — informational, no code |
| T2 | T2-doctor-subcommand.md | `packages/cli/src/doctor.js` (new), `tests/cli-doctor.test.js` (new) |
| T3 | T3-update-check.md | `packages/cli/src/update-check.js` (new), `tests/cli-update-check.test.js` (new), `~/.termdeck/update-check.json` cache schema |
| T4 | T4-cli-dispatch.md | `packages/cli/src/index.js` — wire `doctor` subcommand + lazy-call update-check in the listen callback |

## File ownership table

| File | Owner |
|------|-------|
| `README.md` | T1 |
| `docs/SEMVER-POLICY.md` (new) | T1 |
| `packages/cli/src/doctor.js` (new) | T2 |
| `tests/cli-doctor.test.js` (new) | T2 |
| `packages/cli/src/update-check.js` (new) | T3 |
| `tests/cli-update-check.test.js` (new) | T3 |
| `packages/cli/src/index.js` | T4 |

T2/T3/T4 are file-disjoint. T4 imports from T2/T3 modules — workers run in parallel; T4 writes the dispatch wiring against the documented module contracts (described in T2 and T3 specs) without needing T2/T3 to land first.

## Module contracts (so T4 doesn't have to wait)

```js
// packages/cli/src/doctor.js (T2)
module.exports = function doctor(argv) {
  // Prints a table: package, installed, latest, status. Returns Promise<exitCode>.
  // 0 = all current. 1 = at least one update available. 2 = network/registry failure.
};

// packages/cli/src/update-check.js (T3)
module.exports = {
  // Returns Promise<{ available: bool, package, installed, latest } | null>.
  // null = check skipped (cache fresh, env var set, offline). Errors are swallowed.
  // Reads/writes ~/.termdeck/update-check.json with a 24h TTL.
  checkAndPrintHint: (config, opts) => Promise<void>,
};
```

## Acceptance criteria

- [ ] `termdeck doctor` runs on a machine and prints a 4-row table (TermDeck, Mnestra, Rumen, termdeck-stack) with installed + latest versions and a status column. Exit codes 0/1/2 per the contract.
- [ ] On startup, when an update is available and the cache is stale, exactly one yellow `[hint]` line prints. Suppressed by `TERMDECK_NO_UPDATE_CHECK=1`. Suppressed when cache is fresh (< 24h). Never blocks startup.
- [ ] README has a "Stay current" section pointing at the meta-installer and `termdeck doctor`. `docs/SEMVER-POLICY.md` documents what each kind of bump means.
- [ ] All four `[Tn] DONE` in STATUS.md.

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED <reason>`.
4. Sign off with `[Tn] DONE`.
5. Workers never `git commit` / `git push` / `npm publish` — orchestrator only.

---
(append below)

### [T1] README + SEMVER-POLICY

- Added `## Staying current` section to `README.md` between "Alternative install paths" and "Related packages" (now lines 228–238). Three paths documented: (1) `npx @jhizzard/termdeck-stack` for the whole stack, (2) `termdeck doctor` for an on-demand 4-row table with documented exit codes 0/1/2, (3) the once-per-24-hour startup `[hint]` line backed by `~/.termdeck/update-check.json` and suppressible via `TERMDECK_NO_UPDATE_CHECK=1`. Linked to `docs/SEMVER-POLICY.md` at the end.
- New `docs/SEMVER-POLICY.md`, 51 lines (under the 100-line cap). Sections: semver in TermDeck land, per-package semantics for all four packages (termdeck / mnestra / rumen / termdeck-stack), the upgrade-risk table from the spec verbatim (TermDeck 0.4.x→0.5.x, 0.5.0→0.5.1, Mnestra 0.2.0→0.2.1, Rumen 0.4.0→0.4.2, Rumen 0.4.2→0.4.3), and a kill-switch section explicitly stating that `TERMDECK_NO_UPDATE_CHECK=1` only mutes the startup banner — `termdeck doctor` still queries the registry on demand.
- No code touched. `packages/cli/src/{doctor.js,update-check.js,index.js}` left for T2/T3/T4. `git status` shows only `README.md` and the new `docs/SEMVER-POLICY.md` from this task.

[T1] DONE

### [T4] CLI dispatch — doctor + update-check

- `termdeck doctor` subcommand routed in `packages/cli/src/index.js` using the same pattern as `forge` and `stack`: lazy `require('./doctor.js')`, await the returned promise, exit with the resolved code, exit 2 with a `[cli] doctor failed:` line on rejection. Block placed immediately after the `stack` subcommand block.
- `KNOWN_SUBCOMMANDS` is now `new Set(['init', 'forge', 'stack', 'doctor'])` so the v0.5.0 auto-orchestrate detection skips `termdeck doctor` the way it already skips `forge`/`stack`.
- `--help` text gains: `    termdeck doctor             Check whether the stack packages are up to date` (placed right after the existing `forge` line). Verified via `node packages/cli/src/index.js --help`.
- Listen callback fires `checkAndPrintHint(config)` fire-and-forget right after the existing `runPreflight(config).then(printHealthBanner)` block. Double-protected: outer `try { const { checkAndPrintHint } = require('./update-check.js'); … } catch (_e) {}` around the require so a missing T3 module can't break startup, plus a swallowed `.catch(() => {})` on the returned promise so any runtime rejection inside the module is invisible to the user.
- Verified missing-T3 tolerance: with both `doctor.js` and `update-check.js` not yet present on disk, a fresh-HOME `node packages/cli/src/index.js --no-stack --port 3994 --no-open` starts cleanly, prints the full health banner, and exits cleanly on SIGINT — no `MODULE_NOT_FOUND`, no thrown error, no `[cli] …` failure line.
- `node --check packages/cli/src/index.js` clean.
- Sprint 24 regression: `node --test tests/cli-default-routing.test.js tests/cli-stack-detection.test.js` → 13/13 pass (5 default-routing + 8 stack-detection), unchanged.
- Files I did NOT touch: `packages/cli/src/doctor.js` (T2), `packages/cli/src/update-check.js` (T3), `tests/cli-doctor.test.js` (T2), `tests/cli-update-check.test.js` (T3), `README.md` and `docs/SEMVER-POLICY.md` (T1).

[T4] DONE

### [T2] termdeck doctor subcommand

- New `packages/cli/src/doctor.js`, ~190 LOC, zero new deps. Uses `node:https` for the registry GET and `node:child_process.spawn` for `npm ls -g <pkg> --depth=0 --json`.
- Module export honours the contract: `module.exports = function doctor(argv): Promise<exitCode>`. Helpers `_detectInstalled`, `_fetchLatest`, `_compareSemver`, `STACK_PACKAGES`, and `STATUS` are attached as properties on the function so tests can monkey-patch the network/process surface; the doctor body looks them up via `module.exports.<name>` so monkey-patching takes effect at call time.
- Network error → row's `latest` displays as `?` and exit code 2 wins (per spec). 5s registry timeout, 8s `npm ls` timeout, both with SIGKILL + clearTimeout cleanup; stderr noise from `npm ls` is silently dropped (npm logs WARNs that aren't fatal).
- ANSI output: green for `up to date`, yellow for `update available`, dim for `not installed`/`network error`. Color is muted when `process.stdout.isTTY !== true`, when `--no-color` is passed, and unconditionally when `--json` is passed. `--json` emits `{ exitCode, rows: [{ package, installed, latest, status }, ...] }`.
- Footer text matches the spec example: `N updates available. Run: npx @jhizzard/termdeck-stack` plus the per-package upgrade hint, or `Could not reach npm registry for N packages. Try again later.` on exit 2, or `All packages up to date.` on exit 0.
- New `tests/cli-doctor.test.js` — 4 cases: all current → exit 0; one behind → exit 1; one network failure → exit 2 even when other rows are current; `--json` produces a parseable JSON document with the same exit code and four rows. All pass via `node --test tests/cli-doctor.test.js` (4/4 in ~100ms).
- Smoke-tested rendering manually with stubbed exports: matches the column layout in the spec ("Package / Installed / Latest / Status" with the box-drawing rule under it).
- `node --check packages/cli/src/doctor.js` clean. `node --check tests/cli-doctor.test.js` clean.
- Untouched per ownership table: `packages/cli/src/index.js` (T4 — already wired the dispatch with a lazy `require('./doctor.js')`, my contract matches), `packages/cli/src/update-check.js` (T3), `README.md` / `docs/SEMVER-POLICY.md` (T1).

[T2] DONE

### [T3] startup update-check banner

- New `packages/cli/src/update-check.js` (~150 LOC, zero new deps). Exports `checkAndPrintHint(config, opts)` per the Sprint 28 STATUS contract; also exposes a small `_internal` namespace (compareSemver / isValidSemver / readCache / writeCache / TTL / cache version) for unit tests, intentionally not part of the public surface.
- Suppression order, evaluated before any side effect:
  1. `process.env.TERMDECK_NO_UPDATE_CHECK === '1'` — hard kill switch, no fetch / no cache touch.
  2. `process.stdout.isTTY` falsy — CI and piped output stay clean.
  3. Cache `lastCheckedAt` within 24h of `now` — fresh cache short-circuits before the network.
- Network: GET `https://registry.npmjs.org/-/package/@jhizzard%2Ftermdeck/dist-tags` with a 5s `AbortController` timeout. Reads `json.latest`. **Does not depend on T2's `doctor.js`** — the ~10 LOC fetch is duplicated locally so a doctor.js import error can never break startup, per spec.
- Cache schema (`~/.termdeck/update-check.json`):
  ```json
  { "version": 1, "lastCheckedAt": "...ISO...", "lastSeenLatest": "0.5.1", "installedAtCheck": "0.5.0" }
  ```
  Version mismatch / malformed JSON → treated as "no cache" and the network check proceeds. Unwriteable cache (read-only HOME, ENOSPC) is swallowed.
- Hint format (matches T4's existing yellow `[hint]` style):
  ```
  \x1b[33m[hint]\x1b[0m TermDeck v<latest> available — upgrade with: npm install -g @jhizzard/termdeck@latest
         Or run `termdeck doctor` for the whole stack. Suppress with TERMDECK_NO_UPDATE_CHECK=1.
  ```
  Only printed when `compareSemver(installed, latest) < 0`. Pre-release suffixes are ignored (three-way compare on `[major, minor, patch]` only) — good enough for a hint.
- Failure swallowing: top-level `try { … } catch {}` around the entire body, plus per-step `try/catch` in `readCache`, `writeCache`, and `fetchLatest`. The function is documented as never throwing; tests assert `assert.doesNotReject` on the network-failure path.
- Installed version source: `require(path.join(__dirname, '..', '..', '..', 'package.json')).version` — three levels up from `packages/cli/src/`. Tests inject `packageVersion` directly so they don't depend on the workspace package.json value of the day.
- Fire-and-forget shape: `checkAndPrintHint` returns `Promise<void>`. T4's wiring already dispatches without `await` and double-wraps the require + `.catch(() => {})` per their sign-off — contract matches.
- New `tests/cli-update-check.test.js` — 5 cases per spec, all green:
  1. `TERMDECK_NO_UPDATE_CHECK=1` → 0 output / 0 fetch / 0 cache write (fetch stub throws if called, asserts the fetch isn't invoked).
  2. Fresh cache (`lastCheckedAt: now − 1h`) → 0 output / 0 fetch / cache `lastCheckedAt` unchanged.
  3. Update available (`packageVersion: 0.5.0`, mocked `latest: 0.5.1`) → exactly one fetch, `[hint]` line with `v0.5.1` + `npm install -g @jhizzard/termdeck@latest` + opt-out hint, cache written with `version:1, lastSeenLatest:0.5.1, installedAtCheck:0.5.0`.
  4. Up to date (mocked `latest: 0.5.0`) → no `[hint]`, cache still written so the 24h TTL is respected on the next launch.
  5. Network failure (fetch stub throws) → `assert.doesNotReject`, 0 output, 0 cache write.
  Harness: forces `process.stdout.isTTY = true` at module load (restored on `process.exit`) and stubs `global.fetch` per test so no real registry traffic ever leaves the test runner.
- `node --check packages/cli/src/update-check.js` clean. `node --test tests/cli-update-check.test.js` → 5/5 pass, 0 fail.
- Untouched per ownership table: `packages/cli/src/index.js` (T4), `packages/cli/src/doctor.js` (T2), `README.md` and `docs/SEMVER-POLICY.md` (T1). `tests/cli-doctor.test.js` (T2) also untouched.

[T3] DONE
