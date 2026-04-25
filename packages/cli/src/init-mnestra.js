#!/usr/bin/env node

// `termdeck init --mnestra` — interactive wizard for TermDeck's Tier 2 memory
// layer. Wraps the six manual Mnestra setup steps into one command.
//
// Steps:
//   1. Collect Supabase URL, service_role key, direct DB URL, OpenAI + Anthropic keys
//   2. Connect via `pg` using the direct URL
//   3. Apply the six bundled Mnestra migrations in order
//   4. Write ~/.termdeck/secrets.env (merge-aware, preserves existing values)
//   5. Update ~/.termdeck/config.yaml to enable RAG + point at ${VAR} refs
//   6. Verify with a memory_status_aggregation() call
//
// Flags:
//   --help              Print usage and exit
//   --yes               Reserved (no-op as of v0.6.2 — wizard no longer asks "Proceed?" after secrets)
//   --dry-run           Print what the wizard would do; don't touch the DB or filesystem
//   --skip-verify       Skip the final memory_status_aggregation() check
//
// All control flow lives in this file. All prompts, file IO, and pg work
// delegate to packages/server/src/setup/**.

const path = require('path');
const fs = require('fs');

const SETUP_DIR = path.join(__dirname, '..', '..', 'server', 'src', 'setup');
const {
  prompts,
  dotenv,
  yaml,
  supabaseUrl: urlHelper,
  migrations,
  pgRunner
} = require(SETUP_DIR);

const HELP = [
  '',
  'TermDeck Mnestra Setup',
  '',
  'Usage: termdeck init --mnestra [flags]',
  '',
  'Flags:',
  '  --help            Print this message and exit',
  '  --yes             Reserved (no-op as of v0.6.2 — kept for forward compatibility)',
  '  --dry-run         Print the plan without touching the database or filesystem',
  '  --skip-verify     Skip the final memory_status_aggregation() sanity call',
  '',
  'What this does:',
  '  1. Prompts for Supabase URL, service_role key, direct Postgres connection',
  '     string, OpenAI API key, and (optional) Anthropic API key.',
  '  2. Applies the six Mnestra schema + RPC migrations via node-postgres.',
  '  3. Writes ~/.termdeck/secrets.env (merge-aware, preserves existing values).',
  '  4. Updates ~/.termdeck/config.yaml to enable RAG and reference ${VAR} keys.',
  '  5. Verifies the Mnestra store is reachable via memory_status_aggregation().',
  '',
  'Every secret stays on your machine. Nothing is ever printed once entered.',
  ''
].join('\n');

function parseFlags(argv) {
  const out = { help: false, yes: false, dryRun: false, skipVerify: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-verify') out.skipVerify = true;
  }
  return out;
}

function printBanner() {
  process.stdout.write(`
TermDeck Mnestra Setup
─────────────────────

This wizard configures TermDeck's Tier 2 memory layer (Mnestra) by:
  1. Asking for your Supabase URL and service_role key
  2. Asking for a direct Postgres connection string
  3. Applying six SQL migrations to the database
  4. Asking for an OpenAI API key (embeddings)
  5. Asking for an Anthropic API key (optional, summaries)
  6. Writing ~/.termdeck/secrets.env
  7. Updating ~/.termdeck/config.yaml to enable RAG
  8. Verifying the connection with a memory_status call

Press Ctrl+C at any time to cancel.

`);
}

function step(msg) { process.stdout.write(`→ ${msg}`); }
function ok(suffix = '') { process.stdout.write(` ✓${suffix ? ' ' + suffix : ''}\n`); }
function fail(err) { process.stdout.write(` ✗\n    ${err}\n`); }

