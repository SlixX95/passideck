// `termdeck doctor` — Sprint 28 T2.
//
// Compares installed versions of the four TermDeck-stack packages against
// the npm registry's `dist-tags.latest` and prints a status table. Zero new
// deps — uses only node:https, node:child_process, and process.stdout.
//
// Module contract (per docs/sprint-28-update-signal/STATUS.md):
//   module.exports = function doctor(argv): Promise<exitCode>
//     0 = all current
//     1 = at least one update available
//     2 = network/registry failure or unrecoverable error
//
// `_detectInstalled` and `_fetchLatest` are exposed as properties on the
// exported function so tests can monkey-patch the network/process surface
// without spinning up a real registry. The doctor body calls them via
// `module.exports.<name>` so monkey-patching takes effect at call time.

const https = require('https');
const { spawn } = require('child_process');

const STACK_PACKAGES = [
  '@jhizzard/termdeck',
  '@jhizzard/mnestra',
  '@jhizzard/rumen',
  '@jhizzard/termdeck-stack',
];

const REGISTRY_TIMEOUT_MS = 5000;
const NPM_LS_TIMEOUT_MS = 8000;

const STATUS = {
  UP_TO_DATE: 'up to date',
  UPDATE: 'update available',
  NOT_INSTALLED: 'not installed',
  NETWORK_ERROR: 'network error',
};

function makeColors(enabled) {
  if (!enabled) {
    return { green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s };
  }
  return {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
  };
}

// Detect installed version via `npm ls -g <pkg> --depth=0 --json`. Returns
// the version string on success, or null on "not installed" / parse failure
// / npm-missing-from-PATH / timeout. Stderr noise (npm WARN lines) is
// silently dropped — those are not fatal.
async function _detectInstalled(pkg) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('npm', ['ls', '-g', pkg, '--depth=0', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      return resolve(null);
    }

    let stdout = '';
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_e) { /* already gone */ }
    }, NPM_LS_TIMEOUT_MS);

    child.stdout.on('data', (b) => { stdout += b.toString('utf8'); });
    child.stderr.on('data', () => { /* discard npm WARNs */ });
    child.on('error', () => { clearTimeout(t); resolve(null); });
    child.on('close', () => {
      clearTimeout(t);
      if (timedOut) return resolve(null);
      try {
        const parsed = JSON.parse(stdout);
        const dep = parsed && parsed.dependencies && parsed.dependencies[pkg];
        if (dep && typeof dep.version === 'string') return resolve(dep.version);
        return resolve(null);
      } catch {
        return resolve(null);
      }
    });
  });
}

// Fetch the `latest` dist-tag for a package from the public npm registry.
// Returns the version string on success, or null on any failure (offline,
// non-200, malformed JSON, timeout). The caller treats null as a network
// error and bumps the exit code to 2.
async function _fetchLatest(pkg) {
  return new Promise((resolve) => {
    // Encode `@scope/name` as `%40scope%2Fname` per the registry's URL spec.
    const encoded = encodeURIComponent(pkg);
    const url = `https://registry.npmjs.org/-/package/${encoded}/dist-tags`;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    let req;
    try {
      req = https.get(url, { timeout: REGISTRY_TIMEOUT_MS }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return done(null);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed.latest === 'string') return done(parsed.latest);
            return done(null);
          } catch {
            return done(null);
          }
        });
        res.on('error', () => done(null));
      });
    } catch {
      return done(null);
    }
    req.on('timeout', () => {
      try { req.destroy(); } catch (_e) { /* already gone */ }
      done(null);
    });
    req.on('error', () => done(null));
  });
}

