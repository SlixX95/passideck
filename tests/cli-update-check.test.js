// Sprint 28 T3 — startup update-check tests.
//
// All five suppression / hint cases run with stubbed global.fetch and a fresh
// per-test cache directory. process.stdout.isTTY is forced true at module
// load so the tests work whether `node --test` is run interactively or piped.
//
// Run: node --test tests/cli-update-check.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkAndPrintHint } = require('../packages/cli/src/update-check.js');

// --- harness ---------------------------------------------------------------

// Force isTTY=true so the module's non-TTY suppression doesn't fire under
// `node --test`'s piped stdout. Restore the original value at process exit.
const ORIG_IS_TTY = process.stdout.isTTY;
process.stdout.isTTY = true;
process.on('exit', () => { process.stdout.isTTY = ORIG_IS_TTY; });

// Make sure the env-var suppression is off unless a test explicitly turns it
// on — the runner inherits parent env which might already have it set.
delete process.env.TERMDECK_NO_UPDATE_CHECK;

function freshCachePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'termdeck-uc-'));
  return path.join(dir, 'update-check.json');
}

function captureConsole() {
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => { lines.push(args.map(String).join(' ')); };
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  return {
    lines,
    restore() { console.log = origLog; console.error = origErr; },
  };
}

function stubFetch(handler) {
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, fetchOpts) => {
    calls.push(String(url));
    return handler(url, fetchOpts);
  };
  return {
    calls,
    restore() { global.fetch = orig; },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

// --- tests -----------------------------------------------------------------

test('suppression: TERMDECK_NO_UPDATE_CHECK=1 prevents output, network, and cache write', async () => {
  process.env.TERMDECK_NO_UPDATE_CHECK = '1';
  const cachePath = freshCachePath();
  const cap = captureConsole();
  const f = stubFetch(() => { throw new Error('fetch must not be called'); });
  try {
    await checkAndPrintHint({}, {
      cachePath,
      packageVersion: '0.5.0',
      registryUrl: 'http://invalid.invalid/dist-tags',
    });
    assert.equal(cap.lines.length, 0, 'expected no console output');
    assert.equal(f.calls.length, 0, 'expected no fetch calls');
    assert.equal(fs.existsSync(cachePath), false, 'expected no cache file');
  } finally {
    delete process.env.TERMDECK_NO_UPDATE_CHECK;
    cap.restore();
    f.restore();
  }
});

test('suppression: fresh cache (< 24h) skips the network call', async () => {
  const cachePath = freshCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  fs.writeFileSync(cachePath, JSON.stringify({
    version: 1,
    lastCheckedAt: oneHourAgo,
    lastSeenLatest: '0.5.1',
    installedAtCheck: '0.5.0',
  }), 'utf8');

  const cap = captureConsole();
  const f = stubFetch(() => { throw new Error('fetch must not be called'); });
  try {
    await checkAndPrintHint({}, {
      cachePath,
      packageVersion: '0.5.0',
      registryUrl: 'http://invalid.invalid/dist-tags',
    });
    assert.equal(cap.lines.length, 0, 'fresh cache must not produce output');
    assert.equal(f.calls.length, 0, 'fresh cache must not trigger a fetch');
    // Cache file is not rewritten when fresh.
    const after = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(after.lastCheckedAt, oneHourAgo);
  } finally {
    cap.restore();
    f.restore();
  }
});

test('hint prints when an update is available and cache is written', async () => {
  const cachePath = freshCachePath();
  const cap = captureConsole();
  const f = stubFetch(async () => jsonResponse({ latest: '0.5.1' }));
  try {
    await checkAndPrintHint({}, { cachePath, packageVersion: '0.5.0' });

    assert.equal(f.calls.length, 1, 'expected exactly one fetch call');
    const joined = cap.lines.join('\n');
    assert.match(joined, /\[hint\]/, 'expected a [hint] line');
    assert.match(joined, /v0\.5\.1/, 'expected the latest version in the message');
    assert.match(joined, /npm install -g @jhizzard\/termdeck@latest/);
    assert.match(joined, /TERMDECK_NO_UPDATE_CHECK=1/, 'expected the opt-out hint');

    assert.ok(fs.existsSync(cachePath), 'expected cache to be written');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(cache.version, 1);
    assert.equal(cache.lastSeenLatest, '0.5.1');
    assert.equal(cache.installedAtCheck, '0.5.0');
    assert.ok(typeof cache.lastCheckedAt === 'string' && cache.lastCheckedAt.length > 0);
  } finally {
    cap.restore();
    f.restore();
  }
});

test('no hint when installed >= latest (cache still written so we do not re-check immediately)', async () => {
  const cachePath = freshCachePath();
  const cap = captureConsole();
  const f = stubFetch(async () => jsonResponse({ latest: '0.5.0' }));
  try {
    await checkAndPrintHint({}, { cachePath, packageVersion: '0.5.0' });
    assert.equal(f.calls.length, 1, 'expected the fetch (cache was empty)');
    assert.equal(cap.lines.length, 0, 'expected no [hint] when up to date');
    // Cache is still written so the next startup respects the 24h TTL.
    assert.ok(fs.existsSync(cachePath));
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(cache.lastSeenLatest, '0.5.0');
    assert.equal(cache.installedAtCheck, '0.5.0');
  } finally {
    cap.restore();
    f.restore();
  }
});

test('network failure is swallowed — no output, no cache, no thrown error', async () => {
  const cachePath = freshCachePath();
  const cap = captureConsole();
  const f = stubFetch(() => { throw new Error('simulated network failure'); });
  try {
    await assert.doesNotReject(
      () => checkAndPrintHint({}, { cachePath, packageVersion: '0.5.0' }),
      'checkAndPrintHint must never throw'
    );
    assert.equal(cap.lines.length, 0, 'expected no console output on failure');
    assert.equal(fs.existsSync(cachePath), false, 'expected no cache write on failure');
  } finally {
    cap.restore();
    f.restore();
  }
});
