const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');

const repo = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'passideck-scroll-verify-'));
const home = path.join(tmp, 'home');
const bin = path.join(tmp, 'bin');
const socket = `passideck-scroll-verify-${process.pid}`;
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(bin, { recursive: true });
fs.writeFileSync(path.join(bin, 'hermes'), `#!/bin/bash
if [ "\${1:-}" = "--tui" ]; then
  printf '\\033[?1049h\\033[?1000h\\033[?1006hMANUAL-TUI\\r\\n'
  trap 'printf "\\033[?1000l\\033[?1006l\\033[?1049l"; exit 0' INT TERM
  while :; do sleep 1; done
fi
`, { mode: 0o755 });
process.env.PASSIDECK_HOME = home;
process.env.HERMES_HOME = path.join(tmp, 'hermes-home');
process.env.PASSIDECK_TMUX_SOCKET = socket;
process.env.PATH = `${bin}:${process.env.PATH}`;
const serverPort = Number(process.env.PASSIDECK_SCROLL_TEST_PORT || 8793);
const browserUrl = process.env.PASSIDECK_SCROLL_BROWSER_URL || 'http://127.0.0.1:18793/';
const cdpHttp = process.env.PASSIDECK_SCROLL_CDP_HTTP || 'http://127.0.0.1:9224';
const { createServer } = require(path.join(repo, 'packages/server/src/index.js'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, label, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (err) { last = err.message; }
    await sleep(100);
  }
  throw new Error(`timeout: ${label}; last=${JSON.stringify(last)}`);
}
async function api(base, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
function sendLiteral(session, text) {
  const encoded = Buffer.from(text).toString('base64');
  session.pty.write(`printf %s ${encoded} | base64 -d\r`);
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {});
    });
    this.ws.on('close', () => this.rejectPending(new Error('CDP socket closed')));
    this.ws.on('error', err => this.rejectPending(err));
  }
  open() { return new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }); }
  rejectPending(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (err) { clearTimeout(timer); this.pending.delete(id); reject(err); }
    });
  }
  close() { try { this.ws.close(); } catch {} }
}
async function evaluate(cdp, sid, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
function bufferExpression(id) {
  return `(() => {
    const entry = state.sessions.get(${JSON.stringify(id)});
    if (!entry) return null;
    const buffer = entry.term.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(false) || '');
    return { text: lines.join('\\n'), baseY: buffer.baseY, viewportY: buffer.viewportY, type: buffer.type, owner: entry.terminalOwner, settled: !entry.outputWriteInFlight && entry.pendingReplay === null && entry.outputBuffer.length === 0 };
  })()`;
}

(async () => {
  let app;
  let cdp;
  let targetId;
  const ids = [];
  try {
    app = createServer({ host: '127.0.0.1', port: serverPort, shell: '/bin/bash', hermesTitlePollMs: 60000 });
    await new Promise((resolve, reject) => app.server.listen(serverPort, '127.0.0.1', err => err ? reject(err) : resolve()));
    const base = `http://127.0.0.1:${serverPort}`;
    const shell = await api(base, 'POST', '/api/sessions', { command: '/bin/bash', cwd: home, label: 'scroll-shell', cols: 100, rows: 24 });
    const normal = await api(base, 'POST', '/api/sessions', { command: '/bin/bash', cwd: home, label: 'scroll-hermes', cols: 100, rows: 24 });
    const manual = await api(base, 'POST', '/api/sessions', { command: '/bin/bash', cwd: home, label: 'scroll-manual-tui', cols: 100, rows: 24 });
    ids.push(shell.id, normal.id, manual.id);
    const shellSession = app.sessions.get(shell.id);
    const normalSession = app.sessions.get(normal.id);
    const manualSession = app.sessions.get(manual.id);
    shellSession.pty.write('for i in $(seq -w 1 160); do echo shell-line-$i; done\r');
    sendLiteral(shellSession, '[PassiDeck reconnect: output replay disabled; live session still running]\n');
    normalSession.meta.command = 'hermes';
    normalSession.pty.write('for i in $(seq -w 1 160); do echo hermes-line-$i; done\r');
    await sleep(400);

    const version = await fetch(`${cdpHttp}/json/version`).then(r => {
      if (!r.ok) throw new Error(`CDP ${r.status}`);
      return r.json();
    });
    cdp = new CDP(version.webSocketDebuggerUrl);
    await cdp.open();
    ({ targetId } = await cdp.send('Target.createTarget', { url: browserUrl }));
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sid = attached.sessionId;
    await cdp.send('Runtime.enable', {}, sid);
    await waitFor(() => evaluate(cdp, sid, `typeof state === 'object' && state.sessions.size === 3`), 'three candidate sessions loaded', 15000);

    const shellState = await waitFor(async () => {
      const value = await evaluate(cdp, sid, bufferExpression(shell.id));
      return value?.baseY > 0 && value.text.includes('shell-line-160') && value.text.includes('[PassiDeck reconnect: output replay disabled; live session still running]') ? value : null;
    }, 'shell history and marker replay');
    assert.strictEqual(shellState.owner, 'viewport');
    assert.ok(shellState.text.includes('[PassiDeck reconnect: output replay disabled; live session still running]'), 'typed replay must preserve marker-like shell output');

    const shellWheel = await evaluate(cdp, sid, `(async () => {
      const entry = state.sessions.get(${JSON.stringify(shell.id)});
      entry.term.scrollToBottom();
      const leaked = [];
      const disposable = entry.term.onData(data => leaked.push(data));
      const before = { baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
      const event = new WheelEvent('wheel', { deltaY: -480, bubbles: true, cancelable: true });
      const dispatched = entry.el.querySelector('.terminal').dispatchEvent(event);
      await new Promise(resolve => setTimeout(resolve, 100));
      const after = { baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
      disposable.dispose();
      return { before, after, canceled: !dispatched || event.defaultPrevented, leaked };
    })()`);
    assert.ok(shellWheel.after.viewportY < shellWheel.before.viewportY, JSON.stringify(shellWheel));
    assert.strictEqual(shellWheel.canceled, true);
    assert.deepStrictEqual(shellWheel.leaked, []);

    const normalState = await waitFor(async () => {
      const value = await evaluate(cdp, sid, bufferExpression(normal.id));
      return value?.baseY > 0 && value.text.includes('hermes-line-160') ? value : null;
    }, 'fresh normal Hermes history replay');
    assert.strictEqual(normalState.owner, 'viewport');

    await evaluate(cdp, sid, `saveTerminalSnapshot(${JSON.stringify(shell.id)}); state.sessions.get(${JSON.stringify(shell.id)}).ws.close(4000, 'isolated reconnect test'); true`);
    await sleep(150);
    sendLiteral(shellSession, 'offline-gap-once\n');
    await sleep(150);
    await evaluate(cdp, sid, `reconnect(${JSON.stringify(shell.id)}); true`);
    const reconnectState = await waitFor(async () => {
      const value = await evaluate(cdp, sid, bufferExpression(shell.id));
      return value?.text.includes('offline-gap-once') ? value : null;
    }, 'authoritative reconnect after output gap');
    assert.strictEqual((reconnectState.text.match(/offline-gap-once/g) || []).length, 1, 'offline output must be replayed exactly once');
    assert.strictEqual((reconnectState.text.match(/shell-line-160/g) || []).length, 1, 'existing history must not duplicate on reconnect');

    await evaluate(cdp, sid, `state.sessions.get(${JSON.stringify(shell.id)}).ws.close(4000, 'running output boundary test'); true`);
    await sleep(100);
    shellSession.pty.write('for i in $(seq 1 200); do printf "race-%03d\\n" "$i"; sleep 0.01; done\r');
    await sleep(200);
    await evaluate(cdp, sid, `reconnect(${JSON.stringify(shell.id)}); true`);
    const raceState = await waitFor(async () => {
      const value = await evaluate(cdp, sid, bufferExpression(shell.id));
      return value?.settled && value.text.includes('race-200') ? value : null;
    }, 'reconnect while output remains active', 15000);
    for (let i = 1; i <= 200; i += 1) {
      const line = `race-${String(i).padStart(3, '0')}`;
      assert.strictEqual((raceState.text.match(new RegExp(line, 'g')) || []).length, 1, `${line} must cross capture/live boundary exactly once`);
    }

    shellSession.pty.write('CURSOR-REPLAY-CHECK');
    shellSession.pty.write('\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D');
    await sleep(100);
    const cursorBefore = await evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(shell.id)}); return { x: entry.term.buffer.active.cursorX, attachCount: entry.attachCount }; })()`);
    await evaluate(cdp, sid, `state.sessions.get(${JSON.stringify(shell.id)}).ws.close(4000, 'cursor replay test'); true`);
    await sleep(100);
    await evaluate(cdp, sid, `reconnect(${JSON.stringify(shell.id)}); true`);
    const cursorAfter = await waitFor(async () => {
      const value = await evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(shell.id)}); return { x: entry.term.buffer.active.cursorX, attachCount: entry.attachCount, settled: !entry.outputWriteInFlight && entry.pendingReplay === null }; })()`);
      return value.attachCount > cursorBefore.attachCount && value.settled ? value : null;
    }, 'replay cursor restoration');
    assert.strictEqual(cursorAfter.x, cursorBefore.x, JSON.stringify({ cursorBefore, cursorAfter }));
    shellSession.pty.write('\x03');
    await sleep(100);

    manualSession.pty.write('hermes --tui\r');
    await waitFor(() => evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(manual.id)}); return entry?.terminalOwner === 'application' && entry.terminalMode === 'hermes-tui' && entry.el.classList.contains('hermes-tui'); })()`), 'manual Hermes TUI mode update');
    await evaluate(cdp, sid, `new Promise(resolve => state.sessions.get(${JSON.stringify(manual.id)}).term.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006hMANUAL-TUI', resolve))`);
    const copySemantics = await evaluate(cdp, sid, `(async () => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const textarea = entry.el.querySelector('.xterm-helper-textarea');
      const originalCopy = copyTextToClipboard;
      copyTextToClipboard = async () => true;
      try {
        entry.term.selectAll();
        const plain = { key: 'c', ctrlKey: true, shiftKey: false, metaKey: false, altKey: false, target: textarea, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
        handleTerminalCopyShortcut(plain);
        const plainSelectionRetained = Boolean(entry.term.getSelection());
        const shifted = { ...plain, shiftKey: true, prevented: false, stopped: false };
        handleTerminalCopyShortcut(shifted);
        await new Promise(resolve => setTimeout(resolve, 20));
        return { plainPrevented: plain.prevented, plainStopped: plain.stopped, plainSelectionRetained, shiftedPrevented: shifted.prevented, shiftedStopped: shifted.stopped, selection: entry.term.getSelection() };
      } finally {
        copyTextToClipboard = originalCopy;
      }
    })()`);
    assert.deepStrictEqual(copySemantics, { plainPrevented: false, plainStopped: false, plainSelectionRetained: true, shiftedPrevented: true, shiftedStopped: true, selection: '' });
    const dynamicHermesEvents = await evaluate(cdp, sid, `(() => {
      const id = ${JSON.stringify(manual.id)};
      const entry = state.sessions.get(id);
      entry.terminalOwner = 'viewport';
      entry.terminalMode = 'viewport';
      entry.el.classList.remove('hermes-tui');
      applyHermesEvent(id, { type: 'hermes-event', event: { type: 'message.start', session_id: 'stale' } });
      applyHermesEvent(id, { type: 'hermes-events', connected: true, running: null });
      applyHermesEvent(id, { type: 'hermes-event', event: { type: 'message.start', session_id: 'current' } });
      const queued = entry.pendingHermesEvents.length === 2 && entry.pendingHermesEvents[0].type === 'hermes-events' && !entry.working;
      applyTerminalOwner(id, entry.term, 'application', 'hermes-tui');
      const started = entry.working;
      applyHermesEvent(id, { type: 'hermes-event', event: { type: 'message.complete' } });
      return { queued, started, completed: !entry.working, declaredCommand: entry.session.meta.command, mode: entry.terminalMode };
    })()`);
    assert.deepStrictEqual(dynamicHermesEvents, { queued: true, started: true, completed: true, declaredCommand: '/bin/bash', mode: 'hermes-tui' });
    const tuiWheel = await waitFor(async () => {
      const value = await evaluate(cdp, sid, `(async () => {
        const entry = state.sessions.get(${JSON.stringify(manual.id)});
        const leaked = [];
        const disposable = entry.term.onData(data => leaked.push(data));
        const before = entry.term.buffer.active.viewportY;
        const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
        const rect = target.getBoundingClientRect();
        const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 40 });
        target.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 100));
        const result = { owner: entry.terminalOwner, mode: entry.terminalMode, tuiClass: entry.el.classList.contains('hermes-tui'), type: entry.term.buffer.active.type, before, after: entry.term.buffer.active.viewportY, leaked };
        disposable.dispose();
        return result;
      })()`);
      return value.leaked.length ? value : null;
    }, 'manual Hermes TUI wheel delivery');
    assert.strictEqual(tuiWheel.owner, 'application');
    assert.strictEqual(tuiWheel.mode, 'hermes-tui');
    assert.strictEqual(tuiWheel.tuiClass, true);
    assert.strictEqual(tuiWheel.type, 'alternate');
    assert.strictEqual(tuiWheel.after, tuiWheel.before);
    assert.ok(tuiWheel.leaked.every(data => /^\x1b\[<6[45];\d+;\d+M$/.test(data)), JSON.stringify(tuiWheel));

    const tuiTouch = await evaluate(cdp, sid, `new Promise(resolve => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const lines = Array.from({ length: 80 }, (_, i) => 'touch-line-' + i).join('\\r\\n');
      entry.term.write('\\x1b[?1049l' + lines, () => {
        const target = entry.el.querySelector('.terminal');
        const original = entry.term.scrollLines;
        let calls = 0;
        entry.term.scrollLines = function(...args) { calls += 1; return original.apply(this, args); };
        let supported = true;
        let move;
        try {
          const startTouch = new Touch({ identifier: 1, target, clientX: 20, clientY: 200 });
          const moveTouch = new Touch({ identifier: 1, target, clientX: 20, clientY: 80 });
          target.dispatchEvent(new TouchEvent('touchstart', { touches: [startTouch], changedTouches: [startTouch], bubbles: true, cancelable: true }));
          move = new TouchEvent('touchmove', { touches: [moveTouch], changedTouches: [moveTouch], bubbles: true, cancelable: true });
          target.dispatchEvent(move);
        } catch { supported = false; }
        entry.term.scrollLines = original;
        resolve({ supported, calls, canceled: Boolean(move?.defaultPrevented), type: entry.term.buffer.active.type, baseY: entry.term.buffer.active.baseY, owner: entry.terminalOwner });
      });
    })`);
    assert.ok(tuiTouch.supported && tuiTouch.type === 'normal' && tuiTouch.baseY > 0, JSON.stringify(tuiTouch));
    assert.strictEqual(tuiTouch.owner, 'application', JSON.stringify(tuiTouch));
    assert.strictEqual(tuiTouch.calls, 0, JSON.stringify(tuiTouch));
    assert.strictEqual(tuiTouch.canceled, false, JSON.stringify(tuiTouch));

    manualSession.pty.write('\x03');
    await waitFor(() => evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(manual.id)}); return entry?.terminalOwner === 'viewport' && entry.terminalMode === 'viewport' && !entry.el.classList.contains('hermes-tui') && entry.term.buffer.active.type === 'normal'; })()`), 'mode and normal buffer return after TUI exit', 15000);

    const backlogResync = await evaluate(cdp, sid, `(() => {
      const id = ${JSON.stringify(manual.id)};
      const entry = state.sessions.get(id);
      const original = { ws: entry.ws, outputBuffer: entry.outputBuffer, outputBufferChars: entry.outputBufferChars, outputGeneration: entry.outputGeneration, outputWriteInFlight: entry.outputWriteInFlight, outputFrameHandle: entry.outputFrameHandle };
      let closed = null;
      try {
        entry.ws = { close(code, reason) { closed = { code, reason }; } };
        entry.outputBuffer = [];
        entry.outputBufferChars = 0;
        entry.outputWriteInFlight = true;
        queueTerminalOutput(id, entry.term, 'X'.repeat(TERM_OUTPUT_BUFFER_MAX_CHARS + 1));
        return { closed, bufferChars: entry.outputBufferChars, generationDelta: entry.outputGeneration - original.outputGeneration };
      } finally {
        entry.ws = original.ws;
        entry.outputBuffer = original.outputBuffer;
        entry.outputBufferChars = original.outputBufferChars;
        entry.outputGeneration = original.outputGeneration;
        entry.outputWriteInFlight = original.outputWriteInFlight;
        entry.outputFrameHandle = original.outputFrameHandle;
        entry.outputFlushTimer = null;
        entry.snapshotTimer = null;
        scheduleTerminalSnapshot(id);
      }
    })()`);
    assert.deepStrictEqual(backlogResync, { closed: { code: 4002, reason: 'client output backlog' }, bufferChars: 0, generationDelta: 1 });

    const result = { shellBaseY: reconnectState.baseY, shellWheel, normalBaseY: normalState.baseY, tuiWheel, backlogResync, sessions: ids.length };
    console.log(`browser-scroll-cdp ok ${JSON.stringify(result)}`);
  } finally {
    if (cdp && targetId) {
      try { await cdp.send('Target.closeTarget', { targetId }); } catch {}
    }
    cdp?.close();
    try { await app?.close(); } catch {}
    try { execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore' }); } catch {}
    try { fs.unlinkSync(path.join(os.tmpdir(), `tmux-${process.getuid()}`, socket)); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
