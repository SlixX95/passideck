# Sprint 23 — Responsive Layouts + Installation Simplification

Append-only coordination log.

## Mission

Two goals: (1) Make every layout work from 13" laptops to 27" iMacs. (2) Make the setup wizard actually WRITE config and run migrations — not just detect and display.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-responsive.md | packages/client/public/style.css, packages/client/public/app.js (fitAll only) |
| T2 | T2-wizard-write.md | packages/server/src/index.js (POST /api/setup endpoints), packages/client/public/app.js (wizard form submission) |
| T3 | T3-auto-migrate.md | packages/server/src/setup/ (migration runner), packages/cli/src/index.js (init dispatch) |
| T4 | T4-welcome-back.md | packages/client/public/app.js (returning user flow), scripts/start.sh |

## Rules
1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`. 4. Sign off with `[Tn] DONE`.

---
(append below)

### [T4] Returning-user welcome-back flow

- `packages/client/public/app.js`: split `maybeAutoOpenSetupWizard()` into two
  paths — `firstRun:true` still auto-opens the full wizard; `firstRun:false &&
  tier>=1` now shows a brief inline-styled welcome-back toast (top-right,
  5s auto-dismiss or click to dismiss). Format: `Stack: <tier label>. <N>
  memories. Last Rumen job: <X> ago.` Memory count and Rumen age are parsed
  from the existing `tiers[2].detail` / `tiers[3].detail` strings returned by
  `GET /api/setup`. Toast uses inline styles only — no `style.css` edits
  (T1 owns that file). Config button wiring unchanged — still opens the full
  setup modal via `openSetupModal`.
- `scripts/start.sh`: after the first-run `config.yaml` bootstrap block,
  added a second `sub_note` line directing the user to
  `http://localhost:$PORT` and the `config` button to finish setup. Returning
  runs are unaffected (the whole block is gated on `! -f "$CONFIG_FILE"`),
  so the existing stack summary still prints.
- Syntax verified: `node --check app.js` and `bash -n start.sh` both clean.
- Did not touch server source or CSS, per scope.

[T4] DONE

### [T3] Auto-migration in setup wizard

- New `packages/server/src/setup/migration-runner.js`: unified runner that
  applies the full 7-migration bootstrap sequence (6 bundled Mnestra SQL files
  under `mnestra-migrations/` + `config/transcript-migration.sql` tacked on at
  the end). `listAllMigrations()` returns the ordered absolute paths,
  `resolveDatabaseUrl()` falls back through explicit arg → `process.env` →
  freshly-read `~/.termdeck/secrets.env` (so the wizard path works right after
  T2 writes the file, with no server restart), and `runAll({ databaseUrl,
  onProgress })` streams start/step/done events while reusing the existing
  `pg-runner.applyFile` helper. Stops on first failure to avoid cascading
  errors from later migrations that depend on earlier ones. All migration
  files already use `IF NOT EXISTS` / `CREATE OR REPLACE`, so re-runs are
  no-ops — idempotence confirmed by reading the SQL.
- `packages/server/src/setup/index.js`: exposed the new module as
  `migrationRunner` on the setup barrel export alongside the existing
  prompts/dotenv/yaml/supabaseUrl/migrations/pgRunner helpers.
- `packages/server/src/index.js`: added `POST /api/setup/migrate` directly
  after the existing `GET /api/setup` handler. The endpoint reloads
  `secrets.env` into `process.env` on each call (without clobbering pre-set
  values), resolves `DATABASE_URL`, runs the full sequence, and returns
  `{ ok, applied, failed, total, results, events }` — per-migration status
  plus the streamed progress trail. A module-scoped `_migrateInFlight` guard
  returns 409 on concurrent invocations, and the `/api/setup` tier cache is
  invalidated on each run so tier status flips the moment migrations land.
  Server-side logs mirror the progress line-by-line (`Migration N/7: file ✓
  (ms)`). No client files touched.
- CLI dispatch (`packages/cli/src/index.js`) already routes `termdeck init
  --mnestra` into `init-mnestra.js`, which consumes the same underlying
  `setup/migrations` + `setup/pg-runner` modules the new runner builds on —
  verified. Intentionally did not migrate `init-mnestra.js` onto
  `migrationRunner.runAll`: that file is outside T3's ownership boundary
  (T3 owns `cli/src/index.js` for dispatch alignment only), and the wizard
  path plus CLI path both now apply the Mnestra sequence from the same
  bundled files. Transcript-migration parity for the CLI can be picked up
  in a follow-up sprint.
- Verified: `node --check` clean on `migration-runner.js`, setup `index.js`,
  and server `index.js`; a sanity `node -e` call confirms
  `listAllMigrations()` returns exactly 7 files in the expected order
  (001 → 006 Mnestra, transcript-migration.sql last).

[T3] DONE

### [T1] Responsive layouts

