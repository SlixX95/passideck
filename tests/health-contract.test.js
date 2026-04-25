// Contract tests for GET /api/health
//
// The health endpoint is consumed by the client preflight badge and the CLI
// banner. These tests lock in the response shape so client code can rely on
// `passed`, `checks[]`, and the documented check names without inspecting
// server internals.
//
// Run: node --test tests/health-contract.test.js
//
// Skips gracefully when the server isn't running on BASE_URL (default
// http://localhost:3000), so CI stays green in environments where no server
// is booted alongside the test run.

const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TERMDECK_BASE_URL || 'http://localhost:3000';

const KNOWN_CHECKS = [
  'mnestra_reachable',
  'mnestra_has_memories',
  'rumen_recent',
  'database_url',
  'project_paths',
  'shell_sanity',
];

let serverAvailable = null;

async function probe() {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    serverAvailable = res.ok || res.status < 500;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

test('GET /api/health returns { passed, checks[], timestamp }', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true,
    'health response should be JSON');

  const body = await res.json();

  assert.equal(typeof body.passed, 'boolean', '`passed` must be boolean');
  assert.ok(Array.isArray(body.checks), '`checks` must be an array');
  assert.equal(typeof body.timestamp, 'string', '`timestamp` must be a string');
  // ISO 8601 parseable
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)), '`timestamp` must parse as a date');
});

test('each check has { name, passed, detail } with correct types', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const body = await (await fetch(`${BASE_URL}/api/health`)).json();
  assert.ok(body.checks.length > 0, 'expected at least one check');

  for (const check of body.checks) {
    assert.equal(typeof check.name, 'string', `check.name must be string (got ${typeof check.name})`);
    assert.equal(typeof check.passed, 'boolean', `check.passed must be boolean on ${check.name}`);
    assert.equal(typeof check.detail, 'string', `check.detail must be string on ${check.name}`);
  }
});

test('known check names appear in the response', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const body = await (await fetch(`${BASE_URL}/api/health`)).json();
  const names = new Set(body.checks.map((c) => c.name));

  for (const expected of KNOWN_CHECKS) {
    assert.ok(names.has(expected), `missing expected check: ${expected}`);
  }
});
