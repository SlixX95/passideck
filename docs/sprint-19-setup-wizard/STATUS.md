# Sprint 19 — Setup Wizard Lite

Append-only coordination log.

## Mission

Add a `/setup` route that detects what's installed, shows tier status, and guides configuration. Behind `--setup` flag or accessible from the "config" button.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-setup-api.md | packages/server/src/index.js (GET /api/setup endpoint) |
| T2 | T2-setup-ui.md | packages/client/public/app.js (setup modal), packages/client/public/style.css |
| T3 | T3-first-run-detect.md | packages/server/src/index.js (first-run detection), packages/cli/src/index.js |
| T4 | T4-setup-docs.md | docs/GETTING-STARTED.md (reference setup wizard), README.md |

## Rules
1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`. 4. Sign off with `[Tn] DONE`.

---
(append below)

## [T4] 2026-04-18

- Added setup wizard note to docs/GETTING-STARTED.md — paragraph after Tier 1 "What's not active yet" block, directing users to the toolbar **config** button for tier status and guided instructions.
- Added setup wizard callout to README.md — one-liner immediately after the Tier 1 intro paragraph in the "One command to try it" section: "First-time user? The config button shows what's set up and what's next."
- Touched only the two owned docs; no code files modified.

[T4] DONE

## [T3] 2026-04-18

- Server (`packages/server/src/index.js`): added `const firstRun = !fs.existsSync(~/.termdeck/config.yaml)` at the top of `createServer` so the check happens once at startup. Exposed it on the existing `/api/config` response alongside `projects`, `defaultTheme`, etc. T1's `/api/setup` endpoint is already referencing this same variable.
- CLI (`packages/cli/src/index.js`): added `fs` + `os` requires and a matching `firstRun` check before `loadConfig()`. When true, the launcher prints the exact spec hint — `First run detected. Open http://localhost:3000 and click 'config' to set up.` — right after the startup box and before the preflight banner.
- Verified both files with `node -c`. No client files touched.

[T3] DONE

## [T1] 2026-04-18

- Server (`packages/server/src/index.js`): added `GET /api/setup` directly after `/api/health`. Imports `runPreflight` alongside the existing `createHealthHandler` import so the endpoint reuses the preflight check functions (mnestra_reachable, rumen_recent) rather than duplicating the probing logic.
- Response shape matches the spec: `{ tier, tiers: {1..4}, config: { hasSecretsFile, hasConfigFile, hasDatabaseUrl, hasMnestraRunning, hasRumenDeployed, projectCount }, firstRun }`. Consumes T3's `firstRun` local from line 75 — single source of truth, no recomputation.
- Tier classification:
  - T1 always `active` ("TermDeck running on :<port>").
  - T2 `active` if Mnestra reachable AND DATABASE_URL set; `partial` if Mnestra reachable but no DATABASE_URL; else `not_configured` with the preflight detail string.
  - T3 `active` if rumen_recent passed; `partial` if DATABASE_URL set but preflight reports "no completed Rumen jobs" or "stale"; else `not_configured`.
  - T4 `active` if at least one project in `config.projects`; else `not_configured`.
  - Top-level `tier` = highest contiguous tier with status active or partial.
- 60s in-memory cache (`_setupCache` / `_setupCachedAt`) keyed on the response payload so the UI can poll without re-running the preflight PTY/DB probes.
- Smoke-tested by booting `createServer` against a dummy config pointing Mnestra at a closed port. Response returned 200 with: tier=1, tier2 not_configured (ECONNREFUSED detail surfaced), tier3 active (live rumen_jobs hit), tier4 not_configured, firstRun=false — all fields matched the spec contract. `node --check` passed.
- Only touched packages/server/src/index.js. No client files modified.

[T1] DONE

## [T2] 2026-04-18

- Client (`packages/client/public/app.js`): added a Sprint 19 T2 section after `renderConfigDropdown`. Four new functions — `ensureSetupModal`, `openSetupModal`, `closeSetupModal`, `refreshSetupStatus`, `renderSetupTiers`, `maybeAutoOpenSetupWizard` — plus a `SETUP_TIERS` descriptor table and a `setupModalOpen` flag. Modal DOM is built dynamically (not touching index.html per ownership rules) and appended to `document.body` on first open.
- UI: full-screen overlay (z-index 3200) with 720px card. Vertical progress rail — one dot per tier (green = active, amber = partial, gray = not_configured), connected by a 2px line. Each tier shows name, description, live detail string from `/api/setup`, and copy-paste command(s) when not active. Next-to-install tier pulses via `@keyframes setup-pulse`. Re-check button refreshes via `refreshSetupStatus()`; Done closes.
- Config button wiring: replaced the legacy `setupInfoDropdown({ btnId: 'btn-config', ... })` call with a direct `openSetupModal` listener. `renderConfigDropdown` left as dead code to minimize diff risk. Status dropdown for `btn-status` is unchanged.
- Auto-open: `init()` now calls `maybeAutoOpenSetupWizard()` at the end. That helper hits `/api/setup` with raw `fetch` (so it can `res.ok`-check instead of throwing), opens the wizard on `firstRun=true` with an 800ms delay, and silently no-ops if the endpoint is missing (pre-T1 server) or if the onboarding tour is already active.
- Styles (`packages/client/public/style.css`): appended `.setup-modal` block before the scrollbar section. 51 setup-* selectors total, all scoped. Reuses existing CSS custom properties (`--tg-green`, `--tg-amber`, `--tg-accent`, etc.) so the wizard inherits the dashboard's Tokyo Night palette without introducing new tokens. Per-status dot + pill badge colors wired via `.setup-tier-<status>` and `.setup-tier-status-<status>`.
- Copy buttons clip to clipboard via `navigator.clipboard.writeText`, flash "copied!" for 1.5s, and only render for `termdeck *` shell commands (the Tier 4 hint is plain-text guidance, not runnable). Error surface in the body if `/api/setup` 404s or network fails.
- Verified with `node --check packages/client/public/app.js` → OK. No server files modified.

[T2] DONE
