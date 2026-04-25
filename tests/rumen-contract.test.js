// Contract tests for the Rumen insights endpoints.
//
// Covered:
//   - GET  /api/rumen/insights      → { insights[], total } (or enabled:false)
//   - GET  /api/rumen/status        → JSON status object
//   - PATCH /api/rumen/insights/:id/seen with a fake UUID → 404-ish, never 500
//
// Run: node --test tests/rumen-contract.test.js
//
// Skips when the server isn't reachable on BASE_URL (default
// http://localhost:3000) so CI without a running server stays green.

const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TERMDECK_BASE_URL || 'http://localhost:3000';
const FAKE_UUID = '00000000-0000-4000-8000-000000000000';

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

test('GET /api/rumen/insights returns { insights[], total } shape', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/rumen/insights`);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true,
    'insights response should be JSON');

  const body = await res.json();

  assert.ok(Array.isArray(body.insights), '`insights` must be an array');
  assert.equal(typeof body.total, 'number', '`total` must be a number');

  // When DATABASE_URL isn't set the server short-circuits with enabled:false.
  // In that case the arrays are still present and total is 0.
  if ('enabled' in body) {
    assert.equal(typeof body.enabled, 'boolean', '`enabled` flag must be boolean when present');
    if (body.enabled === false) {
      assert.equal(body.insights.length, 0, 'insights must be empty when disabled');
      assert.equal(body.total, 0, 'total must be 0 when disabled');
    }
  }
});

test('GET /api/rumen/status returns JSON', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/rumen/status`);
  assert.ok(res.status < 500, `status endpoint should not 500 (got ${res.status})`);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true,
    'status response should be JSON');

  const body = await res.json();
  assert.equal(typeof body, 'object', 'status body must be an object');
  assert.ok(body !== null, 'status body must not be null');

  // Either the disabled shape ({enabled:false}) or the enabled shape with
  // summary counters — both share the `enabled` flag when the code path runs.
  if ('enabled' in body) {
    assert.equal(typeof body.enabled, 'boolean');
  }
});

test('PATCH /api/rumen/insights/:id/seen with fake UUID returns 4xx, not 500', async (t) => {
  if (!(await probe())) {
    t.skip('server not running on ' + BASE_URL);
    return;
  }

  const res = await fetch(
    `${BASE_URL}/api/rumen/insights/${FAKE_UUID}/seen`,
    { method: 'PATCH' }
  );

  assert.ok(res.status !== 500,
    `expected non-500 status for missing insight, got ${res.status}`);
  // Accept 404 (not found), 405 (method not allowed), or 400 (validation).
  assert.ok([400, 404, 405].includes(res.status),
    `expected 400/404/405, got ${res.status}`);
});
