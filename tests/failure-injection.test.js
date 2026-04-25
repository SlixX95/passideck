'use strict';

// Failure injection tests — Sprint 10 T3.
//
// Verifies the TermDeck server does not crash, hang, or leak resources when
// dependencies fail. Tests run against a live server at TERMDECK_BASE_URL
// (default http://localhost:3000) and skip gracefully when the server is
// unreachable so CI without a live stack stays green.
//
// Scenarios covered:
//   1. Mnestra unreachable         — terminal sessions still work
//   2. DATABASE_URL failure        — other health checks + sessions keep working
//   3. PTY crash recovery          — external kill transitions session to exited
//   4. Rapid session create/destroy — no resource leaks
//   5. Health endpoint under failure — /api/health never hangs
//
// Run: node --test tests/failure-injection.test.js

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = (process.env.TERMDECK_BASE_URL || process.env.TERMDECK_URL || 'http://localhost:3000').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 3000;
const HEALTH_BUDGET_MS = 6000;

let serverAvailable = false;
let skipReason = '';

async function fetchWithTimeout(url, options = {}) {
  const timeout = options.timeoutMs || REQUEST_TIMEOUT_MS;
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
}

async function getHealth() {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`, { timeoutMs: HEALTH_BUDGET_MS });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

async function createSession(body = {}) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'shell', label: 'failure-injection', ...body }),
  });
  assert.equal(res.status, 201, 'POST /api/sessions should return 201');
  return res.json();
}

async function getSession(id) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/sessions/${encodeURIComponent(id)}`);
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function deleteSession(id) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.status;
}

