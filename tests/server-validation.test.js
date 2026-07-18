const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const tmpRoot = path.join(os.homedir(), 'tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const home = fs.mkdtempSync(path.join(tmpRoot, 'passideck-validation-test-'));
process.env.PASSIDECK_HOME = home;
process.env.PASSIDECK_TMUX_SOCKET = `passideck-validation-${process.pid}`;
const tmux = (...args) => execFileSync('tmux', ['-L', process.env.PASSIDECK_TMUX_SOCKET, ...args], { stdio: 'pipe' });

let app;
const opened = ws => new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    const { createServer, syncHermesTitles, parseCodexLimits, readHermesCodexAuth, saveHermesCodexAuth } = require('../packages/server/src/index');
    const weeklyOnly = parseCodexLimits({
      rate_limit: {
        primary_window: { used_percent: 13, limit_window_seconds: 604800, reset_at: 1784672642 }
      }
    }, false);
    assert.strictEqual(weeklyOnly.primary, null, 'a weekly-only window must not be shown as the 5h limit');
    assert.strictEqual(weeklyOnly.secondary.windowDurationMins, 10080, 'a seven-day window must be shown as weekly');

    const hermesAuthPath = path.join(home, 'hermes-auth.json');
    const codexAuthPath = path.join(home, 'codex-auth.json');
    fs.writeFileSync(hermesAuthPath, JSON.stringify({ providers: {} }));
    fs.writeFileSync(codexAuthPath, JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'codex-access', refresh_token: 'codex-refresh' } }));
    process.env.PASSIDECK_HERMES_AUTH_PATH = hermesAuthPath;
    process.env.PASSIDECK_CODEX_AUTH_PATH = codexAuthPath;
    const fallbackAuth = readHermesCodexAuth();
    assert.strictEqual(fallbackAuth.authPath, codexAuthPath, 'Codex auth must be used when Hermes provider tokens are absent');
    assert.strictEqual(fallbackAuth.tokens.access_token, 'codex-access');
    saveHermesCodexAuth(fallbackAuth, { access_token: 'refreshed-access', refresh_token: 'refreshed-refresh' });
    const refreshedAuth = JSON.parse(fs.readFileSync(codexAuthPath, 'utf8'));
    assert.strictEqual(refreshedAuth.tokens.access_token, 'refreshed-access', 'fallback refresh must preserve the Codex auth schema');
    assert.strictEqual(refreshedAuth.providers, undefined, 'fallback refresh must not write Hermes provider fields');
    delete process.env.PASSIDECK_HERMES_AUTH_PATH;
    delete process.env.PASSIDECK_CODEX_AUTH_PATH;

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
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 0, 'a newer untitled Hermes session must not replace a visible title');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    session.meta.title = '';
    session.meta.hermesSessionId = null;
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 1, 'restart recovery must restore the latest non-empty title');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    hermesDb.close();
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;
    const base = `http://127.0.0.1:${port}`;

    const persistentResponse = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: '/bin/bash', cwd: home, label: 'restart-persistence' })
    });
    assert.strictEqual(persistentResponse.status, 200);
    const persistent = await persistentResponse.json();
    const persistentTmux = `passideck_${persistent.id.replace(/-/g, '')}`;
    tmux('has-session', '-t', persistentTmux);

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
      body: JSON.stringify({ ...initialUi, revision: initialUi.revision, activeId: 'validation', notifyBlinking: false })
    });
    assert.strictEqual(saved.status, 200);
    const savedUi = await saved.json();
    assert.strictEqual(savedUi.notifyBlinking, false, 'UI state must persist Notify blinking Off instead of dropping it during validation');
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
    tmux('has-session', '-t', persistentTmux);
    console.log('server-validation ok');
  } finally {
    if (app) await app.close();
    try { tmux('kill-server'); } catch {}
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
