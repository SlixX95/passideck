// Sprint 28 T3 — passive startup update-check banner.
//
// Side-effect-only module. checkAndPrintHint() rate-limits a single GET against
// the npm registry's dist-tags endpoint to once every 24h via a JSON cache at
// ~/.termdeck/update-check.json, and prints one yellow [hint] line when a
// newer version of @jhizzard/termdeck is published. All failures are swallowed
// — startup must never block on this.
//
// Suppression order (any one short-circuits before any side effect):
//   1. process.env.TERMDECK_NO_UPDATE_CHECK === '1'
//   2. process.stdout.isTTY is falsy (CI, piped output)
//   3. cache exists and lastCheckedAt is within 24h of now
//
// Module contract per docs/sprint-28-update-signal/STATUS.md.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CACHE_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const PACKAGE_NAME = '@jhizzard/termdeck';
const REGISTRY_URL =
  'https://registry.npmjs.org/-/package/@jhizzard%2Ftermdeck/dist-tags';

function defaultCachePath() {
  return path.join(os.homedir(), '.termdeck', 'update-check.json');
}

// The CLI ships inside the @jhizzard/termdeck package; the workspace root
// package.json is three levels up from packages/cli/src/. If anything goes
// wrong reading it (renamed file, broken JSON), return null and let the caller
// suppress.
function defaultPackageVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
    return pkg && pkg.version ? String(pkg.version) : null;
  } catch {
    return null;
  }
}

function isValidSemver(v) {
  return typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v);
}

// Three-way semver compare on [major, minor, patch]. Pre-release suffixes are
// ignored — "0.5.1-beta" and "0.5.1" compare equal. Good enough for the hint.
function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function readCache(cachePath) {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cachePath, data) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Read-only home, ENOSPC, race with another process — all benign here.
  }
}

async function fetchLatest(registryUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(registryUrl, { signal: controller.signal });
    if (!res || !res.ok) return null;
    const json = await res.json();
    const latest = json && json.latest;
    return isValidSemver(latest) ? latest : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkAndPrintHint(_config, opts) {
  try {
    if (process.env.TERMDECK_NO_UPDATE_CHECK === '1') return;
    if (!process.stdout || !process.stdout.isTTY) return;

    const o = opts || {};
    const now = o.now instanceof Date ? o.now : new Date();
    const registryUrl = typeof o.registryUrl === 'string' ? o.registryUrl : REGISTRY_URL;
    const cachePath = typeof o.cachePath === 'string' ? o.cachePath : defaultCachePath();
    const installed = typeof o.packageVersion === 'string'
      ? o.packageVersion
      : defaultPackageVersion();

    if (!isValidSemver(installed)) return;

    const cache = readCache(cachePath);
    if (cache && cache.lastCheckedAt) {
      const lastMs = Date.parse(cache.lastCheckedAt);
      if (Number.isFinite(lastMs) && now.getTime() - lastMs < TTL_MS) {
        return;
      }
    }

    const latest = await fetchLatest(registryUrl);
    if (!isValidSemver(latest)) return;

    writeCache(cachePath, {
      version: CACHE_VERSION,
      lastCheckedAt: now.toISOString(),
      lastSeenLatest: latest,
      installedAtCheck: installed,
    });

    if (compareSemver(installed, latest) >= 0) return;

    console.log(
      '\x1b[33m[hint]\x1b[0m TermDeck v' +
        latest +
        ' available — upgrade with: npm install -g ' +
        PACKAGE_NAME +
        '@latest'
    );
    console.log(
      '       Or run `termdeck doctor` for the whole stack. ' +
        'Suppress with TERMDECK_NO_UPDATE_CHECK=1.'
    );
  } catch {
    // Never throw from a fire-and-forget hook.
  }
}

module.exports = {
  checkAndPrintHint,
  // Exported for unit testing only — not part of the public contract.
  _internal: { compareSemver, isValidSemver, readCache, writeCache, CACHE_VERSION, TTL_MS },
};
