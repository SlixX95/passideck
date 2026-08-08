const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const testPty = require('@homebridge/node-pty-prebuilt-multiarch');

const tmpRoot = path.join(os.homedir(), 'tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const home = fs.mkdtempSync(path.join(tmpRoot, 'passideck-validation-test-'));
process.env.PASSIDECK_HOME = home;
process.env.PASSIDECK_TMUX_SOCKET = `passideck-validation-${process.pid}`;
const tmux = (...args) => execFileSync('tmux', ['-L', process.env.PASSIDECK_TMUX_SOCKET, ...args], { stdio: 'pipe' });

let app;
let extraTmuxClient;
const opened = ws => new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (predicate, message, timeoutMs = 1000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(message);
};

(async () => {
  try {
    const { createServer, syncHermesTitles, hermesResumeIdFromArgv, hermesActiveSessionIdFromEnv, terminalOwnerFromProcesses, terminalStateFromProcesses, foregroundHasHermes, acceptHermesEvent, isPlainShellCommand, isMouseInput, isJobControlSuspendInput, splitCommand, parseCodexLimits, readHermesCodexAuth, readHermesCodexAuths, saveHermesCodexAuth, selectActiveCodexAccount } = require('../packages/server/src/index');
    assert.strictEqual(
      hermesResumeIdFromArgv(['/venv/bin/python3', '/venv/bin/hermes', '--resume', '20260716_180100_5dbdcf']),
      '20260716_180100_5dbdcf',
      'the active Hermes resume id must be parsed from the real Python launcher argv shape'
    );
    assert.strictEqual(hermesResumeIdFromArgv(['/bin/bash']), null, 'ordinary shell panes must not be treated as resumed Hermes sessions');
    for (const command of ['/usr/bin/bash --login -i', 'exec /bin/sh -i', '/usr/bin/env -i HOME=/tmp /bin/zsh -l', 'sudo -u maeve /bin/bash -l']) {
      assert.strictEqual(isPlainShellCommand(command), true, `${command} must be recognized as a safe shell launch`);
    }
    for (const command of ['bash script.sh', 'env bash -c vim', 'sudo -u maeve vim', 'env -u', 'sudo -u']) {
      assert.strictEqual(isPlainShellCommand(command), false, `${command} must not be treated as a plain shell launch`);
    }
    assert.deepStrictEqual(splitCommand('/usr/bin/bash --login -i'), { file: '/usr/bin/bash', args: ['--login', '-i'] }, 'shell flags must become spawn arguments, not part of the executable path');
    assert.deepStrictEqual(splitCommand('exec /bin/sh -i'), { file: '/bin/sh', args: ['-i'] }, 'the shell exec keyword must be removed before spawning');
    assert.deepStrictEqual(splitCommand('/usr/bin/env -i HOME=/tmp /bin/zsh -l'), { file: '/usr/bin/env', args: ['-i', 'HOME=/tmp', '/bin/zsh', '-l'] }, 'safe env wrappers must remain executable launch arguments');
    assert.deepStrictEqual(splitCommand('sudo -u maeve /bin/bash -l'), { file: 'sudo', args: ['-u', 'maeve', '/bin/bash', '-l'] }, 'safe sudo wrappers must remain executable launch arguments');

    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv: ['/bin/bash'] }]),
      'viewport',
      'an actual foreground shell must leave wheel ownership with the viewport'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/python3', '/usr/local/bin/hermes'] }]),
      'viewport',
      'normal Hermes launched manually inside a shell must leave wheel ownership with the viewport'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/python3', '/usr/local/bin/hermes', '--tui'] }]),
      'application',
      'Hermes TUI launched manually inside a shell must keep application wheel ownership'
    );
    assert.deepStrictEqual(
      terminalStateFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/python3', '/usr/local/bin/hermes', '--tui'] }]),
      { owner: 'application', mode: 'hermes-tui' },
      'manual Hermes TUI discovery must expose one authoritative dynamic client mode'
    );
    assert.deepStrictEqual(
      terminalStateFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/vim', 'notes.txt'] }]),
      { owner: 'application', mode: 'application' },
      'generic terminal applications must not inherit Hermes-specific client behavior'
    );
    assert.deepStrictEqual(
      terminalStateFromProcesses({ command: 'hermes --tui' }, [{ argv: ['/bin/bash'] }]),
      { owner: 'viewport', mode: 'viewport' },
      'leaving an explicitly launched Hermes TUI must restore normal shell behavior'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: 'hermes --tui' }, [{ argv: ['/bin/bash'] }]),
      'viewport',
      'the foreground shell must reclaim wheel ownership after an explicitly launched Hermes TUI exits'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: 'hermes --tui' }, []),
      'application',
      'the explicit TUI launch remains the safe startup fallback before process discovery is available'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/vim', 'notes.txt'] }]),
      'application',
      'generic foreground applications inside a shell must keep application wheel ownership'
    );
    for (const argv of [['/usr/bin/vim', 'hermes'], ['/usr/bin/less', '/tmp/hermes'], ['/usr/bin/grep', 'hermes', 'notes.txt']]) {
      const expected = /(?:vim|less)$/.test(argv[0]) ? 'application' : 'viewport';
      assert.strictEqual(terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv }]), expected, `${argv[0]} must not become Hermes merely because a file or pattern is named hermes`);
    }
    assert.strictEqual(terminalOwnerFromProcesses({ command: '/bin/bash' }, [{ argv: ['/usr/bin/sleep', '5'] }]), 'viewport', 'unknown non-interactive commands must not gain PTY wheel ownership');
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [
        { argv: ['/bin/bash'], pgrp: 100, tpgid: 100 },
        { argv: ['/usr/bin/vim', 'background.txt'], pgrp: 200, tpgid: 100 }
      ]),
      'viewport',
      'a background child must not steal wheel ownership from the foreground shell process group'
    );
    assert.strictEqual(
      terminalOwnerFromProcesses({ command: '/bin/bash' }, [
        { argv: ['/bin/bash'], pgrp: 100, tpgid: 200 },
        { argv: ['/usr/bin/vim', 'notes.txt'], pgrp: 200, tpgid: 200 }
      ]),
      'application',
      'a real foreground child process group must retain application wheel ownership'
    );
    assert.strictEqual(
      foregroundHasHermes([
        { argv: ['/bin/bash'], pgrp: 100, tpgid: 200 },
        { argv: ['/usr/bin/python3', '/usr/local/bin/hermes'], pgrp: 200, tpgid: 200 }
      ]),
      true,
      'normal Hermes in the foreground process group must be protected from job-control suspension'
    );
    assert.strictEqual(
      foregroundHasHermes([
        { argv: ['/bin/bash'], pgrp: 100, tpgid: 100 },
        { argv: ['/usr/bin/python3', '/usr/local/bin/hermes', '--resume', 'abc'], pgrp: 200, tpgid: 100 }
      ]),
      false,
      'background Hermes jobs must not disable shell job control'
    );
    assert.strictEqual(
      foregroundHasHermes([
        { argv: ['/usr/bin/cat', '/tmp/hermes.log'], pgrp: 100, tpgid: 100 }
      ]),
      false,
      'ordinary arguments whose names begin with hermes must not disable job control'
    );
    assert.strictEqual(foregroundHasHermes([]), false, 'missing process evidence must not be replaced with declared-session metadata');
    assert.strictEqual(
      foregroundHasHermes([{ argv: ['/usr/local/bin/hermes'], pgrp: 0, tpgid: 0 }]),
      false,
      'process records without a valid foreground process group must fail open'
    );
    assert.strictEqual(
      foregroundHasHermes([{ argv: ['/bin/bash'], pgrp: 100, tpgid: 100 }]),
      false,
      'the foreground shell must regain normal Ctrl+Z after Hermes exits'
    );
    assert.strictEqual(
      foregroundHasHermes([{ argv: ['/usr/bin/vim', 'hermes'], pgrp: 200, tpgid: 200 }]),
      false,
      'an argument named hermes must not disable job control for another application'
    );
    assert.strictEqual(isMouseInput('\x1b[<64;10;20M'), true, 'SGR wheel input must be recognized');
    assert.strictEqual(isMouseInput('\x1b[<35;10;20M'), true, 'SGR motion input must be recognized after a TUI returns to its shell');
    assert.strictEqual(isMouseInput('\x1b[<0;10;20M'), true, 'SGR button input must be recognized after a TUI returns to its shell');
    assert.strictEqual(isMouseInput('\x1b[M`!!'), true, 'X10 wheel input must be recognized');
    assert.strictEqual(isMouseInput('\x1b[M@!!'), true, 'X10 button input must be recognized');
    assert.strictEqual(isMouseInput('\x1b[96;10;20M'), true, 'URXVT wheel input must be recognized');
    assert.strictEqual(isMouseInput('\x1b[35;10;20M'), true, 'URXVT motion input must be recognized');
    assert.strictEqual(isMouseInput('\x1b[A'), false, 'ordinary arrow keys must not be mistaken for mouse input');
    assert.strictEqual(isMouseInput('text\x1b[<35;10;20M'), false, 'mixed user text and mouse data must not be dropped as a mouse-only packet');
    assert.strictEqual(isJobControlSuspendInput('\x1a'), true, 'an exact Ctrl+Z must be recognized before it can suspend a managed Hermes TUI');
    assert.strictEqual(isJobControlSuspendInput('text\x1amore'), true, 'Ctrl+Z inside a batched input payload must be recognized at the final PTY boundary');
    assert.strictEqual(isJobControlSuspendInput('\x1a\x1a'), true, 'repeated Ctrl+Z bytes must be recognized');
    assert.strictEqual(isJobControlSuspendInput('\x03'), false, 'Ctrl+C must remain available to Hermes TUI');
    const eventState = {};
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.start', session_id: 'old' }), true);
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.start', session_id: 'current' }), false, 'a stale publisher generation must not relatch the active lifecycle id');
    eventState.hermesEventSessionId = null;
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.start', session_id: 'current' }), true, 'a new publisher generation may establish its lifecycle id');
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.complete', session_id: 'old' }), false, 'a stale completion must not clear the current Hermes busy state');
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'session.title', session_id: 'old', payload: { stored_session_id: 'old' } }), false, 'a stale title must not replace the current Hermes session title');
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.complete', session_id: 'current' }), true, 'the current session completion must remain authoritative');
    assert.strictEqual(acceptHermesEvent(eventState, { type: 'message.complete' }), false, 'missing lifecycle ids must fail closed after a valid lifecycle id is established');
    const liveVsStoredEventState = {};
    assert.strictEqual(acceptHermesEvent(liveVsStoredEventState, { type: 'message.start', session_id: 'live-1' }), true);
    assert.strictEqual(acceptHermesEvent(liveVsStoredEventState, { type: 'session.info', session_id: 'live-1', payload: { stored_session_id: 'stored-1' } }), true);
    assert.strictEqual(acceptHermesEvent(liveVsStoredEventState, { type: 'message.complete', session_id: 'live-1' }), true, 'stored session ids must not replace the active lifecycle id');
    assert.strictEqual(acceptHermesEvent(liveVsStoredEventState, { type: 'session.info', session_id: 'old-live', payload: { stored_session_id: 'old-stored' } }), false, 'stale session info must not replace the active lifecycle id');
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

    fs.writeFileSync(hermesAuthPath, JSON.stringify({
      credential_pool: {
        'openai-codex': [
          { id: 'finch', label: '#1Finch', source: 'manual:device_code', priority: 0, access_token: 'finch-access', refresh_token: 'finch-refresh', last_status: 'exhausted' },
          { id: 'passi', label: '#2Passi', source: 'manual:device_code', priority: 1, access_token: 'passi-access', refresh_token: 'passi-refresh' }
        ]
      }
    }));
    const pooledAuths = readHermesCodexAuths();
    assert.deepStrictEqual(pooledAuths.map(auth => [auth.index, auth.label, auth.tokens.access_token]), [
      [1, '#1Finch', 'finch-access'],
      [2, '#2Passi', 'passi-access']
    ], 'every native Hermes Codex pool account must be exposed independently and in priority order');
    assert.deepStrictEqual(pooledAuths.map(auth => auth.active), [false, true], 'the first non-exhausted fill-first credential must be marked active');
    assert.strictEqual(selectActiveCodexAccount([
      { index: 1, active: true, ok: true, primary: null, secondary: { usedPercent: 100 } },
      { index: 2, active: false, ok: true, primary: null, secondary: { usedPercent: 43 } }
    ]).index, 1, 'the limit display must mirror Hermes pool state instead of inventing a second account-selection policy');
    saveHermesCodexAuth(pooledAuths[0], { access_token: 'finch-refreshed', refresh_token: 'finch-refresh-2' });
    const refreshedPool = JSON.parse(fs.readFileSync(hermesAuthPath, 'utf8'));
    assert.strictEqual(refreshedPool.credential_pool['openai-codex'][0].access_token, 'finch-refreshed', 'refresh must update the matching pool account');
    assert.strictEqual(refreshedPool.credential_pool['openai-codex'][1].access_token, 'passi-access', 'refresh must not overwrite another pool account');
    assert.strictEqual(refreshedPool.providers, undefined, 'pool refresh must not recreate the collapsing Codex singleton');
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
    hermesDb.prepare('INSERT INTO messages (id, session_id, role, content, finish_reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(1, 'hermes-1', 'assistant', '[CONTEXT COMPACTION — REFERENCE ONLY]', null, Date.now() / 1000);
    syncHermesTitles(app.sessions, hermesDb);
    assert.strictEqual(hermesEvents.filter(event => event.type === 'response-complete').length, 0, 'Hermes database messages must never produce response attention');
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

    const staticResponse = await fetch(`${base}/app.js`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.strictEqual(staticResponse.headers.get('content-encoding'), 'gzip', 'static assets must be compressed when the client supports gzip');

    const persistentResponse = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: '/bin/bash', cwd: home, label: 'restart-persistence' })
    });
    assert.strictEqual(persistentResponse.status, 200);
    const persistent = await persistentResponse.json();
    const persistentTmux = `passideck_${persistent.id.replace(/-/g, '')}`;
    tmux('has-session', '-t', persistentTmux);
    const persistentPanePid = tmux('list-panes', '-t', persistentTmux, '-F', '#{pane_pid}').toString().trim();
    const persistentPaneEnv = fs.readFileSync(`/proc/${persistentPanePid}/environ`, 'utf8').split('\0');
    assert.ok(persistentPaneEnv.includes('PROMPT_TOOLKIT_NO_CPR=1'), 'PassiDeck panes must disable prompt_toolkit cursor position reports');
    assert.ok(persistentPaneEnv.includes('PROMPT_TOOLKIT_BELL=false'), 'PassiDeck panes must suppress prompt_toolkit feedback BELs without suppressing Hermes completion BELs');
    assert.ok(!persistentPaneEnv.some(value => value.startsWith('PASSIDECK_WORKING_ENDPOINT=')), 'non-Hermes shell panes must not receive the Hermes working-state bridge');
    assert.ok(!persistentPaneEnv.some(value => value.startsWith('HERMES_TUI_SIDECAR_URL=')), 'non-Hermes shell panes must not receive the TUI event publisher');

    const persistentSession = app.sessions.get(persistent.id);
    assert.ok(persistentSession.pty.ptsName, 'node-pty must expose the PassiDeck tmux client PTY through ptsName');
    extraTmuxClient = testPty.spawn('tmux', ['-L', process.env.PASSIDECK_TMUX_SOCKET, 'attach-session', '-t', persistentTmux], {
      name: 'xterm-256color', cols: 80, rows: 24, cwd: home, env: { ...process.env, TERM: 'xterm-256color' }
    });
    await waitFor(() => tmux('list-clients', '-t', persistentTmux, '-F', '#{client_name}').toString().trim().split(/\r?\n/).filter(Boolean).length === 2, 'the multi-client replay fixture must attach a second tmux client');
    const realTmuxClientTty = persistentSession.tmuxClientTty;
    persistentSession.tmuxClientTty = '/dev/pts/not-passideck';
    const unmatchedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    let unmatchedReplay = null;
    unmatchedSocket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'replay') unmatchedReplay = message;
      } catch {}
    });
    await opened(unmatchedSocket);
    await waitFor(() => unmatchedReplay, 'unmatched PTY attach must receive a typed fallback frame');
    assert.strictEqual(unmatchedReplay.kind, 'capture-unavailable', 'unmatched PTY attach must fail closed instead of using another client boundary');
    unmatchedSocket.close();
    persistentSession.tmuxClientTty = realTmuxClientTty;
    const lostCounterSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    const lostCounterReplays = [];
    lostCounterSocket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'replay') lostCounterReplays.push(message);
      } catch {}
    });
    await opened(lostCounterSocket);
    persistentSession.tmuxClientTty = '/dev/pts/disappeared';
    await waitFor(() => lostCounterReplays.some(message => message.kind === 'capture-unavailable'), 'hydration must fail closed when its exact tmux client or counter disappears');
    assert.strictEqual(lostCounterReplays.at(-1).reason, 'tmux client not found', `a disappeared exact tmux client must produce its precise fallback: ${JSON.stringify(lostCounterReplays)}`);
    lostCounterSocket.close();
    persistentSession.tmuxClientTty = realTmuxClientTty;
    persistentSession.pty.write("for i in $(seq 1 120); do echo shell-history-$i; done; echo '[PassiDeck reconnect: output replay disabled; live session still running]'\r");
    await delay(250);
    const historySocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    const historyMessages = [];
    let historyOutput = 0;
    historySocket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        historyMessages.push(message);
        if (message.type === 'output') historyOutput += 1;
      } catch {}
    });
    await opened(historySocket);
    await waitFor(() => historyMessages.some(message => message.type === 'replay'), 'shell clients must receive tmux history when they attach to an existing pane');
    const historyReplay = historyMessages.find(message => message.type === 'replay');
    assert.strictEqual(historyReplay.kind, 'tmux-history', 'plain shell history must be labeled separately from the reconnect marker');
    assert.strictEqual(historyReplay.owner, 'viewport', 'plain shell replay must explicitly assign viewport wheel ownership');
    assert.ok(historyReplay.attachId?.startsWith(`${persistent.id}:`), 'replay must identify the attach revision');
    assert.ok(Number.isFinite(historyReplay.outputBoundary) && historyReplay.outputBoundary > 0 && historyReplay.sequence === historyReplay.outputBoundary, 'tmux replay must expose its exact positive output-sequence boundary');
    assert.ok(Number.isFinite(historyReplay.cursorX) && Number.isFinite(historyReplay.cursorY), 'tmux replay must expose the pane cursor used to align following live redraws');
    assert.ok(historyReplay.data.includes('shell-history-1') && historyReplay.data.includes('shell-history-120'), 'plain shell history replay must contain the pane scrollback');
    assert.ok(historyReplay.data.includes('[PassiDeck reconnect: output replay disabled; live session still running]'), 'visible shell output equal to the legacy marker must remain ordinary history data');
    await delay(100);
    historyOutput = 0;
    historySocket.send(JSON.stringify({ type: 'redraw' }));
    await delay(100);
    assert.strictEqual(historyOutput, 0, 'the automatic first redraw must not duplicate the shell frame after tmux history replay');
    historySocket.close();

    const originalPersistentCommand = persistentSession.meta.command;
    persistentSession.meta.command = 'hermes --tui';
    persistentSession.pty.write('top\r');
    await waitFor(() => {
      try {
        return execFileSync('tmux', ['-L', process.env.PASSIDECK_TMUX_SOCKET, 'display-message', '-p', '-t', persistentSession.tmuxName, '#{pane_current_command}'], { encoding: 'utf8' }).trim() === 'top';
      } catch { return false; }
    }, 'foreground application must be active before the TUI attach contract is checked');
    const tuiSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    const tuiMessages = [];
    tuiSocket.on('message', raw => {
      try { tuiMessages.push(JSON.parse(raw.toString())); } catch {}
    });
    await opened(tuiSocket);
    await waitFor(() => tuiMessages.some(message => message.type === 'replay'), 'non-shell panes must still receive the reconnect marker');
    const tuiReplay = tuiMessages.find(message => message.type === 'replay');
    assert.strictEqual(tuiReplay.kind, 'live-only', 'Hermes TUI panes must receive an explicit live-only attach frame');
    assert.strictEqual(tuiReplay.owner, 'application', 'Hermes TUI panes must retain application wheel ownership');
    assert.ok(tuiReplay.data.includes('output replay disabled'), 'non-shell reconnect semantics must stay unchanged');
    tuiSocket.close();
    persistentSession.pty.write('\x03');
    await waitFor(() => {
      try {
        return execFileSync('tmux', ['-L', process.env.PASSIDECK_TMUX_SOCKET, 'display-message', '-p', '-t', persistentSession.tmuxName, '#{pane_current_command}'], { encoding: 'utf8' }).trim() === 'bash';
      } catch { return false; }
    }, 'shell must resume after the TUI attach fixture exits');
    persistentSession.meta.command = originalPersistentCommand;

    let classicHermesPid = 0;
    persistentSession.pty.write("bash -c 'exec -a hermes cat'\r");
    await waitFor(() => {
      try {
        const panePid = Number(tmux('list-panes', '-t', persistentTmux, '-F', '#{pane_pid}').toString().trim());
        const children = fs.readFileSync(`/proc/${panePid}/task/${panePid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
        classicHermesPid = children.find(pid => fs.readFileSync(`/proc/${pid}/cmdline`).toString().split('\0')[0] === 'hermes') || 0;
        return classicHermesPid > 1;
      } catch { return false; }
    }, 'classic Hermes fixture must own the foreground process group');
    const classicSuspendMessages = [];
    let classicSuspendReplay = false;
    let classicSuspendOutput = '';
    const classicSuspendSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    classicSuspendSocket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'terminal-owner') classicSuspendMessages.push(message);
        if (message.type === 'replay') classicSuspendReplay = true;
        if (message.type === 'output') classicSuspendOutput += String(message.data || '');
      } catch {}
    });
    await opened(classicSuspendSocket);
    await waitFor(() => classicSuspendReplay, 'classic Hermes protection test must finish WebSocket hydration before sending input', 3000);
    await waitFor(
      () => classicSuspendMessages.some(message => message.suspendProtected === true),
      'terminal ownership must advertise foreground Hermes suspend protection'
    );
    const classicHermesState = () => {
      const stat = fs.readFileSync(`/proc/${classicHermesPid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)[0];
    };
    classicSuspendSocket.send(JSON.stringify({ type: 'input', data: '\x1a' }));
    await delay(300);
    assert.notStrictEqual(classicHermesState(), 'T', 'the server boundary must not suspend a foreground Hermes CLI');

    classicSuspendOutput = '';
    classicSuspendSocket.send(JSON.stringify({ type: 'input', data: 'ws-before\x1aws-after\r' }));
    await waitFor(() => classicSuspendOutput.includes('ws-beforews-after'), 'WebSocket input must preserve bytes around a filtered Ctrl+Z', 3000);
    assert.notStrictEqual(classicHermesState(), 'T', 'batched WebSocket input must not suspend foreground Hermes');

    classicSuspendOutput = '';
    const batchedHttpInput = await fetch(`${base}/api/sessions/${persistent.id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'http-before\x1ahttp-after\r' })
    });
    assert.strictEqual(batchedHttpInput.status, 200, 'HTTP terminal input must accept a batched Ctrl+Z payload');
    await waitFor(() => classicSuspendOutput.includes('http-beforehttp-after'), 'HTTP input must preserve bytes around a filtered Ctrl+Z', 3000);
    assert.notStrictEqual(classicHermesState(), 'T', 'batched HTTP input must not suspend foreground Hermes');

    persistentSession.pty.write('\x15');
    persistentSession.pty.write('\x03');
    await waitFor(() => !fs.existsSync(`/proc/${classicHermesPid}`), 'classic Hermes fixture must exit after the preservation check');
    await waitFor(
      () => classicSuspendMessages.some(message => message.suspendProtected === false),
      'terminal ownership must release suspend protection after Hermes returns to its shell',
      2000
    );
    classicSuspendSocket.close();

    persistentSession.meta.command = 'hermes';
    const redrawSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?session=${persistent.id}`);
    let redrawOutput = '';
    const redrawMessages = [];
    redrawSocket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        redrawMessages.push(message);
        if (message.type === 'output') redrawOutput += String(message.data || '');
      } catch {}
    });
    await opened(redrawSocket);
    await waitFor(() => redrawMessages.some(message => message.type === 'replay'), 'normal Hermes must receive an attach replay');
    const hermesReplay = redrawMessages.find(message => message.type === 'replay');
    assert.strictEqual(hermesReplay.kind, 'tmux-history', 'normal Hermes must receive tmux history on a fresh renderer attach');
    assert.strictEqual(hermesReplay.owner, 'viewport', 'normal Hermes must assign viewport wheel ownership');
    assert.ok(Number.isFinite(hermesReplay.outputBoundary), 'normal Hermes replay must retain the tmux output boundary');
    assert.ok(hermesReplay.data.includes('shell-history-120'), 'normal Hermes fresh attach must retain pre-existing tmux history');
    await delay(100);
    redrawOutput = '';
    redrawSocket.send(JSON.stringify({ type: 'replay-ack', attachId: hermesReplay.attachId }));
    redrawSocket.send(JSON.stringify({ type: 'redraw' }));
    await waitFor(() => redrawOutput.length > 0, 'replay acknowledgement must make the next explicit redraw effective');
    redrawSocket.close();
    persistentSession.meta.command = originalPersistentCommand;

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
    const firstMessages = [];
    first.on('message', raw => {
      try { firstMessages.push(JSON.parse(raw.toString())); } catch {}
    });
    await opened(first);
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws?session=validation`);
    await opened(second);
    await delay(20);
    assert.strictEqual(first.readyState, WebSocket.OPEN, 'opening the same session elsewhere must not disconnect the first browser');
    first.send(JSON.stringify({ type: 'input', data: 'first-client' }));
    second.send(JSON.stringify({ type: 'input', data: 'second-client' }));
    await delay(20);
    assert.deepStrictEqual(writes, ['first-client', 'second-client'], 'all connected browsers must retain terminal input control');
    first.send(JSON.stringify({ type: 'input', data: '\x1b[<64;10;5M' }));
    await delay(20);
    assert.deepStrictEqual(writes, ['first-client', 'second-client'], 'viewport-owned SGR wheel input must be dropped at the final PTY boundary');
    session.meta.command = 'hermes --tui';
    first.send(JSON.stringify({ type: 'input', data: '\x1b[<65;10;5M' }));
    first.send(JSON.stringify({ type: 'input', data: '\x1b[A' }));
    await delay(20);
    assert.deepStrictEqual(writes, ['first-client', 'second-client', '\x1b[<65;10;5M', '\x1b[A'], 'application-owned wheel and ordinary keyboard arrows must remain exact PTY input');
    session.meta.command = 'hermes';
    first.send(JSON.stringify({ type: 'input', data: '\x1a' }));
    await delay(20);
    assert.strictEqual(writes.at(-1), '\x1a', 'Ctrl+Z must fail open when no foreground-process evidence is available');
    session.meta.command = '';

    const hermesPublisher = new WebSocket(`ws://127.0.0.1:${port}/ws?hermesEvents=validation`);
    await opened(hermesPublisher);
    await waitFor(
      () => firstMessages.some(message => message.type === 'hermes-events' && message.connected === true),
      'the native Hermes event publisher must mark the matching pane connected'
    );
    hermesPublisher.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.start', session_id: 'live-1' } }));
    hermesPublisher.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {
      type: 'session.info',
      session_id: 'live-1',
      payload: { running: true, title: 'Native Hermes Title', stored_session_id: 'stored-1', provider: 'secret-provider-detail' }
    } }));
    hermesPublisher.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {
      type: 'tool.start',
      session_id: 'live-1',
      payload: { tool_id: 'tool-1', args_text: 'must not reach browsers' }
    } }));
    await waitFor(
      () => firstMessages.some(message => message.type === 'hermes-event' && message.event?.type === 'session.info'),
      'native Hermes lifecycle events must reach the matching pane'
    );
    const nativeInfo = firstMessages.find(message => message.type === 'hermes-event' && message.event?.type === 'session.info');
    assert.deepStrictEqual(nativeInfo.event.payload, {
      running: true,
      title: 'Native Hermes Title',
      stored_session_id: 'stored-1'
    }, 'PassiDeck must forward only the native Hermes metadata it actually consumes');
    await waitFor(
      () => session.meta.title === 'Native Hermes Title' && session.meta.hermesSessionId === 'stored-1',
      'native Hermes title metadata must update the pane without waiting for database polling'
    );
    assert.strictEqual(session.meta.titleSource, 'hermes-event');
    session.meta.title = 'Dynamic Retitle Wins';
    session.meta.titleSource = 'passideck-retitle';
    session.meta.hermesSessionId = 'stored-1';
    hermesPublisher.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {
      type: 'session.title',
      session_id: 'live-1',
      payload: { title: 'Late Native Title', session_id: 'stored-1' }
    } }));
    await delay(20);
    assert.strictEqual(session.meta.title, 'Dynamic Retitle Wins', 'native Hermes metadata must not replace the refined plugin title for the same session');
    assert.ok(!firstMessages.some(message => message.type === 'hermes-event' && message.event?.type === 'tool.start'), 'unused tool payloads must not leak through the pane bridge');
    const replacementPublisher = new WebSocket(`ws://127.0.0.1:${port}/ws?hermesEvents=validation`);
    await opened(replacementPublisher);
    await waitFor(() => hermesPublisher.readyState === WebSocket.CLOSED, 'a newer Hermes publisher must supersede the stale publisher generation');
    replacementPublisher.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {
      type: 'session.info', session_id: 'live-2', payload: { running: false, stored_session_id: 'stored-2' }
    } }));
    await waitFor(() => session.hermesEventSessionId === 'live-2' && session.hermesRunning === false, 'a replacement publisher must establish a fresh lifecycle id');
    replacementPublisher.close();
    await waitFor(
      () => firstMessages.some(message => message.type === 'hermes-events' && message.connected === false),
      'the pane must fall back when its last Hermes event publisher disconnects'
    );

    const workingEventCount = () => firstMessages.filter(message => message.type === 'hermes-event' && message.event?.type === 'message.start').length;
    const workingStart = await fetch(`${base}/internal/session-working`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'validation', working: true, turnId: 'turn-new' })
    });
    assert.strictEqual(workingStart.status, 200);
    await waitFor(() => workingEventCount() >= 1, 'a current Hermes turn must mark the pane working');
    const countAfterStart = workingEventCount();
    const staleWorkingEnd = await fetch(`${base}/internal/session-working`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'validation', working: false, turnId: 'turn-old' })
    });
    assert.strictEqual(staleWorkingEnd.status, 202, 'a late completion from an older turn must be accepted as stale without clearing the current turn');
    assert.deepStrictEqual(await staleWorkingEnd.json(), { ok: true, stale: true, working: true, turnId: 'turn-new' });
    await delay(20);
    assert.strictEqual(workingEventCount(), countAfterStart, 'a stale completion must not broadcast a false working event');
    const workingEnd = await fetch(`${base}/internal/session-working`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'validation', working: false, turnId: 'turn-new' })
    });
    assert.strictEqual(workingEnd.status, 200);
    await waitFor(
      () => firstMessages.some(message => message.type === 'hermes-event' && message.event?.type === 'message.complete'),
      'the matching current-turn completion must clear the pane'
    );

    const initialUi = await fetch(`${base}/api/ui-state`).then(res => res.json());
    assert.strictEqual(initialUi.performanceMode, false, 'new installs must default to Energy saver');
    const legacyResponse = await fetch(`${base}/api/ui-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...initialUi,
        panePrefs: {
          order: ['validation'],
          minimized: ['validation'],
          windows: { desktop: { validation: { x: 10, y: 20, w: 700, h: 500, z: 11 } } },
          viewport: { w: 1400, h: 850 }
        }
      })
    });
    assert.strictEqual(legacyResponse.status, 200);
    const migratedUi = await legacyResponse.json();
    assert.deepStrictEqual(migratedUi.panePrefs.desktopOrder, ['desktop-1'], 'legacy pane preferences must migrate into the default desktop');
    assert.deepStrictEqual(migratedUi.panePrefs.desktops['desktop-1'].minimized, ['validation'], 'legacy minimized state must migrate');
    assert.deepStrictEqual(migratedUi.panePrefs.desktops['desktop-1'].windows.validation, { x: 10, y: 20, w: 700, h: 500, z: 11 }, 'legacy geometry must migrate');
    assert.deepStrictEqual(migratedUi.panePrefs.desktops['desktop-1'].viewport, { w: 1400, h: 850 }, 'legacy viewport must migrate');
    const uiEvents = await fetch(`${base}/api/ui-events`);
    assert.strictEqual(uiEvents.status, 200, 'UI state event stream must be available');
    const reader = uiEvents.body.getReader();
    const saved = await fetch(`${base}/api/ui-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...migratedUi,
        revision: migratedUi.revision,
        activeId: 'validation',
        layout: '2x2',
        baseLayout: '2x2',
        focusedId: 'validation',
        primaryId: 'validation',
        minimized: ['validation'],
        notifyBlinking: false,
        performanceMode: true,
        transparencyMode: 'full',
        transparencyOpacity: 64,
        panePrefs: {
          ...migratedUi.panePrefs,
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
    assert.strictEqual(savedUi.performanceMode, true, 'UI state must persist Performance mode instead of dropping it during validation');
    assert.ok(!Object.hasOwn(savedUi, 'transparencyMode') && !Object.hasOwn(savedUi, 'transparencyOpacity'), 'retired transparency preferences must be dropped from authoritative UI state');
    for (const field of ['layout', 'baseLayout', 'focusedId', 'primaryId', 'minimized']) {
      assert.strictEqual(Object.hasOwn(savedUi, field), false, `retired top-level UI field ${field} must be dropped`);
    }
    for (const field of ['minimized', 'windows', 'viewport']) {
      assert.strictEqual(Object.hasOwn(savedUi.panePrefs, field), false, `legacy panePrefs field ${field} must be read-only migration input`);
    }
    assert.deepStrictEqual(Object.keys(savedUi.panePrefs).sort(), ['desktopOrder', 'desktops', 'order', 'paneDesktop', 'titles'], 'serialized pane preferences must expose only the modern contract');
    assert.deepStrictEqual(savedUi.panePrefs.desktopOrder, ['work', 'monitoring'], 'desktop order must survive server validation');
    assert.deepStrictEqual(
      savedUi.panePrefs.desktopOrder.map(id => savedUi.panePrefs.desktops[id].name),
      ['Work', 'Desktop 1'],
      'server validation must repair duplicate desktop names with the lowest free default number'
    );
    assert.strictEqual(savedUi.panePrefs.paneDesktop.validation, 'monitoring', 'pane desktop assignment must survive server validation');
    assert.deepStrictEqual(savedUi.panePrefs.desktops.monitoring.minimized, ['validation'], 'per-desktop minimized state must survive server validation');
    assert.deepStrictEqual(savedUi.panePrefs.desktops.monitoring.windows.validation, { x: 10, y: 20, w: 700, h: 500, z: 11 }, 'per-desktop geometry must survive server validation');
    assert.ok(savedUi.revision > migratedUi.revision, 'accepted UI changes must advance the server revision');
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

    persistentSession.terminalOwnerTimer = setTimeout(() => {}, 60000);
    persistentSession.tmuxRefreshTimer = setTimeout(() => {}, 60000);
    persistentSession.terminalOwnerTimer.unref?.();
    persistentSession.tmuxRefreshTimer.unref?.();
    await app.close();
    assert.strictEqual(persistentSession.terminalOwnerTimer, null, 'server close must clear pending terminal-owner timers');
    assert.strictEqual(persistentSession.tmuxRefreshTimer, null, 'server close must clear pending tmux-refresh timers');
    app = null;
    await delay(20);
    assert.strictEqual(first.readyState, WebSocket.CLOSED, 'shutdown must close first WebSocket client');
    assert.strictEqual(second.readyState, WebSocket.CLOSED, 'shutdown must close second WebSocket client');
    tmux('has-session', '-t', persistentTmux);
    console.log('server-validation ok');
  } finally {
    if (app) await app.close();
    try { extraTmuxClient?.kill(); } catch {}
    try { tmux('kill-server'); } catch {}
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