- `.term-panel` min dimensions: replaced `min-height: 0` with `min-height: 150px; min-width: 200px` so terminals can't collapse below readable size in deep grids.
- `@media (max-height: 800px)` — compact toolbar for 13" laptops: row-1 42→36px, row-2 32→28px, `.layout-btn`/`.topbar-right button`/`.topbar-ql-btn` tighten to 3px×7px padding + 10px font. Frees ~10px vertical.
- `@media (max-width: 1280px)` — `.layout-3x2` and `.layout-4x2` degrade to 2 columns (3 rows and 4 rows respectively) so every panel stays visible on a 1280-wide screen given the new 200px panel floor.
- `@media (max-width: 900px)` — orch layout collapses to a single column, grid becomes `overflow: auto` so very narrow browser windows stay usable.
- `@media (min-width: 1920px)` — panel floor bumps to 200×300px on 27" iMac / ultrawide displays to avoid empty slack around a single terminal.
- `app.js`: added `debounce(fn, wait)` helper + `fitAllDebounced` (100ms). Replaced the `resize → rAF → fitAll` handler with `window.addEventListener('resize', fitAllDebounced)`. The tour's separate resize listener for spotlight tracking is unchanged. Internal `fitAll()` callers (layout switch, panel create/remove, focus-mode exit) still call `fitAll()` directly via `requestAnimationFrame` — only the OS-driven resize path is debounced.
- Verified: `node --check app.js` clean. Did not touch server files.

[T1] DONE

### [T2] Wizard writes credentials

- `packages/server/src/index.js`: added `POST /api/setup/configure` immediately
  after `GET /api/setup` (so it sits next to T3's `/api/setup/migrate`). The
  endpoint accepts `{ supabaseUrl, supabaseServiceRoleKey, openaiApiKey,
  anthropicApiKey?, databaseUrl }`, validates the four required credentials in
  parallel, and only writes to disk when all three live checks pass:
  - `validateSupabase` — `GET <supabaseUrl>/rest/v1/` with `apikey` +
    `Authorization: Bearer` headers; treats 200 and 404 as success (URL
    reachable, auth accepted), 401/403 as an explicit auth failure.
  - `validateOpenAI` — `POST https://api.openai.com/v1/embeddings` with model
    `text-embedding-3-small` and a tiny test string; parses OpenAI's error
    envelope for a human-readable `detail` when the key is rejected.
  - `validateDatabase` — ephemeral `pg.Pool` + `SELECT 1 AS ok`, reports
    connect latency in ms on success.
  Validation results are returned as `{ validation: { supabase, openai,
  database } }` in both the success and 400 failure paths so the wizard can
  light up per-field ✓/✗ independent of overall outcome. Writes are atomic:
  secrets land in `~/.termdeck/secrets.env.tmp` → rename, then explicit
  `chmod 0o600`; existing unknown keys in the file are preserved (parser
  merges old + new). `config.yaml` is rewritten through `yaml.stringify` with
  `rag.enabled: true` and `${VAR}` references for any missing credential
  fields; prior yaml is backed up to `config.yaml.<iso-ts>.bak`. The in-memory
  `config.rag` is mutated alongside so subsequent PTY launches pick up the
  new flags without a restart. `_setupCache` is invalidated on success so the
  next `GET /api/setup` reflects the fresh tier-2 status. Added
  `const https = require('https');` to module imports for the OpenAI/Supabase
  HTTPS probes. Helper functions (`validateSupabase`, `validateOpenAI`,
  `validateDatabase`, `buildSecretsEnv`, `updateConfigYamlForRag`) live at
  module scope so they can be unit-tested without booting the server.
- `packages/client/public/app.js`: extended `renderSetupTiers` so Tier 2 renders
  a credential form (`renderSetupCredentialForm()`) instead of the
  `termdeck init --mnestra` CLI hint when status is `not_configured` or
  `partial`. Form carries five inputs (Supabase URL, Service Role Key, OpenAI
  Key, Database URL, optional Anthropic Key — all password-type except the
  URL, with `autocomplete="new-password"` + `spellcheck="false"` so browsers
  don't leak them). Enter inside the form submits; a dedicated "Save &
  Connect" button POSTs to `/api/setup/configure`. `submitSetupCredentials`
  paints per-credential ✓/✗ status with the server's `validation.*.detail`
  message, shows a consolidated error line on failure, and triggers
  `refreshSetupStatus()` 600ms after success so the tier badge flips to
  `active` without a manual re-check. Inline styles only — did not touch
  `style.css` (T1's file).
- Security: the bind guardrail in `index.js` already refuses non-loopback
  binds without `auth.token`, so `/api/setup/configure` is effectively
  localhost-only by default. Secrets never leave the machine — creds travel
  from the browser to 127.0.0.1, land in `secrets.env` with `chmod 600`,
  and the config.yaml rewrite only stores `${VAR}` references.
- Coordination: T3 owns `/api/setup/migrate` and the `setup/` module — did
  not modify either. T4 owns `maybeAutoOpenSetupWizard` / welcome-back toast
  — left those untouched. Wizard form lives entirely inside
  `renderSetupTiers`, which T4 did not touch.
- Verified: `node --check` clean on both `packages/server/src/index.js` and
  `packages/client/public/app.js`.

[T2] DONE

### [orchestrator] Audit fix

- Audit finding: `POST /api/setup/migrate` (T3) existed but nothing in the browser
  called it, so the wizard only wrote config — the sprint mission requires it to
  also run migrations. Wired `submitSetupCredentials` (T2's handler in app.js)
  so that on a successful `/api/setup/configure`, a new `runSetupMigrations()`
  helper POSTs to `/api/setup/migrate`, reports applied-vs-total or the failure
  detail in the same status line, then calls `refreshSetupStatus()` so the tier
  badge flips to active. No server files touched; all T1/T3/T4-owned code left
  alone. `node -c` clean on app.js/index.js/migration-runner.js. `lint-docs.sh` passes.

[orchestrator] AUDIT-FIX DONE
