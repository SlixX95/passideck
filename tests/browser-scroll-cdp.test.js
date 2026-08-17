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

    const geometrySync = await evaluate(cdp, sid, `(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      const makeEntry = ({ rows, fallback = false, sentRows = 0 }) => {
        const messages = [];
        const term = {
          cols: 80,
          rows: 24,
          buffer: { active: { viewportY: 0, baseY: 0 } },
          resize(cols, nextRows) { this.cols = cols; this.rows = nextRows; },
          scrollToBottom() {}
        };
        const entry = {
          el: { classList: { contains: () => false }, offsetParent: {} },
          term,
          fit: fallback
            ? { proposeDimensions: () => null, fit: () => term.resize(80, rows) }
            : { proposeDimensions: () => ({ cols: 80, rows }) },
          ws: { readyState: WebSocket.OPEN, send: data => messages.push(JSON.parse(data).type) },
          lastSentCols: sentRows ? 80 : 0,
          lastSentRows: sentRows
        };
        return { entry, messages, term, setRows: nextRows => { rows = nextRows; } };
      };
      const scheduledProbe = async options => {
        const id = 'geometry-probe';
        const probe = makeEntry(options);
        state.sessions.set(id, probe.entry);
        try {
          scheduleTerminalFit({ ids: [id], delay: 5, lateDelay: 15 });
          await new Promise(resolve => setTimeout(resolve, 40));
          return { messages: probe.messages, cols: probe.term.cols, rows: probe.term.rows };
        } finally {
          state.sessions.delete(id);
        }
      };
      const forced = makeEntry({ rows: 24, sentRows: 24 });
      fitEntry('geometry-probe', forced.entry, { allowHeight: true, force: true });
      const dragProbe = makeEntry({ rows: 32 });
      state.sessions.set('geometry-drag-probe', dragProbe.entry);
      const originalResizeDrag = state.resizeDrag;
      let dragResize;
      try {
        state.resizeDrag = {};
        scheduleTerminalFit({ ids: ['geometry-drag-probe'], delay: 5, lateDelay: 15 });
        await new Promise(resolve => setTimeout(resolve, 40));
        const during = [...dragProbe.messages];
        state.resizeDrag = null;
        scheduleTerminalFit({ ids: ['geometry-drag-probe'], delay: 5, lateDelay: 15 });
        await new Promise(resolve => setTimeout(resolve, 40));
        dragResize = {
          during,
          after: [...dragProbe.messages],
          dirty: Boolean(dragProbe.entry.geometryChangedSinceRedraw)
        };
      } finally {
        state.resizeDrag = originalResizeDrag;
        state.sessions.delete('geometry-drag-probe');
      }
      const timerDragProbe = makeEntry({ rows: 32 });
      state.sessions.set('geometry-timer-drag-probe', timerDragProbe.entry);
      let preScheduledDrag;
      try {
        state.resizeDrag = null;
        scheduleTerminalFit({ ids: ['geometry-timer-drag-probe'], delay: 60, lateDelay: 100 });
        await new Promise(resolve => setTimeout(resolve, 35));
        timerDragProbe.setRows(40);
        state.resizeDrag = {};
        await new Promise(resolve => setTimeout(resolve, 80));
        const during = [...timerDragProbe.messages];
        const dirtyDuring = Boolean(timerDragProbe.entry.geometryChangedSinceRedraw);
        state.resizeDrag = null;
        scheduleTerminalFit({ ids: ['geometry-timer-drag-probe'], delay: 5, lateDelay: 15 });
        await new Promise(resolve => setTimeout(resolve, 40));
        preScheduledDrag = {
          during,
          dirtyDuring,
          after: [...timerDragProbe.messages],
          dirtyAfter: Boolean(timerDragProbe.entry.geometryChangedSinceRedraw)
        };
      } finally {
        state.resizeDrag = originalResizeDrag;
        state.sessions.delete('geometry-timer-drag-probe');
      }
      const coalescedA = makeEntry({ rows: 32 });
      const coalescedB = makeEntry({ rows: 32 });
      state.sessions.set('geometry-coalesced-a', coalescedA.entry);
      state.sessions.set('geometry-coalesced-b', coalescedB.entry);
      let coalescedPanes;
      try {
        scheduleTerminalFit({ ids: ['geometry-coalesced-a', 'geometry-coalesced-b'], delay: 20, lateDelay: 60 });
        await new Promise(resolve => setTimeout(resolve, 35));
        scheduleTerminalFit({ ids: ['geometry-coalesced-a'], delay: 5, lateDelay: 15 });
        await new Promise(resolve => setTimeout(resolve, 40));
        coalescedPanes = {
          a: [...coalescedA.messages],
          b: [...coalescedB.messages],
          dirtyA: Boolean(coalescedA.entry.geometryChangedSinceRedraw),
          dirtyB: Boolean(coalescedB.entry.geometryChangedSinceRedraw)
        };
      } finally {
        state.sessions.delete('geometry-coalesced-a');
        state.sessions.delete('geometry-coalesced-b');
      }
      return {
        proposed: await scheduledProbe({ rows: 32 }),
        fallback: await scheduledProbe({ rows: 32, fallback: true }),
        unchanged: await scheduledProbe({ rows: 24, sentRows: 24 }),
        forcedUnchanged: { messages: forced.messages, cols: forced.term.cols, rows: forced.term.rows },
        dragResize,
        preScheduledDrag,
        coalescedPanes
      };
    })()`);
    assert.deepStrictEqual(geometrySync, {
      proposed: { messages: ['resize', 'redraw'], cols: 80, rows: 32 },
      fallback: { messages: ['resize', 'redraw'], cols: 80, rows: 32 },
      unchanged: { messages: [], cols: 80, rows: 24 },
      forcedUnchanged: { messages: ['resize'], cols: 80, rows: 24 },
      dragResize: { during: ['resize'], after: ['resize', 'redraw'], dirty: false },
      preScheduledDrag: { during: ['resize'], dirtyDuring: true, after: ['resize', 'resize', 'redraw'], dirtyAfter: false },
      coalescedPanes: { a: ['resize', 'redraw'], b: ['resize', 'redraw'], dirtyA: false, dirtyB: false }
    });

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
      applyHermesEvent(id, { type: 'hermes-event', event: { type: 'message.complete', payload: { working: true } } });
      const delegated = entry.working;
      applyHermesEvent(id, { type: 'hermes-event', event: { type: 'message.complete', payload: { working: false } } });
      return { queued, started, delegated, completed: !entry.working, declaredCommand: entry.session.meta.command, mode: entry.terminalMode };
    })()`);
    assert.deepStrictEqual(dynamicHermesEvents, { queued: true, started: true, delegated: true, completed: true, declaredCommand: '/bin/bash', mode: 'hermes-tui' });
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

    const classicCtrlZ = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(normal.id)});
      delete entry.terminalSuspendProtected;
      const sent = [];
      entry.term.focus();
      window.__classicCtrlZ = { sent, disposable: entry.term.onData(data => sent.push(data)) };
      return true;
    })()`);
    assert.strictEqual(classicCtrlZ, true);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const classicCtrlZResult = await evaluate(cdp, sid, `(() => {
      const sent = window.__classicCtrlZ.sent;
      window.__classicCtrlZ.disposable.dispose();
      delete window.__classicCtrlZ;
      return sent;
    })()`);
    assert.deepStrictEqual(classicCtrlZResult, [], 'Ctrl+Z from a PassiDeck client must not suspend its managed Hermes CLI');

    const declaredHermesClassifications = await evaluate(cdp, sid, `[
      isHermesEntry({ session: { meta: { command: 'hermes' } } }),
      isHermesEntry({ session: { meta: { command: '/opt/hermes --tui' } } }),
      isHermesEntry({ session: { meta: { command: 'HERMES' } } }),
      isHermesEntry({ session: { meta: { command: '/opt/Hermes' } } }),
      isHermesEntry({ session: { meta: { command: ${JSON.stringify('C:\\tools\\hermes')} } } }),
      isHermesEntry({ session: { meta: { command: "bash -lc 'echo hermes'", label: 'Hermes notes' } } })
    ]`);
    assert.deepStrictEqual(declaredHermesClassifications, [true, true, false, false, false, false], 'legacy Hermes classification must require an exact case-sensitive Linux executable token');

    await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(shell.id)});
      window.__nonHermesWordCtrlZ = { ws: entry.ws, command: entry.session.meta.command, label: entry.session.meta.label, sent: [] };
      entry.session.meta.command = "bash -lc 'echo hermes'";
      entry.session.meta.label = 'Hermes notes';
      delete entry.terminalSuspendProtected;
      entry.ws = { readyState: WebSocket.OPEN, send: raw => window.__nonHermesWordCtrlZ.sent.push(JSON.parse(raw).data) };
      entry.term.focus();
    })()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const nonHermesWordCtrlZ = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(shell.id)});
      const record = window.__nonHermesWordCtrlZ;
      entry.ws = record.ws;
      entry.session.meta.command = record.command;
      entry.session.meta.label = record.label;
      delete window.__nonHermesWordCtrlZ;
      return record.sent;
    })()`);
    assert.deepStrictEqual(nonHermesWordCtrlZ, ['\x1a'], 'mentioning Hermes in a non-Hermes command or label must not disable shell job control');

    await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(normal.id)});
      window.__authoritativeCtrlZ = { ws: entry.ws, sent: [] };
      entry.ws = { readyState: WebSocket.OPEN, send: raw => window.__authoritativeCtrlZ.sent.push(JSON.parse(raw).data) };
      applyTerminalOwner(entry.session.id, entry.term, 'viewport', 'viewport', false);
      entry.term.focus();
    })()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const authoritativeFalseCtrlZ = await evaluate(cdp, sid, `(() => {
      const stateRecord = window.__authoritativeCtrlZ;
      const sent = [...stateRecord.sent];
      stateRecord.sent.length = 0;
      const entry = state.sessions.get(${JSON.stringify(normal.id)});
      applyTerminalOwner(entry.session.id, entry.term, 'viewport', 'viewport', true);
      return sent;
    })()`);
    assert.deepStrictEqual(authoritativeFalseCtrlZ, ['\x1a'], 'a new server must remain the authoritative Ctrl+Z boundary after releasing Hermes');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const authoritativeTrueCtrlZ = await evaluate(cdp, sid, `(() => {
      const stateRecord = window.__authoritativeCtrlZ;
      const sent = [...stateRecord.sent];
      const entry = state.sessions.get(${JSON.stringify(normal.id)});
      entry.ws = stateRecord.ws;
      delete entry.terminalSuspendProtected;
      delete window.__authoritativeCtrlZ;
      return sent;
    })()`);
    assert.deepStrictEqual(authoritativeTrueCtrlZ, ['\x1a'], 'a new server must receive Ctrl+Z even while its last protection state is true');

    await evaluate(cdp, sid, `new Promise(resolve => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      entry.term.reset();
      entry.term.write('\\x1b[?1000h\\x1b[?1003h\\x1b[?1006h', resolve);
    })`);
    const genericTuiCtrlZ = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      window.__genericTuiCtrlZ = { ws: entry.ws, sent: [] };
      entry.terminalOwner = 'application';
      entry.terminalMode = 'application';
      entry.ws = { readyState: WebSocket.OPEN, send: raw => window.__genericTuiCtrlZ.sent.push(JSON.parse(raw).data) };
      entry.term.focus();
      return true;
    })()`);
    assert.strictEqual(genericTuiCtrlZ, true);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const genericTuiCtrlZResult = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const sent = window.__genericTuiCtrlZ.sent;
      entry.ws = window.__genericTuiCtrlZ.ws;
      entry.terminalOwner = 'application';
      entry.terminalMode = 'hermes-tui';
      delete window.__genericTuiCtrlZ;
      return sent;
    })()`);
    assert.deepStrictEqual(genericTuiCtrlZResult, ['\x1a'], 'generic mouse-reporting terminal applications must retain Ctrl+Z');

    const blockedSuspend = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const sent = [];
      entry.term.focus();
      window.__blockedSuspend = { sent, disposable: entry.term.onData(data => sent.push(data)) };
      return true;
    })()`);
    assert.strictEqual(blockedSuspend, true);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }, sid);
    const blockedSuspendResult = await evaluate(cdp, sid, `new Promise(resolve => setTimeout(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const result = { sent: window.__blockedSuspend.sent, owner: entry.terminalOwner, mode: entry.terminalMode };
      window.__blockedSuspend.disposable.dispose();
      delete window.__blockedSuspend;
      resolve(result);
    }, 500))`);
    assert.deepStrictEqual(blockedSuspendResult, { sent: [], owner: 'application', mode: 'hermes-tui' }, 'Ctrl+Z from a PassiDeck client must not suspend its managed Hermes TUI');
    const injectedSuspend = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      entry.ws.send(JSON.stringify({ type: 'input', data: '\\x1a' }));
      return true;
    })()`);
    assert.strictEqual(injectedSuspend, true);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.deepStrictEqual(
      await evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(manual.id)}); return { owner: entry.terminalOwner, mode: entry.terminalMode }; })()`),
      { owner: 'application', mode: 'hermes-tui' },
      'the server boundary must also reject an injected Ctrl+Z while Hermes TUI owns the PTY'
    );

    manualSession.pty.write('\x1a');
    const stoppedTuiOwner = await waitFor(() => evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      return entry?.terminalOwner === 'viewport' && entry.terminalMode === 'viewport'
        ? { protocol: entry.term._core.coreMouseService.activeProtocol, type: entry.term.buffer.active.type }
        : null;
    })()`), 'stopped TUI owner return');
    assert.deepStrictEqual(stoppedTuiOwner, { protocol: 'NONE', type: 'normal' }, 'stopping Hermes TUI in a normal xterm buffer must disable mouse tracking before the shell receives pointer input');
    const stoppedTuiMouse = await evaluate(cdp, sid, `(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const leaked = [];
      const disposable = entry.term.onData(data => leaked.push(data));
      const rect = entry.el.querySelector('.xterm-screen').getBoundingClientRect();
      window.__stoppedTuiMouse = { leaked, disposable };
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, beforeBaseY: entry.term.buffer.active.baseY, beforeViewportY: entry.term.buffer.active.viewportY };
    })()`);
    for (let step = 0; step < 12; step += 1) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: stoppedTuiMouse.x + step, y: stoppedTuiMouse.y + step }, sid);
    }
    const stoppedTuiMouseResult = await evaluate(cdp, sid, `new Promise(resolve => setTimeout(() => {
      const entry = state.sessions.get(${JSON.stringify(manual.id)});
      const result = {
        leaked: window.__stoppedTuiMouse.leaked,
        afterBaseY: entry.term.buffer.active.baseY,
        afterViewportY: entry.term.buffer.active.viewportY
      };
      window.__stoppedTuiMouse.disposable.dispose();
      delete window.__stoppedTuiMouse;
      resolve(result);
    }, 250))`);
    assert.deepStrictEqual(stoppedTuiMouseResult, {
      leaked: [],
      afterBaseY: stoppedTuiMouse.beforeBaseY,
      afterViewportY: stoppedTuiMouse.beforeViewportY
    }, 'moving the mouse after a stopped TUI must neither emit SGR packets nor push the visible terminal upward');

    manualSession.pty.write('fg\r');
    await waitFor(() => evaluate(cdp, sid, `(() => { const entry = state.sessions.get(${JSON.stringify(manual.id)}); return entry?.terminalOwner === 'application' && entry.terminalMode === 'hermes-tui'; })()`), 'TUI owner return after foreground resume', 15000);
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
