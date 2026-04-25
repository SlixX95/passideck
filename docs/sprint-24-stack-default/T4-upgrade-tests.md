# T4 — Upgrade-Path Tests for the Default-Routing Change

## Goal

Default-behavior changes are exactly the kind of thing that breaks silently on user upgrades. Add a small, fast, fixture-driven test suite that proves the v0.4.5 → v0.5.0 upgrade path is clean and the dispatch logic respects every documented rule.

## Test surface

We don't need to actually spawn Mnestra or Express. We need to verify:
1. The detection helper (`shouldAutoOrchestrate`) returns the right boolean for the right inputs.
2. The dispatcher in `index.js` calls into `stack.js` only when detection is positive AND there's no `--no-stack`.

For (1), pure unit tests over a temp `~/.termdeck/` fixture.
For (2), a fork/exec test against `node packages/cli/src/index.js` that asserts on stdout — fast and doesn't require mocking.

## Test cases

### Detection (unit)

| Setup | Expected |
|-------|----------|
| Fresh machine — no `~/.termdeck/` | `false` |
| `~/.termdeck/secrets.env` exists, no `config.yaml` | `false` |
| `secrets.env` + `config.yaml` with `mnestra.autoStart: true` | `true` |
| `secrets.env` + `config.yaml` with `rag.enabled: true` | `true` |
| `secrets.env` + `config.yaml` with both flags `false` | `false` |
| `config.yaml` is malformed YAML | `false` (no throw) |

### Dispatch (integration via `node`)

| Invocation | Fixture state | Expected output |
|------------|---------------|-----------------|
| `termdeck` | fresh | "TermDeck v..." banner only, no Step 1/4 |
| `termdeck` | tier 2 + autoStart | Step 1/4 ... Step 4/4 lines visible |
| `termdeck --no-stack` | tier 2 + autoStart | banner only, no Step lines |
| `termdeck stack` | fresh | Step 1/4 ... Step 4/4 (forced orchestration) |
| `termdeck --port 8080` | tier 2 + autoStart | server bound to 8080 |

## Implementation tips

- Use `process.env.HOME = tmpdir()` in tests to redirect `~/.termdeck/` to a fixture directory. Mnestra/Rumen probes will all fall through quickly with WARN/SKIP — that's fine.
- Spawn the CLI with `--no-open` (already supported) so the integration tests don't try to launch a browser.
- Add a `--exit-after-banner` shortcut OR just kill the spawned process after we see the expected stdout — the test harness already does this for other CLI tests.

## Files you own

- `tests/cli-default-routing.test.js` (new)
- `tests/cli-stack-detection.test.js` (new)
- This doc

## Acceptance criteria

- [ ] Both test files run via `npm test` (the existing `node --test packages/server/tests/**/*.test.js` glob may need to widen — coordinate with T1 in STATUS.md if the test script needs updating).
- [ ] All seven detection cases pass.
- [ ] All five dispatch cases pass.
- [ ] CI (the GitHub Actions workflow added Sprint 22) is green.
- [ ] Write `[T4] DONE` to STATUS.md when verified.
