const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const tmpRoot = path.join(os.homedir(), 'tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const home = fs.mkdtempSync(path.join(tmpRoot, 'passideck-validation-test-'));
process.env.PASSIDECK_HOME = home;

let app;
const opened = ws => new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    const { createServer, syncHermesTitles } = require('../packages/server/src/index');
    const oldToken = process.env.PASSIDECK_AUTH_TOKEN;
    delete process.env.PASSIDECK_AUTH_TOKEN;
    const remoteWithoutAuth = createServer({ host: '0.0.0.0', shell: '/bin/bash' });
    await remoteWithoutAuth.close();
    if (oldToken === undefined) delete process.env.PASSIDECK_AUTH_TOKEN;
    else process.env.PASSIDECK_AUTH_TOKEN = oldToken;

    app = createServer({ host: '127.0.0.1', shell: '/bin/bash' });
    const writes = [];
    const resizes = [];
    const session = app.sessions.create({ id: 'validation' });
    session.pty = { write: text => writes.push(text), resize: (cols, rows) => resizes.push([cols, rows]) };
    const hermesDb = new Database(path.join(home, 'hermes-state.db'));
    hermesDb.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, started_at REAL, title TEXT)');
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-1', 'passideck:validation', 1, 'Canonical Hermes Title');
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 1, 'Hermes DB title must update the matching PassiDeck pane');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-2', 'passideck:validation', 2, null);
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 1, 'a newer untitled Hermes session must clear the stale title');
    assert.strictEqual(session.meta.title, '');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-2');
    hermesDb.close();
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;
    const base = `http://127.0.0.1:${port}`;

    const inputResponse = await fetch(`${base}/api/sessions/validation/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(1024 * 1024 + 1) })
    });
    assert.strictEqual(inputResponse.status, 413, 'oversized terminal input must be rejected');
    assert.deepStrictEqual(writes, [], 'rejected input must never reach the PTY');

    const resizeResponse = await fetch(`${base}/api/sessions/validation/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: 1e9, rows: 1e9 })
    });
    assert.strictEqual(resizeResponse.status, 200);
    assert.deepStrictEqual(resizes, [[1000, 1000]], 'terminal dimensions must be capped before reaching node-pty');
    assert.strictEqual(app.wss.options.maxPayload, 1024 * 1024, 'WebSocket messages must have the same input ceiling');

    const first = new WebSocket(`ws://127.0.0.1:${port}/ws?session=validation`);
    await opened(first);
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws?session=validation`);
    await opened(second);
    await delay(20);
    assert.strictEqual(first.readyState, WebSocket.OPEN, 'opening the same session elsewhere must not disconnect the first browser');
    first.send(JSON.stringify({ type: 'input', data: 'first-client' }));
    second.send(JSON.stringify({ type: 'input', data: 'second-client' }));
    await delay(20);
    assert.deepStrictEqual(writes, ['first-client', 'second-client'], 'all connected browsers must retain terminal input control');

    const initialUi = await fetch(`${base}/api/ui-state`).then(res => res.json());
    const uiEvents = await fetch(`${base}/api/ui-events`);
    assert.strictEqual(uiEvents.status, 200, 'UI state event stream must be available');
    const reader = uiEvents.body.getReader();
    const saved = await fetch(`${base}/api/ui-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...initialUi, revision: initialUi.revision, activeId: 'validation' })
    });
    assert.strictEqual(saved.status, 200);
    const savedUi = await saved.json();
    assert.ok(savedUi.revision > initialUi.revision, 'accepted UI changes must advance the server revision');
    const eventChunk = new TextDecoder().decode((await reader.read()).value || new Uint8Array());
    assert.ok(eventChunk.includes('"activeId":"validation"') && eventChunk.includes(`"revision":${savedUi.revision}`), 'accepted UI changes must broadcast to every browser');
    const stale = await fetch(`${base}/api/ui-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...initialUi, revision: initialUi.revision, activeId: 'stale-client' })
    });
    assert.strictEqual(stale.status, 409, 'stale browser state must not overwrite newer layout');
    assert.strictEqual((await stale.json()).activeId, 'validation', 'conflict response must return current authoritative state');
    await reader.cancel();

    await app.close();
    app = null;
    await delay(20);
    assert.strictEqual(first.readyState, WebSocket.CLOSED, 'shutdown must close first WebSocket client');
    assert.strictEqual(second.readyState, WebSocket.CLOSED, 'shutdown must close second WebSocket client');
    console.log('server-validation ok');
  } finally {
    if (app) await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
