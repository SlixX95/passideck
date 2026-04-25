// Discover the SQL migration files that ship bundled inside the TermDeck
// package. Both init wizards call this — init-mnestra for the six Mnestra
// migrations, init-rumen for the two Rumen migrations.
//
// The wizards intentionally do NOT fall back to a sibling `../../mnestra`
// working copy. Resolution order:
//
//   1. Files bundled at `packages/server/src/setup/mnestra-migrations/*.sql`
//      (this directory is covered by the root package.json `files` glob).
//   2. Files at `node_modules/@jhizzard/mnestra/migrations/*.sql` if that
//      package is installed alongside TermDeck (future-proof path — shipping
//      `@jhizzard/mnestra` as an optional peer would let us drop the bundled
//      copy).

const fs = require('fs');
const path = require('path');

const SETUP_DIR = __dirname;

function listBundled(subdir) {
  const dir = path.join(SETUP_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));
}

function tryNodeModules(packageName, migrationSubdir = 'migrations') {
  try {
    // Resolve the package's main file, then look for a migrations sibling dir.
    const pkgJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [process.cwd(), SETUP_DIR]
    });
    const pkgDir = path.dirname(pkgJsonPath);
    const migrationDir = path.join(pkgDir, migrationSubdir);
    if (!fs.existsSync(migrationDir)) return [];
    return fs.readdirSync(migrationDir)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .sort()
      .map((f) => path.join(migrationDir, f));
  } catch (_err) {
    return [];
  }
}

function listMnestraMigrations() {
  const fromNm = tryNodeModules('@jhizzard/mnestra');
  if (fromNm.length > 0) return fromNm;
  return listBundled('mnestra-migrations');
}

function listRumenMigrations() {
  const fromNm = tryNodeModules('@jhizzard/rumen');
  if (fromNm.length > 0) return fromNm;
  return listBundled(path.join('rumen', 'migrations'));
}

function rumenFunctionDir() {
  // Same resolution order.
  try {
    const pkgJsonPath = require.resolve('@jhizzard/rumen/package.json', {
      paths: [process.cwd(), SETUP_DIR]
    });
    const candidate = path.join(path.dirname(pkgJsonPath), 'supabase', 'functions', 'rumen-tick');
    if (fs.existsSync(candidate)) return candidate;
  } catch (_err) { /* fallthrough */ }
  return path.join(SETUP_DIR, 'rumen', 'functions', 'rumen-tick');
}

function readFile(filepath) {
  return fs.readFileSync(filepath, 'utf-8');
}

module.exports = {
  listMnestraMigrations,
  listRumenMigrations,
  rumenFunctionDir,
  readFile
};