async function collectInputs({ yes }) {
  const projectUrlStr = await prompts.askRequired(
    '? Supabase Project URL (e.g. https://xyz.supabase.co)',
    {
      validate: (v) => {
        const parsed = urlHelper.parseProjectUrl(v);
        return parsed.ok ? null : parsed.error;
      }
    }
  );
  const projectUrl = urlHelper.parseProjectUrl(projectUrlStr);

  process.stdout.write('? Supabase service_role key (starts sb_secret_ or eyJ): ');
  const serviceRoleKey = await promptSecretWithValidation(
    urlHelper.looksLikeServiceRole
  );

  process.stdout.write(
    '? Direct Postgres connection string\n' +
    `  (Supabase dashboard → Project Settings → Database → Connection String → Transaction pooler)\n` +
    '  postgres://postgres.REF:PW@... '
  );
  const databaseUrl = await promptSecretWithValidation(urlHelper.looksLikePostgresUrl);

  process.stdout.write('? OpenAI API key (starts sk-proj- or sk-): ');
  const openaiKey = await promptSecretWithValidation(urlHelper.looksLikeOpenAiKey);

  process.stdout.write('? Anthropic API key (optional, for session summaries): ');
  const anthropicKeyRaw = await prompts.askSecret('');
  const anthropicKey = anthropicKeyRaw || null;
  if (anthropicKey) {
    const shapeErr = urlHelper.looksLikeAnthropicKey(anthropicKey);
    if (shapeErr) {
      process.stdout.write(`  (warning: ${shapeErr} — storing anyway)\n`);
    }
  }

  // No confirm here — the user already opted in by typing
  // `termdeck init --mnestra` and supplying every secret. The previous
  // confirm gate was the consistent failure point in Brad's reports
  // (2026-04-25 twice + a third report after v0.6.1) on terminals that
  // emit stray bytes (CRLF, ANSI cursor reports, paste-bracketing) which
  // contaminated readline and made the confirm fast-resolve to "no" or
  // an empty cancel. Migrations are `IF NOT EXISTS` so a re-run is safe;
  // Ctrl-C still aborts cleanly. The `--yes` flag is preserved as a
  // stable CLI surface for callers/scripts and for future use.
  void yes;
  process.stdout.write('\n');

  return {
    projectUrl,
    serviceRoleKey,
    databaseUrl,
    openaiKey,
    anthropicKey
  };
}

// Wrapper that re-prompts on a shape mismatch instead of aborting. Max 3 tries.
async function promptSecretWithValidation(validator) {
  for (let i = 0; i < 3; i++) {
    const value = await prompts.askSecret('');
    if (!value) {
      process.stdout.write('  (required)\n? ');
      continue;
    }
    const err = validator(value);
    if (err) {
      process.stdout.write(`  (${err})\n? `);
      continue;
    }
    return value;
  }
  throw new Error('Too many invalid attempts — cancelling.');
}

async function applyMigrations(client, dryRun) {
  const files = migrations.listMnestraMigrations();
  if (files.length === 0) {
    throw new Error('No Mnestra migrations found. TermDeck install looks corrupted.');
  }

  for (const file of files) {
    const base = path.basename(file);
    step(`Applying migration ${base}...`);
    if (dryRun) { ok('(dry-run)'); continue; }
    const result = await pgRunner.applyFile(client, file);
    if (result.ok) {
      ok(`(${result.elapsedMs}ms)`);
    } else {
      fail(result.error);
      throw new Error(`Migration failed: ${base}`);
    }
  }
}

async function checkExistingStore(client) {
  step('Checking for existing memory_items table...');
  try {
    const result = await pgRunner.run(
      client,
      `SELECT COUNT(*)::bigint AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'memory_items'`
    );
    const exists = result.rows[0] && Number(result.rows[0].n) > 0;
    if (!exists) {
      ok('not found (will create)');
      return { exists: false, rows: 0 };
    }
    const countResult = await pgRunner.run(client, 'SELECT COUNT(*)::bigint AS n FROM memory_items');
    const rows = Number(countResult.rows[0].n);
    ok(`found (${rows.toLocaleString()} rows)`);
    return { exists: true, rows };
  } catch (err) {
    fail(err.message);
    throw err;
  }
}

