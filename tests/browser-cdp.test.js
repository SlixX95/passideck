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
  if (result.exceptionDetails) throw new Error(`Runtime exception: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)}`);
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
  let appServer, server, cdp, chrome;
  try {
    appServer = createServer({ host: '127.0.0.1', port: 0, shell: '/bin/bash' });
    server = appServer.server;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    for (let i = 1; i <= 11; i++) {
      const session = await requestJson(base, 'POST', '/api/sessions', { command: '/bin/bash', label: `smoke-${i}`, cols: 120, rows: 30 });
      madeSessions.push(session.id);
    }
    const firstTmux = `passideck_${madeSessions[0].replace(/[^a-zA-Z0-9_]/g, '')}`;
    const firstPanePid = execFileSync('tmux', ['-L', socket, 'list-panes', '-t', firstTmux, '-F', '#{pane_pid}'], { encoding: 'utf8' }).trim();
    const firstPaneEnv = fs.readFileSync(`/proc/${firstPanePid}/environ`, 'utf8').split('\0');
    assert.ok(firstPaneEnv.includes(`HERMES_SESSION_SOURCE=passideck:${madeSessions[0]}`), 'tmux pane must tag Hermes sessions with its stable PassiDeck id');
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
            [madeSessions[0]]: { x: 99999, y: 99999, w: 1600, h: 900, z: 11 },
            [madeSessions[1]]: { x: 60, y: 60, w: 1200, h: 700, z: 12 }
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
    const compactLaunchStrip = await evalExpr(cdp, sid, `(() => {
      const strip = document.querySelector('.command-strip').getBoundingClientRect();
      const first = document.querySelector('.topbar-ql-btn').getBoundingClientRect();
      return { statusChip: Boolean(document.querySelector('.status-chip')), leftGap: first.left - strip.left };
    })()`);
    assert.deepStrictEqual(compactLaunchStrip, { statusChip: false, leftGap: 6 }, 'quick-launch buttons must occupy the left edge after removing the window/save status chip');
    const chromeToggleResize = await evalExpr(cdp, sid, `(async () => {
      const id = '${madeSessions[0]}';
      const prefs = windowPrefs();
      const previous = structuredClone(prefs[id]);
      const wasHidden = document.body.classList.contains('chrome-hidden');
      if (wasHidden) setChromeHidden(false, { persist: false });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const before = document.getElementById('termGrid').getBoundingClientRect();
      prefs[id] = { x: 0, y: 0, w: before.width, h: before.height, z: previous.z || 1 };
      applyFreeWindow(id);
      setChromeHidden(true, { persist: false });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const panel = state.sessions.get(id).el.getBoundingClientRect();
      setChromeHidden(wasHidden, { persist: false });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      prefs[id] = previous;
      applyFreeWindow(id);
      return { gridGrowth: grid.height - before.height, bottomGap: grid.bottom - panel.bottom };
    })()`);
    assert.ok(chromeToggleResize.gridGrowth > 20 && Math.abs(chromeToggleResize.bottomGap) < 2, `UI toggle must resize desktop windows into the gained space: ${JSON.stringify(chromeToggleResize)}`);
    const dynamicLayoutProposals = await evalExpr(cdp, sid, `(() => {
      const beforeMinimized = state.minimized;
      const proposalsFor = count => {
        state.minimized = new Set(state.order.slice(count));
        return layoutProposals(state.order[0]).map(({ key, label, ids, rects }) => ({ key, label, count: ids.length, rects }));
      };
      const result = { one: proposalsFor(1), two: proposalsFor(2), three: proposalsFor(3) };
      state.minimized = beforeMinimized;
      return result;
    })()`);
    assert.deepStrictEqual(dynamicLayoutProposals.one.map(p => p.label), ['Full'], 'one visible window needs one non-duplicate full-screen layout');
    assert.deepStrictEqual(dynamicLayoutProposals.two.map(p => p.label), ['Side by side', 'Stacked'], 'two visible windows need only the two distinct splits');
    assert.deepStrictEqual(dynamicLayoutProposals.three.map(p => p.label), ['Grid', 'Columns', 'Rows', 'Left + rest', 'Right + rest', 'Top + rest', 'Bottom + rest'], 'three or more visible windows need all adaptive focus directions');
    assert.ok(dynamicLayoutProposals.one.every(p => p.count === 1) && dynamicLayoutProposals.two.every(p => p.count === 2) && dynamicLayoutProposals.three.every(p => p.count === 3), 'layout proposals must exclude minimized windows');
    const stableGridOrder = await evalExpr(cdp, sid, `(() => {
      const ids = state.order.slice(0, 4);
      const previousMinimized = state.minimized;
      const previousWindows = structuredClone(state.panePrefs.windows);
      state.minimized = new Set(state.order.slice(4));
      const prefs = windowPrefs();
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const w = grid.width / 2;
      const h = grid.height / 2;
      prefs[ids[0]] = { x: 0, y: h, w, h, z: 1 };
      prefs[ids[1]] = { x: w, y: 0, w, h, z: 2 };
      prefs[ids[2]] = { x: w, y: h, w, h, z: 3 };
      prefs[ids[3]] = { x: 0, y: 0, w, h, z: 4 };
      const proposal = layoutProposals(ids[0]).find(item => item.key === 'grid');
      const focused = layoutProposals(ids[0]).find(item => item.key === 'focus-left');
      state.minimized = previousMinimized;
      state.panePrefs.windows = previousWindows;
      return { actual: proposal.ids, expected: [ids[3], ids[1], ids[0], ids[2]], focused: focused.ids[0], clicked: ids[0] };
    })()`);
    assert.deepStrictEqual(stableGridOrder.actual, stableGridOrder.expected, 'grid layout must preserve visual window positions instead of promoting the clicked window');
    assert.strictEqual(stableGridOrder.focused, stableGridOrder.clicked, 'focus layouts must still prioritize the explicitly selected window');
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
    assert.ok(savedRect && savedRect.x > clampedWindow.grid.width && savedRect.y > clampedWindow.grid.height && savedRect.w === 1600 && savedRect.h === 900, `local viewport clamp must not rewrite authoritative server geometry: ${JSON.stringify(savedRect)}`);

    const sixSlotAutoPlacement = await evalExpr(cdp, sid, `(() => {
      const ids = state.order.slice(0, 6);
      const prefs = windowPrefs();
      const before = structuredClone(prefs);
      const beforeMinimized = new Set(state.minimized);
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const cell = { w: grid.width / 3, h: grid.height / 2 };
      const occupied = [
        [0, 0], [1, 0], [2, 0],
        [0, 1], [1, 1]
      ];
      state.minimized = new Set(state.order.slice(5));
      occupied.forEach(([col, row], index) => {
        prefs[ids[index]] = { x: col * cell.w, y: row * cell.h, w: cell.w, h: cell.h, z: 20 + index };
      });
      const free = freeSpaceWindowRect(ids[5]);
      state.minimized = new Set(state.order);
      const emptyDesktop = freeSpaceWindowRect();
      const expectedEmpty = desktopCandidates()[0];
      state.panePrefs.windows.desktop = before;
      state.minimized = beforeMinimized;
      return { free, expected: { x: cell.w * 2, y: cell.h, w: cell.w, h: cell.h }, emptyDesktop, expectedEmpty };
    })()`);
    assert.ok(sixSlotAutoPlacement.free, `new window must find the open bottom-right cell in a 3x2 desktop: ${JSON.stringify(sixSlotAutoPlacement)}`);
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(sixSlotAutoPlacement.free[key] - sixSlotAutoPlacement.expected[key]) < 2, `3x2 auto-placement ${key} mismatch: ${JSON.stringify(sixSlotAutoPlacement)}`);
      assert.ok(Math.abs(sixSlotAutoPlacement.emptyDesktop[key] - sixSlotAutoPlacement.expectedEmpty[key]) < 2, `first-window placement ${key} must keep existing default: ${JSON.stringify(sixSlotAutoPlacement)}`);
    }

    const viewportClampPersistence = await evalExpr(cdp, sid, `(async () => {
      const id = '${madeSessions[1]}';
      const prefs = windowPrefs();
      const before = structuredClone(prefs[id]);
      const wasHydrating = state.hydrating;
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      prefs[id] = { x: grid.width - 100, y: grid.height - 80, w: grid.width + 200, h: grid.height + 120, z: 40 };
      state.hydrating = false;
      applyFreeWindow(id);
      await new Promise(resolve => setTimeout(resolve, 80));
      const stored = structuredClone(prefs[id]);
      const panel = state.sessions.get(id).el.getBoundingClientRect();
      state.hydrating = true;
      prefs[id] = before;
      applyFreeWindow(id);
      state.hydrating = wasHydrating;
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      return {
        stored,
        requested: { w: grid.width + 200, h: grid.height + 120 },
        renderedInside: panel.width <= grid.width + 1 && panel.height <= grid.height + 1
      };
    })()`);
    assert.strictEqual(viewportClampPersistence.renderedInside, true, `oversized window must render inside viewport: ${JSON.stringify(viewportClampPersistence)}`);
    assert.deepStrictEqual(
      { w: viewportClampPersistence.stored.w, h: viewportClampPersistence.stored.h },
      viewportClampPersistence.requested,
      `temporary viewport clamp must not overwrite authoritative window size: ${JSON.stringify(viewportClampPersistence)}`
    );

    await evalExpr(cdp, sid, `(() => {
      const p = windowPrefs()['${madeSessions[0]}'];
      Object.assign(p, { x: 111, y: 112, w: 777, h: 444, z: 90 });
      applyFreeWindow('${madeSessions[0]}');
      savePanePrefs();
    })()`);
    await waitEval(cdp, sid, `state.saveTimer === null`);

    const peerTarget = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const peerAttached = await cdp.send('Target.attachToTarget', { targetId: peerTarget.targetId, flatten: true });
    const peerSid = peerAttached.sessionId;
    await cdp.send('Page.enable', {}, peerSid);
    await cdp.send('Runtime.enable', {}, peerSid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, peerSid);
    await cdp.send('Page.navigate', { url: base }, peerSid);
    await waitEval(cdp, peerSid, 'document.readyState === "complete" && document.querySelectorAll(".term-panel").length >= 11');
    await waitEval(cdp, sid, `!state.hydrating && state.saveTimer == null`);
    await waitEval(cdp, peerSid, `!state.hydrating && state.saveTimer == null`);
    const afterDesktopPeerInit = await requestJson(base, 'GET', '/api/ui-state');
    const desktopPeerRect = afterDesktopPeerInit.panePrefs?.windows?.desktop?.[madeSessions[0]];
    assert.deepStrictEqual(
      desktopPeerRect && { x: desktopPeerRect.x, y: desktopPeerRect.y, w: desktopPeerRect.w, h: desktopPeerRect.h },
      { x: 111, y: 112, w: 777, h: 444 },
      'opening a differently sized desktop peer must not rescale shared window geometry'
    );
    await waitEval(cdp, peerSid, `(() => {
      const p = windowPrefs()['${madeSessions[0]}'];
      return p?.x === 111 && p?.y === 112 && p?.w === 777 && p?.h === 444;
    })()`, 4000);
    await waitEval(cdp, peerSid, `(() => [...state.sessions.values()].every(entry => entry.el.dataset.connectionStatus === 'live'))()`, 4000);
    const peerLive = await evalExpr(cdp, peerSid, `(() => ({
      rect: { ...windowPrefs()['${madeSessions[0]}'] },
      live: [...state.sessions.values()].every(entry => entry.el.dataset.connectionStatus === 'live')
    }))()`);
    assert.deepStrictEqual({ x: peerLive.rect.x, y: peerLive.rect.y, w: peerLive.rect.w, h: peerLive.rect.h }, { x: 111, y: 112, w: 777, h: 444 }, 'second browser must apply live authoritative window geometry');
    assert.strictEqual(peerLive.live, true, 'opening a second browser must not disconnect terminal sessions');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, peerSid);
    await waitEval(cdp, peerSid, 'innerWidth === 390');
    await evalExpr(cdp, peerSid, `(() => { responsiveMinimizeForViewport(); applyLayoutVisibility(); savePanePrefs(); })()`);
    await sleep(300);
    const afterMobile = await requestJson(base, 'GET', '/api/ui-state');
    const mobileRect = afterMobile.panePrefs?.windows?.desktop?.[madeSessions[0]];
    assert.deepStrictEqual(
      mobileRect && { x: mobileRect.x, y: mobileRect.y, w: mobileRect.w, h: mobileRect.h },
      { x: 111, y: 112, w: 777, h: 444 },
      `mobile browser must never overwrite authoritative desktop geometry: ${JSON.stringify(afterMobile.panePrefs)}`
    );
    await evalExpr(cdp, peerSid, `(() => {
      Object.assign(windowPrefs()['${madeSessions[0]}'], { x: 9, y: 8, w: 333, h: 222 });
    })()`);
    await cdp.send('Page.navigate', { url: `${base}/?peer-reload=1` }, peerSid);
    await waitEval(cdp, peerSid, 'location.search === "?peer-reload=1" && document.readyState === "complete" && typeof windowPrefs === "function" && document.querySelectorAll(".term-panel").length >= 11');
    await sleep(300);
    const afterPeerReload = await requestJson(base, 'GET', '/api/ui-state');
    const reloadRect = afterPeerReload.panePrefs?.windows?.desktop?.[madeSessions[0]];
    assert.deepStrictEqual(
      reloadRect && { x: reloadRect.x, y: reloadRect.y, w: reloadRect.w, h: reloadRect.h },
      { x: 111, y: 112, w: 777, h: 444 },
      'reloading one client must not publish its unsaved local pane geometry'
    );
    const reloadedPeer = await evalExpr(cdp, peerSid, `(() => ({ ...windowPrefs()['${madeSessions[0]}'] }))()`);
    assert.deepStrictEqual({ x: reloadedPeer.x, y: reloadedPeer.y, w: reloadedPeer.w, h: reloadedPeer.h }, { x: 111, y: 112, w: 777, h: 444 }, 'reload must reconstruct latest server-confirmed geometry');
    await cdp.send('Target.closeTarget', { targetId: peerTarget.targetId });

    const titleDragProbe = await evalExpr(cdp, sid, `(() => {
      document.activeElement?.blur?.();
      const id = '${madeSessions[1]}';
      const title = document.querySelector('[data-pane-id="${madeSessions[1]}"] .term-title');
      const panel = title.closest('.term-panel');
      Object.assign(windowPrefs()[id], { x: 70, y: 60, w: 1100, h: 650, z: 30 });
      applyFreeWindow(id);
      const tr = title.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      return { x: Math.round(tr.left + Math.min(20, tr.width / 2)), y: Math.round(tr.top + tr.height / 2), before: { left: pr.left, top: pr.top, width: pr.width, height: pr.height } };
    })()`);
    const titleDragAfter = await evalExpr(cdp, sid, `(() => {
      const title = document.querySelector('[data-pane-id="${madeSessions[1]}"] .term-title');
      const panel = title.closest('.term-panel');
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: ${titleDragProbe.x}, clientY: ${titleDragProbe.y}, pointerId: 7, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: ${titleDragProbe.x + 90}, clientY: ${titleDragProbe.y + 45} });
      const duringRect = panel.getBoundingClientRect();
      const during = { left: duringRect.left, top: duringRect.top, width: duringRect.width, height: duringRect.height };
      const dragging = Boolean(state.pointerDrag);
      const classes = panel.className;
      endPointerDrag({ preventDefault(){} });
      const restoredRect = panel.getBoundingClientRect();
      return {
        during,
        restored: { left: restoredRect.left, top: restoredRect.top, width: restoredRect.width, height: restoredRect.height },
        dragging,
        classes,
        editing: title.dataset.editing || '',
        target: document.elementFromPoint(${titleDragProbe.x}, ${titleDragProbe.y})?.className || ''
      };
    })()`);
    assert.ok(titleDragAfter.during.left > titleDragProbe.before.left + 40 && titleDragAfter.during.top > titleDragProbe.before.top + 20, `window title drag must move pane: ${JSON.stringify({ before: titleDragProbe.before, after: titleDragAfter })}`);
    assert.ok(titleDragAfter.during.width < titleDragProbe.before.width - 100 && titleDragAfter.during.height < titleDragProbe.before.height - 50, `large window must shrink to default size while dragging: ${JSON.stringify({ before: titleDragProbe.before, after: titleDragAfter })}`);
    assert.ok(Math.abs(titleDragAfter.restored.width - titleDragProbe.before.width) < 2 && Math.abs(titleDragAfter.restored.height - titleDragProbe.before.height) < 2, `free drop must restore the pre-drag size: ${JSON.stringify({ before: titleDragProbe.before, after: titleDragAfter })}`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 120 }, sid);
    const twoWindowFreeDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const target = '${madeSessions[2]}';
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      state.sessions.forEach((entry, id) => {
        if (id === source || id === target) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: 0, y: 0, w: grid.width / 2, h: grid.height, z: 30 });
      Object.assign(prefs[target], { x: grid.width / 2, y: 0, w: grid.width / 2, h: grid.height, z: 29 });
      applyFreeWindow(source);
      applyFreeWindow(target);
      const center = chooseDesktopSlotAt(grid.left + grid.width / 4, grid.top + grid.height / 2, source);
      const bottom = chooseDesktopSlotAt(grid.left + grid.width / 4, grid.top + grid.height * 0.75, source);
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 27, pointerType: 'mouse' }));
      const top = chooseDesktopSlotAt(grid.left + grid.width / 4, grid.top + grid.height / 4, source);
      updatePointerDrag({ preventDefault(){}, clientX: grid.left + grid.width / 4, clientY: grid.top + grid.height / 2 });
      const centerLabels = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => el.textContent);
      updatePointerDrag({ preventDefault(){}, clientX: grid.left + grid.width / 4, clientY: grid.top + grid.height / 4 });
      const quarterLabels = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => el.textContent);
      updatePointerDrag({ preventDefault(){}, clientX: grid.left + grid.width / 4, clientY: grid.top + grid.height / 2 });
      endPointerDrag({ preventDefault(){} });
      const docked = { ...prefs[source] };
      const free = slotRectsForDrag(source).free.map(slot => slot.rect);
      const freeOverlap = free.length === 2 ? rectOverlap(free[0], free[1]) : null;
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { grid: { w: grid.width, h: grid.height }, top: { type: top.type, rect: top.rect }, center: { type: center.type, rect: center.rect }, bottom: { type: bottom.type, rect: bottom.rect }, centerLabels, quarterLabels, docked, free, freeOverlap };
    })()`);
    assert.deepStrictEqual(
      { x: twoWindowFreeDock.top.rect.x, y: twoWindowFreeDock.top.rect.y, w: twoWindowFreeDock.top.rect.w, h: twoWindowFreeDock.top.rect.h },
      { x: 0, y: 0, w: twoWindowFreeDock.grid.w / 2, h: twoWindowFreeDock.grid.h / 2 },
      `upper Free choice must select the upper quarter, not the overlapping half: ${JSON.stringify(twoWindowFreeDock)}`
    );
    assert.deepStrictEqual(
      { x: twoWindowFreeDock.center.rect.x, y: twoWindowFreeDock.center.rect.y, w: twoWindowFreeDock.center.rect.w, h: twoWindowFreeDock.center.rect.h },
      { x: 0, y: 0, w: twoWindowFreeDock.grid.w / 2, h: twoWindowFreeDock.grid.h },
      `center-left Free choice must select the whole left half: ${JSON.stringify(twoWindowFreeDock)}`
    );
    assert.ok(twoWindowFreeDock.centerLabels.includes('Free · 1/2'), `half overlay must identify itself: ${JSON.stringify(twoWindowFreeDock.centerLabels)}`);
    assert.ok(twoWindowFreeDock.quarterLabels.includes('Free · 1/4'), `quarter overlay must identify itself: ${JSON.stringify(twoWindowFreeDock.quarterLabels)}`);
    assert.deepStrictEqual(
      { x: twoWindowFreeDock.bottom.rect.x, y: twoWindowFreeDock.bottom.rect.y, w: twoWindowFreeDock.bottom.rect.w, h: twoWindowFreeDock.bottom.rect.h },
      { x: 0, y: twoWindowFreeDock.grid.h / 2, w: twoWindowFreeDock.grid.w / 2, h: twoWindowFreeDock.grid.h / 2 },
      `lower Free choice must select the lower quarter, not the overlapping half: ${JSON.stringify(twoWindowFreeDock)}`
    );
    assert.deepStrictEqual(
      { x: twoWindowFreeDock.docked.x, y: twoWindowFreeDock.docked.y, w: twoWindowFreeDock.docked.w, h: twoWindowFreeDock.docked.h },
      { x: 0, y: 0, w: twoWindowFreeDock.grid.w / 2, h: twoWindowFreeDock.grid.h },
      `Free drop must dock to the selected slot geometry: ${JSON.stringify(twoWindowFreeDock)}`
    );
    assert.strictEqual(twoWindowFreeDock.free.length, 2, `two-window Free overlay must expose one unambiguous grid, not overlapping half/quarter/third layouts: ${JSON.stringify(twoWindowFreeDock.free)}`);
    assert.strictEqual(twoWindowFreeDock.freeOverlap, 0, `Free targets must never overlap: ${JSON.stringify(twoWindowFreeDock.free)}`);
    const horizontalHalfDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      state.sessions.forEach((entry, id) => {
        if (id === source) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: grid.width / 2, y: grid.height / 2, w: grid.width / 2, h: grid.height / 2, z: 30 });
      applyFreeWindow(source);
      const top = chooseDesktopSlotAt(grid.left + grid.width / 2, grid.top + grid.height / 4, source);
      const bottom = chooseDesktopSlotAt(grid.left + grid.width / 2, grid.top + grid.height * 0.75, source);
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 28, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: grid.left + grid.width / 2, clientY: grid.top + grid.height / 4 });
      const labels = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => el.textContent);
      endPointerDrag({ preventDefault(){} });
      const docked = { ...prefs[source] };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { grid: { w: grid.width, h: grid.height }, top: top.rect, bottom: bottom.rect, labels, docked };
    })()`);
    assert.deepStrictEqual(horizontalHalfDock.top, { x: 0, y: 0, w: horizontalHalfDock.grid.w, h: horizontalHalfDock.grid.h / 2 }, `top-center must select the whole upper half: ${JSON.stringify(horizontalHalfDock)}`);
    assert.deepStrictEqual(horizontalHalfDock.bottom, { x: 0, y: horizontalHalfDock.grid.h / 2, w: horizontalHalfDock.grid.w, h: horizontalHalfDock.grid.h / 2 }, `bottom-center must select the whole lower half: ${JSON.stringify(horizontalHalfDock)}`);
    assert.ok(horizontalHalfDock.labels.includes('Free · 1/2'), `horizontal half overlay must identify itself: ${JSON.stringify(horizontalHalfDock.labels)}`);
    assert.deepStrictEqual(
      { x: horizontalHalfDock.docked.x, y: horizontalHalfDock.docked.y, w: horizontalHalfDock.docked.w, h: horizontalHalfDock.docked.h },
      horizontalHalfDock.top,
      `top-center drop must adopt the upper half geometry: ${JSON.stringify(horizontalHalfDock)}`
    );
    const dynamicFreeGapDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}', '${madeSessions[4]}', '${madeSessions[5]}', '${madeSessions[6]}', '${madeSessions[7]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const topH = Math.round(grid.height - 240);
      const gap = { x: 0, y: topH, w: grid.width, h: grid.height - topH };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: gap.x + 20, y: gap.y + 20, w: 360, h: 220, z: 40 });
      blockers.forEach((id, i) => {
        const x = Math.round(i * grid.width / blockers.length);
        const right = Math.round((i + 1) * grid.width / blockers.length);
        Object.assign(prefs[id], { x, y: 0, w: right - x, h: topH, z: 30 - i });
      });
      [source, ...blockers].forEach(applyFreeWindow);
      const px = grid.left + gap.x + gap.w / 2;
      const py = grid.top + gap.y + gap.h / 2;
      const choice = chooseDesktopSlotAt(px, py, source);
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 29, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: px, clientY: py });
      const visible = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => ({
        x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height)
      }));
      endPointerDrag({ preventDefault(){} });
      const docked = { ...prefs[source] };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { choice: { type: choice.type, rect: choice.rect || null }, gap, visible, docked };
    })()`);
    assert.deepStrictEqual(dynamicFreeGapDock.choice, { type: 'free', rect: dynamicFreeGapDock.gap }, `drag must discover the actual free gap between many windows: ${JSON.stringify(dynamicFreeGapDock)}`);
    assert.ok(dynamicFreeGapDock.visible.some(rect => JSON.stringify(rect) === JSON.stringify(dynamicFreeGapDock.gap)), `actual free gap must be visibly offered during drag: ${JSON.stringify(dynamicFreeGapDock)}`);
    assert.deepStrictEqual(
      { x: dynamicFreeGapDock.docked.x, y: dynamicFreeGapDock.docked.y, w: dynamicFreeGapDock.docked.w, h: dynamicFreeGapDock.docked.h },
      dynamicFreeGapDock.gap,
      `dropping into a dynamic free gap must adopt that exact geometry: ${JSON.stringify(dynamicFreeGapDock)}`
    );
    const splitCenterGapDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}', '${madeSessions[4]}', '${madeSessions[5]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const left = Math.round(grid.width / 3);
      const right = Math.round(grid.width * 2 / 3);
      const middle = grid.height / 2;
      const top = { x: left, y: 0, w: right - left, h: middle };
      const full = { x: left, y: 0, w: right - left, h: grid.height };
      const bottom = { x: left, y: middle, w: right - left, h: grid.height - middle };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { ...full, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: left, h: middle, z: 30 });
      Object.assign(prefs[blockers[1]], { x: 0, y: middle, w: left, h: bottom.h, z: 29 });
      Object.assign(prefs[blockers[2]], { x: right, y: 0, w: grid.width - right, h: middle, z: 28 });
      Object.assign(prefs[blockers[3]], { x: right, y: middle, w: grid.width - right, h: bottom.h, z: 27 });
      [source, ...blockers].forEach(applyFreeWindow);
      const blockersBefore = blockers.map(id => ({ x: prefs[id].x, y: prefs[id].y, w: prefs[id].w, h: prefs[id].h }));
      const px = grid.left + left + (right - left) / 2;
      const point = y => ({ x: px, y: grid.top + y });
      const choiceAt = y => {
        const choice = chooseDesktopSlotAt(point(y).x, point(y).y, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      const choices = {
        top: choiceAt(middle / 2),
        full: choiceAt(grid.height / 2),
        bottom: choiceAt(middle + bottom.h / 2)
      };
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const persistPanePrefs = savePanePrefs;
      let saveCalls = 0;
      savePanePrefs = () => { saveCalls += 1; };
      const cancelBefore = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h, z: prefs[source].z };
      let titleRect = title.getBoundingClientRect();
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 30, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: point(middle / 2).x, clientY: point(middle / 2).y });
      const saveCallsBeforeCancel = saveCalls;
      endPointerDrag({ type: 'pointercancel', preventDefault(){} });
      const cancelAfter = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h, z: prefs[source].z };
      const cancelSaveCalls = saveCalls - saveCallsBeforeCancel;
      titleRect = title.getBoundingClientRect();
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 31, pointerType: 'mouse' }));
      const visible = {};
      for (const [name, y] of [['top', middle / 2], ['full', grid.height / 2], ['bottom', middle + bottom.h / 2]]) {
        updatePointerDrag({ preventDefault(){}, clientX: point(y).x, clientY: point(y).y });
        visible[name] = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => ({
          x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height)
        }));
      }
      endPointerDrag({ preventDefault(){} });
      const docked = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h };
      const blockersAfter = blockers.map(id => ({ x: prefs[id].x, y: prefs[id].y, w: prefs[id].w, h: prefs[id].h }));
      const upper = Math.round(grid.height / 3);
      const lower = Math.round(grid.height * 2 / 3);
      const centerX = Math.round(grid.width / 2);
      const leftSlot = { x: 0, y: upper, w: centerX, h: lower - upper };
      const fullWidthSlot = { x: 0, y: upper, w: Math.round(grid.width), h: lower - upper };
      const rightSlot = { x: centerX, y: upper, w: Math.round(grid.width) - centerX, h: lower - upper };
      Object.assign(prefs[source], { ...fullWidthSlot, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: centerX, h: upper, z: 30 });
      Object.assign(prefs[blockers[1]], { x: centerX, y: 0, w: grid.width - centerX, h: upper, z: 29 });
      Object.assign(prefs[blockers[2]], { x: 0, y: lower, w: centerX, h: grid.height - lower, z: 28 });
      Object.assign(prefs[blockers[3]], { x: centerX, y: lower, w: grid.width - centerX, h: grid.height - lower, z: 27 });
      [source, ...blockers].forEach(applyFreeWindow);
      const py = grid.top + upper + (lower - upper) / 2;
      const choiceAtX = x => {
        const choice = chooseDesktopSlotAt(grid.left + x, py, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      const horizontal = {
        left: leftSlot,
        full: fullWidthSlot,
        right: rightSlot,
        choices: {
          left: choiceAtX(centerX / 2),
          full: choiceAtX(grid.width / 2),
          right: choiceAtX(centerX + rightSlot.w / 2)
        }
      };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { top, full, bottom, choices, visible, docked, blockersBefore, blockersAfter, horizontal, cancelBefore, cancelAfter, cancelSaveCalls };
    })()`);
    assert.deepStrictEqual(splitCenterGapDock.choices.top, { type: 'free', rect: splitCenterGapDock.top }, `upper center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.choices.full, { type: 'free', rect: splitCenterGapDock.full }, `full-height center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.choices.bottom, { type: 'free', rect: splitCenterGapDock.bottom }, `lower center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.visible, {
      top: [splitCenterGapDock.top],
      full: [splitCenterGapDock.full],
      bottom: [splitCenterGapDock.bottom]
    }, `split center gap must show one unambiguous option at a time: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.docked, splitCenterGapDock.bottom, `drop must use the selected lower center gap: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.blockersAfter, splitCenterGapDock.blockersBefore, `split-gap docking must not move surrounding windows: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.cancelAfter, splitCenterGapDock.cancelBefore, `pointercancel must restore the exact pre-drag geometry: ${JSON.stringify(splitCenterGapDock)}`);
    assert.strictEqual(splitCenterGapDock.cancelSaveCalls, 0, `pointercancel must not add a preview commit: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.horizontal.choices.left, { type: 'free', rect: splitCenterGapDock.horizontal.left }, `left center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.horizontal.choices.full, { type: 'free', rect: splitCenterGapDock.horizontal.full }, `full-width center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    assert.deepStrictEqual(splitCenterGapDock.horizontal.choices.right, { type: 'free', rect: splitCenterGapDock.horizontal.right }, `right center gap option must remain selectable: ${JSON.stringify(splitCenterGapDock)}`);
    const independentlySplitCenterGapDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const left = Math.round(grid.width / 3);
      const right = Math.round(grid.width * 2 / 3);
      const middle = grid.height / 2;
      const top = { x: left, y: 0, w: right - left, h: middle };
      const full = { x: left, y: 0, w: right - left, h: grid.height };
      const bottom = { x: left, y: middle, w: right - left, h: grid.height - middle };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { ...full, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: left, h: grid.height, z: 30 });
      Object.assign(prefs[blockers[1]], { x: right, y: 0, w: grid.width - right, h: grid.height, z: 29 });
      [source, ...blockers].forEach(applyFreeWindow);
      const px = grid.left + left + (right - left) / 2;
      const points = {
        top: { x: px, y: grid.top + grid.height / 4 },
        full: { x: px, y: grid.top + grid.height / 2 },
        bottom: { x: px, y: grid.top + grid.height * 3 / 4 }
      };
      const choiceAt = point => {
        const choice = chooseDesktopSlotAt(point.x, point.y, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      const choices = Object.fromEntries(Object.entries(points).map(([name, point]) => [name, choiceAt(point)]));
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 32, pointerType: 'mouse' }));
      const visible = {};
      for (const [name, point] of Object.entries(points)) {
        updatePointerDrag({ preventDefault(){}, clientX: point.x, clientY: point.y });
        visible[name] = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => ({
          x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height)
        }));
      }
      endPointerDrag({ preventDefault(){} });
      const docked = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { top, full, bottom, choices, visible, docked };
    })()`);
    assert.deepStrictEqual(independentlySplitCenterGapDock.choices.top, { type: 'free', rect: independentlySplitCenterGapDock.top }, `free columns must offer an upper half without neighboring horizontal edges: ${JSON.stringify(independentlySplitCenterGapDock)}`);
    assert.deepStrictEqual(independentlySplitCenterGapDock.choices.full, { type: 'free', rect: independentlySplitCenterGapDock.full }, `free columns must retain the full-height option: ${JSON.stringify(independentlySplitCenterGapDock)}`);
    assert.deepStrictEqual(independentlySplitCenterGapDock.choices.bottom, { type: 'free', rect: independentlySplitCenterGapDock.bottom }, `free columns must offer a lower half without neighboring horizontal edges: ${JSON.stringify(independentlySplitCenterGapDock)}`);
    assert.deepStrictEqual(independentlySplitCenterGapDock.visible, {
      top: [independentlySplitCenterGapDock.top],
      full: [independentlySplitCenterGapDock.full],
      bottom: [independentlySplitCenterGapDock.bottom]
    }, `independently split gaps must show one pointer-selected target at a time: ${JSON.stringify(independentlySplitCenterGapDock)}`);
    assert.deepStrictEqual(independentlySplitCenterGapDock.docked, independentlySplitCenterGapDock.bottom, `drop must use the selected lower split of the free column: ${JSON.stringify(independentlySplitCenterGapDock)}`);
    const independentlySplitCenterRowDock = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const top = Math.round(grid.height / 3);
      const bottom = Math.round(grid.height * 2 / 3);
      const middle = grid.width / 2;
      const left = { x: 0, y: top, w: middle, h: bottom - top };
      const full = { x: 0, y: top, w: grid.width, h: bottom - top };
      const right = { x: middle, y: top, w: grid.width - middle, h: bottom - top };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { ...full, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: grid.width, h: top, z: 30 });
      Object.assign(prefs[blockers[1]], { x: 0, y: bottom, w: grid.width, h: grid.height - bottom, z: 29 });
      [source, ...blockers].forEach(applyFreeWindow);
      const py = grid.top + top + (bottom - top) / 2;
      const points = {
        left: { x: grid.left + grid.width / 4, y: py },
        full: { x: grid.left + grid.width / 2, y: py },
        right: { x: grid.left + grid.width * 3 / 4, y: py }
      };
      const choiceAt = point => {
        const choice = chooseDesktopSlotAt(point.x, point.y, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      const choices = Object.fromEntries(Object.entries(points).map(([name, point]) => [name, choiceAt(point)]));
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 33, pointerType: 'mouse' }));
      const visible = {};
      for (const [name, point] of Object.entries(points)) {
        updatePointerDrag({ preventDefault(){}, clientX: point.x, clientY: point.y });
        visible[name] = [...document.querySelectorAll('#desktopSlotSuggestions .desktop-slot')].map(el => ({
          x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height)
        }));
      }
      endPointerDrag({ preventDefault(){} });
      const docked = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { left, full, right, choices, visible, docked };
    })()`);
    assert.deepStrictEqual(independentlySplitCenterRowDock.choices.left, { type: 'free', rect: independentlySplitCenterRowDock.left }, `free rows must offer a left half without neighboring vertical edges: ${JSON.stringify(independentlySplitCenterRowDock)}`);
    assert.deepStrictEqual(independentlySplitCenterRowDock.choices.full, { type: 'free', rect: independentlySplitCenterRowDock.full }, `free rows must retain the full-width option: ${JSON.stringify(independentlySplitCenterRowDock)}`);
    assert.deepStrictEqual(independentlySplitCenterRowDock.choices.right, { type: 'free', rect: independentlySplitCenterRowDock.right }, `free rows must offer a right half without neighboring vertical edges: ${JSON.stringify(independentlySplitCenterRowDock)}`);
    assert.deepStrictEqual(independentlySplitCenterRowDock.visible, {
      left: [independentlySplitCenterRowDock.left],
      full: [independentlySplitCenterRowDock.full],
      right: [independentlySplitCenterRowDock.right]
    }, `independently split rows must show one pointer-selected target at a time: ${JSON.stringify(independentlySplitCenterRowDock)}`);
    assert.deepStrictEqual(independentlySplitCenterRowDock.docked, independentlySplitCenterRowDock.right, `drop must use the selected right split of the free row: ${JSON.stringify(independentlySplitCenterRowDock)}`);
    const dynamicGapQuadrants = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const gap = { x: grid.width / 4, y: 0, w: grid.width / 2, h: grid.height };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { ...gap, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: gap.x, h: grid.height, z: 30 });
      Object.assign(prefs[blockers[1]], { x: gap.x + gap.w, y: 0, w: grid.width - gap.x - gap.w, h: grid.height, z: 29 });
      [source, ...blockers].forEach(applyFreeWindow);
      const point = (x, y) => ({ x: grid.left + gap.x + gap.w * x, y: grid.top + gap.y + gap.h * y });
      const choiceAt = (x, y) => {
        const choice = chooseDesktopSlotAt(point(x, y).x, point(x, y).y, source);
        return choice.rect || null;
      };
      const choices = {
        topLeft: choiceAt(1 / 6, 1 / 6),
        top: choiceAt(1 / 2, 1 / 6),
        left: choiceAt(1 / 6, 1 / 2),
        full: choiceAt(1 / 2, 1 / 2),
        bottomRight: choiceAt(5 / 6, 5 / 6)
      };
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { gap, choices };
    })()`);
    const quadrantGap = dynamicGapQuadrants.gap;
    assert.deepStrictEqual(dynamicGapQuadrants.choices.topLeft, { x: quadrantGap.x, y: quadrantGap.y, w: quadrantGap.w / 2, h: quadrantGap.h / 2 }, `large free regions must expose pointer-selected quadrants: ${JSON.stringify(dynamicGapQuadrants)}`);
    assert.deepStrictEqual(dynamicGapQuadrants.choices.top, { x: quadrantGap.x, y: quadrantGap.y, w: quadrantGap.w, h: quadrantGap.h / 2 }, `large free regions must retain edge halves between corner zones: ${JSON.stringify(dynamicGapQuadrants)}`);
    assert.deepStrictEqual(dynamicGapQuadrants.choices.left, { x: quadrantGap.x, y: quadrantGap.y, w: quadrantGap.w / 2, h: quadrantGap.h }, `large free regions must retain side halves between corner zones: ${JSON.stringify(dynamicGapQuadrants)}`);
    assert.deepStrictEqual(dynamicGapQuadrants.choices.full, quadrantGap, `large free regions must retain their full center target: ${JSON.stringify(dynamicGapQuadrants)}`);
    assert.deepStrictEqual(dynamicGapQuadrants.choices.bottomRight, { x: quadrantGap.x + quadrantGap.w / 2, y: quadrantGap.y + quadrantGap.h / 2, w: quadrantGap.w / 2, h: quadrantGap.h / 2 }, `large free regions must expose the opposite quadrant: ${JSON.stringify(dynamicGapQuadrants)}`);
    const overlappingBlockerCoverage = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const left = { x: 0, y: 0, w: grid.width / 2, h: grid.height };
      const blocker = { x: 0, y: 0, w: left.w, h: left.h * 0.08 };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: left.w, y: 0, w: left.w, h: left.h, z: 40 });
      blockers.forEach((id, i) => Object.assign(prefs[id], { ...blocker, z: 30 - i }));
      [source, ...blockers].forEach(applyFreeWindow);
      const choice = chooseDesktopSlotAt(grid.left + left.w / 2, grid.top + left.h / 2, source);
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { choice: { type: choice.type, rect: choice.rect || null }, left };
    })()`);
    assert.deepStrictEqual(overlappingBlockerCoverage.choice, { type: 'free', rect: overlappingBlockerCoverage.left }, `overlapping blockers must count their covered union only once: ${JSON.stringify(overlappingBlockerCoverage)}`);
    const edgeDragKeepsOtherWindow = await evalExpr(cdp, sid, `(() => {
      const small = '${madeSessions[1]}';
      const source = '${madeSessions[2]}';
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      state.sessions.forEach((entry, id) => {
        if (id === small || id === source) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[small], { x: 0, y: 80, w: 280, h: 240, z: 29 });
      Object.assign(prefs[source], { x: grid.width / 2, y: 0, w: grid.width / 2, h: grid.height, z: 30 });
      applyFreeWindow(small);
      applyFreeWindow(source);
      const before = { ...prefs[small] };
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 28, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: grid.left + 5, clientY: grid.top + grid.height / 2 });
      const edgeSuggestion = state.pointerDrag.activeSuggestion?.key || null;
      endPointerDrag({ preventDefault(){} });
      const after = { ...prefs[small] };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { edgeSuggestion, before, after };
    })()`);
    assert.strictEqual(edgeDragKeepsOtherWindow.edgeSuggestion, null, `edge drag must not activate an invisible snap layout: ${JSON.stringify(edgeDragKeepsOtherWindow)}`);
    assert.deepStrictEqual(
      { x: edgeDragKeepsOtherWindow.after.x, y: edgeDragKeepsOtherWindow.after.y, w: edgeDragKeepsOtherWindow.after.w, h: edgeDragKeepsOtherWindow.after.h },
      { x: edgeDragKeepsOtherWindow.before.x, y: edgeDragKeepsOtherWindow.before.y, w: edgeDragKeepsOtherWindow.before.w, h: edgeDragKeepsOtherWindow.before.h },
      `dragging another window must not move or resize the small window: ${JSON.stringify(edgeDragKeepsOtherWindow)}`
    );
    const overlapKeepsTargetWindow = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const target = '${madeSessions[2]}';
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      state.sessions.forEach((entry, id) => {
        if (id === source || id === target) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: 80, y: 70, w: 420, h: 300, z: 30 });
      Object.assign(prefs[target], { x: 760, y: 220, w: 500, h: 360, z: 29 });
      applyFreeWindow(source);
      applyFreeWindow(target);
      const before = { ...prefs[target] };
      const targetRect = state.sessions.get(target).el.getBoundingClientRect();
      const title = state.sessions.get(source).el.querySelector('.term-title');
      const titleRect = title.getBoundingClientRect();
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 29, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: targetRect.left + targetRect.width / 2, clientY: targetRect.top + targetRect.height / 2 });
      const activeSlot = state.pointerDrag.activeDesktopSlot?.type || null;
      endPointerDrag({ preventDefault(){} });
      const after = { ...prefs[target] };
      savePanePrefs = persistPanePrefs;
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { activeSlot, before, after };
    })()`);
    assert.strictEqual(overlapKeepsTargetWindow.activeSlot, null, `dragging over a window must remain a free overlap, not activate swap: ${JSON.stringify(overlapKeepsTargetWindow)}`);
    assert.deepStrictEqual(
      { x: overlapKeepsTargetWindow.after.x, y: overlapKeepsTargetWindow.after.y, w: overlapKeepsTargetWindow.after.w, h: overlapKeepsTargetWindow.after.h },
      { x: overlapKeepsTargetWindow.before.x, y: overlapKeepsTargetWindow.before.y, w: overlapKeepsTargetWindow.before.w, h: overlapKeepsTargetWindow.before.h },
      `overlap drop must not move or resize the covered window: ${JSON.stringify(overlapKeepsTargetWindow)}`
    );
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1595, y: 895 }, sid);
    await evalExpr(cdp, sid, `(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      clearLayoutAssist();
      return true;
    })()`);
    const edgeResize = await evalExpr(cdp, sid, `(() => {
      const id = '${madeSessions[1]}';
      const entry = state.sessions.get(id);
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      state.sessions.forEach((other, otherId) => {
        if (otherId === id) return;
        state.minimized.add(otherId);
        other.el.classList.add('layout-hidden');
      });
      Object.assign(prefs[id], { x: 100, y: 100, w: 500, h: 300, z: 40 });
      applyFreeWindow(id);
      const handle = entry.el.querySelector('.window-resize-handle.edge-w');
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 200, pointerId: 8, pointerType: 'mouse' }));
      const start = { ...state.resizeDrag.startRect };
      updateWindowResize({ preventDefault(){}, clientX: state.resizeDrag.startX - 60, clientY: state.resizeDrag.startY });
      const result = { dx: Math.round(prefs[id].x - start.x), dw: Math.round(prefs[id].w - start.w), edges: entry.el.querySelectorAll('.window-resize-handle').length };
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(savedId => state.minimized.add(savedId));
      restorePanelOrder();
      endWindowResize({ preventDefault(){} });
      return result;
    })()`);
    assert.deepStrictEqual(edgeResize, { dx: -60, dw: 60, edges: 8 }, `left edge resize must grow window without bottom-right-only lock: ${JSON.stringify(edgeResize)}`);

    const resizeSnap = await evalExpr(cdp, sid, `(() => {
      const ids = ${JSON.stringify(madeSessions.slice(0, 3))};
      const [source, verticalTarget, horizontalTarget] = ids;
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      state.sessions.forEach((entry, id) => {
        state.minimized.add(id);
        entry.el.classList.add('layout-hidden');
      });
      ids.forEach(id => {
        state.minimized.delete(id);
        state.sessions.get(id)?.el.classList.remove('layout-hidden', 'minimized');
      });
      Object.assign(prefs[source], { x: 100, y: 100, w: 500, h: 300, z: 40 });
      Object.assign(prefs[verticalTarget], { x: 720, y: 80, w: 400, h: 350, z: 20 });
      Object.assign(prefs[horizontalTarget], { x: 80, y: 500, w: 570, h: 300, z: 21 });
      ids.forEach(applyFreeWindow);
      state.resizeDrag = { sourceId: source, edge: 'se', startX: 600, startY: 400, startRect: { x: 100, y: 100, w: 500, h: 300 }, z: 40 };
      updateWindowResize({ preventDefault(){}, clientX: 708, clientY: 488 });
      const se = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h };
      const west = snapWindowResize(source, 'w', { x: 1132, y: 100, w: 568, h: 300 });
      const north = snapWindowResize(source, 'n', { x: 100, y: 812, w: 500, h: 388 });
      const targets = {
        vertical: { ...prefs[verticalTarget] },
        horizontal: { ...prefs[horizontalTarget] }
      };
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      endWindowResize({ preventDefault(){} });
      return { se, west, north, targets };
    })()`);
    assert.deepStrictEqual(resizeSnap.se, { x: 100, y: 100, w: 620, h: 400 }, `southeast resize must snap both moving edges to nearby neighbor edges: ${JSON.stringify(resizeSnap)}`);
    assert.deepStrictEqual(resizeSnap.west, { x: 1120, y: 100, w: 580, h: 300 }, `west resize must mirror-snap to a neighbor right edge: ${JSON.stringify(resizeSnap)}`);
    assert.deepStrictEqual(resizeSnap.north, { x: 100, y: 800, w: 500, h: 400 }, `north resize must mirror-snap to a neighbor bottom edge: ${JSON.stringify(resizeSnap)}`);
    assert.deepStrictEqual(
      { vertical: { x: resizeSnap.targets.vertical.x, y: resizeSnap.targets.vertical.y, w: resizeSnap.targets.vertical.w, h: resizeSnap.targets.vertical.h }, horizontal: { x: resizeSnap.targets.horizontal.x, y: resizeSnap.targets.horizontal.y, w: resizeSnap.targets.horizontal.w, h: resizeSnap.targets.horizontal.h } },
      { vertical: { x: 720, y: 80, w: 400, h: 350 }, horizontal: { x: 80, y: 500, w: 570, h: 300 } },
      `resize snapping must never move the target windows: ${JSON.stringify(resizeSnap)}`
    );

    const sharedResizeOcclusion = await evalExpr(cdp, sid, `(() => {
      const ids = ${JSON.stringify(madeSessions.slice(0, 3))};
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      state.sessions.forEach((entry, id) => {
        state.minimized.add(id);
        entry.el.classList.add('layout-hidden');
      });
      ids.forEach(id => {
        state.minimized.delete(id);
        state.sessions.get(id)?.el.classList.remove('layout-hidden');
      });
      Object.assign(prefs[ids[0]], { x: 0, y: 0, w: 400, h: 500, z: 10 });
      Object.assign(prefs[ids[1]], { x: 400, y: 0, w: 400, h: 500, z: 11 });
      Object.assign(prefs[ids[2]], { x: 250, y: 100, w: 300, h: 200, z: 50 });
      ids.forEach(applyFreeWindow);
      renderSharedResizeHandles();
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const covered = document.elementFromPoint(grid.left + 400, grid.top + 150);
      const visible = document.elementFromPoint(grid.left + 400, grid.top + 400);
      const result = {
        coveredPane: covered?.closest('.term-panel')?.dataset?.paneId || '',
        coveredClass: covered?.className || '',
        visibleShared: Boolean(visible?.classList?.contains('shared-resize-handle'))
      };
      prefs[ids[2]].z = 5;
      applyFreeWindow(ids[2]);
      renderSharedResizeHandles();
      result.beforeBringShared = document.elementFromPoint(grid.left + 400, grid.top + 150)?.classList?.contains('shared-resize-handle') || false;
      const persistPanePrefs = savePanePrefs;
      savePanePrefs = () => {};
      bringWindowToFront(ids[2]);
      savePanePrefs = persistPanePrefs;
      result.afterBringPane = document.elementFromPoint(grid.left + 400, grid.top + 150)?.closest('.term-panel')?.dataset?.paneId || '';
      state.panePrefs.windows.desktop = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return result;
    })()`);
    assert.strictEqual(sharedResizeOcclusion.coveredPane, madeSessions[2], `a higher window must own pointer hit-testing above covered shared resize edges: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.visibleShared, true, `uncovered shared resize edge must remain interactive: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.beforeBringShared, true, `shared edge should be interactive while the crossing pane is behind it: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.afterBringPane, madeSessions[2], `bringing a crossing pane forward must immediately refresh shared resize hit-testing: ${JSON.stringify(sharedResizeOcclusion)}`);

    const counts = await evalExpr(cdp, sid, `(() => ({
      panels: document.querySelectorAll('.term-panel').length,
      activeTitle: document.getElementById('activeSessionDescription')?.textContent || ''
    }))()`);
    assert.strictEqual(counts.panels, 11, 'all panels should render');
    assert.notStrictEqual(counts.activeTitle, 'No title', `topbar should show session info, not the generated-title fallback: ${JSON.stringify(counts)}`);

    const terminalFocusVisual = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get('${madeSessions[0]}');
      selectPanel(entry.session.id, { persist: false });
      const textarea = entry.el.querySelector('.xterm-helper-textarea');
      textarea.focus();
      syncTerminalInputFocus(true);
      const focused = {
        selected: entry.el.classList.contains('active'),
        inputFocused: entry.el.classList.contains('input-focused'),
        shadow: getComputedStyle(entry.el).boxShadow
      };
      window.dispatchEvent(new Event('blur'));
      document.getElementById('settingsToggle').focus();
      const background = {
        selected: entry.el.classList.contains('active'),
        inputFocused: entry.el.classList.contains('input-focused'),
        shadow: getComputedStyle(entry.el).boxShadow
      };
      window.dispatchEvent(new Event('focus'));
      await new Promise(requestAnimationFrame);
      const reactivated = {
        selected: entry.el.classList.contains('active'),
        inputFocused: entry.el.classList.contains('input-focused'),
        textareaFocused: document.activeElement === textarea
      };
      const modal = document.getElementById('closeModal');
      showCloseConfirm(entry.session.id, 'Focus guard');
      await new Promise(resolve => setTimeout(resolve, 0));
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      await new Promise(requestAnimationFrame);
      const modalFocus = {
        buttonFocused: modal.contains(document.activeElement),
        inputFocused: entry.el.classList.contains('input-focused')
      };
      hideCloseConfirm();
      focusActiveTerminalOnWindowActivation();
      return { focused, background, reactivated, modalFocus };
    })()`);
    assert.strictEqual(terminalFocusVisual.focused.selected, true, 'selected pane state must remain independent from keyboard focus');
    assert.strictEqual(terminalFocusVisual.focused.inputFocused, true, 'focused xterm pane must show keyboard-input focus');
    assert.strictEqual(terminalFocusVisual.background.selected, true, 'backgrounding PassiDeck must not change selected pane/session state');
    assert.strictEqual(terminalFocusVisual.background.inputFocused, false, 'backgrounded PassiDeck must remove keyboard-input focus styling');
    assert.notStrictEqual(terminalFocusVisual.background.shadow, terminalFocusVisual.focused.shadow, 'backgrounded selected pane must not retain the focused neon frame');
    assert.strictEqual(terminalFocusVisual.reactivated.selected, true, 'reactivating PassiDeck must preserve the last selected pane');
    assert.strictEqual(terminalFocusVisual.reactivated.inputFocused, true, 'reactivating PassiDeck must restore terminal input styling');
    assert.strictEqual(terminalFocusVisual.reactivated.textareaFocused, true, 'reactivating PassiDeck must focus the last selected terminal for immediate typing');
    assert.deepStrictEqual(terminalFocusVisual.modalFocus, { buttonFocused: true, inputFocused: false }, 'reactivating PassiDeck must not steal focus from an open modal');

    const responseAttentionBridge = await evalExpr(cdp, sid, `(async () => {
      const calls = [];
      const entries = [...state.sessions.values()];
      const originalActiveId = state.activeId;
      const originalDesktopDescriptor = Object.getOwnPropertyDescriptor(window, 'passideckDesktop');
      Object.defineProperty(window, 'passideckDesktop', {
        configurable: true,
        writable: true,
        value: {
          notifyResponseComplete: () => calls.push('complete'),
          clearResponseAttention: () => calls.push('clear')
        }
      });
      setResponseSoundMode('off');
      notifyResponseComplete(entries[0].session.id);
      notifyResponseComplete(entries[1].session.id);
      const header = entries[0].el.querySelector('.term-header');
      const switcher = document.querySelector('[data-switcher-pane-id="' + entries[0].session.id + '"]');
      const immediate = header.classList.contains('response-pulse');
      const immediateTab = switcher.classList.contains('response-pulse');
      const headerStyle = getComputedStyle(header);
      const tabStyle = getComputedStyle(switcher);
      const tabIterations = tabStyle.animationIterationCount;
      const headerDuration = headerStyle.animationDuration;
      const tabDuration = tabStyle.animationDuration;
      const badgeContent = getComputedStyle(header, '::after').content;
      await new Promise(resolve => setTimeout(resolve, 1700));
      const persistent = header.classList.contains('response-pulse');
      const persistentTab = switcher.classList.contains('response-pulse');
      entries[0].el.querySelector('.terminal').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const desktopHeldForOtherPane = !calls.includes('clear');
      const otherBeforeSwitcherClick = entries[1].responseAttention;
      document.querySelector('[data-switcher-pane-id="' + entries[1].session.id + '"]').click();
      const otherClearedBySwitcher = !entries[1].responseAttention;
      if (state.activeId !== originalActiveId) selectPanel(originalActiveId);
      const result = {
        calls,
        immediate,
        immediateTab,
        tabIterations,
        headerDuration,
        tabDuration,
        badgeContent,
        persistent,
        persistentTab,
        cleared: !header.classList.contains('response-pulse'),
        clearedTab: !document.querySelector('[data-switcher-pane-id="' + entries[0].session.id + '"]').classList.contains('response-pulse'),
        desktopHeldForOtherPane,
        otherBeforeSwitcherClick,
        otherClearedBySwitcher
      };
      if (originalDesktopDescriptor) Object.defineProperty(window, 'passideckDesktop', originalDesktopDescriptor);
      else delete window.passideckDesktop;
      return result;
    })()`);
    assert.deepStrictEqual(responseAttentionBridge, {
      calls: ['complete', 'complete', 'clear'],
      immediate: true,
      immediateTab: true,
      tabIterations: 'infinite',
      headerDuration: '1.6s',
      tabDuration: '1.6s',
      badgeContent: 'none',
      persistent: true,
      persistentTab: true,
      cleared: true,
      clearedTab: true,
      desktopHeldForOtherPane: true,
      otherBeforeSwitcherClick: true,
      otherClearedBySwitcher: true
    }, 'pane acknowledgement must preserve backend attention while another pane waits, and switcher selection must clear the selected pane plus the backend after the final acknowledgement');

    const fontSizeDropdown = await evalExpr(cdp, sid, `(async () => {
      const select = document.getElementById('fontSizeSelect');
      if (!select) return { missing: true, oldSlider: Boolean(document.getElementById('fontSizeSlider')) };
      const original = state.fontSize;
      const term = state.sessions.values().next().value?.term;
      const originalPanelWidth = document.getElementById('settingsPanel').getBoundingClientRect().width;
      setFontSize(13, { persist: false });
      select.value = '18';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const immediate = {
        size: state.fontSize,
        terminalSize: term?.options.fontSize,
        selected: select.options[select.selectedIndex]?.textContent || '',
        status: document.getElementById('fontSizeLabel')?.textContent || ''
      };
      await new Promise(resolve => setTimeout(resolve, 120));
      const beforeDelay = state.fontSize;
      await new Promise(resolve => setTimeout(resolve, 180));
      const afterDelay = state.fontSize;
      const afterTerminalSize = term?.options.fontSize;
      const afterSettingsSize = getComputedStyle(document.getElementById('settingsPanel')).fontSize;
      const resizedPanelWidth = document.getElementById('settingsPanel').getBoundingClientRect().width;
      const afterStatus = document.getElementById('fontSizeLabel')?.textContent || '';
      setFontSize(original, { persist: false });
      return { missing: false, oldSlider: Boolean(document.getElementById('fontSizeSlider')), immediate, beforeDelay, afterDelay, afterTerminalSize, afterSettingsSize, resized: resizedPanelWidth > originalPanelWidth, afterStatus };
    })()`);
    assert.deepStrictEqual(fontSizeDropdown, {
      missing: false,
      oldSlider: false,
      immediate: { size: 13, terminalSize: 13, selected: '18 px', status: 'Pending' },
      beforeDelay: 13,
      afterDelay: 18,
      afterTerminalSize: 18,
      afterSettingsSize: '12px',
      resized: false,
      afterStatus: 'Live'
    }, 'font-size dropdown must show the selected value immediately and apply it live after a short delay');

    const responseSound = await evalExpr(cdp, sid, `(async () => {
      const entries = [...state.sessions.values()];
      const active = entries[0];
      const other = entries[1];
      selectPanel(active.session.id, { persist: false });
      setResponseSoundMode('background');
      setResponseSoundTone('chime');
      setResponseSoundVolume(25);
      const decisions = {
        activeFocused: shouldPlayResponseSound(active.session.id, true, false),
        otherFocused: shouldPlayResponseSound(other.session.id, true, false),
        activeHidden: shouldPlayResponseSound(active.session.id, false, true)
      };
      setResponseSoundMode('off', { persist: false });
      decisions.off = shouldPlayResponseSound(other.session.id, false, true);
      setResponseSoundMode('always');
      decisions.always = shouldPlayResponseSound(active.session.id, true, false);
      const played = [];
      const originalBell = playBell;
      playBell = (tone, volume) => { played.push({ tone, volume }); };
      document.getElementById('responseSoundTest').click();
      await new Promise(resolve => active.term.write('\\u0007', resolve));
      await new Promise(resolve => setTimeout(resolve, 20));
      playBell = originalBell;
      const persisted = JSON.parse(localStorage.getItem('passideck:response-sound'));
      return {
        decisions,
        played,
        mode: document.getElementById('responseSoundModeSelect')?.value || '',
        tone: document.getElementById('responseSoundToneSelect')?.value || '',
        toneOptions: [...document.getElementById('responseSoundToneSelect').options].map(option => option.textContent),
        volume: Number(document.getElementById('responseSoundVolume')?.value),
        volumeLabel: document.getElementById('responseSoundVolumeLabel')?.textContent || '',
        persisted,
        serverPayloadHasSound: Object.keys(uiPayload()).some(key => key.startsWith('responseSound'))
      };
    })()`);
    assert.deepStrictEqual(responseSound, {
      decisions: { activeFocused: false, otherFocused: true, activeHidden: true, off: false, always: true },
      played: [{ tone: 'chime', volume: 25 }, { tone: 'chime', volume: 25 }],
      mode: 'always',
      tone: 'chime',
      toneOptions: ['Soft', 'Ping', 'Chime'],
      volume: 25,
      volumeLabel: '25%',
      persisted: { mode: 'always', tone: 'chime', volume: 25 },
      serverPayloadHasSound: false
    }, 'response sounds must be backend-local, configurable, and driven by terminal BEL');

    const generatedTitle = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      selectPanel(entry.session.id);
      entry.session.meta.title = 'Model Session Title';
      renderSwitcher();
      entry.el.querySelector('.term-title').textContent = panelTitle(entry.session);
      return {
        pane: entry.el.querySelector('.term-title')?.textContent || '',
        switcher: document.querySelector('#sessionSwitcher .switcher-btn.active .switcher-title')?.textContent || '',
        topbarPresent: Boolean(document.getElementById('activeSessionDescription'))
      };
    })()`);
    assert.strictEqual(generatedTitle.pane, 'Model Session Title', 'generated terminal/model title must appear in pane header');
    assert.strictEqual(generatedTitle.switcher, 'Model Session Title', 'taskbar/switcher item should use the pane title');
    assert.strictEqual(generatedTitle.topbarPresent, false, 'old command/cwd topbar description should be removed');

    const placeholderCustomDoesNotBlock = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      state.panePrefs.titles[entry.session.id] = 'Titel';
      applySessionMeta(entry.session.id, { id: entry.session.id, meta: { ...entry.session.meta, title: 'Canonical Hermes Title', hermesSessionId: 'hermes-1' } });
      return { pane: entry.el.querySelector('.term-title')?.textContent || '', stored: state.panePrefs.titles[entry.session.id] || '', source: entry.titleSource };
    })()`);
    assert.deepStrictEqual(placeholderCustomDoesNotBlock, { pane: 'Canonical Hermes Title', stored: 'Titel', source: 'server' }, 'placeholder custom titles must not block canonical server titles');

    const oscTitleEvent = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      clearGeneratedTitle(entry.session.id);
      await new Promise(resolve => entry.term.write('\\u001b]0;OSC Event Title\\u0007', resolve));
      await new Promise(resolve => setTimeout(resolve, 20));
      return entry.el.querySelector('.term-title')?.textContent || '';
    })()`);
    assert.strictEqual(oscTitleEvent, 'No title', 'generic OSC window titles must not become session titles');

    const garbageVisibleTitle = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      entry.session.meta.command = '/bin/bash';
      clearGeneratedTitle(entry.session.id);
      const inferred = inferHermesVisibleTitle(['Title: /home/maeve/projects/passideck-dev', 'loaded session: npm test']);
      refreshTitleFromTerminal(entry.session.id);
      return { inferred, pane: entry.el.querySelector('.term-title')?.textContent || '' };
    })()`);
    assert.deepStrictEqual(garbageVisibleTitle, { inferred: '', pane: 'No title' }, 'shell output and generic Title lines must not poison pane titles');

    const tuiSelectedTitle = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      entry.session.meta.command = 'hermes --tui';
      delete entry.autoTitle;
      delete entry.session.meta.title;
      entry.el.querySelector('.term-title').textContent = panelTitle(entry.session);
      renderSwitcher();
      const screen = '\\r\\n╔════════════════════════════════════════════════════════════════╗\\r\\n║ Sessions                                                       ║\\r\\n║ 1 live · 48 resumable                                          ║\\r\\n║    +   new        ✎ draft    current/default   Start a new live session ║\\r\\n║ ▸  1.  current    ✓ idle     gpt-5.5           Passideck Repo Audit mit Ponytail ║\\r\\n║    2.  20260622_2_today     2 msgs             Friendly greeting ║\\r\\n╚════════════════════════════════════════════════════════════════╝\\r\\n';
      await new Promise(resolve => entry.term.write(screen, resolve));
      refreshTitleFromTerminal(entry.session.id);
      return {
        inferred: inferHermesSessionTitle(terminalViewportRows(entry.term)),
        pane: entry.el.querySelector('.term-title')?.textContent || '',
        switcher: document.querySelector('#sessionSwitcher .switcher-btn.active .switcher-title')?.textContent || ''
      };
    })()`);
    assert.strictEqual(tuiSelectedTitle.inferred, 'Passideck Repo Audit mit Ponytail', 'Hermes TUI selected saved session must be inferred despite box borders');
    assert.strictEqual(tuiSelectedTitle.pane, 'Passideck Repo Audit mit Ponytail', 'Hermes TUI selected saved session must drive pane header title');
    assert.strictEqual(tuiSelectedTitle.switcher, 'Passideck Repo Audit mit Ponytail', 'taskbar item should use the same pane title');

    const tuiLoadedVisibleTitle = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      clearGeneratedTitle(entry.session.id);
      await new Promise(resolve => entry.term.write('\\r\\nHermes CLI Status\\r\\n\\r\\nTitle: Loaded TUI Session Title\\r\\n', resolve));
      refreshTitleFromTerminal(entry.session.id);
      return { inferred: inferHermesVisibleTitle(terminalViewportRows(entry.term)), pane: entry.el.querySelector('.term-title')?.textContent || '' };
    })()`);
    assert.deepStrictEqual(tuiLoadedVisibleTitle, { inferred: 'Loaded TUI Session Title', pane: 'Loaded TUI Session Title' }, 'loaded Hermes TUI sessions must update pane title from visible session title text');

    const tuiUntitledTitle = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      delete entry.autoTitle;
      delete entry.session.meta.title;
      delete entry.session.title;
      entry.titleSource = '';
      entry.el.querySelector('.term-title').textContent = panelTitle(entry.session);
      renderSwitcher();
      const lines = ['║ Sessions ║', '║ ▸  1.  current    ✓ idle     gpt-5.5           (untitled)                                                 ║', '║    2.  20260623_today      12 msgs            Should Not Become Title                                   ║'];
      if (selectedHermesSessionTitleIsEmpty(lines)) clearGeneratedTitle(entry.session.id);
      return { inferred: inferHermesSessionTitle(lines), pane: entry.el.querySelector('.term-title')?.textContent || '', topbarPresent: Boolean(document.getElementById('activeSessionDescription')) };
    })()`);
    assert.strictEqual(tuiUntitledTitle.inferred, '', 'Hermes TUI current untitled row must not infer a title');
    assert.strictEqual(tuiUntitledTitle.pane, 'No title', 'Hermes TUI current untitled row must clear stale pane title');
    assert.strictEqual(tuiUntitledTitle.topbarPresent, false, 'topbar command/cwd description should stay removed');

    const titleLock = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      applyGeneratedTitle(entry.session.id, 'Saved Session Name', { source: 'hermes-session' });
      applyGeneratedTitle(entry.session.id, 'Duster', { source: 'terminal' });
      return {
        pane: entry.el.querySelector('.term-title')?.textContent || '',
        switcher: document.querySelector('#sessionSwitcher .switcher-btn.active .switcher-title')?.textContent || '',
        source: entry.titleSource
      };
    })()`);
    assert.strictEqual(titleLock.pane, 'Saved Session Name', 'Hermes saved-session title must not be overwritten by later terminal OSC titles');
    assert.strictEqual(titleLock.switcher, 'Saved Session Name', 'taskbar item should use saved-session title');
    assert.strictEqual(titleLock.source, 'hermes-session', 'saved-session title source should stay locked');

    const minimizedSwitcher = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      applyGeneratedTitle(entry.session.id, 'Minimized Window Name', { source: 'hermes-session' });
      minimizePanel(entry.session.id);
      const btn = document.querySelector('#sessionSwitcher .switcher-btn.minimized');
      const close = btn?.closest('.switcher-item')?.querySelector('.switcher-close');
      const before = {
        text: btn?.querySelector('.switcher-title')?.textContent?.trim() || '',
        tooltip: btn?.dataset?.tooltip || '',
        nativeTitle: btn?.getAttribute('title') || '',
        tag: btn?.tagName || '',
        closeTag: close?.tagName || '',
        closeNested: Boolean(btn?.querySelector('.switcher-close')),
        hidden: entry.el.classList.contains('layout-hidden')
      };
      btn?.click();
      const restored = !state.minimized.has(entry.session.id) && !entry.el.classList.contains('layout-hidden');
      btn?.click();
      const minimizedAgain = state.minimized.has(entry.session.id) && entry.el.classList.contains('layout-hidden');
      restorePanel(entry.session.id);
      return { before, restored, minimizedAgain };
    })()`);
    assert.deepStrictEqual(minimizedSwitcher, { before: { text: 'Minimized Window Name', tooltip: 'Restore Minimized Window Name', nativeTitle: '', tag: 'BUTTON', closeTag: 'BUTTON', closeNested: false, hidden: true }, restored: true, minimizedAgain: true }, 'taskbar must use sibling native buttons; pane activation must restore/minimize without swallowing close keyboard input');

    const keyboardCloseId = await evalExpr(cdp, sid, `(() => {
      const close = document.querySelector('#sessionSwitcher .switcher-close');
      close.focus();
      return close.closest('.switcher-item').querySelector('.switcher-btn').dataset.switcherPaneId;
    })()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sid);
    await waitEval(cdp, sid, `document.querySelector('#closeModal.open') && !document.querySelector('#closeModal').hidden`);
    assert.strictEqual(await evalExpr(cdp, sid, 'closeConfirmSessionId'), keyboardCloseId, 'Space on taskbar close must target close, not activate/minimize its pane');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await waitEval(cdp, sid, `document.querySelector('#closeModal').hidden`);

    const currentRowTitle = await evalExpr(cdp, sid, `(() => {
      const rows = ['║ 1 live · 48 resumable ║', '║    1.  20260622_old      2 msgs             Old Title ║', '║    2.  current    ✓ idle     gpt-5.5           Selected Session Title ║'];
      return inferHermesSessionTitle(rows);
    })()`);
    assert.strictEqual(currentRowTitle, 'Selected Session Title', 'Hermes TUI current row should infer title even when Sessions header/selector glyph is not visible');

    const unnumberedCurrentRowTitle = await evalExpr(cdp, sid, `(() => {
      const rows = ['║ Sessions ║', '║ ▸ current    ✓ idle     gpt-5.5           Real Visible Title ║', '║   2.  older      2 msgs             Wrong Title ║'];
      return inferHermesSessionTitle(rows);
    })()`);
    assert.strictEqual(unnumberedCurrentRowTitle, 'Real Visible Title', 'Hermes TUI selected current row may omit numeric index; still infer title');

    const fakeSessionListTitle = await evalExpr(cdp, sid, `inferHermesSessionTitle(['Sessions', '▸ 1. current  gpt-5.5  npm run dev'])`);
    assert.strictEqual(fakeSessionListTitle, '', 'ordinary Hermes output resembling a session row must not become a locked pane title');

    await evalExpr(cdp, sid, `(() => { [...state.sessions.values()][0].session.meta.command = '/bin/bash'; return true; })()`);

    const switchDescriptions = await evalExpr(cdp, sid, `(async () => {
      const ids = [...state.sessions.keys()];
      for (const id of ids) {
        selectPanel(id);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const entry = state.sessions.get(id);
        const expected = panelTitle(entry.session);
        const actual = document.querySelector('#sessionSwitcher .switcher-btn.active .switcher-title')?.textContent || '';
        if (actual !== expected) return { ok: false, id, expected, actual };
      }
      return { ok: true };
    })()`);
    assert.deepStrictEqual(switchDescriptions, { ok: true }, 'taskbar active item must follow active session switches');

    const wheelScroll = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      entry.session.meta.command = 'hermes';
      await new Promise(resolve => entry.term.write(Array.from({ length: 80 }, (_, i) => 'wheel-' + i + '\\r\\n').join(''), resolve));
      await new Promise(resolve => entry.term.write('\\x1b[?1000h', resolve));
      entry.term.scrollToBottom();
      const before = entry.term.buffer.active.viewportY;
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const r = target.getBoundingClientRect();
      let tinyLeaked = false;
      target.addEventListener('wheel', () => { tinyLeaked = true; }, { once: true });
      const tinyEvent = new WheelEvent('wheel', { deltaY: -4, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 });
      const tinyDispatched = target.dispatchEvent(tinyEvent);
      target.dispatchEvent(new WheelEvent('wheel', { deltaY: -480, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(resolve => entry.term.write('\\x1b[?1000l', resolve));
      entry.session.meta.command = oldCommand;
      return { before, after: entry.term.buffer.active.viewportY, tinyCanceled: !tinyDispatched || tinyEvent.defaultPrevented, tinyLeaked };
    })()`);
    assert.ok(wheelScroll.after < wheelScroll.before, `normal Hermes wheel must scroll xterm history even when app mouse mode is active: ${JSON.stringify(wheelScroll)}`);
    assert.strictEqual(wheelScroll.tinyCanceled, true, `normal Hermes tiny wheel deltas must be canceled while accumulating: ${JSON.stringify(wheelScroll)}`);
    assert.strictEqual(wheelScroll.tinyLeaked, false, `normal Hermes tiny wheel deltas must not reach xterm/Hermes app mouse handling: ${JSON.stringify(wheelScroll)}`);

    const altScreenWheel = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      entry.session.meta.command = 'hermes --tui';
      let scrollCalls = 0;
      const oldScrollLines = entry.term.scrollLines.bind(entry.term);
      entry.term.scrollLines = n => { scrollCalls += 1; return oldScrollLines(n); };
      await new Promise(resolve => entry.term.write('\\x1b[?1049h\\x1b[?1000h', resolve));
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const termEl = entry.el.querySelector('.terminal');
      let capturePrevented = null;
      const captureProbe = e => { capturePrevented = e.defaultPrevented; };
      termEl.addEventListener('wheel', captureProbe, { capture: true, once: true });
      const r = target.getBoundingClientRect();
      const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 });
      const dispatched = target.dispatchEvent(event);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = { scrollCalls, baseY: entry.term.buffer.active.baseY, canceled: !dispatched || event.defaultPrevented, capturePrevented };
      await new Promise(resolve => entry.term.write('\\x1b[?1000l\\x1b[?1049l', resolve));
      entry.term.scrollLines = oldScrollLines;
      entry.session.meta.command = oldCommand;
      return out;
    })()`);
    assert.deepStrictEqual(altScreenWheel, { scrollCalls: 0, baseY: 0, canceled: true, capturePrevented: true }, 'Hermes TUI alternate-screen wheel must not scroll xterm/browser chrome when no scrollback exists');

    const uploadInteraction = await evalExpr(cdp, sid, `(async () => {
      const entry = activeTerminalEntry();
      const sent = [];
      entry.ws = { readyState: WebSocket.OPEN, send: message => { const frame = JSON.parse(message); if (frame.type === 'input') sent.push(frame.data); } };
      entry.term.focus = () => {};
      const oldApi = api;
      api = async (_method, path, body) => ({ insert: '/tmp/' + body.name, type: body.type });
      entry.session.meta.command = 'hermes';
      let textPrevented = false;
      let textStopped = false;
      handleTerminalPaste({
        target: entry.el.querySelector('.xterm-helper-textarea'),
        clipboardData: { files: [], items: [], getData: type => type === 'text/plain' ? 'normal Hermes paste' : '' },
        preventDefault(){ textPrevented = true; },
        stopImmediatePropagation(){ textStopped = true; }
      });
      let keyStopped = false;
      let keyPrevented = false;
      letBrowserOwnTerminalPasteShortcut({
        key: 'v', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false,
        target: entry.el.querySelector('.xterm-helper-textarea'),
        preventDefault(){ keyPrevented = true; },
        stopImmediatePropagation(){ keyStopped = true; }
      });
      entry.session.meta.command = 'hermes --tui';
      const screenshot = new File(['png'], 'screenshot.png', { type: 'image/png' });
      handleTerminalPaste({ clipboardData: {
        files: [],
        items: [{ kind: 'file', getAsFile: () => screenshot }]
      }, preventDefault(){}, stopImmediatePropagation(){} });
      while (state.uploadBusy) await new Promise(resolve => setTimeout(resolve, 0));
      window.passideckDesktop = { readImage: async () => 'data:image/png;base64,cG5n' };
      handleTerminalPaste({ clipboardData: { files: [], items: [], getData: () => '' }, preventDefault(){}, stopImmediatePropagation(){} });
      for (let i = 0; i < 100 && sent.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
      delete window.passideckDesktop;
      handleTerminalPaste({ clipboardData: { files: [
        new File(['text'], 'pasted.txt', { type: 'text/plain' })
      ], items: [] }, preventDefault(){}, stopImmediatePropagation(){} });
      while (state.uploadBusy) await new Promise(resolve => setTimeout(resolve, 0));
      entry.session.meta.command = 'hermes';
      handleUploadDrop({ dataTransfer: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] }, target: entry.el, preventDefault(){}, stopImmediatePropagation(){} });
      while (state.uploadBusy) await new Promise(resolve => setTimeout(resolve, 0));
      api = oldApi;
      return { sent, textPrevented, textStopped, keyStopped, keyPrevented };
    })()`);
    assert.deepStrictEqual(uploadInteraction, {
      sent: [
        '\u001b[200~normal Hermes paste\u001b[201~',
        '\u0001/image /tmp/screenshot.png\r',
        '\u0001/image /tmp/clipboard.png\r',
        '\u001b[200~/tmp/pasted.txt \u001b[201~',
        '\u001b[200~/tmp/notes.txt \u001b[201~'
      ],
      textPrevented: true,
      textStopped: true,
      keyStopped: true,
      keyPrevented: false
    }, 'Ctrl+V text, clipboard files, and file drop must reach normal Hermes/TUI through the terminal bridge');

    const rightClickCopy = await evalExpr(cdp, sid, `(async () => {
      const entry = activeTerminalEntry();
      const oldGetSelection = entry.term.getSelection;
      const oldClearSelection = entry.term.clearSelection;
      const oldCopy = copyTextToClipboard;
      let copied = '';
      let clears = 0;
      let prevented = false;
      let stopped = false;
      entry.term.getSelection = () => 'POWERSHELL_STYLE_COPY';
      entry.term.clearSelection = () => { clears += 1; };
      copyTextToClipboard = async text => { copied = text; return true; };
      await handleTerminalContextMenu({
        target: entry.el.querySelector('.xterm-screen'),
        preventDefault(){ prevented = true; },
        stopImmediatePropagation(){ stopped = true; }
      });
      entry.term.getSelection = oldGetSelection;
      entry.term.clearSelection = oldClearSelection;
      copyTextToClipboard = oldCopy;
      return { copied, clears, prevented, stopped };
    })()`);
    assert.deepStrictEqual(rightClickCopy, {
      copied: 'POWERSHELL_STYLE_COPY', clears: 1, prevented: true, stopped: true
    }, 'right-click must copy and immediately clear terminal selection like Windows PowerShell');

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

    const arrangeProbe = await evalExpr(cdp, sid, `(() => {
      const r = document.querySelector('.term-panel.active button.arrange').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: arrangeProbe.x, y: arrangeProbe.y }, sid);
    await sleep(150);
    assert.strictEqual(await evalExpr(cdp, sid, `Boolean(document.getElementById('layoutAssist'))`), false, 'arrange preview must wait 300ms before opening');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 120 }, sid);
    await sleep(250);
    assert.strictEqual(await evalExpr(cdp, sid, `Boolean(document.getElementById('layoutAssist'))`), false, 'leaving arrange before the delay must cancel its preview');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: arrangeProbe.x, y: arrangeProbe.y }, sid);
    await sleep(350);
    assert.strictEqual(await evalExpr(cdp, sid, `Boolean(document.getElementById('layoutAssist'))`), true, 'arrange preview must open after the hover delay');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -10, y: arrangeProbe.y }, sid);
    await waitEval(cdp, sid, `!document.getElementById('layoutAssist')`);

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
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 120 }, sid);
    await waitEval(cdp, sid, `document.getElementById('appTooltip').hidden && !document.getElementById('appTooltip').classList.contains('visible')`);

    const failedCloseKeepsPane = await evalExpr(cdp, sid, `(async () => {
      const id = [...state.sessions.keys()][0];
      const originalApi = api;
      api = async () => { throw new Error('backend unavailable'); };
      try { await closePanel(id); } finally { api = originalApi; }
      return { inState: state.sessions.has(id), inDom: Boolean(document.getElementById('panel-' + id)) };
    })()`);
    assert.deepStrictEqual(failedCloseKeepsPane, { inState: true, inDom: true }, 'failed session close must keep the pane so the running process remains reachable');

    const failedLaunchIsVisible = await evalExpr(cdp, sid, `(async () => {
      const originalApi = api;
      const originalToast = showToast;
      let toast = '';
      api = async () => { throw new Error('backend unavailable'); };
      showToast = text => { toast = text; };
      let threw = false;
      try { await launch('/bin/bash'); } catch { threw = true; }
      api = originalApi;
      showToast = originalToast;
      return { threw, toast };
    })()`);
    assert.deepStrictEqual(failedLaunchIsVisible, { threw: false, toast: 'Launch failed: backend unavailable' }, 'failed launch must show an actionable error instead of an unhandled promise rejection');

    await evalExpr(cdp, sid, `document.getElementById('settingsToggle').click()`);
    await waitEval(cdp, sid, `document.activeElement?.id === 'themeSelect'`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 12, y: 120, button: 'left', clickCount: 1 }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 12, y: 120, button: 'left', clickCount: 1 }, sid);
    await waitEval(cdp, sid, `document.getElementById('settingsPanel').hidden`);
    await evalExpr(cdp, sid, `document.getElementById('settingsToggle').click()`);
    await waitEval(cdp, sid, `document.activeElement?.id === 'themeSelect'`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await waitEval(cdp, sid, `document.getElementById('settingsPanel').hidden && document.activeElement?.id === 'settingsToggle'`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 700, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 760');
    const mobileLayout = await evalExpr(cdp, sid, `(() => {
      window.__mobileUserMinimized = persistentMinimizedIds();
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      savePanePrefs();
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden'));
      const rects = visible.map(panel => { const r = panel.getBoundingClientRect(); return { left: r.left, right: r.right }; });
      return {
        visible: visible.length,
        total: state.sessions.size,
        inBounds: rects.every(r => r.left >= 0 && r.right <= innerWidth),
        persisted: state.panePrefs.minimized,
        expectedPersisted: window.__mobileUserMinimized
      };
    })()`);
    assert.ok(mobileLayout.total > 1 && mobileLayout.visible === 1 && mobileLayout.inBounds, `760px viewport must expose one in-bounds pane, got ${JSON.stringify(mobileLayout)}`);
    assert.deepStrictEqual(mobileLayout.persisted, mobileLayout.expectedPersisted, 'responsive-only minimization must not be persisted as user state');
    const narrowClose = await evalExpr(cdp, sid, `(async () => {
      const closedId = state.activeId;
      await closePanel(closedId);
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden'));
      return { visible: visible.length, active: state.activeId, activeResponsive: state.responsiveMinimized.has(state.activeId), persisted: persistentMinimizedIds(), expectedPersisted: window.__mobileUserMinimized };
    })()`);
    assert.ok(narrowClose.visible === 1 && narrowClose.active && !narrowClose.activeResponsive, `closing the mobile active pane must reveal one successor, got ${JSON.stringify(narrowClose)}`);
    assert.deepStrictEqual(narrowClose.persisted, narrowClose.expectedPersisted, 'mobile close must preserve explicit user minimization');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 1280');
    const restoredDesktop = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden')).length;
      return { visible, expectedVisible: state.sessions.size - window.__mobileUserMinimized.length, transient: state.responsiveMinimized.size, minimized: persistentMinimizedIds(), expectedMinimized: window.__mobileUserMinimized };
    })()`);
    assert.deepStrictEqual(restoredDesktop, { visible: restoredDesktop.expectedVisible, expectedVisible: restoredDesktop.expectedVisible, transient: 0, minimized: restoredDesktop.expectedMinimized, expectedMinimized: restoredDesktop.expectedMinimized }, 'widening must restore only responsive-minimized panes and preserve user minimization');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 700, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 760');
    const remoteMinimizeId = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const id = [...state.responsiveMinimized][0];
      const ui = uiPayload();
      ui.revision = state.uiRevision + 1;
      ui.panePrefs = structuredClone(state.panePrefs);
      ui.panePrefs.minimized = [...new Set([...persistentMinimizedIds(), id])];
      applyAuthoritativeUiState(ui);
      return id;
    })()`);
    assert.ok(remoteMinimizeId, 'narrow peer must have a responsive-minimized pane for remote user-minimize regression');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 1280');
    const remoteMinimizeAfterWiden = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      return { minimized: state.minimized.has('${remoteMinimizeId}'), persistent: persistentMinimizedIds().includes('${remoteMinimizeId}'), transient: state.responsiveMinimized.has('${remoteMinimizeId}') };
    })()`);
    assert.deepStrictEqual(remoteMinimizeAfterWiden, { minimized: true, persistent: true, transient: false }, 'remote user minimization must survive narrow-client responsive state and widening');

    await cdp.send('Page.navigate', { url: `${base}/?token=secret-token#keep` }, sid);
    await waitEval(cdp, sid, 'document.readyState === "complete"');
    const scrubbedAuthToken = await waitEval(cdp, sid, `(() => ({ token: sessionStorage.getItem('passideck:auth-token'), search: location.search, hash: location.hash }))()`);
    assert.deepStrictEqual(scrubbedAuthToken, { token: 'secret-token', search: '', hash: '#keep' }, 'auth token must move to session storage and be removed from browser history/address bar');

    const resumeLifecycle = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get(state.activeId);
      const realSocket = entry.ws;
      const realSessions = state.sessions;
      const originalAttachSocket = attachSocket;
      const originalRefresh = entry.term.refresh;
      let reconnects = 0;
      let staleClosed = 0;
      let refreshes = 0;
      try {
        state.sessions = new Map([[entry.session.id, entry]]);
        attachSocket = () => {
          reconnects += 1;
          return { readyState: WebSocket.CONNECTING, send() {}, close() {} };
        };
        entry.term.refresh = () => { refreshes += 1; };
        entry.ws = {
          readyState: WebSocket.OPEN,
          lastMessageAt: Date.now(),
          lastPongAt: Date.now() - SOCKET_STALE_MS - 1,
          send() {},
          close(code) { if (code === 4000) staleClosed += 1; }
        };
        resumeAllPanes();
        const stale = { reconnects, staleClosed, refreshes };

        const sent = [];
        entry.ws = {
          readyState: WebSocket.OPEN,
          lastMessageAt: Date.now(),
          send(raw) { sent.push(JSON.parse(raw).type); },
          close() {}
        };
        resumeAllPanes();
        await new Promise(resolve => setTimeout(resolve, 300));
        const healthy = { sent, refreshes };

        let onlineClosed = 0;
        entry.ws = {
          readyState: WebSocket.OPEN,
          lastMessageAt: Date.now(),
          send() {},
          close(code) { if (code === 4000) onlineClosed += 1; }
        };
        resumeAllPanes(true);
        return { stale, healthy, online: { reconnects, onlineClosed } };
      } finally {
        state.sessions = realSessions;
        attachSocket = originalAttachSocket;
        entry.term.refresh = originalRefresh;
        entry.ws = realSocket;
      }
    })()`);
    assert.deepStrictEqual(resumeLifecycle.stale, { reconnects: 1, staleClosed: 1, refreshes: 1 }, `resume must replace stale sockets and repaint every pane: ${JSON.stringify(resumeLifecycle)}`);
    assert.ok(resumeLifecycle.healthy.sent.includes('ping') && resumeLifecycle.healthy.sent.includes('resize') && resumeLifecycle.healthy.refreshes >= 2,
      `resume must probe live sockets, force PTY redraw, and repaint xterm: ${JSON.stringify(resumeLifecycle)}`);
    assert.deepStrictEqual(resumeLifecycle.online, { reconnects: 2, onlineClosed: 1 }, `returning online must replace even a nominally open socket immediately: ${JSON.stringify(resumeLifecycle)}`);

    const heartbeatRoundTrip = await evalExpr(cdp, sid, `(async () => {
      const socket = state.sessions.get(state.activeId).ws;
      const before = socket.lastPongAt || 0;
      socket.send(JSON.stringify({ type: 'ping' }));
      for (let i = 0; i < 30 && !(socket.lastPongAt > before); i += 1) await new Promise(resolve => setTimeout(resolve, 20));
      return socket.lastPongAt > before;
    })()`);
    assert.strictEqual(heartbeatRoundTrip, true, 'server must answer application heartbeat pings');

    const socketCloseLifecycle = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get(state.activeId);
      const currentSocket = entry.ws;
      const originalReconnect = reconnect;
      let reconnects = 0;
      reconnect = () => { reconnects += 1; };
      handleSocketClose(entry.session.id, currentSocket, { code: 4000 });
      await new Promise(resolve => setTimeout(resolve, 1100));
      const currentResult = { reconnects, retained: state.sessions.has(entry.session.id), status: entry.el.dataset.connectionStatus };
      setConnectionStatus(entry.session.id, 'live');
      reconnects = 0;
      handleSocketClose(entry.session.id, {}, { code: 4000 });
      await new Promise(resolve => setTimeout(resolve, 1100));
      const staleResult = { reconnects, retained: state.sessions.has(entry.session.id), status: entry.el.dataset.connectionStatus };
      entry.ws = {};
      setConnectionStatus(entry.session.id, 'live');
      currentSocket.onerror();
      const staleErrorStatus = entry.el.dataset.connectionStatus;
      setConnectionStatus(entry.session.id, 'offline');
      entry.lastPongAt = 111;
      currentSocket.onopen();
      currentSocket.onmessage({ data: JSON.stringify({ type: 'pong' }) });
      const staleEventResult = { status: entry.el.dataset.connectionStatus, lastPongAt: entry.lastPongAt };
      const delayedSocket = {};
      entry.ws = delayedSocket;
      reconnects = 0;
      handleSocketClose(entry.session.id, delayedSocket, { code: 1006 });
      entry.ws = { readyState: WebSocket.CONNECTING };
      await new Promise(resolve => setTimeout(resolve, 1100));
      const staleTimerReconnects = reconnects;
      entry.ws = currentSocket;
      reconnect = originalReconnect;
      return { currentResult, staleResult, staleErrorStatus, staleEventResult, staleTimerReconnects };
    })()`);

    assert.deepStrictEqual(socketCloseLifecycle, {
      currentResult: { reconnects: 0, retained: true, status: 'offline' },
      staleResult: { reconnects: 0, retained: true, status: 'live' },
      staleErrorStatus: 'live',
      staleEventResult: { status: 'offline', lastPongAt: 111 },
      staleTimerReconnects: 0
    }, 'current superseded websocket must stop; stale callbacks and delayed reconnect timers must not affect its newer replacement');

    await evalExpr(cdp, sid, `createPanel({ id: 'missing-session-probe', meta: { command: '/bin/bash', label: 'orphan probe', status: 'active', cols: 120, rows: 30 } })`);
    await waitEval(cdp, sid, `!state.sessions.has('missing-session-probe') && !document.getElementById('panel-missing-session-probe')`, 3000);

    const badEvents = cdp.events.filter(e => {
      if (e.method === 'Log.entryAdded') {
        const entry = e.params?.entry || {};
        if (entry.url?.endsWith('/favicon.ico') && entry.text?.includes('404')) return false;
        if (entry.url?.endsWith('/api/ui-state') && entry.text?.includes('409 (Conflict)')) return false;
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
    if (appServer) await appServer.close();
    try { execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore' }); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
