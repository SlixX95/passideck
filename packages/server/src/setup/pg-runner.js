// Thin wrapper around node-postgres for applying SQL migration files.
//
// `pg` is a runtime dep of the top-level package and must be present when the
// init wizards run. If `require('pg')` fails we throw an actionable error
// pointing the user at `npm install` — TermDeck's normal install path pulls
// `pg` in automatically, so this only fires on partial / broken installs.

const fs = require('fs');
const path = require('path');

function loadPg() {
  try {
    return require('pg');
  } catch (err) {
    const e = new Error(
      "Could not load node-postgres ('pg'). TermDeck's init wizards need it to " +
      'apply migrations. Run `npm install` (or reinstall TermDeck with `npm install -g @jhizzard/termdeck`) and try again.'
    );
    e.cause = err;
    throw e;
  }
}

// Connect to the given postgres URL and return a live Client. The caller is
// responsible for `await client.end()`.
async function connect(databaseUrl) {
  const { Client } = loadPg();
  const client = new Client({
    connectionString: databaseUrl,
    // Supabase pooler endpoints present a TLS cert that Node's default CA
    // store accepts, but some users hit verification issues behind corporate
    // proxies. Enable TLS with rejectUnauthorized=false so the wizard works
    // in those environments — we're talking to a Supabase host we already
    // trust by project ref, and the connection is still encrypted.
    ssl: { rejectUnauthorized: false },
    // Keep connection attempts bounded so a misconfigured URL fails fast.
    connectionTimeoutMillis: 15000
  });
  try {
    await client.connect();
  } catch (err) {
    const friendly = mapConnectError(err);
    const e = new Error(`Could not connect to Postgres: ${friendly}`);
    e.cause = err;
    throw e;
  }
  return client;
}

function mapConnectError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/ENOTFOUND/.test(msg)) return 'host not found (check the project URL)';
  if (/ECONNREFUSED/.test(msg)) return 'connection refused (wrong port?)';
  if (/password authentication failed/i.test(msg)) return 'password authentication failed (check the service_role / db password)';
  if (/SASL/i.test(msg)) return 'authentication failed (check username, it should be `postgres` or `postgres.<project-ref>`)';
  if (/timeout/i.test(msg)) return 'connect timed out after 15s (network issue or wrong host)';
  return msg;
}

// Read a migration file and execute it as a single batched query. Returns
// `{ ok, file, elapsedMs, rowCount, skipped?, error? }`.
//
// A migration "skipped" means the file body included a marker the runner
// detected as already-applied (reserved for future use — currently not wired).
async function applyFile(client, filepath) {
  const started = Date.now();
  const sql = fs.readFileSync(filepath, 'utf-8');
  const base = path.basename(filepath);
  try {
    const result = await client.query(sql);
    const rowCount = Array.isArray(result)
      ? result.reduce((sum, r) => sum + (r && r.rowCount ? r.rowCount : 0), 0)
      : (result && result.rowCount) || 0;
    return {
      ok: true,
      file: base,
      elapsedMs: Date.now() - started,
      rowCount
    };
  } catch (err) {
    return {
      ok: false,
      file: base,
      elapsedMs: Date.now() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

// Apply a list of migration files in order. Returns an array of per-file
// results. Stops on first failure unless `continueOnError: true` is passed.
async function applyAll(client, files, { continueOnError = false } = {}) {
  const results = [];
  for (const file of files) {
    const result = await applyFile(client, file);
    results.push(result);
    if (!result.ok && !continueOnError) break;
  }
  return results;
}

// Run a single SQL string (not a file). Useful for parameterized checks like
// `SELECT COUNT(*) FROM memory_items`.
async function run(client, sql, params = []) {
  return client.query(sql, params);
}

module.exports = {
  connect,
  applyFile,
  applyAll,
  run
};