async function verifyStatus(client) {
  step('Verifying memory_status_aggregation()...');
  try {
    const result = await pgRunner.run(client, 'SELECT * FROM memory_status_aggregation()');
    const row = result.rows && result.rows[0];
    if (!row) {
      fail('RPC returned no rows');
      return false;
    }
    const total = Number(row.total_active || 0);
    ok(`(${total.toLocaleString()} active memories found)`);
    return true;
  } catch (err) {
    fail(err.message);
    return false;
  }
}

function writeLocalConfig(inputs, dryRun) {
  step('Writing ~/.termdeck/secrets.env...');
  if (dryRun) { ok('(dry-run)'); }
  else {
    dotenv.writeSecrets({
      SUPABASE_URL: inputs.projectUrl.url,
      SUPABASE_SERVICE_ROLE_KEY: inputs.serviceRoleKey,
      DATABASE_URL: inputs.databaseUrl,
      OPENAI_API_KEY: inputs.openaiKey,
      ...(inputs.anthropicKey ? { ANTHROPIC_API_KEY: inputs.anthropicKey } : {})
    });
    ok();
  }

  step('Updating ~/.termdeck/config.yaml (rag.enabled: true)...');
  if (dryRun) { ok('(dry-run)'); }
  else {
    const r = yaml.updateRagConfig({
      enabled: true,
      supabaseUrl: '${SUPABASE_URL}',
      supabaseKey: '${SUPABASE_SERVICE_ROLE_KEY}',
      openaiApiKey: '${OPENAI_API_KEY}',
      anthropicApiKey: '${ANTHROPIC_API_KEY}'
    });
    if (r.backup) ok(`(backup: ${path.basename(r.backup)})`);
    else ok();
  }
}

function printNextSteps() {
  process.stdout.write(`
Mnestra is configured.

Next steps:
  1. Restart TermDeck: termdeck
  2. Flashback will fire automatically on panel errors
  3. Use the "Ask about this terminal" input to query memories
  4. Want async learning? Run: termdeck init --rumen
`);
}

async function main(argv) {
  const flags = parseFlags(argv || []);
  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  printBanner();

  let inputs;
  try {
    inputs = await collectInputs({ yes: flags.yes });
  } catch (err) {
    process.stderr.write(`\n[init --mnestra] ${err.message}\n`);
    return 2;
  }

  process.stdout.write('\n');
  step('Connecting to Supabase...');
  if (flags.dryRun) {
    ok('(dry-run, skipped)');
    await applyMigrations(null, true);
    writeLocalConfig(inputs, true);
    process.stdout.write('\nDry run complete. No changes were made.\n');
    return 0;
  }

  let client;
  try {
    client = await pgRunner.connect(inputs.databaseUrl);
    ok();
  } catch (err) {
    fail(err.message);
    process.stderr.write(
      '\nDouble-check the connection string from Supabase → Project Settings → Database → Connection String.\n'
    );
    return 3;
  }

  try {
    await checkExistingStore(client);
    await applyMigrations(client, false);
    writeLocalConfig(inputs, false);
    if (!flags.skipVerify) {
      const verified = await verifyStatus(client);
      if (!verified) {
        process.stdout.write(
          '\nMigrations applied, but memory_status_aggregation() is not responding yet.\n' +
          'This usually means the RPC was just created — give it a second and run:\n' +
          '  psql "$DATABASE_URL" -c "SELECT * FROM memory_status_aggregation();"\n'
        );
        return 4;
      }
    }
  } catch (err) {
    process.stderr.write(`\n[init --mnestra] ${err.message}\n`);
    return 5;
  } finally {
    try { await client.end(); } catch (_err) { /* ignore */ }
  }

  printNextSteps();
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      process.stderr.write(`\n[init --mnestra] unexpected error: ${err && err.stack || err}\n`);
      process.exit(1);
    });
}

module.exports = main;
