const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

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
    const { createServer } = require('../packages/server/src/index');
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
    const firstClosed = new Promise(resolve => first.once('close', (code, reason) => resolve([code, reason.toString()])));
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws?session=validation`);
    await opened(second);
    assert.deepStrictEqual(await firstClosed, [4000, 'superseded'], 'a newer client must explicitly supersede the old session socket');
    second.send(JSON.stringify({ type: 'input', data: 'current-client' }));
    await delay(20);
    assert.deepStrictEqual(writes, ['current-client'], 'the current WebSocket must retain terminal input control');

    await app.close();
    app = null;
    assert.strictEqual(second.readyState, WebSocket.CLOSED, 'shutdown must close active WebSocket clients');
    console.log('server-validation ok');
  } finally {
    if (app) await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
