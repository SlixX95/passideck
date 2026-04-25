// Unified migration runner for the setup wizard and `termdeck init --mnestra`.
//
// Applies the full 7-migration bootstrap sequence in order:
//   1-6. Mnestra schema + RPCs (bundled under ./mnestra-migrations)
//   7.   termdeck_transcripts table (repo root: config/transcript-migration.sql)
//
// Every migration file is authored with IF NOT EXISTS / CREATE OR REPLACE so
// re-running the sequence is a no-op on an already-configured database.

const fs = require('fs');
const path = require('path');

const dotenv = require('./dotenv-io');
const migrations = require('./migrations');
const pgRunner = require('./pg-runner');

const TRANSCRIPT_MIGRATION = path.resolve(
  __dirname, '..', '..', '..', '..', 'config', 'transcript-migration.sql'
);

// Build the ordered list of absolute migration file paths. The transcript
// migration lives outside the Mnestra bundle so we tack it on at the end.
function listAllMigrations() {
  const mnestra = migrations.listMnestraMigrations();
  const files = mnestra.slice();
  if (fs.existsSync(TRANSCRIPT_MIGRATION)) {
    files.push(TRANSCRIPT_MIGRATION);
  }
  return files;
}

// Resolve DATABASE_URL from (in order) an explicit argument, process.env, or
// a freshly-loaded ~/.termdeck/secrets.env. The wizard path needs the third
// branch because it may have just written secrets.env without restarting the
// server, so process.env won't have picked up the new value.
function resolveDatabaseUrl(explicit) {
  if (explicit) return explicit;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const secrets = dotenv.readSecrets();
  return secrets.DATABASE_URL || null;
}

// Run the full migration sequence. Options:
//   - databaseUrl:   override URL (otherwise resolved per the rules above)
//   - onProgress:    (event) => void, fires for 'start'|'step'|'done'|'error'
// Returns { ok, applied, failed, results } where `results` is one entry per
// migration file: { file, ok, elapsedMs, error? }.
async function runAll({ databaseUrl, onProgress } = {}) {
  const url = resolveDatabaseUrl(databaseUrl);
  if (!url) {
    const err = new Error(
      'DATABASE_URL not set. Save credentials in the setup wizard (or set it in ~/.termdeck/secrets.env) and try again.'
    );
    err.code = 'NO_DATABASE_URL';
    throw err;
  }

  const files = listAllMigrations();
  if (files.length === 0) {
    const err = new Error('No migration files found. TermDeck install looks corrupted.');
    err.code = 'NO_MIGRATIONS';
    throw err;
  }

  const emit = (event) => { if (typeof onProgress === 'function') onProgress(event); };

  emit({ type: 'start', total: files.length });

  let client;
  try {
    client = await pgRunner.connect(url);
  } catch (err) {
    emit({ type: 'error', phase: 'connect', message: err.message });
    throw err;
  }

  const results = [];
  let appliedCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base = path.basename(file);
      const stepIdx = i + 1;
      emit({ type: 'step', index: stepIdx, total: files.length, file: base, status: 'running' });

      const result = await pgRunner.applyFile(client, file);
      const entry = {
        file: base,
        ok: result.ok,
        elapsedMs: result.elapsedMs,
        ...(result.error ? { error: result.error } : {})
      };
      results.push(entry);

      if (result.ok) {
        appliedCount++;
        emit({
          type: 'step',
          index: stepIdx,
          total: files.length,
          file: base,
          status: 'done',
          elapsedMs: result.elapsedMs
        });
      } else {
        failedCount++;
        emit({
          type: 'step',
          index: stepIdx,
          total: files.length,
          file: base,
          status: 'failed',
          error: result.error
        });
        // Stop on first failure — later migrations usually depend on earlier ones.
        break;
      }
    }
  } finally {
    try { await client.end(); } catch (_err) { /* ignore */ }
  }

  const ok = failedCount === 0 && appliedCount === files.length;
  emit({ type: 'done', ok, applied: appliedCount, failed: failedCount, total: files.length });

  return { ok, applied: appliedCount, failed: failedCount, total: files.length, results };
}

module.exports = {
  listAllMigrations,
  resolveDatabaseUrl,
  runAll,
  TRANSCRIPT_MIGRATION
};
