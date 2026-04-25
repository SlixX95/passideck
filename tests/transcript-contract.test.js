'use strict';

// Contract tests for the transcript API endpoints.
// Sprint 8 T2 — prevents regression of the contract mismatch fixed in bb9bfd9.
//
// These tests hit a running TermDeck server at TERMDECK_URL (default
// http://localhost:3000). If the server isn't reachable, tests skip rather
// than fail — CI without a live stack stays green.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = (process.env.TERMDECK_URL || 'http://localhost:3000').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 3000;

let serverAvailable = false;
let skipReason = '';

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

test('GET /api/transcripts/recent returns { sessions: [...] } with session_id + chunks', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const res = await fetchWithTimeout(`${BASE_URL}/api/transcripts/recent?minutes=60`);
  assert.equal(res.status, 200, 'expected 200 OK');
  assert.match(res.headers.get('content-type') || '', /application\/json/, 'expected JSON content-type');

  const body = await res.json();
  assert.ok(body && typeof body === 'object', 'body is an object');
  assert.ok(Array.isArray(body.sessions), 'sessions is an array');

  for (const session of body.sessions) {
    assert.equal(typeof session.session_id, 'string', 'session.session_id is a string');
    assert.ok(Array.isArray(session.chunks), 'session.chunks is an array');
  }
});

test('GET /api/transcripts/search returns { results: [...] }', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const res = await fetchWithTimeout(`${BASE_URL}/api/transcripts/search?q=test`);
  // 200 with results, or 200 with empty results when the writer is disabled.
  assert.equal(res.status, 200, 'expected 200 OK');
  assert.match(res.headers.get('content-type') || '', /application\/json/, 'expected JSON content-type');

  const body = await res.json();
  assert.ok(body && typeof body === 'object', 'body is an object');
  assert.ok(Array.isArray(body.results), 'results is an array');
});

test('GET /api/transcripts/:sessionId returns { content, lines, chunks } for valid id', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  // Discover a real session_id via /api/transcripts/recent; fall back to a nonexistent id.
  let sessionId = null;
  try {
    const recentRes = await fetchWithTimeout(`${BASE_URL}/api/transcripts/recent?minutes=1440`);
    if (recentRes.ok) {
      const recent = await recentRes.json();
      if (Array.isArray(recent.sessions) && recent.sessions.length > 0) {
        sessionId = recent.sessions[0].session_id;
      }
    }
  } catch (_) { /* fall through */ }

  if (!sessionId) {
    return t.skip('no recent sessions available — cannot test valid-id shape');
  }

  const res = await fetchWithTimeout(`${BASE_URL}/api/transcripts/${encodeURIComponent(sessionId)}`);
  assert.equal(res.status, 200, 'expected 200 OK');
  assert.match(res.headers.get('content-type') || '', /application\/json/, 'expected JSON content-type');

  const body = await res.json();
  assert.equal(typeof body.content, 'string', 'content is a string');
  assert.ok(Array.isArray(body.lines), 'lines is an array');
  assert.ok(Array.isArray(body.chunks), 'chunks is an array');
});

test('GET /api/transcripts/:sessionId with nonexistent id returns empty content/lines/chunks', async (t) => {
  if (!serverAvailable) return t.skip(skipReason);

  const fakeId = '00000000-0000-0000-0000-000000000000';
  const res = await fetchWithTimeout(`${BASE_URL}/api/transcripts/${fakeId}`);
  assert.equal(res.status, 200, 'expected 200 OK');

  const body = await res.json();
  assert.equal(typeof body.content, 'string', 'content is a string');
  assert.equal(body.content, '', 'content is empty for nonexistent id');
  assert.ok(Array.isArray(body.lines), 'lines is an array');
  assert.equal(body.lines.length, 0, 'lines is empty for nonexistent id');

  // `chunks` is present when a transcriptWriter is configured. If absent
  // (writer disabled), accept that — the key is that whatever is returned
  // for chunks is either missing or an empty array.
  if ('chunks' in body) {
    assert.ok(Array.isArray(body.chunks), 'chunks is an array when present');
    assert.equal(body.chunks.length, 0, 'chunks is empty for nonexistent id');
  }
});
