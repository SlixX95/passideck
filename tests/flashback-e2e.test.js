'use strict';

// End-to-end test for the Flashback pipeline (Sprint 10 T2).
//
// Proves the chain fires under real conditions:
//
//   PTY stdout → session.analyzeOutput → _detectErrors
//              → onStatusChange → rag.onStatusChanged → rag_events
//              → onErrorDetected → mnestra-bridge.queryMnestra
//              → (optional) proactive_memory WS frame
//
// We use the rag_events `status_changed → errored` row as the authoritative
// signal that the analyzer fired, because session.meta.status can legitimately
// flip back to 'idle' one event loop later when the shell prompt lands in the
// next PTY chunk — that flap is a property of the analyzer, not a pipeline
// failure.
//
// Requires a running TermDeck server with Mnestra reachable. Skips gracefully
// when either is unavailable so CI without a live stack stays green.
//
// Run: node --test tests/flashback-e2e.test.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const BASE_URL = (process.env.TERMDECK_URL || process.env.TERMDECK_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const REQUEST_TIMEOUT_MS = 3000;
const EVENT_POLL_TIMEOUT_MS = 8000;
const EVENT_POLL_INTERVAL_MS = 200;

let skipAll = false;
let skipReason = '';
let createdSessionId = null;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function pollUntil(fn, { timeoutMs, intervalMs }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

before(async () => {
  // Probe the server + verify Mnestra is reachable. Flashback can't fire
  // without Mnestra, so testing the pipeline end-to-end requires both.
  let healthBody;
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
    if (!res.ok && res.status >= 500) {
      skipAll = true;
      skipReason = `server health returned ${res.status}`;
      return;
    }
    healthBody = await res.json();
  } catch (err) {
    skipAll = true;
    skipReason = `server unreachable at ${BASE_URL}: ${err.message}`;
    return;
  }

  const checks = Array.isArray(healthBody?.checks) ? healthBody.checks : [];
  const mnestra = checks.find((c) => c.name === 'mnestra_reachable');
  if (!mnestra || !mnestra.passed) {
    skipAll = true;
    skipReason = `mnestra_reachable not passing (${mnestra ? mnestra.detail : 'check absent'})`;
    return;
  }

  // rag_events is the authoritative observable. If the server has no SQLite
  // (db==null) the endpoint returns []; the pipeline cannot be observed.
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/rag/status`);
    if (!res.ok) {
      skipAll = true;
      skipReason = `rag status returned ${res.status}`;
      return;
    }
    const body = await res.json();
    // `localEvents` only exists when SQLite is live. Its absence means db==null.
    if (body.localEvents === undefined) {
      skipAll = true;
      skipReason = 'server has no SQLite — cannot observe rag_events';
    }
  } catch (err) {
    skipAll = true;
    skipReason = `rag status unreachable: ${err.message}`;
  }
});

after(async () => {
  if (!createdSessionId) return;
  try {
    await fetchWithTimeout(`${BASE_URL}/api/sessions/${createdSessionId}`, { method: 'DELETE' });
  } catch {
    // best-effort cleanup — server may already be gone
  }
});

test('error in PTY → output analyzer → mnestra-bridge query pipeline fires', async (t) => {
  if (skipAll) return t.skip(skipReason);

  // 1. Create a bash session. bash is picked so `cat /nonexistent` hits the
  //    real filesystem and produces a "No such file or directory" line that
  //    the error regex in session.js will match.
  const createRes = await fetchWithTimeout(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'bash', label: 'flashback-e2e' }),
  });
  assert.equal(createRes.status, 201, 'POST /api/sessions must return 201');
  const session = await createRes.json();
  assert.ok(session.id, 'session response must include an id');
  createdSessionId = session.id;

  if (session.meta?.status === 'errored') {
    // PTY spawn itself failed — can't exercise the pipeline.
    return t.skip(`session failed to spawn: ${session.meta.statusDetail || 'unknown'}`);
  }

  // 2. Attach a WebSocket to watch for proactive_memory frames. Best-effort:
  //    Mnestra may not have a matching memory, in which case no frame is sent.
  //    Reaching that branch proves the bridge was queried end-to-end.
  let proactiveMemoryFrame = null;
  let wsOpen = false;
  const ws = new WebSocket(`${WS_URL}?session=${createdSessionId}`);
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'proactive_memory') proactiveMemoryFrame = msg.hit;
    } catch {
      // non-JSON frames are not part of this contract
    }
  });
  await new Promise((resolve) => {
    const done = () => resolve();
    ws.once('open', () => { wsOpen = true; done(); });
    ws.once('error', done);
    setTimeout(done, 2000).unref?.();
  });

  // 3. Let the PTY finish spawning the shell before we write to it. Bash
  //    prints its prompt within a few ms, but give it a bit of slack.
  await sleep(500);

  // 4. Inject an error-triggering command. The bash stderr line matches
  //    PATTERNS.error in session.js, which flips meta.status to 'errored'
  //    AND fires onStatusChange (→ rag.onStatusChanged → rag_events insert)
  //    AND fires onErrorDetected (→ mnestra-bridge.queryMnestra).
  const inputRes = await fetchWithTimeout(`${BASE_URL}/api/sessions/${createdSessionId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'cat /nonexistent/file/path\n' }),
  });
  assert.equal(inputRes.status, 200, 'POST /api/sessions/:id/input must return 200');

  // 5. Poll /api/rag/events for a status_changed row transitioning this
  //    session into 'errored'. We poll rag_events rather than session.meta
  //    because the analyzer can legitimately flip status back to 'idle' when
  //    the bash prompt lands in the next chunk; the rag_events row is
  //    write-once and durable proof the analyzer fired.
  const erroredEvent = await pollUntil(async () => {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/api/rag/events?limit=200`);
      if (!res.ok) return null;
      const events = await res.json();
      return events.find((e) =>
        e.session_id === createdSessionId &&
        e.event_type === 'status_changed' &&
        e.payload?.to === 'errored'
      ) || null;
    } catch {
      return null;
    }
  }, { timeoutMs: EVENT_POLL_TIMEOUT_MS, intervalMs: EVENT_POLL_INTERVAL_MS });

  assert.ok(
    erroredEvent,
    `no status_changed→errored event appeared for session ${createdSessionId} within ${EVENT_POLL_TIMEOUT_MS}ms — output analyzer did not detect the error`
  );
  assert.equal(erroredEvent.payload.to, 'errored', 'rag event must log transition to "errored"');

  // 6. The mnestra-bridge call is fire-and-forget, so a failing Mnestra must
  //    not take the server down. Confirm /api/health still responds.
  const postHealth = await fetchWithTimeout(`${BASE_URL}/api/health`);
  assert.ok(postHealth.ok, 'server must remain responsive after pipeline fires');

  // 7. If Mnestra had a hit, the bridge will have pushed a proactive_memory
  //    frame over the WS. We don't require it — the test store may not match
  //    — but emit a diagnostic so reviewers see when the full happy path
  //    lit up. The mnestra-bridge fetch is async and fires after rag_events
  //    is already written, so give the frame up to 3s to arrive before we
  //    close the socket (closing too early = dropped hit, not a real failure).
  if (wsOpen && !proactiveMemoryFrame) {
    await pollUntil(() => proactiveMemoryFrame || null, {
      timeoutMs: 3000,
      intervalMs: 100,
    });
  }
  if (wsOpen && proactiveMemoryFrame) {
    const preview = JSON.stringify(proactiveMemoryFrame).slice(0, 200);
    t.diagnostic(`proactive_memory frame received: ${preview}`);
  }

  try { ws.close(); } catch { /* already closed */ }
});

// Sprint 26 T1 — bridge contract test.
//
// Sprint 21 T1 fixed a 15-sprint regression where queryDirect sent
// `recency_weight` / `decay_days` keys to an 8-arg PostgREST RPC, causing
// every Flashback query to silently 404. The trigger fired, but the bridge
// returned an error every time, so the user-visible behavior was "Flashback
// is silent." That class of regression is invisible to the trigger-side
// pipeline test above, because it succeeds even when the bridge is broken.
//
// This test asks the bridge for a string that cannot match anything and
// asserts the response shape: HTTP 200 with `{ memories: [], total: 0 }`.
// If a future change to the bridge adds an unsupported RPC parameter, breaks
// the function name, drifts on the SQL signature, or fails to map the response
// row shape, the bridge will return an error response and this test will fail
// loudly instead of degrading to "no Flashback."
test('mnestra bridge returns well-shaped response when there are zero hits', async (t) => {
  if (skipAll) return t.skip(skipReason);

  const res = await fetchWithTimeout(`${BASE_URL}/api/ai/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Random ASCII salad guaranteed to miss every real memory. Includes a
      // unique sentinel so log greppers can find this query if it ever fires
      // a real-world false positive.
      question: 'flashback-contract-test-zzqx-no-real-memory-should-match-this-12345',
      project: 'flashback-contract-test-nonexistent-project'
    })
  });

  assert.equal(
    res.status, 200,
    'POST /api/ai/query must return 200 even when there are zero hits — non-200 means the bridge layer (RPC signature, RPC name, auth, response mapping) regressed'
  );

  const body = await res.json();
  assert.ok(Array.isArray(body.memories), '`memories` must be an array');
  assert.equal(body.memories.length, 0, 'unique salad query must produce zero memories');
  assert.equal(typeof body.total, 'number', '`total` must be a number');
  assert.equal(body.total, 0, '`total` must be 0 when there are no hits');
});
