# Sprint 30 — Quality Pass + Wizard Bug Fix

Append-only coordination log.

## Mission

Codex's 2026-04-25 audit named "release-truth drift" (closed) and "central files too large + setup edge cases" as the remaining tech-debt items. Brad surfaced a concrete instance of the latter on 2026-04-25: the CLI init wizard aborts as if Ctrl-C was pressed after the Anthropic key prompt. Sprint 30 closes both: refactor the two large central files into focused modules, fix the wizard bug, ship the canonical operating docs in the npm tarball, and clean the 12 remaining silent catches surfaced in the Sprint 11 audit.

Goal: every Codex score lands ≥ 8.5 after this sprint and Sprint 31's external-proof updates.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-server-route-split.md | Refactor `packages/server/src/index.js` into route modules under `packages/server/src/routes/{health,sessions,setup,supabase,transcripts,themes}.js`. Each <300 LOC. |
| T2 | T2-client-module-split.md | Split `packages/client/public/app.js` into ES modules under `packages/client/public/modules/{wizard,drawer,layout,flashback,panels,switcher}.js`. Inline `<script type="module">` — no bundler. |
| ~~T3~~ | ~~T3-wizard-bug-fix.md~~ | **Already shipped as v0.6.1 on 2026-04-25.** Pulled out of sprint scope to unblock Brad — a working tester takes precedence over a sprint cadence. Three bugs fixed in `packages/server/src/setup/prompts.js`: CRLF leak, ANSI escape pollution, hard SIGINT during secret prompts. 7-fixture regression test at `tests/setup-prompts.test.js`. |
| T3 | T3-docs-shipping-and-catches.md | (a) Add `docs/ORCHESTRATION.md` + `docs/SEMVER-POLICY.md` + `docs/GETTING-STARTED.md` + `docs/WHY-THIS-EXISTS.md` (new) to `package.json` `files[]` array. (b) Address the 12 remaining silent `catch {}` blocks from the Sprint 11 audit. |
| T4 | T4-bridge-contracts.md | Add Mnestra MCP contract test + Rumen-write-back contract test (Codex audit named bridge-contract drift as a recurring debt vector). |

## File ownership table

| File | Owner |
|------|-------|
| `packages/server/src/index.js` | T1 (only the route extraction; T1 leaves middleware/init code in place) |
| `packages/server/src/routes/*.js` (new) | T1 |
| `packages/client/public/app.js` | T2 (becomes a thin entry point that imports modules) |
| `packages/client/public/modules/*.js` (new) | T2 |
| `packages/server/src/setup/prompts.js` | T3 |
| `tests/setup-prompts.test.js` (new) | T3 |
| `package.json` `files[]` array | T4 |
| `docs/WHY-THIS-EXISTS.md` (new) | T4 |
| Silent-catch sites across server/client | T4 (12 sites, list in spec) |

## Acceptance criteria

- [ ] `packages/server/src/index.js` shrinks to <500 LOC with route logic in `routes/`.
- [ ] `packages/client/public/app.js` becomes a thin module-importer; new modules each <400 LOC.
- [ ] Brad's wizard bug repros in a new test fixture and is fixed (the test is the regression check).
- [ ] `npm pack --dry-run` shows the four orchestration/policy docs included.
- [ ] All 12 silent-catch sites either log structured errors OR document why silent is correct (intentional feature-detection cases stay).
- [ ] All existing tests still pass: `node --test tests/*.test.js`.
- [ ] Append `[Tn] DONE` to STATUS.md.

## Rules

1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED <reason>`. 4. Sign off with `[Tn] DONE`.
5. Workers never `git commit` / `git push` / `npm publish` — orchestrator only.

---
(append below)

## 2026-04-25 — v0.6.2 wizard hotfix (Brad's third report)

Brad re-tested after v0.6.1 and the wizard still cancelled after the
Anthropic key prompt. Re-investigated the flow and the root cause was
**not** in `askSecret` (the v0.6.1 hardening held) — it was the
`prompts.confirm("Proceed with setup for project X?")` gate that ran
immediately after the last secret prompt in `init-mnestra.js`. On
Brad's terminal, byte residue from the secret prompts (or his Enter
keystroke) was carrying into the readline that powered the confirm
and resolving it as a soft-cancel before he could answer.

Fix: **removed the confirm in `init-mnestra.js`**. Justification:
the user already opted in by typing `termdeck init --mnestra` and
supplying four secrets; Mnestra migrations are `IF NOT EXISTS` so
re-runs are idempotent; Ctrl-C still aborts cleanly. The `--yes`
flag is preserved as a no-op for forward compatibility.

`init-rumen.js`'s confirm is intentionally retained — it gates a
heavier deploy step (Edge Function + secret-set + pg_cron) and runs
*before* any secret prompt, so its byte-contamination surface is
different. If a similar report comes back from Rumen we'll revisit.

T1/T2/T3-bridge-contracts/T4 from this sprint remain queued. This
hotfix did not consume sprint capacity beyond Brad-unblock.
