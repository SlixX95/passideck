# Sprint 16 — UX Polish + Insight Quality

Append-only coordination log. Ready to execute.

## Mission

Six user-facing issues flagged during live testing on 2026-04-17:
1. CLI ASCII box right border misaligned (dynamic version string padding)
2. Flashback toast click goes to buried drawer tab — needs a proper modal
3. Output analyzer false positive: "Error detected in output" on clean exits
4. Project names show "chopin-nashville" (directory path) instead of config.yaml names
5. Rumen insights at 0.08 confidence are noise — need a threshold filter
6. No mechanism to audit/review insight quality over time

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-cli-error-fix.md | packages/cli/src/index.js (banner), packages/server/src/session.js (error detection) |
| T2 | T2-flashback-modal.md | packages/client/public/app.js (Flashback modal), packages/client/public/style.css (modal styles) |
| T3 | T3-project-names.md | packages/server/src/rag.js (project tagging), packages/server/src/mnestra-bridge/index.js (query context) |
| T4 | T4-insight-quality.md | packages/server/src/index.js (confidence filter on /api/rumen/insights), docs/INSIGHT-QUALITY.md (new) |

## File ownership

| File | Owner |
|------|-------|
| packages/cli/src/index.js | T1 |
| packages/server/src/session.js | T1 |
| packages/client/public/app.js | T2 |
| packages/client/public/style.css | T2 |
| packages/server/src/rag.js | T3 |
| packages/server/src/mnestra-bridge/index.js | T3 |
| packages/server/src/index.js | T4 (Rumen endpoint filter only) |
| docs/INSIGHT-QUALITY.md (new) | T4 |
| docs/sprint-16-ux-quality/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

---

## [T4] Progress

- Added `minConfidence` query param to `GET /api/rumen/insights` in packages/server/src/index.js. Default `0.15`, clamped to `[0, 1]`. Applied as a SQL predicate (`confidence >= $N`) that joins the existing `where` clause so it composes with `project`/`since`/`unseen` filters and the same `params` array is reused by both the count and list queries.
- Left the client untouched per file ownership. Server default of 0.15 filters the 0.08–0.09 noise without a client change.
- Wrote docs/INSIGHT-QUALITY.md (~65 lines): good vs. bad insight patterns, three tuning levers (raise threshold, exclude STATUS.md from Extract, periodic review via `/seen`), confidence band table, and endpoint reference.
- Verified the existing catch block reads `catch (err)` — no change needed.

[T4] DONE

---

## [T2] Flashback modal

- Replaced toast click handler in `packages/client/public/app.js`: no longer opens the drawer Memory tab; now calls `showFlashbackModal(hit, id)`.
- Added `showFlashbackModal` / `closeFlashbackModal` / `logFlashbackFeedback` helpers. Modal is built dynamically (no index.html changes — that file is not owned by T2).
- Modal content: header with "Flashback — similar issue found", project chip, similarity score chip; pre-formatted content body; meta row with project / source / relative timestamp; footer with "This helped" / "Not relevant" feedback buttons (fire-and-forget → `console.log`) and a Dismiss button.
- Close paths: X button, Dismiss, click backdrop, Escape key. Focus is returned to previous element on close.
- Added `.flashback-modal` styles to `packages/client/public/style.css` — 600px max-width centered card, dark overlay, purple accent matching the existing toast. Reused existing CSS variables (`--tg-surface`, `--tg-purple`, `--tg-accent-dim`, `--tg-red`, `--tg-green`).
- Toast appearance unchanged — only the click handler behavior changed.
- Did not touch any server files.

[T2] DONE

---

## [T1] CLI banner + error false-positive

- `packages/cli/src/index.js`: replaced the static `padEnd(14)` title line with a dynamically centered title. Computed `innerWidth = 38` (count of `═` between `╔`/`╗`), built `titleLine` as `' '.repeat(leftPad) + 'TermDeck v' + version + ' '.repeat(rightPad)` so the right `║` aligns regardless of version length. Verified with the current `0.3.7` version → titleLine is exactly 38 chars; box renders square.
- Root cause of the original bug: `12 leading spaces + "TermDeck v" (10) + padEnd(14) = 36 chars`, but the box's content width is 38. Off by 2 for any version length. The new code is robust to versions up to 28 chars.
- `packages/server/src/session.js`: added `PATTERNS.errorLineStart` (line-anchored variant of `PATTERNS.error`, drops the `\b5\d\d\b` HTTP-5xx alternation since that's never a Claude Code self-failure indicator).
- `_detectErrors()` now (a) early-returns when `meta.exitCode === 0` so trailing data after a clean exit can't retroactively flip status back to `errored`, and (b) uses `errorLineStart` for `claude-code` sessions so mid-line "Error" mentions in tool output (grep results, test logs, file contents) don't false-trigger.
- Real-time error detection still fires for live sessions (the guard only kicks in once exit code 0 is recorded by `index.js`'s `onExit` handler at line 222–224).
- Non-zero exits (real failures) are unaffected — `exitCode === 0` is the only short-circuit; any other exit code (including null while running) leaves detection enabled.
- All 35 existing tests in `packages/server/tests/session.test.js` still pass — including the 6 error-detection tests, which use the default `shell` type and unaffected `PATTERNS.error`.

[T1] DONE

---

## [T3] Project name resolution

- Added `resolveProjectName(cwd, config)` to `packages/server/src/rag.js` (exported alongside `RAGIntegration`). Expands `~`, resolves absolute paths, matches the longest `config.projects[*].path` prefix wins, falls back to directory basename when no config entry covers the cwd.
- Added `_projectFor(session)` helper on `RAGIntegration`. All five event hooks (`onSessionCreated`, `onCommandExecuted`, `onStatusChanged`, `onSessionEnded`, `onFileEdited`) now use it instead of raw `session.meta.project`, so sessions created without an explicit project are tagged via cwd → config rather than landing as `null` in Mnestra (where they were getting backfilled to mid-path segments like `chopin-nashville`).
- `packages/server/src/mnestra-bridge/index.js`: `queryMnestra` now accepts optional `cwd` / `sessionContext.cwd`. When the caller passes no explicit `project`, the bridge imports `resolveProjectName` from `../rag` and resolves the cwd against `config.projects` before dispatching to direct/webhook/mcp. Forward-compatible — existing Flashback caller in index.js (T4) still passes `sess.meta.project` unchanged.
- Verified: every `catch` clause in both files uses `catch (err)`.
- Unit-checked `resolveProjectName` against six inputs (exact match → `termdeck`; subdirectory → `termdeck`; tilde-path project → `mnestra`; unrelated `/tmp/foo/bar` → `bar`; empty string → null; null → null) — all expected.
- `node -c` clean on both files.
- Did not touch `packages/server/src/index.js`, any client files, or session.js — all outside T3 ownership.

[T3] DONE
