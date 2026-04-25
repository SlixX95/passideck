# T3 — Auto-Migration in Setup Wizard

## Goal

After credentials are saved (T2), automatically run Mnestra migrations so the user never touches psql.

## Implementation

### Migration runner

In `packages/server/src/setup/`, create a migration runner that:
1. Reads DATABASE_URL from the just-saved secrets.env
2. Connects via pg
3. Runs each Mnestra migration SQL file in order (001-006)
4. Runs the transcript migration (config/transcript-migration.sql)
5. Reports progress: "Migration 1/7... 2/7... done"

### Wire into setup wizard

Add a POST `/api/setup/migrate` endpoint:
- Reads DATABASE_URL from process.env (loaded from secrets.env)
- Runs the migration sequence
- Returns progress/results
- Idempotent — safe to re-run (all migrations use IF NOT EXISTS)

### CLI integration

Make `termdeck init --mnestra` use the same migration runner (it probably already does — verify and align).

## Files you own
- packages/server/src/setup/ (migration runner)
- packages/server/src/index.js (POST /api/setup/migrate endpoint only)
- packages/cli/src/index.js (init dispatch alignment only)

## Acceptance criteria
- [ ] Migrations run automatically from the wizard
- [ ] All 7 migrations (6 Mnestra + 1 transcript) applied
- [ ] Idempotent — re-running doesn't break anything
- [ ] Progress reported to the client
- [ ] Write [T3] DONE to STATUS.md
