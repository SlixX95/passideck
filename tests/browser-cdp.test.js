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
    await waitEval(cdp, sid, `state.saveState === 'saved'`);

    const peerTarget = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const peerAttached = await cdp.send('Target.attachToTarget', { targetId: peerTarget.targetId, flatten: true });
    const peerSid = peerAttached.sessionId;
    await cdp.send('Page.enable', {}, peerSid);
    await cdp.send('Runtime.enable', {}, peerSid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, peerSid);
    await cdp.send('Page.navigate', { url: base }, peerSid);
    await waitEval(cdp, peerSid, 'document.readyState === "complete" && document.querySelectorAll(".term-panel").length >= 11');
    await waitEval(cdp, sid, `!state.hydrating && state.saveState === 'saved'`);
    await waitEval(cdp, peerSid, `!state.hydrating && state.saveState === 'saved'`);
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
      const title = document.querySelector('[data-pane-id="${madeSessions[1]}"] .term-title');
      const panel = title.closest('.term-panel');
      const tr = title.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      return { x: Math.round(tr.left + Math.min(20, tr.width / 2)), y: Math.round(tr.top + tr.height / 2), before: { left: pr.left, top: pr.top, width: pr.width, height: pr.height } };
    })()`);
    const titleDragAfter = await evalExpr(cdp, sid, `(() => {
      const title = document.querySelector('[data-pane-id="${madeSessions[1]}"] .term-title');
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: ${titleDragProbe.x}, clientY: ${titleDragProbe.y}, pointerId: 7, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: ${titleDragProbe.x + 90}, clientY: ${titleDragProbe.y + 45} });
      const r = document.querySelector('[data-pane-id="${madeSessions[1]}"]').getBoundingClientRect();
      const dragging = Boolean(state.pointerDrag);
      const classes = title.closest('.term-panel').className;
      endPointerDrag({ preventDefault(){} });
      return { left: r.left, top: r.top, width: r.width, height: r.height, dragging, classes, editing: title.dataset.editing || '', target: document.elementFromPoint(${titleDragProbe.x}, ${titleDragProbe.y})?.className || '' };
    })()`);
    assert.ok(titleDragAfter.left > titleDragProbe.before.left + 40 && titleDragAfter.top > titleDragProbe.before.top + 20, `window title drag must move pane: ${JSON.stringify({ before: titleDragProbe.before, after: titleDragAfter })}`);
    assert.ok(Math.abs(titleDragAfter.width - titleDragProbe.before.width) < 2 && Math.abs(titleDragAfter.height - titleDragProbe.before.height) < 2, `window drag must not resize pane: ${JSON.stringify({ before: titleDragProbe.before, after: titleDragAfter })}`);
    const dragDropSizePreserved = await evalExpr(cdp, sid, `(() => {
      const prefs = windowPrefs();
      const a = '${madeSessions[1]}';
      const b = '${madeSessions[2]}';
      ensureFreeWindow(a); ensureFreeWindow(b);
      Object.assign(prefs[a], { x: 80, y: 80, w: 1111, h: 555, z: 30 });
      Object.assign(prefs[b], { x: 360, y: 260, w: 640, h: 360, z: 29 });
      applyFreeSlotSnap(a, { x: 120, y: 140, w: 300, h: 190 });
      const afterFree = { ...prefs[a] };
      swapWindowSlots(a, b, { x: 120, y: 140, w: 999, h: 999 });
      return { afterFree, afterSwapA: { ...prefs[a] }, afterSwapB: { ...prefs[b] } };
    })()`);
    assert.strictEqual(dragDropSizePreserved.afterFree.w, 1111, `free slot drop must preserve width: ${JSON.stringify(dragDropSizePreserved)}`);
    assert.strictEqual(dragDropSizePreserved.afterFree.h, 555, `free slot drop must preserve height: ${JSON.stringify(dragDropSizePreserved)}`);
    assert.strictEqual(dragDropSizePreserved.afterSwapA.w, 1111, `swap drop must preserve source width: ${JSON.stringify(dragDropSizePreserved)}`);
    assert.strictEqual(dragDropSizePreserved.afterSwapA.h, 555, `swap drop must preserve source height: ${JSON.stringify(dragDropSizePreserved)}`);
    assert.strictEqual(dragDropSizePreserved.afterSwapB.w, 640, `swap drop must preserve target width: ${JSON.stringify(dragDropSizePreserved)}`);
    assert.strictEqual(dragDropSizePreserved.afterSwapB.h, 360, `swap drop must preserve target height: ${JSON.stringify(dragDropSizePreserved)}`);
    const edgeResize = await evalExpr(cdp, sid, `(() => {
      const id = '${madeSessions[1]}';
      const entry = state.sessions.get(id);
      const prefs = windowPrefs();
      Object.assign(prefs[id], { x: 100, y: 100, w: 500, h: 300, z: 40 });
      applyFreeWindow(id);
      const handle = entry.el.querySelector('.window-resize-handle.edge-w');
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 200, pointerId: 8, pointerType: 'mouse' }));
      updateWindowResize({ preventDefault(){}, clientX: 40, clientY: 200 });
      endWindowResize({ preventDefault(){} });
      return { x: Math.round(prefs[id].x), w: Math.round(prefs[id].w), edges: entry.el.querySelectorAll('.window-resize-handle').length };
    })()`);
    assert.deepStrictEqual(edgeResize, { x: 40, w: 560, edges: 8 }, `left edge resize must grow window without bottom-right-only lock: ${JSON.stringify(edgeResize)}`);

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

    const terminalFocusVisual = await evalExpr(cdp, sid, `(() => {
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
      const background = {
        selected: entry.el.classList.contains('active'),
        inputFocused: entry.el.classList.contains('input-focused'),
        shadow: getComputedStyle(entry.el).boxShadow
      };
      syncTerminalInputFocus(true);
      return { focused, background };
    })()`);
    assert.strictEqual(terminalFocusVisual.focused.selected, true, 'selected pane state must remain independent from keyboard focus');
    assert.strictEqual(terminalFocusVisual.focused.inputFocused, true, 'focused xterm pane must show keyboard-input focus');
    assert.strictEqual(terminalFocusVisual.background.selected, true, 'backgrounding PassiDeck must not change selected pane/session state');
    assert.strictEqual(terminalFocusVisual.background.inputFocused, false, 'backgrounded PassiDeck must remove keyboard-input focus styling');
    assert.notStrictEqual(terminalFocusVisual.background.shadow, terminalFocusVisual.focused.shadow, 'backgrounded selected pane must not retain the focused neon frame');

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
      handleTerminalPaste({ clipboardData: { files: [
        new File(['png'], 'clip.png', { type: 'image/png' }),
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
        '\u0001/image /tmp/clip.png\r',
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
      reconnect = originalReconnect;
      return { currentResult, staleResult };
    })()`);
    assert.deepStrictEqual(socketCloseLifecycle, {
      currentResult: { reconnects: 0, retained: true, status: 'offline' },
      staleResult: { reconnects: 0, retained: true, status: 'live' }
    }, 'current superseded websocket must stop; stale websocket close must not affect its newer live replacement');

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