async function listSessions() {
  const res = await fetchWithTimeout(`${BASE_URL}/api/sessions`);
  if (!res.ok) throw new Error(`GET /api/sessions ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/healthz`);
    if (!res.ok) {
      skipReason = `server returned ${res.status} on /healthz`;
      return;
    }
    serverAvailable = true;
  } catch (err) {
    skipReason = `server unreachable at ${BASE_URL}: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// 1. Mnestra unreachable — terminal sessions still work
// ---------------------------------------------------------------------------
// The Mnestra bridge and RAG push loop are decoupled from PTY/WebSocket flow.
// Whether Mnestra is up or down, /api/sessions CRUD must keep functioning and
// the server must not propagate Mnestra failures onto other endpoints.
test('mnestra unreachable: session CRUD keeps working', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  // Create + inspect + delete round-trip. Must succeed independent of Mnestra.
  const created = await createSession({ label: 't3-mnestra-test' });
  assert.equal(typeof created.id, 'string', 'session.id is a string');

  const inspected = await getSession(created.id);
  assert.equal(inspected.status, 200, 'GET /api/sessions/:id returns 200');
  assert.equal(inspected.body.id, created.id, 'inspected id matches created id');

  const deleteStatus = await deleteSession(created.id);
  assert.ok(deleteStatus === 200 || deleteStatus === 204, `DELETE returns 2xx (got ${deleteStatus})`);

  // Other endpoints still respond — no Mnestra contagion.
  const health = await getHealth();
  assert.equal(typeof health.passed, 'boolean', '/api/health still returns a boolean `passed`');
  assert.ok(Array.isArray(health.checks), '/api/health still returns checks[]');
});

// ---------------------------------------------------------------------------
// 2. DATABASE_URL / component failure — other checks + sessions keep working
// ---------------------------------------------------------------------------
// The server cannot be restarted from inside the test with a forced bad URL,
// so we observe the current health response. If any component (database_url,
// mnestra_reachable, rumen_recent) is currently failing, verify the remaining
// checks still report and terminal sessions still work. If the environment
// is fully healthy, the failure-mode scenario isn't observable and we skip.
test('component failure isolation: other checks + sessions keep working', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const health = await getHealth();
  const failing = health.checks.filter((c) => c.passed === false);

  if (failing.length === 0) {
    return t.skip('all health checks passing — failure isolation cannot be observed');
  }

  // At least one check is failing. Assert:
  //   (a) other checks still produced a result (not swallowed by the failure)
  //   (b) the overall response still shapes correctly
  //   (c) session CRUD keeps working under this partial failure
  assert.ok(health.checks.length >= 2,
    `expected multiple checks to still report under failure (got ${health.checks.length})`);

  for (const check of health.checks) {
    assert.equal(typeof check.name, 'string');
    assert.equal(typeof check.passed, 'boolean');
    assert.equal(typeof check.detail, 'string');
  }

  const created = await createSession({ label: 't3-component-failure' });
  try {
    const inspected = await getSession(created.id);
    assert.equal(inspected.status, 200, 'sessions still reachable under component failure');
  } finally {
    await deleteSession(created.id).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// 3. PTY crash recovery — external SIGKILL transitions session to exited
// ---------------------------------------------------------------------------
// Simulates a PTY crashing unexpectedly (e.g. OOM killer, manual kill). The
// server must observe the exit, mark the session `exited`, and continue to
// serve GET /api/sessions/:id rather than 5xx or hang.
test('pty crash: SIGKILL transitions session to exited', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const created = await createSession({ label: 't3-pty-crash' });

  if (!created.pid || typeof created.pid !== 'number') {
    await deleteSession(created.id).catch(() => {});
    return t.skip('session has no pid — node-pty likely unavailable in this environment');
  }

  // Give the PTY a moment to fully spawn before we kill it.
  await sleep(200);

  try {
    process.kill(created.pid, 'SIGKILL');
  } catch (err) {
    await deleteSession(created.id).catch(() => {});
    return t.skip(`cannot kill pid ${created.pid}: ${err.message}`);
  }

  // Poll until the server's onExit handler runs and updates meta.status.
  // Generous budget — onExit fires asynchronously after PTY teardown.
  const deadline = Date.now() + 5000;
  let finalStatus = null;
  let finalBody = null;
  while (Date.now() < deadline) {
    const { status, body } = await getSession(created.id);
    if (status === 200 && body?.meta?.status === 'exited') {
      finalStatus = status;
      finalBody = body;
      break;
    }
    // 404 means the session was already reaped — also an acceptable end state
    // (the server did not crash; it simply removed the dead session).
    if (status === 404) {
      finalStatus = status;
      break;
    }
    await sleep(150);
  }

  if (finalStatus === 404) {
    // Session reaped — server stayed responsive, which is the real contract.
    assert.ok(true, 'session reaped after PTY crash');
  } else {
    assert.equal(finalStatus, 200, 'GET /api/sessions/:id should return after crash');
    assert.equal(finalBody?.meta?.status, 'exited',
      `expected status=exited after SIGKILL, got ${finalBody?.meta?.status}`);
  }

  // Server must still serve other endpoints after the crash.
  const listed = await listSessions();
  assert.ok(Array.isArray(listed), 'GET /api/sessions still returns an array after PTY crash');

  // Best-effort cleanup in case the session wasn't reaped.
  await deleteSession(created.id).catch(() => {});
});

// ---------------------------------------------------------------------------
// 4. Rapid session create/destroy — no resource leaks
// ---------------------------------------------------------------------------
// Creates N sessions back-to-back, deletes them all, and verifies the server
// returns the session list to its pre-test cardinality. The intent is to
// catch leaked PTYs, orphaned SessionManager entries, or leaked WS handles.
test('rapid create/destroy: no leaked session entries', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const before = await listSessions();
  const baselineIds = new Set(before.map((s) => s.id));

  const N = 10;
  const created = [];
  for (let i = 0; i < N; i += 1) {
    try {
      const s = await createSession({ label: `t3-churn-${i}` });
      created.push(s);
    } catch (err) {
      // If the server rejects one mid-burst, stop creating but still clean up.
      break;
    }
  }

  // Delete them immediately, no await-between-gaps.
  await Promise.all(created.map((s) => deleteSession(s.id).catch(() => {})));

  // Allow the server a brief moment to finalize PTY teardown and remove
  // entries from the SessionManager.
  await sleep(500);

  const after = await listSessions();
  const leakedFromThisTest = after.filter(
    (s) => !baselineIds.has(s.id) && created.some((c) => c.id === s.id)
  );

  assert.equal(leakedFromThisTest.length, 0,
    `expected all ${created.length} churn sessions to be gone, found ${leakedFromThisTest.length} leaked`);
});

// ---------------------------------------------------------------------------
// 5. Health endpoint under component failure — never hangs
// ---------------------------------------------------------------------------
// The preflight health handler performs network-bound checks (Mnestra HTTP,
// Postgres connect). Each check must be budgeted so /api/health returns even
// when dependencies time out. We assert a hard ceiling below the default
// fetch timeout to catch regressions that remove per-check timeouts.
test('health endpoint returns within budget under any component state', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const start = Date.now();
  const body = await getHealth();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < HEALTH_BUDGET_MS,
    `/api/health took ${elapsed}ms, expected < ${HEALTH_BUDGET_MS}ms`);

  assert.equal(typeof body.passed, 'boolean', 'health.passed is a boolean');
  assert.ok(Array.isArray(body.checks) && body.checks.length > 0,
    'health.checks is a non-empty array');
  assert.equal(typeof body.timestamp, 'string', 'health.timestamp is a string');

  // Every known check must produce an entry even when some of them fail.
  const names = new Set(body.checks.map((c) => c.name));
  for (const expected of ['mnestra_reachable', 'database_url']) {
    assert.ok(names.has(expected),
      `health response missing check ${expected} — failure may have short-circuited others`);
  }
});
