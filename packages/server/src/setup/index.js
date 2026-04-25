// Aggregate export for the `termdeck init` setup helpers.
//
// The init wizards live in packages/cli/src/ but all the heavy lifting
// (prompting, reading/writing config, applying migrations) lives here so
// the CLI files can stay short, linear, and easy to audit.

module.exports = {
  prompts: require('./prompts'),
  dotenv: require('./dotenv-io'),
  yaml: require('./yaml-io'),
  supabaseUrl: require('./supabase-url'),
  migrations: require('./migrations'),
  pgRunner: require('./pg-runner'),
  migrationRunner: require('./migration-runner')
};
