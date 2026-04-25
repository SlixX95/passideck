# Sprint 24 — Make `termdeck` Orchestrate the Stack by Default

Append-only coordination log.

## Mission

After Sprint 23, `termdeck` only boots the multiplexer; users have to know about `termdeck stack` (shipped in v0.4.6) to also boot Mnestra and surface Rumen status. That's still discovery friction. This sprint flips the default: a returning user with a configured stack just runs `termdeck` and the right thing happens — Mnestra wakes if it's installed and `mnestra.autoStart: true`, Rumen status prints, then the dashboard opens. Tier-1-only users opt out with `--no-stack`.

This is option (3) from the 2026-04-25 packaging review. It folds the new `stack.js` orchestrator into the default code path so first-time and returning users have a single command to remember.

## Why now

Brad (Unagi tester, 2026-04-25) hit the gap: he installed via npm, asked Josh how to start TermDeck, was told `scripts/start.sh`, and discovered scripts/ isn't shipped in the npm tarball. v0.4.6 fixed that with a `termdeck stack` subcommand, but the right long-run fix is that `termdeck` itself does the right thing. Otherwise every new tester needs to be told "actually it's `termdeck stack`," which is the same kind of conversation we're trying to eliminate.

## Goals

1. **`termdeck` (no args) routes through the orchestrator** when a configured stack is detected. "Configured" means: `~/.termdeck/secrets.env` exists AND `~/.termdeck/config.yaml` has `mnestra.autoStart: true` OR `rag.enabled: true`. Otherwise behave as today (Tier-1-only, no orchestration).
2. **`termdeck --no-stack` always skips the orchestrator** — short path to the bare multiplexer for diagnostics or when someone doesn't want Mnestra to autostart.
3. **`termdeck stack` keeps working as an alias** so the v0.4.6 docs and Brad's muscle memory don't break.
4. **Backwards compatible for existing users**. A v0.4.5 user who upgrades to v0.5.0 must not see new prompts, must not have Mnestra auto-spawn unless they already had `mnestra.autoStart: true`, must not have any new config requirements.
5. **Cross-platform.** No bash dependency in the default path. Already true for `stack.js` (Sprint 23/v0.4.6 work).

## Out of scope

- The in-browser setup wizard's auto-orchestrate behavior — that's Sprint 23 territory and already shipped.
- Any change to Mnestra or Rumen package behavior.
- Windows-specific `lsof` replacement for stale-port reclaim — already handled by `stack.js` falling back gracefully.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-default-route.md | `packages/cli/src/index.js` (default-path detection + dispatch into `stack.js`) |
| T2 | T2-no-stack-flag.md | `packages/cli/src/index.js` flag parser, `packages/cli/src/stack.js` (`--no-stack` honor + log) |
| T3 | T3-readme-and-help.md | `README.md` Tier 1 quickstart, CLI help text in `packages/cli/src/index.js`, `docs/INSTALL.md`, `docs/GETTING-STARTED.md` |
| T4 | T4-upgrade-tests.md | `tests/cli-default-routing.test.js` (new), `tests/cli-stack-detection.test.js` (new) — fixture-driven so v0.4.5→v0.5.0 upgrade paths stay green |

## Detection rule (T1 to implement)

```
hasSecrets   = fs.existsSync(~/.termdeck/secrets.env)
yaml         = read(~/.termdeck/config.yaml) || {}
mnestraAuto  = yaml.mnestra?.autoStart === true
ragEnabled   = yaml.rag?.enabled === true

shouldOrchestrate = hasSecrets && (mnestraAuto || ragEnabled)
```

If `shouldOrchestrate` is true and no `--no-stack` flag is present, dispatch to `stack.js` exactly as `termdeck stack` does today. Otherwise fall through to the existing direct-launch path.

## Acceptance criteria

- [ ] `termdeck` on a fresh machine (no `~/.termdeck/`) behaves exactly as v0.4.6 — Tier 1, no Mnestra probe, no Rumen probe.
- [ ] `termdeck` on a Tier 2+ machine (the Brad case after v0.4.6 upgrade) prints the four-step orchestrator output and ends up at the dashboard.
- [ ] `termdeck --no-stack` always behaves like v0.4.6's `termdeck` (Tier-1-only, no orchestrator output).
- [ ] `termdeck stack` continues to work and behaves identically to `termdeck` when orchestration is detected.
- [ ] No new fields required in `config.yaml` — detection reads existing fields only.
- [ ] T4 tests cover: fresh machine, Tier 2 machine with `mnestra.autoStart: true`, Tier 2 machine with `mnestra.autoStart: false`, `--no-stack` override.
- [ ] CHANGELOG entry under v0.5.0 notes the default-behavior change with explicit upgrade-path messaging.

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---
(append below)
