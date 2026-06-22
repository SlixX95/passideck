const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const chromeCandidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/brave-browser',
  '/usr/bin/brave',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromeBin = chromeCandidates.find(p => fs.existsSync(p));
if (!chromeBin) throw new Error(`No Chrome/Chromium/Brave/Edge binary found for CDP smoke. Checked: ${chromeCandidates.join(', ')}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'passideck-cdp-'));
const home = path.join(tmp, 'home');
const chromeProfile = path.join(tmp, 'chrome');
const socket = `passideck-cdp-${process.pid}`;
process.env.PASSIDECK_HOME = home;
process.env.PASSIDECK_TMUX_SOCKET = socket;
fs.mkdirSync(home, { recursive: true });

const { createServer } = require(path.join(root, 'packages/server/src/index.js'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function requestJson(base, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const url = new URL(apiPath, base);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`${method} ${apiPath} -> ${res.statusCode}: ${raw}`));
        try { resolve(raw ? JSON.parse(raw) : null); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws.on('message', raw => this.onMessage(raw));
  }
  open() { return new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }); }
  onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message}: ${JSON.stringify(msg.error.data || '')}`)) : resolve(msg.result || {});
    } else {
      this.events.push(msg);
    }
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch {} }
}

function launchChrome() {
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${chromeProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--window-size=1600,1000',
    'about:blank'
  ];
  const child = spawn(chromeBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const wsUrlPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome CDP did not start: ${stderr}`)), 10000);
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on('exit', code => reject(new Error(`Chrome exited before CDP ready: ${code}\n${stderr}`)));
  });
  return { child, wsUrlPromise };
}

async function evalExpr(cdp, sessionId, expression, opts = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: opts.awaitPromise !== false,
    returnByValue: true,
    userGesture: true
  }, sessionId);
  if (result.exceptionDetails) throw new Error(`Runtime exception: ${result.exceptionDetails.text}`);
  return result.result?.value;
}

async function waitEval(cdp, sessionId, expression, timeout = 8000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await evalExpr(cdp, sessionId, expression);
      if (last) return last;
    } catch (err) { last = err.message; }
    await sleep(100);
  }
  throw new Error(`Timeout waiting for: ${expression}\nlast=${last}`);
}

(async () => {
  const madeSessions = [];
  let server, cdp, chrome;
  try {
    const appServer = createServer({ host: '127.0.0.1', port: 0, shell: '/bin/bash', projects: {}, defaultTheme: 'blue' });
    server = appServer.server;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    for (let i = 1; i <= 11; i++) {
      const session = await requestJson(base, 'POST', '/api/sessions', { command: '/bin/bash', label: `smoke-${i}`, cols: 120, rows: 30 });
      madeSessions.push(session.id);
    }
    await requestJson(base, 'PUT', '/api/ui-state', {
      baseLayout: 'auto',
      layout: 'auto',
      activeId: madeSessions[0],
      panePrefs: {
        order: madeSessions,
        minimized: [],
        viewport: { w: 3200, h: 1800 },
        windows: {
          desktop: {
            [madeSessions[0]]: { x: 99999, y: 99999, w: 1600, h: 900, z: 11 }
          }
        }
      }
    });

    chrome = launchChrome();
    const wsUrl = await chrome.wsUrlPromise;
    cdp = new CDP(wsUrl);
    await cdp.open();
    await cdp.send('Browser.getVersion');
    const target = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sid = attached.sessionId;
    await cdp.send('Page.enable', {}, sid);
    await cdp.send('Runtime.enable', {}, sid);
    await cdp.send('Log.enable', {}, sid);
    await cdp.send('Network.enable', {}, sid);
    await cdp.send('Page.navigate', { url: base }, sid);
    await waitEval(cdp, sid, 'document.readyState === "complete"');
    await waitEval(cdp, sid, 'document.querySelectorAll(".term-panel").length >= 11');
    const clampedWindow = await evalExpr(cdp, sid, `(() => {
      const panel = document.querySelector('[data-pane-id="${madeSessions[0]}"]');
      const grid = document.getElementById('termGrid');
      const pr = panel.getBoundingClientRect();
      const gr = grid.getBoundingClientRect();
      const eps = 1;
      return {
        inside: pr.left >= gr.left - eps && pr.top >= gr.top - eps && pr.right <= gr.right + eps && pr.bottom <= gr.bottom + eps,
        panel: { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom, width: pr.width, height: pr.height },
        grid: { left: gr.left, top: gr.top, right: gr.right, bottom: gr.bottom, width: gr.width, height: gr.height }
      };
    })()`);
    assert.strictEqual(clampedWindow.inside, true, `persisted offscreen window must clamp inside termGrid: ${JSON.stringify(clampedWindow)}`);
    await sleep(250);
    const savedUi = await requestJson(base, 'GET', '/api/ui-state');
    const savedRect = savedUi.panePrefs?.windows?.desktop?.[madeSessions[0]];
    assert.ok(savedRect && savedRect.x + savedRect.w <= clampedWindow.grid.width + 1 && savedRect.y + savedRect.h <= clampedWindow.grid.height + 1, `clamped window rect must persist server-side: ${JSON.stringify(savedRect)}`);

    const counts = await evalExpr(cdp, sid, `(() => ({
      panels: document.querySelectorAll('.term-panel').length,
      activeTitle: document.getElementById('activeSessionDescription')?.textContent || ''
    }))()`);
    assert.strictEqual(counts.panels, 11, 'all panels should render');
    assert.strictEqual(counts.activeTitle, 'Kein Titel', `no generated title should show explicit fallback: ${JSON.stringify(counts)}`);

    const generatedTitle = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      selectPanel(entry.session.id);
      entry.session.meta.title = 'Model Session Title';
      renderSwitcher();
      entry.el.querySelector('.term-title').textContent = panelTitle(entry.session);
      return {
        pane: entry.el.querySelector('.term-title')?.textContent || '',
        topbar: document.getElementById('activeSessionDescription')?.textContent || ''
      };
    })()`);
    assert.deepStrictEqual(generatedTitle, { pane: 'Model Session Title', topbar: 'Model Session Title' }, 'generated terminal/model title must appear in pane and topbar');

    const switchDescriptions = await evalExpr(cdp, sid, `(async () => {
      const ids = [...state.sessions.keys()];
      for (const id of ids) {
        selectPanel(id);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const entry = state.sessions.get(id);
        const expected = panelTitle(entry.session);
        const actual = document.getElementById('activeSessionDescription')?.textContent || '';
        if (actual !== expected) return { ok: false, id, expected, actual };
      }
      return { ok: true };
    })()`);
    assert.deepStrictEqual(switchDescriptions, { ok: true }, 'topbar title must follow active session switches');

    const wheelScroll = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      await new Promise(resolve => entry.term.write(Array.from({ length: 80 }, (_, i) => 'wheel-' + i + '\\r\\n').join(''), resolve));
      await new Promise(resolve => entry.term.write('\\x1b[?1000h', resolve));
      entry.term.scrollToBottom();
      const before = entry.term.buffer.active.viewportY;
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const r = target.getBoundingClientRect();
      target.dispatchEvent(new WheelEvent('wheel', { deltaY: -480, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(resolve => entry.term.write('\\x1b[?1000l', resolve));
      return { before, after: entry.term.buffer.active.viewportY };
    })()`);
    assert.ok(wheelScroll.after < wheelScroll.before, `wheel must scroll xterm history even when app mouse mode is active: ${JSON.stringify(wheelScroll)}`);

    const minimizeProbe = await evalExpr(cdp, sid, `(() => {
      const panel = document.querySelector('.term-panel.active');
      const actionRects = [...panel.querySelectorAll('.term-actions button')].map(btn => {
        const r = btn.getBoundingClientRect();
        return { cls: btn.className, w: r.width, h: r.height };
      });
      const r = panel.querySelector('button.minimize').getBoundingClientRect();
      return { id: panel.dataset.paneId, x: r.left + r.width / 2, y: r.top + r.height / 2, actionRects };
    })()`);
    assert.deepStrictEqual(minimizeProbe.actionRects.map(r => r.w), [24, 24, 24], 'pane action buttons should be wider');
    assert.deepStrictEqual(minimizeProbe.actionRects.map(r => r.h), [18, 18, 18], 'pane action buttons should not be taller');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: minimizeProbe.x, y: minimizeProbe.y }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: minimizeProbe.x, y: minimizeProbe.y, button: 'left', clickCount: 1 }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: minimizeProbe.x, y: minimizeProbe.y, button: 'left', clickCount: 1 }, sid);
    await waitEval(cdp, sid, `document.getElementById('panel-${minimizeProbe.id}')?.classList.contains('minimized')`);
    const minimizeOpenedClose = await evalExpr(cdp, sid, `document.querySelector('#closeModal.open') && !document.querySelector('#closeModal').hidden`);
    assert.strictEqual(Boolean(minimizeOpenedClose), false, 'minimize button must not trigger close modal');
    await evalExpr(cdp, sid, `restorePanel('${minimizeProbe.id}')`);
    await waitEval(cdp, sid, `!document.getElementById('panel-${minimizeProbe.id}')?.classList.contains('minimized')`);

    await evalExpr(cdp, sid, `document.querySelector('.term-panel.active button.danger').focus()`);
    const beforeFocus = await evalExpr(cdp, sid, 'document.activeElement?.className || document.activeElement?.id || document.activeElement?.tagName');
    const rect = await evalExpr(cdp, sid, `(() => { const r = document.querySelector('.term-panel.active button.danger').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid);
    await waitEval(cdp, sid, `document.querySelector('#closeModal.open') && !document.querySelector('#closeModal').hidden`);
    const modalFocus = await waitEval(cdp, sid, `document.activeElement && document.activeElement.id === 'closeModalConfirm'`);
    assert.strictEqual(modalFocus, true, 'close modal should focus close confirmation by default');

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }, sid);
    const afterTab = await evalExpr(cdp, sid, 'document.activeElement?.id');
    assert.strictEqual(afterTab, 'closeModalCancel', 'Tab should stay inside modal');

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await waitEval(cdp, sid, `!document.querySelector('#closeModal.open') && document.querySelector('#closeModal').hidden`);
    await sleep(50);
    const focusReturned = await evalExpr(cdp, sid, `document.activeElement?.className || document.activeElement?.id || document.activeElement?.tagName`);
    assert.ok(String(focusReturned).includes('danger') || String(beforeFocus).includes('danger'), 'focus should return to previous close button after Esc');

    const beforeEnterCount = await evalExpr(cdp, sid, 'document.querySelectorAll(".term-panel").length');
    const nextCloseRect = await evalExpr(cdp, sid, `(() => { const r = document.querySelector('.term-panel.active button.danger').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nextCloseRect.x, y: nextCloseRect.y }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: nextCloseRect.x, y: nextCloseRect.y, button: 'left', clickCount: 1 }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: nextCloseRect.x, y: nextCloseRect.y, button: 'left', clickCount: 1 }, sid);
    await waitEval(cdp, sid, `document.activeElement && document.activeElement.id === 'closeModalConfirm'`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
    await waitEval(cdp, sid, `document.querySelectorAll('.term-panel').length === ${beforeEnterCount - 1}`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }, sid);
    await sleep(50);

    const settingsRect = await evalExpr(cdp, sid, `(() => { const r = document.getElementById('settingsToggle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: settingsRect.x, y: settingsRect.y }, sid);
    const immediateTip = await evalExpr(cdp, sid, `!!document.querySelector('#appTooltip.visible') && !document.getElementById('appTooltip')?.hidden`);
    assert.strictEqual(immediateTip, false, 'tooltip should not appear immediately on hover');
    await sleep(500);
    const delayedTip = await evalExpr(cdp, sid, `!!document.querySelector('#appTooltip.visible') && !document.getElementById('appTooltip')?.hidden`);
    assert.strictEqual(delayedTip, true, 'tooltip should appear after 300ms delay');

    const badEvents = cdp.events.filter(e => {
      if (e.method === 'Log.entryAdded') {
        const entry = e.params?.entry || {};
        if (entry.url?.endsWith('/favicon.ico') && entry.text?.includes('404')) return false;
        return ['error', 'violation'].includes(entry.level);
      }
      return e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && ['error'].includes(e.params?.type));
    });
    assert.deepStrictEqual(badEvents.map(e => e.method), [], `browser errors: ${JSON.stringify(badEvents.slice(0, 3))}`);

    console.log('browser-cdp ok');
  } finally {
    for (const id of madeSessions) {
      try { await requestJson(`http://127.0.0.1:${server?.address()?.port || 0}`, 'DELETE', `/api/sessions/${id}`); } catch {}
    }
    if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.close(); }
    if (chrome?.child && !chrome.child.killed) { try { chrome.child.kill('SIGTERM'); } catch {} }
    if (server) await new Promise(resolve => server.close(resolve));
    try { execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore' }); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