// Lightweight semver compare — only looks at the first three numeric segments,
// which is all dist-tags.latest ever needs. Returns -1, 0, or 1.
function _compareSemver(a, b) {
  const pa = String(a).split('.').map((s) => parseInt(s, 10) || 0);
  const pb = String(b).split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function classifyRow(installed, latest) {
  if (latest === null) return STATUS.NETWORK_ERROR;
  if (installed === null) return STATUS.NOT_INSTALLED;
  return _compareSemver(installed, latest) < 0 ? STATUS.UPDATE : STATUS.UP_TO_DATE;
}

function pad(s, n) {
  const str = String(s);
  return str.length >= n ? str : str + ' '.repeat(n - str.length);
}

function renderTable(rows, c) {
  const out = [];
  out.push(c.bold('TermDeck stack — version check'));
  out.push('');
  out.push(`  ${pad('Package', 32)}${pad('Installed', 12)}${pad('Latest', 12)}Status`);
  out.push('  ' + '─'.repeat(63));
  for (const r of rows) {
    const installedDisplay = r.installed === null ? '(none)' : r.installed;
    const latestDisplay = r.latest === null ? '?' : r.latest;
    let statusDisplay = r.status;
    if (r.status === STATUS.UP_TO_DATE) statusDisplay = c.green(r.status);
    else if (r.status === STATUS.UPDATE) statusDisplay = c.yellow(r.status);
    else if (r.status === STATUS.NOT_INSTALLED) statusDisplay = c.dim(r.status);
    else if (r.status === STATUS.NETWORK_ERROR) statusDisplay = c.dim(r.status);
    out.push(`  ${pad(r.package, 32)}${pad(installedDisplay, 12)}${pad(latestDisplay, 12)}${statusDisplay}`);
  }
  return out.join('\n');
}

function renderFooter(rows, exitCode) {
  if (exitCode === 2) {
    const errors = rows.filter((r) => r.status === STATUS.NETWORK_ERROR).length;
    return `\n  Could not reach npm registry for ${errors} package${errors === 1 ? '' : 's'}. Try again later.`;
  }
  if (exitCode === 1) {
    const updates = rows.filter((r) => r.status === STATUS.UPDATE).length;
    return (
      `\n  ${updates} update${updates === 1 ? '' : 's'} available. ` +
      `Run: npx @jhizzard/termdeck-stack\n` +
      `  Or upgrade individually: npm install -g @jhizzard/termdeck@latest`
    );
  }
  return `\n  All packages up to date.`;
}

function parseArgv(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    json: args.includes('--json'),
    noColor: args.includes('--no-color'),
  };
}

async function doctor(argv) {
  const opts = parseArgv(argv);

  // Resolve every package's installed + latest in parallel — independent
  // network/process calls, no reason to serialize.
  const rows = await Promise.all(
    STACK_PACKAGES.map(async (pkg) => {
      const [installed, latest] = await Promise.all([
        module.exports._detectInstalled(pkg),
        module.exports._fetchLatest(pkg),
      ]);
      return {
        package: pkg,
        installed,
        latest,
        status: classifyRow(installed, latest),
      };
    })
  );

  // Exit-code priority: any network failure → 2; any update available → 1;
  // else 0. Computed after all rows resolve so a single transient failure
  // doesn't mask real updates in stdout.
  let exitCode = 0;
  for (const r of rows) {
    if (r.status === STATUS.NETWORK_ERROR) {
      exitCode = 2;
      break;
    }
    if (r.status === STATUS.UPDATE && exitCode < 1) exitCode = 1;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ exitCode, rows }, null, 2) + '\n');
    return exitCode;
  }

  const colorEnabled = !opts.noColor && process.stdout.isTTY === true;
  const c = makeColors(colorEnabled);
  process.stdout.write(renderTable(rows, c) + '\n');
  process.stdout.write(renderFooter(rows, exitCode) + '\n');
  return exitCode;
}

module.exports = doctor;
module.exports._detectInstalled = _detectInstalled;
module.exports._fetchLatest = _fetchLatest;
module.exports._compareSemver = _compareSemver;
module.exports.STACK_PACKAGES = STACK_PACKAGES;
module.exports.STATUS = STATUS;
