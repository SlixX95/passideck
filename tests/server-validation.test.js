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
    const { createServer, syncHermesTitles, hermesResumeIdFromArgv, hermesActiveSessionIdFromEnv, parseCodexLimits, readHermesCodexAuth, saveHermesCodexAuth } = require('../packages/server/src/index');
    assert.strictEqual(
      hermesResumeIdFromArgv(['/venv/bin/python3', '/venv/bin/hermes', '--resume', '20260716_180100_5dbdcf']),
      '20260716_180100_5dbdcf',
      'the active Hermes resume id must be parsed from the real Python launcher argv shape'
    );
    assert.strictEqual(hermesResumeIdFromArgv(['/bin/bash']), null, 'ordinary shell panes must not be treated as resumed Hermes sessions');
    const tuiActiveSessionFile = path.join(home, 'tui-active-session.json');
    fs.writeFileSync(tuiActiveSessionFile, JSON.stringify({ session_id: '20260718_210406_6404d7' }));
    assert.strictEqual(
      hermesActiveSessionIdFromEnv([`HERMES_TUI_ACTIVE_SESSION_FILE=${tuiActiveSessionFile}`]),
      '20260718_210406_6404d7',
      'Hermes TUI panes must resolve the currently selected live session from the TUI breadcrumb'
    );
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
    hermesDb.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, started_at REAL, title TEXT);
      CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, finish_reason TEXT, active INTEGER DEFAULT 1, timestamp REAL);
    `);
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-1', 'passideck:validation', 1, 'Canonical Hermes Title');
    const hermesEvents = [];
    const originalBroadcast = session.broadcast.bind(session);
    session.broadcast = message => { hermesEvents.push(message); originalBroadcast(message); };
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 1, 'Hermes DB title must update the matching PassiDeck pane');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    hermesDb.prepare('INSERT INTO messages (id, session_id, role, content, finish_reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(1, 'hermes-1', 'assistant', '', 'tool_calls', Date.now() / 1000);
    syncHermesTitles(app.sessions, hermesDb);
    assert.strictEqual(hermesEvents.filter(event => event.type === 'response-complete').length, 0, 'tool-call progress must not trigger response attention');
    hermesDb.prepare('INSERT INTO messages (id, session_id, role, content, finish_reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(2, 'hermes-1', 'assistant', 'Final answer', 'stop', Date.now() / 1000 + 1);
    syncHermesTitles(app.sessions, hermesDb);
    syncHermesTitles(app.sessions, hermesDb);
    assert.strictEqual(hermesEvents.filter(event => event.type === 'response-complete').length, 1, 'one persisted final answer must trigger response attention exactly once');
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-2', 'passideck:validation', 2, null);
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 0, 'a newer untitled Hermes session must not replace a visible title');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    session.meta.title = '';
    session.meta.hermesSessionId = null;
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb), 1, 'restart recovery must restore the latest non-empty title');
    assert.strictEqual(session.meta.title, 'Canonical Hermes Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');

    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-resumed', 'passideck:former-pane', 3, 'Resumed Session Title');
    session.meta.title = '';
    session.meta.hermesSessionId = null;
    assert.strictEqual(
      syncHermesTitles(app.sessions, hermesDb, () => 'hermes-resumed'),
      1,
      'an active hermes --resume session must resolve by its exact session id even after the PassiDeck pane id changes'
    );
    assert.strictEqual(session.meta.title, 'Resumed Session Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-resumed');

    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-resumed-blank', 'passideck:former-pane', 4, null);
    assert.strictEqual(
      syncHermesTitles(app.sessions, hermesDb, () => 'hermes-resumed-blank'),
      0,
      'an active resumed session without a generated title must not erase the visible title'
    );
    assert.strictEqual(session.meta.title, 'Resumed Session Title');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-resumed');
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
      body: JSON.stringify({
        ...initialUi,
        revision: initialUi.revision,
        activeId: 'validation',
        notifyBlinking: false,
        panePrefs: {
          ...initialUi.panePrefs,
          desktopOrder: ['work', 'monitoring'],
          paneDesktop: { validation: 'monitoring' },
          desktops: {
            work: { name: 'Work', minimized: [], windows: {}, viewport: { w: 1400, h: 850 } },
            monitoring: { name: 'Work', minimized: ['validation'], windows: { validation: { x: 10, y: 20, w: 700, h: 500, z: 11 } }, viewport: { w: 1400, h: 850 } }
          }
        }
      })
    });
    assert.strictEqual(saved.status, 200);
    const savedUi = await saved.json();
    assert.strictEqual(savedUi.notifyBlinking, false, 'UI state must persist Notify blinking Off instead of dropping it during validation');
    assert.deepStrictEqual(savedUi.panePrefs.desktopOrder, ['work', 'monitoring'], 'desktop order must survive server validation');
    assert.deepStrictEqual(
      savedUi.panePrefs.desktopOrder.map(id => savedUi.panePrefs.desktops[id].name),
      ['Work', 'Desktop 1'],
      'server validation must repair duplicate desktop names with the lowest free default number'
    );
    assert.strictEqual(savedUi.panePrefs.paneDesktop.validation, 'monitoring', 'pane desktop assignment must survive server validation');
    assert.deepStrictEqual(savedUi.panePrefs.desktops.monitoring.minimized, ['validation'], 'per-desktop minimized state must survive server validation');
    assert.deepStrictEqual(savedUi.panePrefs.desktops.monitoring.windows.validation, { x: 10, y: 20, w: 700, h: 500, z: 11 }, 'per-desktop geometry must survive server validation');
    assert.ok(savedUi.revision > initialUi.revision, 'accepted UI changes must advance the server revision');
    const eventChunk = new TextDecoder().decode((await reader.read()).value || new Uint8Array());
    assert.ok(eventChunk.includes('"activeId":"validation"') && eventChunk.includes(`"revision":${savedUi.revision}`), 'accepted UI changes must broadcast to every browser');
    const capped = await fetch(`${base}/api/ui-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...savedUi,
        revision: savedUi.revision,
        panePrefs: {
          ...savedUi.panePrefs,
          order: ['validation'],
          desktopOrder: ['one', 'two', 'three', 'four'],
          paneDesktop: { validation: 'four' },
          desktops: Object.fromEntries(['one', 'two', 'three', 'four'].map((id, index) => [id, { name: `Desk ${index + 1}`, minimized: [], windows: {}, viewport: null }]))
        }
      })
    });
    assert.strictEqual(capped.status, 200);
    const cappedUi = await capped.json();
    assert.deepStrictEqual(cappedUi.panePrefs.desktopOrder, ['one', 'two', 'three'], 'server validation must cap persisted desktops at the supported maximum');
    assert.deepStrictEqual(Object.keys(cappedUi.panePrefs.desktops), ['one', 'two', 'three'], 'discarded desktops must not remain in persisted desktop metadata');
    assert.strictEqual(cappedUi.panePrefs.paneDesktop.validation, 'one', 'panes assigned to a discarded desktop must move to the first retained desktop');
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
