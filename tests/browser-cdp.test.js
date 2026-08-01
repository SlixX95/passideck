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
    const firstClientFeatures = execFileSync('tmux', ['-L', socket, 'display-message', '-p', '-t', firstTmux, '#{client_termfeatures}'], { encoding: 'utf8' }).trim().split(',');
    assert.ok(firstClientFeatures.includes('hyperlinks'), 'tmux clients must preserve OSC 8 link targets for the terminal renderer');
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
    const migratedDesktop = await evalExpr(cdp, sid, `(() => {
      const tabs = [...document.querySelectorAll('[data-desktop-id]')];
      const lastTab = tabs.at(-1)?.getBoundingClientRect();
      const add = document.getElementById('addDesktop')?.getBoundingClientRect();
      return {
        ids: state.panePrefs.desktopOrder || [],
        names: tabs.map(tab => tab.textContent.trim()),
        assignments: state.order.map(id => state.panePrefs.paneDesktop?.[id]),
        active: state.activeDesktopId,
        local: JSON.parse(sessionStorage.getItem('passideck:desktop-view:v1') || '{}').activeDesktopId,
        addGap: add && lastTab ? Math.round(add.left - lastTab.right) : null
      };
    })()`);
    assert.deepStrictEqual(migratedDesktop.ids, ['desktop-1'], 'legacy pane layout must migrate into one default desktop');
    assert.deepStrictEqual(migratedDesktop.names, ['1'], 'desktop switcher must use compact ordinal-only labels');
    assert.ok(migratedDesktop.addGap !== null && migratedDesktop.addGap <= 7, `add desktop must stay attached to the dynamic desktop tab group, gap=${migratedDesktop.addGap}`);
    assert.ok(migratedDesktop.assignments.every(id => id === 'desktop-1'), 'legacy panes must remain assigned to Desktop 1');
    assert.strictEqual(migratedDesktop.active, 'desktop-1', 'default desktop must become locally active');
    assert.strictEqual(migratedDesktop.local, 'desktop-1', 'active desktop must persist locally, not in shared UI state');
    const localPerformanceMode = await evalExpr(cdp, sid, `(() => {
      const key = 'passideck:performance-mode';
      const previousStored = localStorage.getItem(key);
      const previousMode = state.performanceMode;
      const previousRevision = state.uiRevision;
      const previousBaseline = structuredClone(state.lastUiState);
      try {
        localStorage.removeItem(key);
        loadPerformanceMode(undefined);
        const unavailable = {
          stored: localStorage.getItem(key),
          mode: state.performanceMode
        };
        loadPerformanceMode(true);
        const migrated = { stored: localStorage.getItem(key), mode: state.performanceMode };
        setPerformanceMode(true);
        const remote = structuredClone(uiPayload());
        remote.revision = state.uiRevision + 1;
        remote.performanceMode = false;
        applyAuthoritativeUiState(remote, { force: true });
        const afterRemote = state.performanceMode;
        window.dispatchEvent(new StorageEvent('storage', {
          key,
          newValue: 'off',
          storageArea: localStorage
        }));
        const afterSiblingTab = state.performanceMode;
        window.dispatchEvent(new StorageEvent('storage', {
          key,
          newValue: 'on',
          storageArea: localStorage
        }));
        setPerformanceMode(false, { persist: false });
        loadPerformanceMode(false);
        return {
          stored: localStorage.getItem(key),
          afterRemote,
          afterSiblingTab,
          afterReload: state.performanceMode,
          selected: document.getElementById('performanceModeSelect').value,
          shared: Object.hasOwn(uiPayload(), 'performanceMode'),
          migrated,
          unavailable
        };
      } finally {
        state.uiRevision = previousRevision;
        state.lastUiState = previousBaseline;
        setPerformanceMode(previousMode, { persist: false });
        if (previousStored === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previousStored);
      }
    })()`);
    assert.deepStrictEqual(localPerformanceMode, {
      stored: 'on',
      afterRemote: true,
      afterSiblingTab: false,
      afterReload: true,
      selected: 'on',
      shared: false,
      migrated: { stored: 'on', mode: true },
      unavailable: { stored: null, mode: false }
    }, 'Performance mode must persist per browser profile/backend origin and ignore shared UI updates from stale or different clients');
    const modernDesktopIgnoresLegacy = await evalExpr(cdp, sid, `(() => {
      const snapshot = structuredClone(state.panePrefs);
      loadPanePrefs({
        order: ['pane-modern'],
        minimized: ['stale-pane'],
        windows: { desktop: { 'stale-pane': { x: 1, y: 1, w: 300, h: 200, z: 1 } } },
        viewport: { w: 300, h: 200 },
        desktopOrder: ['survivor'],
        paneDesktop: { 'pane-modern': 'survivor' },
        desktops: { survivor: { name: 'Survivor', minimized: [], windows: { 'pane-modern': { x: 20, y: 30, w: 700, h: 500, z: 2 } }, viewport: { w: 1400, h: 850 } } }
      });
      const survivor = structuredClone(state.panePrefs.desktops.survivor);
      loadPanePrefs(snapshot);
      return survivor;
    })()`);
    assert.deepStrictEqual(modernDesktopIgnoresLegacy, { name: 'Survivor', minimized: [], windows: { 'pane-modern': { x: 20, y: 30, w: 700, h: 500, z: 2 } }, viewport: { w: 1400, h: 850 } }, 'modern desktop state must never be overwritten by stale legacy mirrors after deleting the original first desktop');
    const mergedConcurrentDesktops = await evalExpr(cdp, sid, `(() => {
      const desktop = name => ({ name, minimized: [], windows: {}, viewport: null });
      const baseState = { revision: 1, panePrefs: { desktopOrder: ['one', 'two'], paneDesktop: { p1: 'one', p2: 'two' }, desktops: { one: desktop('One'), two: desktop('Two') } } };
      const local = structuredClone(baseState);
      local.panePrefs.desktopOrder = ['two', 'local'];
      delete local.panePrefs.desktops.one;
      delete local.panePrefs.paneDesktop.p1;
      local.panePrefs.desktops.local = desktop('Local');
      local.panePrefs.paneDesktop.pLocal = 'local';
      const remote = structuredClone(baseState);
      remote.revision = 2;
      remote.panePrefs.desktopOrder.push('remote');
      remote.panePrefs.desktops.two.name = 'Two renamed remotely';
      remote.panePrefs.desktops.remote = desktop('Remote');
      remote.panePrefs.paneDesktop.pRemote = 'remote';
      const merged = mergeUiChanges(baseState, local, remote);
      return {
        order: merged.panePrefs.desktopOrder,
        names: Object.fromEntries(Object.entries(merged.panePrefs.desktops).map(([id, value]) => [id, value.name])),
        assignments: merged.panePrefs.paneDesktop
      };
    })()`);
    assert.deepStrictEqual(mergedConcurrentDesktops, {
      order: ['two', 'local', 'remote'],
      names: { two: 'Two renamed remotely', local: 'Local', remote: 'Remote' },
      assignments: { p2: 'two', pLocal: 'local', pRemote: 'remote' }
    }, '409 replay must preserve independent remote edits/additions while applying local additions and deletions');
    const repeatedConflictReplay = await evalExpr(cdp, sid, `(async () => {
      const originalApi = api;
      const snapshot = { prefs: structuredClone(state.panePrefs), revision: state.uiRevision, baseline: structuredClone(state.lastUiState) };
      const desktop = name => ({ name, minimized: [], windows: {}, viewport: null });
      const baseState = structuredClone(uiPayload());
      state.lastUiState = structuredClone(baseState);
      state.panePrefs.desktops['retry-local'] = desktop('Retry local');
      state.panePrefs.desktopOrder.push('retry-local');
      let remote = structuredClone(baseState);
      let puts = 0;
      api = async (method, path, body) => {
        puts += 1;
        if (puts <= 3) {
          const id = 'retry-remote-' + puts;
          remote.panePrefs.desktops[id] = desktop('Retry remote ' + puts);
          remote.panePrefs.desktopOrder.push(id);
          remote.revision += 1;
          const error = new Error('conflict');
          error.status = 409;
          error.data = structuredClone(remote);
          throw error;
        }
        return { ...structuredClone(body), revision: remote.revision + 1 };
      };
      saveUiState();
      for (let i = 0; i < 40 && (puts < 4 || uiSavePending()); i += 1) await new Promise(resolve => setTimeout(resolve, 50));
      const result = { puts, pending: uiSavePending(), ids: state.panePrefs.desktopOrder.filter(id => id.startsWith('retry-')) };
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      state.saveInFlight = 0;
      api = originalApi;
      state.uiRevision = snapshot.revision;
      state.lastUiState = snapshot.baseline;
      loadPanePrefs(snapshot.prefs);
      renderSwitcher();
      return result;
    })()`);
    assert.deepStrictEqual(repeatedConflictReplay, { puts: 4, pending: false, ids: ['retry-local', 'retry-remote-1', 'retry-remote-2', 'retry-remote-3'] }, 'three consecutive 409 responses must retain local changes and retry them against every remote revision');
    const serializedSaves = await evalExpr(cdp, sid, `(async () => {
      const originalApi = api;
      const snapshot = { prefs: structuredClone(state.panePrefs), revision: state.uiRevision, baseline: structuredClone(state.lastUiState), queued: state.saveQueued };
      const targetId = state.panePrefs.desktopOrder[0];
      const baseState = structuredClone(uiPayload());
      state.lastUiState = structuredClone(baseState);
      let releaseFirst;
      const firstGate = new Promise(resolve => { releaseFirst = resolve; });
      let puts = 0;
      let concurrent = 0;
      let maxConcurrent = 0;
      api = async (_method, _path, body) => {
        puts += 1;
        const call = puts;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        if (call === 1) await firstGate;
        concurrent -= 1;
        return { ...structuredClone(body), revision: state.uiRevision + call + 10 };
      };
      state.panePrefs.desktops[targetId].name = 'Serialized first';
      saveUiState();
      for (let i = 0; i < 20 && puts < 1; i += 1) await new Promise(resolve => setTimeout(resolve, 25));
      state.panePrefs.desktops[targetId].name = 'Serialized latest';
      saveUiState();
      await new Promise(resolve => setTimeout(resolve, 250));
      const putsBeforeRelease = puts;
      releaseFirst();
      for (let i = 0; i < 60 && (puts < 2 || uiSavePending()); i += 1) await new Promise(resolve => setTimeout(resolve, 25));
      const result = { putsBeforeRelease, puts, maxConcurrent, revision: state.uiRevision, savedName: state.lastUiState?.panePrefs?.desktops?.[targetId]?.name };
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      state.saveInFlight = 0;
      state.saveQueued = snapshot.queued;
      api = originalApi;
      state.uiRevision = snapshot.revision;
      state.lastUiState = snapshot.baseline;
      loadPanePrefs(snapshot.prefs);
      renderSwitcher();
      return result;
    })()`);
    assert.deepStrictEqual(serializedSaves, { putsBeforeRelease: 1, puts: 2, maxConcurrent: 1, revision: serializedSaves.revision, savedName: 'Serialized latest' }, 'UI saves must serialize so a delayed older response cannot regress the baseline or overlap a newer save');
    const unloadDraft = await evalExpr(cdp, sid, `(() => {
      const originalFetch = window.fetch;
      const targetId = state.panePrefs.desktopOrder[0];
      const originalName = state.panePrefs.desktops[targetId].name;
      let fetches = 0;
      window.fetch = () => { fetches += 1; return Promise.resolve({ ok: true }); };
      state.panePrefs.desktops[targetId].name = 'Unload latest';
      persistUiDraft();
      state.saveInFlight = 1;
      state.saveQueued = true;
      flushUiState();
      const draft = readUiDraft();
      const result = { fetches, savedName: draft?.local?.panePrefs?.desktops?.[targetId]?.name, hasBase: Boolean(draft?.base) };
      state.saveInFlight = 0;
      state.saveQueued = false;
      state.panePrefs.desktops[targetId].name = originalName;
      clearUiDraft();
      window.fetch = originalFetch;
      return result;
    })()`);
    assert.deepStrictEqual(unloadDraft, { fetches: 0, savedName: 'Unload latest', hasBase: true }, 'unload during an in-flight save must preserve the newest state as a recoverable local draft instead of racing a stale revision');
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
      const previousWindows = structuredClone(activeDesktop().windows);
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
      activeDesktop().windows = previousWindows;
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
    const savedRect = savedUi.panePrefs?.desktops?.['desktop-1']?.windows?.[madeSessions[0]];
    assert.ok(savedRect && savedRect.x > clampedWindow.grid.width && savedRect.y > clampedWindow.grid.height && savedRect.w === 1600 && savedRect.h === 900, `local viewport clamp must not rewrite authoritative server geometry: ${JSON.stringify(savedRect)}`);

    const zRollover = await evalExpr(cdp, sid, `(() => {
      const ids = ${JSON.stringify(madeSessions.slice(0, 4))};
      const prefs = windowPrefs();
      const savedPrefs = structuredClone(prefs);
      const savedZCounter = state.zCounter;
      const persistPanePrefs = savePanePrefs;
      try {
        savePanePrefs = () => {};
        Object.values(prefs).forEach((rect, index) => { rect.z = 20 + index; });
        prefs[ids[0]].z = 9997;
        prefs[ids[1]].z = 9998;
        prefs[ids[2]].z = 9999;
        state.zCounter = 9999;
        bringWindowToFront(ids[0]);
        const boundedValues = Object.values(prefs).map(rect => Number(rect.z));
        const bounded = {
          focusedIsMax: prefs[ids[0]].z === Math.max(...boundedValues),
          allValid: boundedValues.every(z => Number.isFinite(z) && z >= 1 && z <= 9999),
          preservedOrder: prefs[ids[1]].z < prefs[ids[2]].z
        };

        Object.values(prefs).forEach((rect, index) => { rect.z = 20 + index; });
        prefs[ids[3]].z = 10000;
        state.zCounter = 10;
        bringWindowToFront(ids[0]);
        const invalidValues = Object.values(prefs).map(rect => Number(rect.z));
        const invalid = {
          focusedIsMax: prefs[ids[0]].z === Math.max(...invalidValues),
          allValid: invalidValues.every(z => Number.isFinite(z) && z >= 1 && z <= 9999),
          preservedOrder: prefs[ids[1]].z < prefs[ids[2]].z
        };
        return { bounded, invalid };
      } finally {
        savePanePrefs = persistPanePrefs;
        state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
        state.zCounter = savedZCounter;
        restorePanelOrder();
      }
    })()`);
    assert.deepStrictEqual(
      zRollover,
      {
        bounded: { focusedIsMax: true, allValid: true, preservedOrder: true },
        invalid: { focusedIsMax: true, allValid: true, preservedOrder: true }
      },
      `z-order rollover must compact both bounded and legacy out-of-range values while preserving order: ${JSON.stringify(zRollover)}`
    );

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
      const expectedEmpty = { x: 0, y: 0, w: grid.width / 2, h: grid.height };
      state.panePrefs.desktops[state.activeDesktopId].windows = before;
      state.minimized = beforeMinimized;
      return { free, expected: { x: cell.w * 2, y: cell.h, w: cell.w, h: cell.h }, emptyDesktop, expectedEmpty };
    })()`);
    assert.ok(sixSlotAutoPlacement.free, `new window must find the open bottom-right cell in a 3x2 desktop: ${JSON.stringify(sixSlotAutoPlacement)}`);
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(sixSlotAutoPlacement.free[key] - sixSlotAutoPlacement.expected[key]) < 2, `3x2 auto-placement ${key} mismatch: ${JSON.stringify(sixSlotAutoPlacement)}`);
      assert.ok(Math.abs(sixSlotAutoPlacement.emptyDesktop[key] - sixSlotAutoPlacement.expectedEmpty[key]) < 2, `first-window placement ${key} must keep existing default: ${JSON.stringify(sixSlotAutoPlacement)}`);
    }

    const desktopEdgeFill = await evalExpr(cdp, sid, `(() => {
      const id = state.order[0];
      const prefs = windowPrefs();
      const beforeRect = structuredClone(prefs[id]);
      const desktop = activeDesktop();
      const beforeViewport = structuredClone(desktop.viewport);
      const beforeBridge = window.passideckDesktop;
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const stored = { x: 0, y: 0, w: grid.width - 12, h: grid.height - 6, z: 42 };
      window.passideckDesktop = { isDesktop: true, platform: 'win32' };
      desktop.viewport = { w: stored.w, h: stored.h };
      prefs[id] = structuredClone(stored);
      applyFreeWindow(id);
      const panel = state.sessions.get(id).el.getBoundingClientRect();
      const result = {
        right: panel.right - grid.left,
        bottom: panel.bottom - grid.top,
        grid: { w: grid.width, h: grid.height },
        stored: structuredClone(prefs[id])
      };
      prefs[id] = beforeRect;
      desktop.viewport = beforeViewport;
      if (beforeBridge === undefined) delete window.passideckDesktop;
      else window.passideckDesktop = beforeBridge;
      applyFreeWindow(id);
      return result;
    })()`);
    assert.ok(Math.abs(desktopEdgeFill.right - desktopEdgeFill.grid.w) < 2, `desktop right-edge pane must visually reach the Electron app edge without rewriting shared geometry: ${JSON.stringify(desktopEdgeFill)}`);
    assert.ok(Math.abs(desktopEdgeFill.bottom - desktopEdgeFill.grid.h) < 2, `desktop bottom-edge pane must visually reach the Electron app edge without rewriting shared geometry: ${JSON.stringify(desktopEdgeFill)}`);
    assert.deepStrictEqual(desktopEdgeFill.stored, { x: 0, y: 0, w: desktopEdgeFill.grid.w - 12, h: desktopEdgeFill.grid.h - 6, z: 42 }, 'Electron edge fill must remain renderer-local and preserve authoritative stored geometry');

    const desktopResizeEdges = await evalExpr(cdp, sid, `(() => {
      const beforeBridge = window.passideckDesktop;
      const calls = [];
      window.passideckDesktop = {
        isDesktop: true,
        platform: 'win32',
        windowResize: (phase, value) => calls.push({ phase, direction: value?.direction })
      };
      installDesktopWindowResizeHandles();
      const wrap = document.getElementById('desktopWindowResizeHandles');
      const right = wrap.querySelector('[data-app-resize="right"]');
      right.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 71, screenX: 100, screenY: 100 }));
      right.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 71, screenX: 108, screenY: 100 }));
      right.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 71, screenX: 108, screenY: 100 }));
      const result = { count: wrap.children.length, calls };
      wrap.remove();
      if (beforeBridge === undefined) delete window.passideckDesktop;
      else window.passideckDesktop = beforeBridge;
      return result;
    })()`);
    assert.strictEqual(desktopResizeEdges.count, 5, 'edge-filling Windows backend view must retain left/right/bottom and bottom-corner resize hit areas');
    assert.deepStrictEqual(desktopResizeEdges.calls, [
      { phase: 'start', direction: 'right' },
      { phase: 'move' },
      { phase: 'end' }
    ], 'backend edge drag must keep the existing native window-resize IPC sequence');

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
    const addDesktopReady = await evalExpr(cdp, sid, `(() => ({ count: state.panePrefs.desktopOrder.length, disabled: document.getElementById('addDesktop').disabled, max: MAX_DESKTOPS }))()`);
    assert.deepStrictEqual(addDesktopReady, { count: 1, disabled: false, max: 3 }, 'add desktop must stay enabled below the three-desktop limit');
    await evalExpr(cdp, sid, `document.getElementById('addDesktop').click()`);
    await sleep(250);
    const desktopCreation = await evalExpr(cdp, sid, `(() => ({
      count: state.panePrefs.desktopOrder.length,
      active: state.activeDesktopId,
      name: activeDesktop().name,
      visiblePanels: [...document.querySelectorAll('.term-panel:not(.layout-hidden)')].length,
      local: localDesktopView().activeDesktopId
    }))()`);
    assert.strictEqual(desktopCreation.count, 2, 'Add desktop must create one shared desktop');
    assert.strictEqual(desktopCreation.name, 'Desktop 2', 'new desktops need a predictable default name');
    const desktopPresentation = await evalExpr(cdp, sid, `(() => {
      const firstId = state.panePrefs.desktopOrder[0];
      const waitingPaneId = state.order.find(id => state.panePrefs.paneDesktop[id] === firstId);
      state.sessions.get(waitingPaneId).responseAttention = true;
      renderDesktops();
      const tabs = [...document.querySelectorAll('.desktop-tab')];
      const active = tabs.find(tab => tab.classList.contains('active'));
      const waiting = tabs.find(tab => tab.classList.contains('attention'));
      const activeStyle = getComputedStyle(active);
      const waitingStyle = getComputedStyle(waiting);
      const result = {
        labels: tabs.map(tab => tab.textContent.trim()),
        maxWidth: Math.max(...tabs.map(tab => Math.round(tab.getBoundingClientRect().width))),
        activeLabel: active?.textContent.trim(),
        activeSelected: active?.getAttribute('aria-selected'),
        activeCurrent: active?.getAttribute('aria-current'),
        activeWeight: activeStyle.fontWeight,
        activeAnimation: activeStyle.animationName,
        waitingLabel: waiting?.textContent.trim(),
        waitingAnimation: waitingStyle.animationName,
        distinctBackground: activeStyle.backgroundColor !== waitingStyle.backgroundColor,
        renameHint: tabs.some(tab => tab.dataset.tooltip?.includes('rename'))
      };
      state.sessions.get(waitingPaneId).responseAttention = false;
      renderDesktops();
      return result;
    })()`);
    assert.deepStrictEqual(desktopPresentation, {
      labels: ['1', '2'], maxWidth: 29, activeLabel: '2', activeSelected: 'true', activeCurrent: 'page',
      activeWeight: '900', activeAnimation: 'none', waitingLabel: '1', waitingAnimation: 'desktop-response-pulse',
      distinctBackground: true, renameHint: false
    }, 'compact desktop ordinals must keep the current desktop solid and unmistakable while another desktop pulses for attention');
    assert.strictEqual(desktopCreation.active, desktopCreation.local, 'new desktop must become active only in this client');
    assert.strictEqual(desktopCreation.visiblePanels, 0, 'new desktop must start empty without stopping existing panes');
    await waitEval(cdp, peerSid, `state.panePrefs.desktopOrder.length === 2`);
    const peerDesktopSelection = await evalExpr(cdp, peerSid, `(() => ({ active: state.activeDesktopId, visiblePanels: [...document.querySelectorAll('.term-panel:not(.layout-hidden)')].length }))()`);
    assert.strictEqual(peerDesktopSelection.active, 'desktop-1', 'shared desktop updates must not switch another client locally');
    assert.ok(peerDesktopSelection.visiblePanels > 0, 'another client must keep rendering its locally selected desktop');
    const desktopLimit = await evalExpr(cdp, sid, `(() => {
      const prefs = structuredClone(state.panePrefs);
      const active = state.activeDesktopId;
      const wasHydrating = state.hydrating;
      state.hydrating = true;
      createDesktop();
      createDesktop();
      renderDesktops();
      const result = { count: state.panePrefs.desktopOrder.length, addDisabled: document.getElementById('addDesktop').disabled };
      loadPanePrefs(prefs);
      state.activeDesktopId = active;
      state.hydrating = wasHydrating;
      saveLocalDesktopView();
      renderSwitcher();
      return result;
    })()`);
    assert.deepStrictEqual(desktopLimit, { count: 3, addDisabled: true }, 'desktop creation must stop at the initial maximum of three');

    const firstDesktopDeletion = await evalExpr(cdp, sid, `(() => {
      const removedId = 'desktop-1';
      const remainingId = '${desktopCreation.active}';
      const blocker = '${madeSessions[1]}';
      const blockerRect = { x: 27, y: 31, w: 530, h: 410, z: 707 };
      const saved = {
        panePrefs: structuredClone(state.panePrefs),
        activeDesktopId: state.activeDesktopId,
        activeId: state.activeId,
        minimized: [...state.minimized],
        responsiveMinimized: [...state.responsiveMinimized],
        zCounter: state.zCounter,
        savePanePrefs
      };
      let result;
      try {
        savePanePrefs = () => {};
        state.panePrefs.paneDesktop[blocker] = remainingId;
        delete state.panePrefs.desktops[removedId].windows[blocker];
        state.panePrefs.desktops[remainingId].windows = { [blocker]: { ...blockerRect } };
        state.panePrefs.desktops[remainingId].minimized = [];
        performDeleteDesktop(removedId);
        const remaining = state.panePrefs.desktops[remainingId];
        const prefs = windowPrefs();
        result = {
          removed: !state.panePrefs.desktops[removedId],
          first: state.panePrefs.desktopOrder[0],
          allMoved: state.order.every(id => state.panePrefs.paneDesktop[id] === remainingId),
          blocker: prefs[blocker] ? { ...prefs[blocker] } : null,
          blockerExpected: blockerRect
        };
      } finally {
        state.panePrefs = saved.panePrefs;
        state.activeDesktopId = saved.activeDesktopId;
        state.activeId = saved.activeId;
        state.minimized = new Set(saved.minimized);
        state.responsiveMinimized = new Set(saved.responsiveMinimized);
        state.zCounter = saved.zCounter;
        savePanePrefs = saved.savePanePrefs;
        for (const [id, entry] of state.sessions) {
          entry.el.classList.toggle('active', id === state.activeId);
          entry.el.classList.toggle('minimized', state.minimized.has(id));
        }
        applyLayoutVisibility();
        renderSwitcher();
      }
      return result;
    })()`);
    assert.deepStrictEqual(
      { removed: firstDesktopDeletion.removed, first: firstDesktopDeletion.first, allMoved: firstDesktopDeletion.allMoved },
      { removed: true, first: desktopCreation.active, allMoved: true },
      `deleting the first desktop must promote the surviving desktop: ${JSON.stringify(firstDesktopDeletion)}`
    );
    assert.deepStrictEqual(firstDesktopDeletion.blocker, firstDesktopDeletion.blockerExpected, `promoting a desktop must preserve its existing window geometry: ${JSON.stringify(firstDesktopDeletion)}`);
    await evalExpr(cdp, sid, `document.querySelector('[data-desktop-id="desktop-1"]').click()`);
    await waitEval(cdp, sid, `state.activeDesktopId === 'desktop-1'`);
    const desktopMoveChoices = await evalExpr(cdp, sid, `(() => {
      state.sessions.get('${madeSessions[0]}').el.querySelector('.arrange').click();
      return [...document.querySelectorAll('#layoutAssist [data-target-desktop-id]')].map(button => button.textContent.trim());
    })()`);
    assert.deepStrictEqual(desktopMoveChoices, ['Move to Desktop 2'], 'Arrange menu must offer every other desktop as a move target');
    const movedPane = await evalExpr(cdp, sid, `(async () => {
      document.querySelector('#layoutAssist [data-target-desktop-id]').click();
      await new Promise(resolve => setTimeout(resolve, 200));
      const entry = state.sessions.get('${madeSessions[0]}');
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const target = state.panePrefs.desktops['${desktopCreation.active}'];
      const rect = target.windows['${madeSessions[0]}'];
      return {
        desktopId: state.panePrefs.paneDesktop['${madeSessions[0]}'],
        sourceVisible: !entry.el.classList.contains('layout-hidden'),
        socketLive: entry.el.dataset.connectionStatus === 'live',
        rect: { ...rect },
        expected: { x: 0, y: 0, w: grid.width / 2, h: grid.height },
        frontmost: rect.z === Math.max(...Object.values(target.windows).map(value => Number(value.z) || 0))
      };
    })()`);
    assert.strictEqual(movedPane.desktopId, desktopCreation.active, 'move action must assign the pane to the target desktop');
    assert.strictEqual(movedPane.sourceVisible, false, 'moved pane must disappear from the source desktop');
    assert.strictEqual(movedPane.socketLive, true, 'moving a pane must not reconnect or stop its terminal session');
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(movedPane.rect[key] - movedPane.expected[key]) < 2, `moving into an empty desktop must use its first free slot (${key}): ${JSON.stringify(movedPane)}`);
    }
    assert.strictEqual(movedPane.frontmost, true, `a moved pane must enter the target desktop in front: ${JSON.stringify(movedPane)}`);
    await waitEval(cdp, sid, `state.saveTimer === null && state.panePrefs.paneDesktop['${madeSessions[0]}'] === '${desktopCreation.active}'`);
    await waitEval(cdp, peerSid, `state.panePrefs.paneDesktop['${madeSessions[0]}'] === '${desktopCreation.active}'`);

    const occupiedDesktopMove = await evalExpr(cdp, sid, `(() => {
      const mover = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const targetId = '${desktopCreation.active}';
      const sourceId = 'desktop-1';
      const saved = {
        panePrefs: structuredClone(state.panePrefs),
        activeDesktopId: state.activeDesktopId,
        activeId: state.activeId,
        minimized: [...state.minimized],
        responsiveMinimized: [...state.responsiveMinimized],
        zCounter: state.zCounter,
        savePanePrefs
      };
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const expectedSize = defaultWindowSize();
      const blockerZ = [801, 802];
      let result;
      try {
        savePanePrefs = () => {};
        const source = state.panePrefs.desktops[sourceId];
        const target = state.panePrefs.desktops[targetId];
        state.panePrefs.paneDesktop[mover] = sourceId;
        state.panePrefs.paneDesktop['${madeSessions[0]}'] = sourceId;
        blockers.forEach(id => { state.panePrefs.paneDesktop[id] = targetId; });
        source.windows[mover] = { x: grid.width - 360, y: grid.height - 240, w: 360, h: 240, z: 3 };
        target.windows = {
          'stale-window': { x: 12, y: 12, w: 40, h: 40, z: 800 },
          [blockers[0]]: { x: 0, y: 0, w: grid.width / 2, h: grid.height, z: blockerZ[0] },
          [blockers[1]]: { x: grid.width / 2, y: 0, w: grid.width / 2, h: grid.height, z: blockerZ[1] }
        };
        target.minimized = [];
        movePaneToDesktop(mover, targetId);
        const rect = { ...target.windows[mover] };
        selectDesktop(targetId);
        const offset = blockers.length * 34;
        result = {
          rect,
          expected: {
            x: Math.max(0, Math.min(grid.width - 120, 24 + offset)),
            y: Math.max(0, Math.min(grid.height - 80, 24 + offset)),
            ...expectedSize
          },
          frontmost: rect.z > Math.max(...blockerZ),
          selected: state.activeId === mover
        };
      } finally {
        state.panePrefs = saved.panePrefs;
        state.activeDesktopId = saved.activeDesktopId;
        state.activeId = saved.activeId;
        state.minimized = new Set(saved.minimized);
        state.responsiveMinimized = new Set(saved.responsiveMinimized);
        state.zCounter = saved.zCounter;
        savePanePrefs = saved.savePanePrefs;
        for (const [id, entry] of state.sessions) {
          entry.el.classList.toggle('active', id === state.activeId);
          entry.el.classList.toggle('minimized', state.minimized.has(id));
        }
        applyLayoutVisibility();
        renderSwitcher();
      }
      return result;
    })()`);
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(occupiedDesktopMove.rect[key] - occupiedDesktopMove.expected[key]) < 2, `a full target desktop must use new-window fallback geometry (${key}): ${JSON.stringify(occupiedDesktopMove)}`);
    }
    assert.deepStrictEqual(
      { frontmost: occupiedDesktopMove.frontmost, selected: occupiedDesktopMove.selected },
      { frontmost: true, selected: true },
      `fallback placement must be frontmost and selected when the target desktop opens: ${JSON.stringify(occupiedDesktopMove)}`
    );
    const desktopLayoutIsolation = await evalExpr(cdp, sid, `(() => ({
      foreignIncluded: visibleWindowIds().includes('${madeSessions[0]}'),
      allLocal: visibleWindowIds().every(id => state.panePrefs.paneDesktop[id] === state.activeDesktopId)
    }))()`);
    assert.deepStrictEqual(desktopLayoutIsolation, { foreignIncluded: false, allLocal: true }, 'layout and drag helpers must only include panes on the active desktop');
    const crossDesktopActive = await evalExpr(cdp, sid, `(() => {
      const foreignId = '${madeSessions[0]}';
      const wasHydrating = state.hydrating;
      state.hydrating = true;
      selectAuthoritativePane(foreignId);
      state.hydrating = wasHydrating;
      applyLayoutVisibility();
      const activeBeforeDirectCalls = state.activeId;
      selectPanel(foreignId);
      restorePanel(foreignId);
      return {
        selectedForeignPane: state.activeId === foreignId,
        directCallsIgnored: state.activeId === activeBeforeDirectCalls,
        hidden: state.sessions.get(foreignId).el.classList.contains('layout-hidden'),
        pollutedCurrentGeometry: Boolean(windowPrefs()[foreignId]),
        fallbackLocal: state.panePrefs.paneDesktop[nextActivePaneId()] === state.activeDesktopId
      };
    })()`);
    assert.deepStrictEqual(
      crossDesktopActive,
      { selectedForeignPane: false, directCallsIgnored: true, hidden: true, pollutedCurrentGeometry: false, fallbackLocal: true },
      'authoritative, direct-select and restore paths must never select or create geometry for a pane on another local desktop'
    );
    await evalExpr(cdp, sid, `(() => { movePaneToDesktop('${madeSessions[0]}', 'desktop-1'); selectDesktop('desktop-1'); })()`);
    await waitEval(cdp, sid, `state.panePrefs.paneDesktop['${madeSessions[0]}'] === 'desktop-1' && state.activeDesktopId === 'desktop-1' && state.saveTimer === null`);
    const desktopShortcuts = await evalExpr(cdp, sid, `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      const direct = state.activeDesktopId;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      const previous = state.activeDesktopId;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      const next = state.activeDesktopId;
      selectDesktop('desktop-1');
      return { direct, previous, next };
    })()`);
    assert.deepStrictEqual(desktopShortcuts, { direct: desktopCreation.active, previous: 'desktop-1', next: desktopCreation.active }, 'Alt/Option+Shift desktop shortcuts must support direct and cyclic switching');
    const renameDisabled = await evalExpr(cdp, sid, `(async () => {
      selectDesktop('desktop-1');
      const tab = document.querySelector('[data-desktop-id="${desktopCreation.active}"]');
      tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 220));
      return { input: Boolean(document.querySelector('.desktop-rename')), name: state.panePrefs.desktops['${desktopCreation.active}']?.name };
    })()`);
    assert.deepStrictEqual(renameDisabled, { input: false, name: 'Desktop 2' }, 'desktop ordinal buttons must not expose rename interaction');
    const attentionStability = await evalExpr(cdp, sid, `(() => {
      const activeId = state.activeId;
      const pingId = desktopPaneIds().find(id => id !== activeId) || activeId;
      state.sessions.get(activeId)?.term.focus();
      const focused = document.activeElement;
      const revision = state.uiRevision;
      const baseline = structuredClone(state.lastUiState);
      const remote = structuredClone(uiPayload());
      remote.revision = revision + 1;
      remote.activeId = pingId;
      applyAuthoritativeUiState(remote);
      const authoritativeStable = state.activeId === activeId && document.activeElement === focused;
      const desktopTab = document.querySelector('[data-desktop-id="desktop-1"]');
      const sessionTab = document.querySelector('[data-switcher-pane-id="' + pingId + '"]');
      pulsePaneTitlebar(pingId);
      const result = {
        activeStable: state.activeId === activeId,
        focusStable: document.activeElement === focused,
        authoritativeStable,
        desktopDomStable: document.querySelector('[data-desktop-id="desktop-1"]') === desktopTab,
        sessionDomStable: document.querySelector('[data-switcher-pane-id="' + pingId + '"]') === sessionTab,
        marked: sessionTab?.classList.contains('response-pulse') === true
      };
      clearResponseAttention(pingId);
      state.uiRevision = revision;
      state.lastUiState = baseline;
      return result;
    })()`);
    assert.deepStrictEqual(attentionStability, { activeStable: true, focusStable: true, authoritativeStable: true, desktopDomStable: true, sessionDomStable: true, marked: true }, 'background response attention and incoming shared state must not replace or refocus the active local chat UI');
    const desktopLifecycle = await evalExpr(cdp, sid, `(async () => {
      const target = '${desktopCreation.active}';
      const beforeSessions = state.sessions.size;
      const renamed = state.panePrefs.desktops[target]?.name;
      movePaneToDesktop('${madeSessions[0]}', target);
      state.sessions.get('${madeSessions[0]}').responseAttention = true;
      renderSwitcher();
      const attention = document.querySelector('[data-desktop-id="' + target + '"]').classList.contains('attention');
      state.sessions.get('${madeSessions[0]}').responseAttention = false;
      document.querySelector('[data-desktop-id="' + target + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
      const modal = document.getElementById('closeModal');
      const confirmation = {
        open: modal.classList.contains('open') && !modal.hidden,
        title: document.getElementById('closeModalTitle').textContent,
        text: document.getElementById('closeModalText').textContent,
        action: document.getElementById('closeModalConfirm').textContent
      };
      document.getElementById('closeModalConfirm').click();
      await new Promise(resolve => setTimeout(resolve, 220));
      return {
        renamed,
        removed: !state.panePrefs.desktops[target],
        paneDesktop: state.panePrefs.paneDesktop['${madeSessions[0]}'],
        attention,
        sessionsUnchanged: state.sessions.size === beforeSessions,
        confirmation
      };
    })()`);
    assert.deepStrictEqual(desktopLifecycle, {
      renamed: 'Desktop 2',
      removed: true,
      paneDesktop: 'desktop-1',
      attention: true,
      sessionsUnchanged: true,
      confirmation: { open: true, title: 'Delete desktop?', text: '1 window will be moved to another desktop.', action: 'Delete' }
    }, 'desktop deletion must use the themed confirmation modal, preserve panes and surface hidden-desktop response attention');
    await waitEval(cdp, sid, `state.saveTimer === null && state.panePrefs.desktopOrder.length === 1`);
    await waitEval(cdp, peerSid, `state.panePrefs.desktopOrder.length === 1`);
    const launchDesktop = await evalExpr(cdp, sid, `(async () => {
      state.panePrefs.desktops['desktop-1'].name = 'Work';
      renderDesktops();
      document.getElementById('addDesktop').click();
      const target = state.activeDesktopId;
      const defaultName = state.panePrefs.desktops[target].name;
      const renameUnavailable = !document.querySelector('.desktop-rename');
      const before = new Set(state.order);
      await launch('/bin/bash');
      const id = state.order.find(paneId => !before.has(paneId));
      await new Promise(resolve => setTimeout(resolve, 200));
      return {
        id,
        assigned: state.panePrefs.paneDesktop[id],
        target,
        defaultName,
        renameUnavailable,
        visible: id ? !state.sessions.get(id).el.classList.contains('layout-hidden') : false
      };
    })()`);
    assert.deepStrictEqual(
      { assigned: launchDesktop.assigned, target: launchDesktop.target, defaultName: launchDesktop.defaultName, renameUnavailable: launchDesktop.renameUnavailable, visible: launchDesktop.visible },
      { assigned: launchDesktop.target, target: launchDesktop.target, defaultName: 'Desktop 1', renameUnavailable: true, visible: true },
      'new desktops must reuse the lowest free default name, expose no rename control and receive new sessions'
    );
    await waitEval(cdp, peerSid, `state.sessions.has('${launchDesktop.id}') && state.panePrefs.paneDesktop['${launchDesktop.id}'] === '${launchDesktop.target}'`);
    const remoteLaunchIsolation = await evalExpr(cdp, peerSid, `(() => ({
      selectedRemote: state.activeId === '${launchDesktop.id}',
      hidden: state.sessions.get('${launchDesktop.id}').el.classList.contains('layout-hidden'),
      pollutedCurrentGeometry: Boolean(windowPrefs()['${launchDesktop.id}'])
    }))()`);
    assert.deepStrictEqual(remoteLaunchIsolation, { selectedRemote: false, hidden: true, pollutedCurrentGeometry: false }, 'a session launched on another client desktop must not steal focus or geometry locally');
    const launchCleanup = await evalExpr(cdp, sid, `(async () => {
      await closePanel('${launchDesktop.id}');
      const staleAssignment = Boolean(state.panePrefs.paneDesktop['${launchDesktop.id}']);
      deleteDesktop('${launchDesktop.target}');
      runCloseConfirm();
      return { staleAssignment };
    })()`);
    assert.deepStrictEqual(launchCleanup, { staleAssignment: false }, 'closed sessions must remove their desktop assignment');
    await waitEval(cdp, sid, `state.saveTimer === null && state.panePrefs.desktopOrder.length === 1`);
    const expectedSharedDesktopRect = await evalExpr(cdp, sid, `(() => {
      const rect = windowPrefs()['${madeSessions[0]}'];
      return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    })()`);
    await evalExpr(cdp, sid, 'savePanePrefs()');
    await waitEval(cdp, sid, 'state.saveTimer === null && state.saveInFlight === 0');
    const afterDesktopPeerInit = await requestJson(base, 'GET', '/api/ui-state');
    const desktopPeerRect = afterDesktopPeerInit.panePrefs?.desktops?.['desktop-1']?.windows?.[madeSessions[0]];
    assert.deepStrictEqual(
      desktopPeerRect && { x: desktopPeerRect.x, y: desktopPeerRect.y, w: desktopPeerRect.w, h: desktopPeerRect.h },
      expectedSharedDesktopRect,
      'desktop lifecycle actions and a differently sized peer must agree on authoritative window geometry'
    );
    await waitEval(cdp, peerSid, `(() => {
      const p = windowPrefs()['${madeSessions[0]}'];
      const expected = ${JSON.stringify(expectedSharedDesktopRect)};
      return p?.x === expected.x && p?.y === expected.y && p?.w === expected.w && p?.h === expected.h;
    })()`, 4000);
    await waitEval(cdp, peerSid, `(() => [...state.sessions.values()].every(entry => entry.el.dataset.connectionStatus === 'live'))()`, 4000);
    const peerLive = await evalExpr(cdp, peerSid, `(() => ({
      rect: { ...windowPrefs()['${madeSessions[0]}'] },
      live: [...state.sessions.values()].every(entry => entry.el.dataset.connectionStatus === 'live')
    }))()`);
    assert.deepStrictEqual({ x: peerLive.rect.x, y: peerLive.rect.y, w: peerLive.rect.w, h: peerLive.rect.h }, expectedSharedDesktopRect, 'second browser must apply live authoritative window geometry');
    assert.strictEqual(peerLive.live, true, 'opening a second browser must not disconnect terminal sessions');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, peerSid);
    await waitEval(cdp, peerSid, 'innerWidth === 390');
    await evalExpr(cdp, peerSid, `(() => { responsiveMinimizeForViewport(); applyLayoutVisibility(); savePanePrefs(); })()`);
    await sleep(300);
    const afterMobile = await requestJson(base, 'GET', '/api/ui-state');
    const mobileRect = afterMobile.panePrefs?.desktops?.['desktop-1']?.windows?.[madeSessions[0]];
    assert.deepStrictEqual(
      mobileRect && { x: mobileRect.x, y: mobileRect.y, w: mobileRect.w, h: mobileRect.h },
      expectedSharedDesktopRect,
      `mobile browser must never overwrite authoritative desktop geometry: ${JSON.stringify(afterMobile.panePrefs)}`
    );
    await evalExpr(cdp, peerSid, `(() => {
      Object.assign(windowPrefs()['${madeSessions[0]}'], { x: 9, y: 8, w: 333, h: 222 });
    })()`);
    await cdp.send('Page.navigate', { url: `${base}/?peer-reload=1` }, peerSid);
    await waitEval(cdp, peerSid, 'location.search === "?peer-reload=1" && document.readyState === "complete" && typeof windowPrefs === "function" && document.querySelectorAll(".term-panel").length >= 11');
    await sleep(300);
    const afterPeerReload = await requestJson(base, 'GET', '/api/ui-state');
    const reloadRect = afterPeerReload.panePrefs?.desktops?.['desktop-1']?.windows?.[madeSessions[0]];
    assert.deepStrictEqual(
      reloadRect && { x: reloadRect.x, y: reloadRect.y, w: reloadRect.w, h: reloadRect.h },
      expectedSharedDesktopRect,
      'reloading one client must not publish its unsaved local pane geometry'
    );
    const reloadedPeer = await evalExpr(cdp, peerSid, `(() => ({ ...windowPrefs()['${madeSessions[0]}'] }))()`);
    assert.deepStrictEqual({ x: reloadedPeer.x, y: reloadedPeer.y, w: reloadedPeer.w, h: reloadedPeer.h }, expectedSharedDesktopRect, 'reload must reconstruct latest server-confirmed geometry');
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
      const freeOverlap = free.length === 2
        ? Math.max(0, Math.min(free[0].x + free[0].w, free[1].x + free[1].w) - Math.max(free[0].x, free[1].x)) * Math.max(0, Math.min(free[0].y + free[0].h, free[1].y + free[1].h) - Math.max(free[0].y, free[1].y))
        : null;
      savePanePrefs = persistPanePrefs;
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
    const equalGapChoices = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blocker = '${madeSessions[2]}';
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const third = grid.width / 3;
      state.sessions.forEach((entry, id) => {
        if (id === source || id === blocker) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      const choiceAt = x => {
        const choice = chooseDesktopSlotAt(grid.left + x, grid.top + grid.height / 2, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      Object.assign(prefs[source], { x: 0, y: 0, w: third * 2, h: grid.height, z: 40 });
      Object.assign(prefs[blocker], { x: third * 2, y: 0, w: third, h: grid.height, z: 30 });
      [source, blocker].forEach(applyFreeWindow);
      const rounded = value => Math.round(value * 1000) / 1000;
      const leftGap = { x: 0, y: 0, w: rounded(third * 2), h: grid.height };
      const left = [choiceAt(grid.width * 0.30), choiceAt(grid.width * 0.37)];
      Object.assign(prefs[source], { x: third, y: 0, w: third * 2, h: grid.height, z: 40 });
      Object.assign(prefs[blocker], { x: 0, y: 0, w: third, h: grid.height, z: 30 });
      [source, blocker].forEach(applyFreeWindow);
      const rightX = rounded(third);
      const rightGap = { x: rightX, y: 0, w: grid.width - rightX, h: grid.height };
      const right = [choiceAt(grid.width * 0.63), choiceAt(grid.width * 0.70)];
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { leftGap, rightGap, left, right };
    })()`);
    assert.deepStrictEqual(
      equalGapChoices.left,
      [{ type: 'free', rect: equalGapChoices.leftGap }, { type: 'free', rect: equalGapChoices.leftGap }],
      `the same left free area must offer the same full-gap placement across pointer zones: ${JSON.stringify(equalGapChoices)}`
    );
    assert.deepStrictEqual(
      equalGapChoices.right,
      [{ type: 'free', rect: equalGapChoices.rightGap }, { type: 'free', rect: equalGapChoices.rightGap }],
      `the mirrored right free area must offer the same full-gap placement across pointer zones: ${JSON.stringify(equalGapChoices)}`
    );
    const screenshotThirdChoices = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[1]}';
      const blockers = ['${madeSessions[2]}', '${madeSessions[3]}'];
      const prefs = windowPrefs();
      const savedPrefs = JSON.parse(JSON.stringify(prefs));
      const savedMinimized = [...state.minimized];
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const third = grid.width / 3;
      const gapX = Math.round(third * 1000) / 1000;
      const fullGap = { x: gapX, y: 0, w: grid.width - gapX, h: grid.height };
      const middle = { x: gapX, y: 0, w: fullGap.w / 2, h: grid.height };
      const right = { x: gapX + fullGap.w / 2, y: 0, w: fullGap.w / 2, h: grid.height };
      state.sessions.forEach((entry, id) => {
        if (id === source || blockers.includes(id)) state.minimized.delete(id);
        else state.minimized.add(id);
      });
      Object.assign(prefs[source], { x: third * 1.5, y: grid.height / 4, w: third, h: grid.height / 2, z: 40 });
      Object.assign(prefs[blockers[0]], { x: 0, y: 0, w: third, h: grid.height / 2, z: 30 });
      Object.assign(prefs[blockers[1]], { x: 0, y: grid.height / 2, w: third, h: grid.height / 2, z: 29 });
      [source, ...blockers].forEach(applyFreeWindow);
      const choose = ratio => {
        const choice = chooseDesktopSlotAt(grid.left + third + fullGap.w * ratio, grid.top + grid.height / 2, source);
        return { type: choice.type, rect: choice.rect || null };
      };
      const choices = { middle: choose(1 / 6), full: choose(1 / 2), right: choose(5 / 6) };
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return { middle, fullGap, right, choices };
    })()`);
    assert.deepStrictEqual(screenshotThirdChoices.choices.middle, { type: 'free', rect: screenshotThirdChoices.middle }, `a free two-thirds region must expose its middle-screen third near the inner edge: ${JSON.stringify(screenshotThirdChoices)}`);
    assert.deepStrictEqual(screenshotThirdChoices.choices.full, { type: 'free', rect: screenshotThirdChoices.fullGap }, `a free two-thirds region must retain the full-gap option in its center: ${JSON.stringify(screenshotThirdChoices)}`);
    assert.deepStrictEqual(screenshotThirdChoices.choices.right, { type: 'free', rect: screenshotThirdChoices.right }, `a free two-thirds region must expose the right-screen third near the outer edge: ${JSON.stringify(screenshotThirdChoices)}`);
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      const savedZCounter = state.zCounter;
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
      prefs[blockers[0]].z = 9999;
      state.zCounter = 9999;
      applyFreeWindow(blockers[0]);
      const cancelZBefore = windowZSnapshot(prefs);
      const cancelZCounterBefore = state.zCounter;
      const cancelBefore = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h, z: prefs[source].z };
      let titleRect = title.getBoundingClientRect();
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: titleRect.left + 20, clientY: titleRect.top + 12, pointerId: 30, pointerType: 'mouse' }));
      updatePointerDrag({ preventDefault(){}, clientX: point(middle / 2).x, clientY: point(middle / 2).y });
      const saveCallsBeforeCancel = saveCalls;
      endPointerDrag({ type: 'pointercancel', preventDefault(){} });
      const cancelAfter = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h, z: prefs[source].z };
      const cancelZAfter = windowZSnapshot(prefs);
      const cancelZCounterAfter = state.zCounter;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      state.zCounter = savedZCounter;
      restorePanelOrder();
      return { top, full, bottom, choices, visible, docked, blockersBefore, blockersAfter, horizontal, cancelBefore, cancelAfter, cancelZBefore, cancelZAfter, cancelZCounterBefore, cancelZCounterAfter, saveCallsBeforeCancel, cancelSaveCalls };
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
    assert.deepStrictEqual(splitCenterGapDock.cancelZAfter, splitCenterGapDock.cancelZBefore, `pointercancel must restore every compacted z-order value: ${JSON.stringify(splitCenterGapDock)}`);
    assert.strictEqual(splitCenterGapDock.cancelZCounterAfter, splitCenterGapDock.cancelZCounterBefore, `pointercancel must restore the z-order counter: ${JSON.stringify(splitCenterGapDock)}`);
    assert.strictEqual(splitCenterGapDock.saveCallsBeforeCancel, 0, `drag preview must not persist temporary size, position, or z-order: ${JSON.stringify(splitCenterGapDock)}`);
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(savedId => state.minimized.add(savedId));
      restorePanelOrder();
      endWindowResize({ preventDefault(){} });
      return result;
    })()`);
    assert.deepStrictEqual(edgeResize, { dx: -60, dw: 60, edges: 8 }, `left edge resize must grow window without bottom-right-only lock: ${JSON.stringify(edgeResize)}`);

    const canceledResizes = await evalExpr(cdp, sid, `(() => {
      const [source, neighbor] = ${JSON.stringify(madeSessions.slice(0, 2))};
      const prefs = windowPrefs();
      const savedPrefs = structuredClone(prefs);
      const savedMinimized = [...state.minimized];
      const persistPanePrefs = savePanePrefs;
      let saveCalls = 0;
      try {
        savePanePrefs = () => { saveCalls += 1; };
        state.minimized = new Set(state.order.filter(id => id !== source && id !== neighbor));
        const sourceStart = { x: 100, y: 100, w: 500, h: 300, z: 40 };
        const neighborStart = { x: 600, y: 100, w: 500, h: 300, z: 41 };
        prefs[source] = { ...sourceStart };
        prefs[neighbor] = { ...neighborStart };
        [source, neighbor].forEach(applyFreeWindow);

        state.resizeDrag = {
          sourceId: source,
          edge: 'e',
          startX: 600,
          startY: 250,
          startRect: { x: sourceStart.x, y: sourceStart.y, w: sourceStart.w, h: sourceStart.h },
          z: sourceStart.z
        };
        updateWindowResize({ preventDefault(){}, clientX: 680, clientY: 250 });
        const singleChanged = prefs[source].w !== sourceStart.w;
        const singleSaveBefore = saveCalls;
        endWindowResize({ type: 'pointercancel', preventDefault(){} });
        const single = { x: prefs[source].x, y: prefs[source].y, w: prefs[source].w, h: prefs[source].h };
        const singleCancelSaves = saveCalls - singleSaveBefore;

        state.sharedResizeDrag = {
          axis: 'vertical',
          beforeIds: [source],
          afterIds: [neighbor],
          startX: 600,
          startY: 250,
          rects: { [source]: { ...sourceStart }, [neighbor]: { ...neighborStart } }
        };
        updateSharedResize({ preventDefault(){}, clientX: 660, clientY: 250 });
        const sharedChanged = prefs[source].w !== sourceStart.w && prefs[neighbor].x !== neighborStart.x;
        const sharedSaveBefore = saveCalls;
        endSharedResize({ type: 'pointercancel', preventDefault(){} });
        const shared = {
          source: { ...prefs[source] },
          neighbor: { ...prefs[neighbor] }
        };
        return {
          singleChanged,
          single,
          singleExpected: { x: sourceStart.x, y: sourceStart.y, w: sourceStart.w, h: sourceStart.h },
          singleCancelSaves,
          sharedChanged,
          shared,
          sharedExpected: { source: sourceStart, neighbor: neighborStart },
          sharedCancelSaves: saveCalls - sharedSaveBefore
        };
      } finally {
        savePanePrefs = persistPanePrefs;
        state.resizeDrag = null;
        state.sharedResizeDrag = null;
        state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
        state.minimized = new Set(savedMinimized);
        restorePanelOrder();
      }
    })()`);
    assert.strictEqual(canceledResizes.singleChanged, true, `single-window resize fixture must exercise a real geometry change: ${JSON.stringify(canceledResizes)}`);
    assert.deepStrictEqual(canceledResizes.single, canceledResizes.singleExpected, `pointercancel must restore pre-resize window geometry: ${JSON.stringify(canceledResizes)}`);
    assert.strictEqual(canceledResizes.singleCancelSaves, 0, `canceled window resize must not persist a partial rectangle: ${JSON.stringify(canceledResizes)}`);
    assert.strictEqual(canceledResizes.sharedChanged, true, `shared-resize fixture must exercise both adjoining windows: ${JSON.stringify(canceledResizes)}`);
    assert.deepStrictEqual(canceledResizes.shared, canceledResizes.sharedExpected, `pointercancel must restore every shared-resize participant: ${JSON.stringify(canceledResizes)}`);
    assert.strictEqual(canceledResizes.sharedCancelSaves, 0, `canceled shared resize must not persist partial rectangles: ${JSON.stringify(canceledResizes)}`);

    const startedResizeCancel = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[0]}';
      const zBlocker = '${madeSessions[1]}';
      const prefs = windowPrefs();
      const savedPrefs = structuredClone(prefs);
      const savedMinimized = [...state.minimized];
      const savedZCounter = state.zCounter;
      const persistPanePrefs = savePanePrefs;
      const before = { x: 140, y: 90, w: 520, h: 340, z: 41 };
      let saveCalls = 0;
      try {
        savePanePrefs = () => { saveCalls += 1; };
        state.minimized.delete(source);
        state.minimized.delete(zBlocker);
        prefs[source] = { ...before };
        prefs[zBlocker].z = 9999;
        state.zCounter = 9999;
        [source, zBlocker].forEach(applyFreeWindow);
        const zBefore = windowZSnapshot(prefs);
        const zCounterBefore = state.zCounter;
        const handle = state.sessions.get(source).el.querySelector('.window-resize-handle.edge-se');
        const rect = handle.getBoundingClientRect();
        handle.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: rect.left + Math.max(1, rect.width / 2),
          clientY: rect.top + Math.max(1, rect.height / 2),
          pointerId: 45,
          pointerType: 'mouse'
        }));
        const started = Boolean(state.resizeDrag);
        updateWindowResize({ preventDefault(){}, clientX: rect.left + 70, clientY: rect.top + 55 });
        const changed = prefs[source].w !== before.w || prefs[source].h !== before.h;
        const saveCallsBeforeCancel = saveCalls;
        endWindowResize({ type: 'pointercancel', preventDefault(){} });
        return { started, changed, before, after: { ...prefs[source] }, zBefore, zAfter: windowZSnapshot(prefs), zCounterBefore, zCounterAfter: state.zCounter, saveCallsBeforeCancel, cancelSaveCalls: saveCalls - saveCallsBeforeCancel };
      } finally {
        savePanePrefs = persistPanePrefs;
        state.resizeDrag = null;
        state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
        state.minimized = new Set(savedMinimized);
        state.zCounter = savedZCounter;
        restorePanelOrder();
      }
    })()`);
    assert.strictEqual(startedResizeCancel.started, true, `resize handle must enter a resize interaction: ${JSON.stringify(startedResizeCancel)}`);
    assert.strictEqual(startedResizeCancel.changed, true, `resize cancel fixture must preview a real geometry change: ${JSON.stringify(startedResizeCancel)}`);
    assert.deepStrictEqual(startedResizeCancel.after, startedResizeCancel.before, `pointercancel must restore canonical pre-resize geometry including z-order: ${JSON.stringify(startedResizeCancel)}`);
    assert.deepStrictEqual(startedResizeCancel.zAfter, startedResizeCancel.zBefore, `resize pointercancel must restore every compacted z-order value: ${JSON.stringify(startedResizeCancel)}`);
    assert.strictEqual(startedResizeCancel.zCounterAfter, startedResizeCancel.zCounterBefore, `resize pointercancel must restore the z-order counter: ${JSON.stringify(startedResizeCancel)}`);
    assert.strictEqual(startedResizeCancel.saveCallsBeforeCancel, 0, `resize preview must not persist temporary geometry or z-order: ${JSON.stringify(startedResizeCancel)}`);
    assert.strictEqual(startedResizeCancel.cancelSaveCalls, 0, `canceled resize must not add a persistence commit: ${JSON.stringify(startedResizeCancel)}`);

    const missingRectInteractions = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[0]}';
      const prefs = windowPrefs();
      const savedPrefs = structuredClone(prefs);
      const savedPointerDrag = state.pointerDrag;
      const savedResizeDrag = state.resizeDrag;
      try {
        delete prefs[source];
        state.pointerDrag = null;
        state.resizeDrag = null;
        const entry = state.sessions.get(source);
        const title = entry.el.querySelector('.term-title');
        const event = { button: 0, clientX: 100, clientY: 100, pointerId: 91, preventDefault(){}, stopPropagation(){} };
        startPointerDrag(source, title, event);
        const dragStarted = Boolean(state.pointerDrag);
        const dragCreatedRect = Boolean(prefs[source]);
        startWindowResize(source, { ...event, currentTarget: entry.el.querySelector('.window-resize-handle.edge-se') });
        return { dragStarted, dragCreatedRect, resizeStarted: Boolean(state.resizeDrag), resizeCreatedRect: Boolean(prefs[source]) };
      } finally {
        state.pointerDrag = savedPointerDrag;
        state.resizeDrag = savedResizeDrag;
        state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
        restorePanelOrder();
      }
    })()`);
    assert.deepStrictEqual(
      missingRectInteractions,
      { dragStarted: false, dragCreatedRect: false, resizeStarted: false, resizeCreatedRect: false },
      'drag and resize must fail closed instead of creating stale geometry when the canonical window rect is missing'
    );

    await waitEval(cdp, sid, 'state.saveTimer === null && state.saveInFlight === 0');
    const canceledPreviewSave = await evalExpr(cdp, sid, `(async () => {
      const source = '${madeSessions[0]}';
      const prefs = windowPrefs();
      const savedPrefs = structuredClone(prefs);
      const savedMinimized = [...state.minimized];
      const savedResponsive = [...state.responsiveMinimized];
      const savedActiveId = state.activeId;
      const savedZCounter = state.zCounter;
      const savedSaveQueued = state.saveQueued;
      const savedLastUiState = state.lastUiState ? structuredClone(state.lastUiState) : state.lastUiState;
      const savedUiRevision = state.uiRevision;
      const savedDraft = localStorage.getItem(UI_DRAFT_KEY);
      const persistApi = api;
      const writes = [];
      try {
        api = async (method, path, body) => {
          if (method !== 'PUT' || path !== '/api/ui-state') return persistApi(method, path, body);
          writes.push(structuredClone(body));
          return { ...structuredClone(body), revision: (Number(body.revision) || 0) + 1 };
        };
        state.minimized.delete(source);
        const before = { x: 120, y: 85, w: 610, h: 380, z: 51 };
        prefs[source] = { ...before };
        applyFreeWindow(source);
        const zBefore = windowZSnapshot(prefs);
        const counterBefore = state.zCounter;
        saveUiState();
        const title = state.sessions.get(source).el.querySelector('.term-title');
        const rect = title.getBoundingClientRect();
        title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rect.left + 25, clientY: rect.top + 10, pointerId: 92, pointerType: 'mouse' }));
        updatePointerDrag({ preventDefault(){}, clientX: rect.left + 145, clientY: rect.top + 95 });
        const previewChanged = prefs[source].x !== before.x || prefs[source].y !== before.y;
        await new Promise(resolve => setTimeout(resolve, 220));
        const duringWrites = writes.length;
        endPointerDrag({ type: 'pointercancel', preventDefault(){} });
        await new Promise(resolve => setTimeout(resolve, 220));
        const payloadPrefs = writes[0]?.panePrefs?.windows?.desktop || {};
        const payloadZ = Object.fromEntries(Object.entries(payloadPrefs).map(([id, value]) => [id, value?.z]));
        return {
          previewChanged,
          duringWrites,
          totalWrites: writes.length,
          savedRectRestored: JSON.stringify(payloadPrefs[source]) === JSON.stringify(before),
          savedZRestored: JSON.stringify(payloadZ) === JSON.stringify(zBefore),
          counterRestored: state.zCounter === counterBefore
        };
      } finally {
        if (state.pointerDrag) endPointerDrag({ type: 'pointercancel', preventDefault(){} });
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
        state.saveQueued = savedSaveQueued;
        state.saveInFlight = 0;
        state.lastUiState = savedLastUiState;
        state.uiRevision = savedUiRevision;
        api = persistApi;
        Object.keys(prefs).forEach(id => delete prefs[id]);
        Object.assign(prefs, savedPrefs);
        state.minimized = new Set(savedMinimized);
        state.responsiveMinimized = new Set(savedResponsive);
        state.activeId = savedActiveId;
        state.zCounter = savedZCounter;
        if (savedDraft === null) localStorage.removeItem(UI_DRAFT_KEY);
        else localStorage.setItem(UI_DRAFT_KEY, savedDraft);
        applyLayoutVisibility();
        restorePanelOrder();
      }
    })()`);
    assert.deepStrictEqual(
      canceledPreviewSave,
      { previewChanged: true, duringWrites: 0, totalWrites: 1, savedRectRestored: true, savedZRestored: true, counterRestored: true },
      'a pending UI save must defer through drag preview and persist only the fully restored post-cancel state'
    );

    const dragDesktopSwitchCancel = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[0]}';
      const sourceDesktopId = state.activeDesktopId;
      let targetDesktopId = state.panePrefs.desktopOrder.find(id => id !== sourceDesktopId);
      const createdTarget = !targetDesktopId;
      if (createdTarget) {
        targetDesktopId = crypto.randomUUID();
        state.panePrefs.desktops[targetDesktopId] = { name: 'Switch Race Target', minimized: [], windows: {}, viewport: null };
        state.panePrefs.desktopOrder.push(targetDesktopId);
      }
      const prefs = windowPrefs(sourceDesktopId);
      const savedRect = { ...prefs[source] };
      const savedActiveId = state.activeId;
      const savedMinimized = [...state.minimized];
      const savedResponsive = [...state.responsiveMinimized];
      const savedZCounter = state.zCounter;
      const sourceDesktop = state.panePrefs.desktops[sourceDesktopId];
      const targetDesktop = state.panePrefs.desktops[targetDesktopId];
      const savedSourceMinimized = [...(sourceDesktop.minimized || [])];
      const savedTargetMinimized = [...(targetDesktop.minimized || [])];
      const savedSourceViewport = sourceDesktop.viewport ? { ...sourceDesktop.viewport } : sourceDesktop.viewport;
      const savedTargetViewport = targetDesktop.viewport ? { ...targetDesktop.viewport } : targetDesktop.viewport;
      try {
        state.minimized.delete(source);
        const before = { x: 110, y: 80, w: 620, h: 390, z: 40 };
        prefs[source] = { ...before };
        applyFreeWindow(source);
        const title = state.sessions.get(source).el.querySelector('.term-title');
        const rect = title.getBoundingClientRect();
        title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rect.left + 30, clientY: rect.top + 12, pointerId: 93, pointerType: 'mouse' }));
        updatePointerDrag({ preventDefault(){}, clientX: rect.left + 150, clientY: rect.top + 100 });
        const previewChanged = prefs[source].x !== before.x || prefs[source].y !== before.y || prefs[source].w !== before.w || prefs[source].h !== before.h;
        selectDesktop(targetDesktopId);
        return {
          previewChanged,
          interactionEnded: state.pointerDrag === null,
          restored: JSON.stringify(windowPrefs(sourceDesktopId)[source]) === JSON.stringify(before),
          switched: state.activeDesktopId === targetDesktopId
        };
      } finally {
        state.activeDesktopId = sourceDesktopId;
        if (state.pointerDrag) endPointerDrag({ type: 'pointercancel', preventDefault(){} });
        windowPrefs(sourceDesktopId)[source] = savedRect;
        state.minimized = new Set(savedMinimized);
        state.responsiveMinimized = new Set(savedResponsive);
        state.activeId = savedActiveId;
        state.zCounter = savedZCounter;
        sourceDesktop.minimized = savedSourceMinimized;
        targetDesktop.minimized = savedTargetMinimized;
        sourceDesktop.viewport = savedSourceViewport;
        targetDesktop.viewport = savedTargetViewport;
        if (createdTarget) {
          delete state.panePrefs.desktops[targetDesktopId];
          state.panePrefs.desktopOrder = state.panePrefs.desktopOrder.filter(id => id !== targetDesktopId);
        }
        applyLayoutVisibility();
        restorePanelOrder();
      }
    })()`);
    assert.deepStrictEqual(
      dragDesktopSwitchCancel,
      { previewChanged: true, interactionEnded: true, restored: true, switched: true },
      'desktop switching must cancel and fully restore an active window drag before changing desktop context'
    );

    const resizeDesktopSwitchCancel = await evalExpr(cdp, sid, `(() => {
      const source = '${madeSessions[0]}';
      const sourceDesktopId = state.activeDesktopId;
      let targetDesktopId = state.panePrefs.desktopOrder.find(id => id !== sourceDesktopId);
      const createdTarget = !targetDesktopId;
      if (createdTarget) {
        targetDesktopId = crypto.randomUUID();
        state.panePrefs.desktops[targetDesktopId] = { name: 'Switch Race Target', minimized: [], windows: {}, viewport: null };
        state.panePrefs.desktopOrder.push(targetDesktopId);
      }
      const prefs = windowPrefs(sourceDesktopId);
      const savedRect = { ...prefs[source] };
      const savedActiveId = state.activeId;
      const savedMinimized = [...state.minimized];
      const savedResponsive = [...state.responsiveMinimized];
      const savedZCounter = state.zCounter;
      const sourceDesktop = state.panePrefs.desktops[sourceDesktopId];
      const targetDesktop = state.panePrefs.desktops[targetDesktopId];
      const savedSourceMinimized = [...(sourceDesktop.minimized || [])];
      const savedTargetMinimized = [...(targetDesktop.minimized || [])];
      const savedSourceViewport = sourceDesktop.viewport ? { ...sourceDesktop.viewport } : sourceDesktop.viewport;
      const savedTargetViewport = targetDesktop.viewport ? { ...targetDesktop.viewport } : targetDesktop.viewport;
      try {
        state.minimized.delete(source);
        const before = { x: 140, y: 90, w: 520, h: 340, z: 41 };
        prefs[source] = { ...before };
        applyFreeWindow(source);
        const handle = state.sessions.get(source).el.querySelector('.window-resize-handle.edge-se');
        const rect = handle.getBoundingClientRect();
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rect.left + 2, clientY: rect.top + 2, pointerId: 94, pointerType: 'mouse' }));
        updateWindowResize({ preventDefault(){}, clientX: rect.left + 90, clientY: rect.top + 70 });
        const previewChanged = prefs[source].w !== before.w || prefs[source].h !== before.h;
        selectDesktop(targetDesktopId);
        return {
          previewChanged,
          interactionEnded: state.resizeDrag === null,
          restored: JSON.stringify(windowPrefs(sourceDesktopId)[source]) === JSON.stringify(before),
          switched: state.activeDesktopId === targetDesktopId
        };
      } finally {
        state.activeDesktopId = sourceDesktopId;
        if (state.resizeDrag) endWindowResize({ type: 'pointercancel', preventDefault(){} });
        windowPrefs(sourceDesktopId)[source] = savedRect;
        state.minimized = new Set(savedMinimized);
        state.responsiveMinimized = new Set(savedResponsive);
        state.activeId = savedActiveId;
        state.zCounter = savedZCounter;
        sourceDesktop.minimized = savedSourceMinimized;
        targetDesktop.minimized = savedTargetMinimized;
        sourceDesktop.viewport = savedSourceViewport;
        targetDesktop.viewport = savedTargetViewport;
        if (createdTarget) {
          delete state.panePrefs.desktops[targetDesktopId];
          state.panePrefs.desktopOrder = state.panePrefs.desktopOrder.filter(id => id !== targetDesktopId);
        }
        applyLayoutVisibility();
        restorePanelOrder();
      }
    })()`);
    assert.deepStrictEqual(
      resizeDesktopSwitchCancel,
      { previewChanged: true, interactionEnded: true, restored: true, switched: true },
      'desktop switching must cancel and fully restore an active window resize before changing desktop context'
    );

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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
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
      state.panePrefs.desktops[state.activeDesktopId].windows = savedPrefs;
      state.minimized.clear();
      savedMinimized.forEach(id => state.minimized.add(id));
      restorePanelOrder();
      return result;
    })()`);
    assert.strictEqual(sharedResizeOcclusion.coveredPane, madeSessions[2], `a higher window must own pointer hit-testing above covered shared resize edges: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.visibleShared, true, `uncovered shared resize edge must remain interactive: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.beforeBringShared, true, `shared edge should be interactive while the crossing pane is behind it: ${JSON.stringify(sharedResizeOcclusion)}`);
    assert.strictEqual(sharedResizeOcclusion.afterBringPane, madeSessions[2], `bringing a crossing pane forward must immediately refresh shared resize hit-testing: ${JSON.stringify(sharedResizeOcclusion)}`);

    const counts = await evalExpr(cdp, sid, `(() => ({ panels: document.querySelectorAll('.term-panel').length }))()`);
    assert.strictEqual(counts.panels, 11, 'all panels should render');

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

    const hiddenDesktopAttention = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      const originalPrefs = structuredClone(state.panePrefs);
      const originalActiveDesktopId = state.activeDesktopId;
      const originalActiveId = state.activeId;
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'passideckDesktop');
      const calls = [];
      const hiddenDesktopId = 'desktop-attention-fixture';
      state.panePrefs.desktopOrder.push(hiddenDesktopId);
      state.panePrefs.desktops[hiddenDesktopId] = { name: 'Attention fixture', minimized: [], windows: {}, viewport: null };
      state.panePrefs.paneDesktop[entry.session.id] = hiddenDesktopId;
      Object.defineProperty(window, 'passideckDesktop', {
        configurable: true,
        writable: true,
        value: { notifyResponseComplete: details => calls.push(details), clearResponseAttention: () => {} }
      });
      renderSwitcher();
      notifyResponseComplete(entry.session.id);
      const tab = document.querySelector('[data-desktop-id="' + hiddenDesktopId + '"]');
      const result = {
        activeDesktopStable: state.activeDesktopId === originalActiveDesktopId,
        hiddenDesktopMarked: tab?.classList.contains('attention') === true,
        hiddenDesktopAnimation: getComputedStyle(tab).animationName,
        bridgeCall: calls[0]
      };
      clearResponseAttention(entry.session.id);
      state.panePrefs = originalPrefs;
      state.activeDesktopId = originalActiveDesktopId;
      state.activeId = originalActiveId;
      renderSwitcher();
      applyLayoutVisibility();
      if (originalDescriptor) Object.defineProperty(window, 'passideckDesktop', originalDescriptor);
      else delete window.passideckDesktop;
      return result;
    })()`);
    assert.deepStrictEqual(hiddenDesktopAttention, {
      activeDesktopStable: true,
      hiddenDesktopMarked: true,
      hiddenDesktopAnimation: 'desktop-response-pulse',
      bridgeCall: { hiddenDesktop: true }
    }, 'a Hermes BEL from a hidden virtual desktop must blink that desktop and bubble hidden-desktop attention to the Electron backend tab');

    const responseAttentionBridge = await evalExpr(cdp, sid, `(async () => {
      const calls = [];
      const entries = [...state.sessions.values()];
      const originalActiveId = state.activeId;
      const originalNotifyBlinking = state.notifyBlinking;
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
      setNotifyBlinking(true, { persist: false });
      document.activeElement?.blur?.();
      notifyResponseComplete(entries[0].session.id);
      notifyResponseComplete(entries[1].session.id);
      const header = entries[0].el.querySelector('.term-header');
      const switcher = document.querySelector('[data-switcher-pane-id="' + entries[0].session.id + '"]');
      const immediate = header.classList.contains('response-pulse');
      const immediateTab = switcher.classList.contains('response-pulse');
      const headerStyle = getComputedStyle(header);
      const tabStyle = getComputedStyle(switcher);
      const indicator = entries[0].el.querySelector('.connection-dot');
      const indicatorBefore = getComputedStyle(indicator, '::before');
      const indicatorAfter = getComputedStyle(indicator, '::after');
      const indicatorState = {
        indicatorMarked: entries[0].el.classList.contains('response-attention'),
        indicatorLabel: indicator.getAttribute('aria-label'),
        indicatorDotAnimation: indicatorBefore.animationName,
        indicatorBellAnimation: indicatorAfter.animationName,
        indicatorBellContent: indicatorAfter.content
      };
      const tabIterations = tabStyle.animationIterationCount;
      const headerDuration = headerStyle.animationDuration;
      const tabDuration = tabStyle.animationDuration;
      const badgeContent = getComputedStyle(header, '::after').content;
      await new Promise(resolve => setTimeout(resolve, 1700));
      const persistent = header.classList.contains('response-pulse');
      const persistentTab = switcher.classList.contains('response-pulse');
      const persistentBell = getComputedStyle(indicator, '::after').opacity;
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
        ...indicatorState,
        persistentBell,
        persistent,
        persistentTab,
        cleared: !header.classList.contains('response-pulse'),
        clearedTab: !document.querySelector('[data-switcher-pane-id="' + entries[0].session.id + '"]').classList.contains('response-pulse'),
        indicatorCleared: !entries[0].el.classList.contains('response-attention'),
        indicatorLabelCleared: indicator.getAttribute('aria-label'),
        desktopHeldForOtherPane,
        otherBeforeSwitcherClick,
        otherClearedBySwitcher
      };
      setNotifyBlinking(originalNotifyBlinking, { persist: false });
      if (originalDesktopDescriptor) Object.defineProperty(window, 'passideckDesktop', originalDesktopDescriptor);
      else delete window.passideckDesktop;
      return result;
    })()`);
    assert.deepStrictEqual(responseAttentionBridge, {
      calls: ['complete', 'complete', 'clear'],
      immediate: true,
      immediateTab: true,
      tabIterations: '1',
      headerDuration: '1.6s',
      tabDuration: '0s',
      badgeContent: 'none',
      indicatorMarked: true,
      indicatorLabel: 'New response',
      indicatorDotAnimation: 'session-response-dot-out',
      indicatorBellAnimation: 'session-response-bell-show',
      indicatorBellContent: '"🔔"',
      persistentBell: '1',
      persistent: true,
      persistentTab: true,
      cleared: true,
      clearedTab: true,
      indicatorCleared: true,
      indicatorLabelCleared: 'Connected',
      desktopHeldForOtherPane: true,
      otherBeforeSwitcherClick: true,
      otherClearedBySwitcher: true
    }, 'pane acknowledgement must preserve backend attention while another pane waits, and switcher selection must clear the selected pane plus the backend after the final acknowledgement');

    const notifyBlinkingBehavior = await evalExpr(cdp, sid, `(() => {
      const entries = [...state.sessions.values()];
      const active = entries[0];
      const inactive = entries[1];
      const originalActiveId = state.activeId;
      const originalNotifyBlinking = state.notifyBlinking;
      const originalHydrating = state.hydrating;
      selectPanel(active.session.id, { persist: false });
      setNotifyBlinking(true, { persist: false });
      pulsePaneTitlebar(active.session.id);
      pulsePaneTitlebar(inactive.session.id);
      const activeTab = document.querySelector('[data-switcher-pane-id="' + active.session.id + '"]');
      const inactiveTab = document.querySelector('[data-switcher-pane-id="' + inactive.session.id + '"]');
      const activeHeader = active.el.querySelector('.term-header');
      const inactiveHeader = inactive.el.querySelector('.term-header');
      const on = {
        select: document.getElementById('notifyBlinkingSelect').value,
        activeTabAnimation: getComputedStyle(activeTab).animationName,
        inactiveTabAnimation: getComputedStyle(inactiveTab).animationName,
        activeHeaderAnimation: getComputedStyle(activeHeader).animationName
      };
      state.hydrating = true;
      const select = document.getElementById('notifyBlinkingSelect');
      select.value = 'off';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      state.hydrating = originalHydrating;
      const off = {
        state: state.notifyBlinking,
        select: select.value,
        activeTabAnimation: getComputedStyle(activeTab).animationName,
        inactiveTabAnimation: getComputedStyle(inactiveTab).animationName,
        activeHeaderAnimation: getComputedStyle(activeHeader).animationName,
        inactiveHeaderAnimation: getComputedStyle(inactiveHeader).animationName,
        activeTabFilter: getComputedStyle(activeTab).filter,
        inactiveTabFilter: getComputedStyle(inactiveTab).filter,
        headerPeakVisible: getComputedStyle(activeHeader).boxShadow !== 'none',
        attentionHeld: active.responseAttention && inactive.responseAttention
      };
      clearResponseAttention(active.session.id);
      clearResponseAttention(inactive.session.id);
      setNotifyBlinking(originalNotifyBlinking, { persist: false });
      if (state.activeId !== originalActiveId) selectPanel(originalActiveId, { persist: false });
      return { on, off };
    })()`);
    assert.deepStrictEqual(notifyBlinkingBehavior.on, {
      select: 'on',
      activeTabAnimation: 'none',
      inactiveTabAnimation: 'switcher-response-pulse',
      activeHeaderAnimation: 'pane-response-pulse'
    }, 'Notify blinking On must animate pending panes and inactive tabs while the already-active tab stays at the static peak');
    assert.deepStrictEqual(notifyBlinkingBehavior.off, {
      state: false,
      select: 'off',
      activeTabAnimation: 'none',
      inactiveTabAnimation: 'none',
      activeHeaderAnimation: 'none',
      inactiveHeaderAnimation: 'none',
      activeTabFilter: 'brightness(1.3)',
      inactiveTabFilter: 'brightness(1.3)',
      headerPeakVisible: true,
      attentionHeld: true
    }, 'Notify blinking Off must stop every animation without clearing the persistent bright attention peak');

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
      const deadline = Date.now() + 1000;
      while (state.fontSize !== 18 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
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
      clearResponseAttention(active.session.id);
      document.activeElement?.blur?.();
      await new Promise(resolve => active.term.write('\\u0007', resolve));
      await new Promise(resolve => setTimeout(resolve, 20));
      const nativeHermesBellMarked = active.responseAttention;
      clearResponseAttention(active.session.id);
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
        nativeHermesBellMarked,
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
      nativeHermesBellMarked: true,
      serverPayloadHasSound: false
    }, 'response attention must use the native Hermes terminal completion BEL');

    const generatedTitle = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      selectPanel(entry.session.id);
      entry.session.meta.title = 'Model Session Title';
      renderSwitcher();
      entry.el.querySelector('.term-title').textContent = panelTitle(entry.session);
      return {
        pane: entry.el.querySelector('.term-title')?.textContent || '',
        switcher: document.querySelector('#sessionSwitcher .switcher-btn.active .switcher-title')?.textContent || ''
      };
    })()`);
    assert.strictEqual(generatedTitle.pane, 'Model Session Title', 'generated terminal/model title must appear in pane header');
    assert.strictEqual(generatedTitle.switcher, 'Model Session Title', 'taskbar/switcher item should use the pane title');

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
      return { inferred: inferHermesSessionTitle(lines), pane: entry.el.querySelector('.term-title')?.textContent || '' };
    })()`);
    assert.strictEqual(tuiUntitledTitle.inferred, '', 'Hermes TUI current untitled row must not infer a title');
    assert.strictEqual(tuiUntitledTitle.pane, 'No title', 'Hermes TUI current untitled row must clear stale pane title');

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

    await waitEval(cdp, sid, 'state.saveTimer === null');
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

    const zeroScrollbackWheel = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      const saved = entry.serialize.serialize({ scrollback: 20000 });
      entry.session.meta.command = 'hermes';
      entry.term.reset();
      await new Promise(resolve => entry.term.write('\\x1b[?1000h\\x1b[?1006h', resolve));
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const rect = target.getBoundingClientRect();
      const mouseData = [];
      const listener = entry.term.onData(data => mouseData.push(data));
      const before = { baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
      const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 40 });
      const dispatched = target.dispatchEvent(event);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = { baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
      listener.dispose();
      entry.term.reset();
      await new Promise(resolve => entry.term.write(saved, resolve));
      entry.session.meta.command = oldCommand;
      return { before, after, canceled: !dispatched || event.defaultPrevented, mouseData };
    })()`);
    assert.strictEqual(zeroScrollbackWheel.before.baseY, 0, `zero-scrollback regression setup must start at baseY 0: ${JSON.stringify(zeroScrollbackWheel)}`);
    assert.strictEqual(zeroScrollbackWheel.canceled, true, `normal Hermes wheel must be canceled without scrollback: ${JSON.stringify(zeroScrollbackWheel)}`);
    assert.deepStrictEqual(zeroScrollbackWheel.mouseData, [], `normal Hermes wheel without scrollback must not become PTY mouse/history input: ${JSON.stringify(zeroScrollbackWheel)}`);
    assert.deepStrictEqual(zeroScrollbackWheel.after, zeroScrollbackWheel.before, `normal Hermes wheel without scrollback must leave the viewport fixed: ${JSON.stringify(zeroScrollbackWheel)}`);

    const restoredAlternateBufferHermesWheel = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const id = entry.session.id;
      const oldCommand = entry.session.meta.command;
      const saved = entry.serialize.serialize({ scrollback: 20000 });
      const snapshotRaw = localStorage.getItem(snapshotKey(id));
      entry.session.meta.command = 'hermes';
      try {
        entry.term.reset();
        await new Promise(resolve => entry.term.write(Array.from({ length: entry.term.rows + 60 }, (_, i) => 'normal-hermes-history-' + i + '\\r\\n').join(''), resolve));
        await new Promise(resolve => entry.term.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006hstale-alt-screen', resolve));
        const legacyText = entry.serialize.serialize({ scrollback: 20000 });
        localStorage.setItem(snapshotKey(id), JSON.stringify({ id, text: legacyText, cols: entry.term.cols, savedAt: Date.now() }));
        entry.term.reset();
        await new Promise(resolve => restoreTerminalSnapshot(id, entry.term, resolve, entry));
        const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
        const rect = target.getBoundingClientRect();
        const mouseData = [];
        const listener = entry.term.onData(data => mouseData.push(data));
        entry.term.scrollToBottom();
        const before = { type: entry.term.buffer.active.type, baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
        const event = new WheelEvent('wheel', { deltaY: -480, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 40 });
        const dispatched = target.dispatchEvent(event);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const after = { type: entry.term.buffer.active.type, baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
        listener.dispose();
        return { before, after, canceled: !dispatched || event.defaultPrevented, mouseData };
      } finally {
        if (snapshotRaw === null) localStorage.removeItem(snapshotKey(id));
        else localStorage.setItem(snapshotKey(id), snapshotRaw);
        entry.term.reset();
        await new Promise(resolve => entry.term.write(saved, resolve));
        entry.session.meta.command = oldCommand;
      }
    })()`);
    assert.strictEqual(restoredAlternateBufferHermesWheel.before.type, 'normal', `restoring normal Hermes must exit a stale alternate buffer before wheel input: ${JSON.stringify(restoredAlternateBufferHermesWheel)}`);
    assert.ok(restoredAlternateBufferHermesWheel.before.baseY > 0, `restoring normal Hermes must preserve its normal-buffer scrollback: ${JSON.stringify(restoredAlternateBufferHermesWheel)}`);
    assert.ok(restoredAlternateBufferHermesWheel.after.viewportY < restoredAlternateBufferHermesWheel.before.viewportY, `normal Hermes wheel must scroll restored history after stale alternate-buffer recovery: ${JSON.stringify(restoredAlternateBufferHermesWheel)}`);
    assert.strictEqual(restoredAlternateBufferHermesWheel.canceled, true, `normal Hermes restored wheel must remain PassiDeck-owned: ${JSON.stringify(restoredAlternateBufferHermesWheel)}`);
    assert.deepStrictEqual(restoredAlternateBufferHermesWheel.mouseData, [], `normal Hermes restored wheel must not become PTY mouse/history input: ${JSON.stringify(restoredAlternateBufferHermesWheel)}`);

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

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' }, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 390 && innerHeight === 844');
    const touchSwipeSetup = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get(state.activeId);
      window.__touchScrollRestore = { entry, command: entry.session.meta.command, snapshot: entry.serialize.serialize({ scrollback: 20000 }) };
      entry.session.meta.command = 'hermes';
      entry.term.reset();
      await new Promise(resolve => entry.term.write(Array.from({ length: 100 }, (_, i) => 'touch-' + i + '\\r\\n').join(''), resolve));
      entry.term.scrollToBottom();
      const screen = entry.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, startY: rect.top + rect.height * .35, endY: rect.top + rect.height * .75, width: rect.width, height: rect.height, before: entry.term.buffer.active.viewportY, baseY: entry.term.buffer.active.baseY };
    })()`);
    assert.ok(touchSwipeSetup.width > 0 && touchSwipeSetup.height > 0 && touchSwipeSetup.baseY > 0 && touchSwipeSetup.before === touchSwipeSetup.baseY, `touch swipe regression setup must use the visible active terminal at scrollback bottom: ${JSON.stringify(touchSwipeSetup)}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchSwipeSetup.x, y: touchSwipeSetup.startY, radiusX: 1, radiusY: 1, force: 1 }] }, sid);
    for (let step = 1; step <= 6; step++) {
      const y = touchSwipeSetup.startY + (touchSwipeSetup.endY - touchSwipeSetup.startY) * step / 6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchSwipeSetup.x, y, radiusX: 1, radiusY: 1, force: 1 }] }, sid);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
    const touchSwipe = await evalExpr(cdp, sid, `(async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { entry, command, snapshot } = window.__touchScrollRestore;
      const after = entry.term.buffer.active.viewportY;
      entry.term.reset();
      await new Promise(resolve => entry.term.write(snapshot, resolve));
      entry.session.meta.command = command;
      delete window.__touchScrollRestore;
      return { before: ${touchSwipeSetup.before}, after };
    })()`);
    assert.ok(touchSwipe.after < touchSwipe.before, `a vertical touch swipe must scroll PassiDeck terminal history: ${JSON.stringify(touchSwipe)}`);

    const tuiTouchSetup = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get(state.activeId);
      const mouseData = [];
      const listener = entry.term.onData(data => mouseData.push(data));
      window.__tuiTouchRestore = { entry, command: entry.session.meta.command, snapshot: entry.serialize.serialize({ scrollback: 20000 }), mouseData, listener };
      entry.session.meta.command = 'hermes --tui';
      entry.term.reset();
      await new Promise(resolve => entry.term.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006h', resolve));
      const screen = entry.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        startY: rect.top + rect.height * .35,
        endY: rect.top + rect.height * .75,
        width: rect.width,
        height: rect.height,
        bufferType: entry.term.buffer.active.type
      };
    })()`);
    assert.ok(tuiTouchSetup.width > 0 && tuiTouchSetup.height > 0 && tuiTouchSetup.bufferType === 'alternate',
      `Hermes TUI touch regression must use the visible alternate-screen terminal: ${JSON.stringify(tuiTouchSetup)}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tuiTouchSetup.x, y: tuiTouchSetup.startY, radiusX: 1, radiusY: 1, force: 1 }] }, sid);
    for (let step = 1; step <= 6; step++) {
      const y = tuiTouchSetup.startY + (tuiTouchSetup.endY - tuiTouchSetup.startY) * step / 6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tuiTouchSetup.x, y, radiusX: 1, radiusY: 1, force: 1 }] }, sid);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
    const tuiTouch = await evalExpr(cdp, sid, `(async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { entry, command, snapshot, mouseData, listener } = window.__tuiTouchRestore;
      const mouseEvents = mouseData.filter(data => data.includes('\\x1b[<')).length;
      listener.dispose();
      await new Promise(resolve => entry.term.write('\\x1b[?1000l\\x1b[?1006l\\x1b[?1049l', resolve));
      entry.term.reset();
      await new Promise(resolve => entry.term.write(snapshot, resolve));
      entry.session.meta.command = command;
      delete window.__tuiTouchRestore;
      return { mouseEvents };
    })()`);
    assert.ok(tuiTouch.mouseEvents > 0, `Hermes TUI touch swipes must become terminal mouse-wheel input: ${JSON.stringify(tuiTouch)}`);

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 1280 && innerHeight === 720');

    const altScreenWheel = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      entry.session.meta.command = 'hermes --tui';
      let scrollCalls = 0;
      const mouseData = [];
      const acceleratedInput = [];
      const dataListener = entry.term.onData(data => mouseData.push(data));
      const socket = entry.ws;
      const originalSend = socket.send;
      socket.send = function(raw) {
        const message = JSON.parse(raw);
        if (message.type === 'input') acceleratedInput.push(message.data);
        else return originalSend.call(this, raw);
      };
      const oldScrollLines = entry.term.scrollLines.bind(entry.term);
      entry.term.scrollLines = n => { scrollCalls += 1; return oldScrollLines(n); };
      await new Promise(resolve => entry.term.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006h', resolve));
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const termEl = entry.el.querySelector('.terminal');
      let capturePrevented = null;
      const captureProbe = e => { capturePrevented = e.defaultPrevented; };
      termEl.addEventListener('wheel', captureProbe, { capture: true, once: true });
      const r = target.getBoundingClientRect();
      const baseBeforeFirst = entry.term.buffer.active.baseY;
      const first = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 });
      const firstDispatched = target.dispatchEvent(first);
      const baseAfterFirst = entry.term.buffer.active.baseY;
      await new Promise(resolve => entry.term.write(Array.from({ length: entry.term.rows + 5 }, (_, i) => 'resumed-response-' + i + '\\r\\n').join(''), resolve));
      const baseBeforeSecond = entry.term.buffer.active.baseY;
      const second = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 });
      const secondDispatched = target.dispatchEvent(second);
      const baseAfterSecond = entry.term.buffer.active.baseY;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = {
        scrollCalls,
        mouseEvents: mouseData.filter(data => data.includes('\\x1b[<')).length,
        acceleratedMouseEvents: (acceleratedInput.join('').match(/\\x1b\\[<6[45];\\d+;\\d+M/g) || []).length,
        wheelStable: baseBeforeFirst === baseAfterFirst && baseBeforeSecond === baseAfterSecond,
        canceled: !firstDispatched || first.defaultPrevented || !secondDispatched || second.defaultPrevented,
        capturePrevented
      };
      await new Promise(resolve => entry.term.write('\\x1b[?1000l\\x1b[?1006l\\x1b[?1049l', resolve));
      dataListener.dispose();
      socket.send = originalSend;
      entry.term.scrollLines = oldScrollLines;
      entry.session.meta.command = oldCommand;
      return out;
    })()`);
    assert.deepStrictEqual(altScreenWheel, { scrollCalls: 0, mouseEvents: 2, acceleratedMouseEvents: 6, wheelStable: true, canceled: true, capturePrevented: false }, 'Hermes TUI wheel must reach the TUI at accelerated speed before and after resumed-session output without scrolling xterm/browser chrome');

    const resizedNormalBufferTuiWheel = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      entry.session.meta.command = 'hermes --tui';
      const mouseData = [];
      let scrollCalls = 0;
      const dataListener = entry.term.onData(data => mouseData.push(data));
      const oldScrollLines = entry.term.scrollLines.bind(entry.term);
      entry.term.scrollLines = n => { scrollCalls += 1; return oldScrollLines(n); };
      entry.term.reset();
      await new Promise(resolve => entry.term.write('\\x1b[?1000h\\x1b[?1006h' + Array.from({ length: entry.term.rows + 25 }, (_, i) => 'resize-history-' + i + '\\r\\n').join(''), resolve));
      entry.term.scrollToBottom();
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const r = target.getBoundingClientRect();
      const before = { baseY: entry.term.buffer.active.baseY, viewportY: entry.term.buffer.active.viewportY };
      const event = new WheelEvent('wheel', { deltaY: -180, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 40 });
      const dispatched = target.dispatchEvent(event);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = {
        bufferType: entry.term.buffer.active.type,
        hadScrollback: before.baseY > 0,
        mouseEvents: mouseData.filter(data => data.includes('\\x1b[<')).length,
        scrollCalls,
        viewportStable: entry.term.buffer.active.viewportY === before.viewportY,
        canceled: !dispatched || event.defaultPrevented
      };
      await new Promise(resolve => entry.term.write('\\x1b[?1000l\\x1b[?1006l', resolve));
      dataListener.dispose();
      entry.term.scrollLines = oldScrollLines;
      entry.session.meta.command = oldCommand;
      return out;
    })()`);
    assert.deepStrictEqual(resizedNormalBufferTuiWheel, { bufferType: 'normal', hadScrollback: true, mouseEvents: 1, scrollCalls: 0, viewportStable: true, canceled: true }, 'resized Hermes TUI in a normal xterm buffer must keep wheel routed to the TUI even when baseY is nonzero');

    const xtermScrollbar = await evalExpr(cdp, sid, `(() => {
      const panel = [...state.sessions.values()][0].el;
      panel.classList.remove('hermes-tui');
      const scrollbar = panel.querySelector('.xterm-scrollable-element > .scrollbar.vertical');
      const slider = scrollbar?.querySelector(':scope > .slider');
      const normal = {
        width: scrollbar ? getComputedStyle(scrollbar).width : '',
        sliderRadius: slider ? getComputedStyle(slider).borderRadius : ''
      };
      panel.classList.add('hermes-tui');
      const viewport = panel.querySelector('.xterm-viewport');
      const tui = {
        display: scrollbar ? getComputedStyle(scrollbar).display : '',
        pointerEvents: scrollbar ? getComputedStyle(scrollbar).pointerEvents : '',
        nativeFirefox: getComputedStyle(viewport).scrollbarWidth,
        nativeWebkit: getComputedStyle(viewport, '::-webkit-scrollbar').display
      };
      panel.classList.remove('hermes-tui');
      return { exists: Boolean(scrollbar && slider), normal, tui };
    })()`);
    assert.strictEqual(xtermScrollbar.exists, true, `the regression must inspect xterm 6's real custom scrollbar: ${JSON.stringify(xtermScrollbar)}`);
    assert.deepStrictEqual(xtermScrollbar.normal, { width: '4px', sliderRadius: '999px' }, `normal terminal panes must use the real narrow rounded xterm scrollbar: ${JSON.stringify(xtermScrollbar)}`);
    assert.deepStrictEqual(xtermScrollbar.tui, { display: 'none', pointerEvents: 'none', nativeFirefox: 'none', nativeWebkit: 'none' }, `Hermes TUI must hide both xterm 6's custom scrollbar and the native fallback after resize: ${JSON.stringify(xtermScrollbar)}`);

    const outerScrollbar = await evalExpr(cdp, sid, `(() => ({
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      widthFits: document.documentElement.scrollWidth <= innerWidth,
      heightFits: document.documentElement.scrollHeight <= innerHeight
    }))()`);
    assert.deepStrictEqual(outerScrollbar, { htmlOverflow: 'hidden', bodyOverflow: 'hidden', widthFits: true, heightFits: true }, `window resize must never expose a second browser/Electron scrollbar: ${JSON.stringify(outerScrollbar)}`);

    const tuiDragSelection = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      entry.session.meta.command = 'hermes --tui';
      entry.term.reset();
      await new Promise(resolve => entry.term.write('\x1b[?1000h\x1b[?1006hdrag-to-copy-this-text\\r\\n', resolve));
      const mouseData = [];
      const dataListener = entry.term.onData(data => { if (data.includes('\x1b[<')) mouseData.push(data); });
      const termEl = entry.el.querySelector('.terminal');
      const screen = termEl.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      const cellWidth = rect.width / entry.term.cols;
      const cellHeight = rect.height / entry.term.rows;
      const y = rect.top + cellHeight / 2;
      const x1 = rect.left + cellWidth;
      const x2 = rect.left + cellWidth * 18;
      const mouseProtocolBeforeDrag = entry.term._core.coreMouseService.activeProtocol;
      screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x1, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: x1, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointermove', { button: 0, buttons: 1, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = {
        selection: entry.term.getSelection(),
        mouseData: mouseData.length,
        mouseProtocolBeforeDrag,
        mouseProtocol: entry.term._core.coreMouseService.activeProtocol
      };
      dataListener.dispose();
      return out;
    })()`);
    assert.ok(tuiDragSelection.selection.length >= 8 && 'drag-to-copy-this-text'.includes(tuiDragSelection.selection), `plain left-drag in Hermes TUI must visibly select copyable terminal text: ${JSON.stringify(tuiDragSelection)}`);
    assert.strictEqual(tuiDragSelection.mouseData, 0, `text drag must not leak mouse events into Hermes TUI and redraw away the selection: ${JSON.stringify(tuiDragSelection)}`);
    assert.strictEqual(tuiDragSelection.mouseProtocol, 'NONE', `mouse reporting must stay suspended while the copy selection is visible: ${JSON.stringify(tuiDragSelection)}`);

    const tuiKeyboardCopy = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const copied = [];
      window.passideckDesktop = { copyText: async text => { copied.push(text); return true; } };
      const textarea = entry.el.querySelector('.xterm-helper-textarea');
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 0));
      delete window.passideckDesktop;
      return {
        copied,
        selection: entry.term.getSelection(),
        mouseProtocol: entry.term._core.coreMouseService.activeProtocol
      };
    })()`);
    assert.ok(tuiKeyboardCopy.copied[0]?.length >= 8 && 'drag-to-copy-this-text'.includes(tuiKeyboardCopy.copied[0]), `Ctrl+Shift+C must copy the visible TUI selection through the desktop bridge: ${JSON.stringify(tuiKeyboardCopy)}`);
    assert.strictEqual(tuiKeyboardCopy.selection, '', `copy must clear the visible TUI selection: ${JSON.stringify(tuiKeyboardCopy)}`);
    assert.strictEqual(tuiKeyboardCopy.mouseProtocol, tuiDragSelection.mouseProtocolBeforeDrag, `copy must restore Hermes TUI mouse reporting after clearing the selection: ${JSON.stringify({ tuiDragSelection, tuiKeyboardCopy })}`);

    const tuiMouseOnlySelection = await evalExpr(cdp, sid, `(() => {
      const entry = [...state.sessions.values()][0];
      const screen = entry.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      const cellWidth = rect.width / entry.term.cols;
      const cellHeight = rect.height / entry.term.rows;
      const y = rect.top + cellHeight / 2;
      const x1 = rect.left + cellWidth;
      const x2 = rect.left + cellWidth * 18;
      screen.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: x1, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      const out = {
        selection: entry.term.getSelection(),
        mouseProtocol: entry.term._core.coreMouseService.activeProtocol
      };
      clearCopiedSelection(entry);
      return out;
    })()`);
    assert.ok(tuiMouseOnlySelection.selection.length >= 8 && 'drag-to-copy-this-text'.includes(tuiMouseOnlySelection.selection), `mouse-only input from the visible browser/desktop must select TUI text: ${JSON.stringify(tuiMouseOnlySelection)}`);
    assert.strictEqual(tuiMouseOnlySelection.mouseProtocol, 'NONE', `mouse reporting must stay suspended while a mouse-only copy selection is visible: ${JSON.stringify(tuiMouseOnlySelection)}`);

    const tuiDirectLinkActivation = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const providers = entry.term._core._linkProviderService.linkProviders;
      const originalProviders = providers.slice();
      const originalDesktop = window.passideckDesktop;
      const originalSize = { cols: entry.term.cols, rows: entry.term.rows };
      const calls = [];
      const clickCell = (col, row) => {
        const screen = entry.el.querySelector('.xterm-screen');
        const rect = screen.getBoundingClientRect();
        const x = rect.left + rect.width / entry.term.cols * (col + 0.5);
        const y = rect.top + rect.height / entry.term.rows * (row + 0.5);
        screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      };
      try {
        providers.splice(0, providers.length, { provideLinks: (_line, callback) => setTimeout(() => callback([]), 0) });
        window.passideckDesktop = { openExternal: async url => { calls.push(url); return true; } };

        entry.term.reset();
        await new Promise(resolve => entry.term.write('\\x1b]8;;https://example.com/passideck-osc8\\x07PassiDeck Link Test\\x1b]8;;\\x07', resolve));
        clickCell(4, 0);
        await new Promise(resolve => setTimeout(resolve, 20));

        entry.term.resize(12, 4);
        entry.term.reset();
        await new Promise(resolve => entry.term.write('https://example.com/passideck-wrapped-link', resolve));
        clickCell(4, 1);
        await new Promise(resolve => setTimeout(resolve, 20));
        return calls;
      } finally {
        entry.term.resize(originalSize.cols, originalSize.rows);
        providers.splice(0, providers.length, ...originalProviders);
        if (originalDesktop === undefined) delete window.passideckDesktop;
        else window.passideckDesktop = originalDesktop;
      }
    })()`);
    assert.deepStrictEqual(tuiDirectLinkActivation, [
      'https://example.com/passideck-osc8',
      'https://example.com/passideck-wrapped-link'
    ], 'one-cell Hermes TUI gestures must resolve OSC 8 and wrapped raw links synchronously from the buffer even when a provider replies asynchronously');

    const tuiSnapshotLinkActivation = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const originalDesktop = window.passideckDesktop;
      const originalSnapshot = localStorage.getItem(snapshotKey(entry.session.id));
      const originalTerminal = entry.serialize.serialize({ scrollback: TERM_SNAPSHOT_MAX_LINES });
      const originalCols = entry.term.cols;
      const originalRows = entry.term.rows;
      const originalProposeDimensions = entry.fit.proposeDimensions;
      const calls = [];
      const url = 'http://42.69.42.46:6080/vnc.html?autoconnect=true&resize=scale';
      const clickCell = (col, row) => {
        const screen = entry.el.querySelector('.xterm-screen');
        const rect = screen.getBoundingClientRect();
        const x = rect.left + rect.width / entry.term.cols * (col + 0.5);
        const y = rect.top + rect.height / entry.term.rows * (row + 0.5);
        screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      };
      try {
        window.passideckDesktop = { openExternal: async value => { calls.push(value); return true; } };
        entry.term.reset();
        const escape = String.fromCharCode(27);
        const oscTerminator = String.fromCharCode(27, 92);
        await new Promise(resolve => entry.term.write(escape + ']8;id=passideck-snapshot;' + url + oscTerminator + 'noVNC' + escape + ']8;;' + oscTerminator, resolve));
        saveTerminalSnapshot(entry.session.id);
        entry.term.reset();
        restoreTerminalSnapshot(entry.session.id, entry.term);
        await new Promise(resolve => setTimeout(resolve, 20));
        clickCell(2, 0);
        await new Promise(resolve => setTimeout(resolve, 20));
        const sameWidth = calls.slice();
        calls.length = 0;
        entry.term.resize(originalCols - 1, originalRows);
        entry.term.reset();
        restoreTerminalSnapshot(entry.session.id, entry.term);
        await new Promise(resolve => setTimeout(resolve, 20));
        clickCell(2, 0);
        await new Promise(resolve => setTimeout(resolve, 20));
        const changedWidth = calls.slice();
        calls.length = 0;
        entry.term.resize(originalCols, originalRows);
        restoreTerminalSnapshot(entry.session.id, entry.term);
        await new Promise(resolve => setTimeout(resolve, 20));
        entry.fit.proposeDimensions = () => ({ cols: originalCols - 1, rows: originalRows });
        fitEntry(entry.session.id, entry, { allowHeight: true });
        clickCell(2, 0);
        await new Promise(resolve => setTimeout(resolve, 20));
        return { sameWidth, changedWidth, resizedAfterRestore: calls };
      } finally {
        entry.fit.proposeDimensions = originalProposeDimensions;
        entry.term.resize(originalCols, originalRows);
        entry.term.reset();
        await new Promise(resolve => entry.term.write(originalTerminal, resolve));
        if (originalSnapshot === null) localStorage.removeItem(snapshotKey(entry.session.id));
        else localStorage.setItem(snapshotKey(entry.session.id), originalSnapshot);
        if (originalDesktop === undefined) delete window.passideckDesktop;
        else window.passideckDesktop = originalDesktop;
      }
    })()`);
    assert.deepStrictEqual(tuiSnapshotLinkActivation, {
      sameWidth: ['http://42.69.42.46:6080/vnc.html?autoconnect=true&resize=scale'],
      changedWidth: [],
      resizedAfterRestore: []
    }, 'OSC 8 snapshot targets must survive unchanged geometry and fail closed after terminal reflow');

    const terminalLinks = await evalExpr(cdp, sid, `(async () => {
      const originalDesktop = window.passideckDesktop;
      const originalOpen = window.open;
      const originalCopy = copyTextToClipboard;
      const originalToast = showToast;
      const calls = [];
      const copied = [];
      const toasts = [];
      try {
        window.passideckDesktop = {
          openExternal: async url => { calls.push(['desktop', url]); return true; }
        };
        const desktop = await handleTerminalLink(null, 'https://example.com/desktop?q=1');

        delete window.passideckDesktop;
        const openedWindow = { opener: 'unsafe', location: { replace: url => { calls.push(['navigate', url]); } } };
        window.open = (url, target) => { calls.push(['browser', url, target]); return openedWindow; };
        const browser = await handleTerminalLink(null, 'http://example.com/browser');

        window.open = (url, target) => { calls.push(['blocked', url, target]); return null; };
        copyTextToClipboard = async text => { copied.push(text); return true; };
        showToast = (text, kind) => { toasts.push([text, kind || '']); };
        const fallback = await handleTerminalLink(null, 'https://example.com/copy');
        const unsafe = await handleTerminalLink(null, 'javascript:alert(1)');
        return { desktop, browser, fallback, unsafe, calls, copied, toasts, opener: openedWindow.opener };
      } finally {
        if (originalDesktop === undefined) delete window.passideckDesktop;
        else window.passideckDesktop = originalDesktop;
        window.open = originalOpen;
        copyTextToClipboard = originalCopy;
        showToast = originalToast;
      }
    })()`);
    assert.deepStrictEqual(terminalLinks, {
      desktop: true,
      browser: true,
      fallback: false,
      unsafe: false,
      calls: [
        ['desktop', 'https://example.com/desktop?q=1'],
        ['browser', 'about:blank', '_blank'],
        ['navigate', 'http://example.com/browser'],
        ['blocked', 'about:blank', '_blank']
      ],
      copied: ['https://example.com/copy'],
      toasts: [['Link copied', '']],
      opener: null
    }, 'terminal links must open through Electron/browser, copy when blocked, and reject non-HTTP(S) schemes');

    const terminalLinkProviders = await evalExpr(cdp, sid, `(async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:120px;z-index:-1';
      document.body.appendChild(host);
      const originalDesktop = window.passideckDesktop;
      const originalConfirm = window.confirm;
      const calls = [];
      const term = new Terminal({
        cols: 100,
        rows: 4,
        linkHandler: [...state.sessions.values()][0].term.options.linkHandler
      });
      term.loadAddon(new WebLinksAddon.WebLinksAddon(handleTerminalLink));
      term.open(host);
      try {
        window.passideckDesktop = { openExternal: async url => { calls.push(url); return true; } };
        window.confirm = () => false;
        await new Promise(resolve => term.write('https://example.com/raw\\r\\n\\x1b]8;;https://example.com/osc8?q=1\\x07Samsung Link\\x1b]8;;\\x07\\r\\n', resolve));
        const linksForLine = line => Promise.all(term._core._linkProviderService.linkProviders.map(provider =>
          new Promise(resolve => provider.provideLinks(line, links => resolve(links || [])))
        )).then(groups => groups.flat());
        const raw = (await linksForLine(1)).find(link => link.text === 'https://example.com/raw');
        const osc8 = (await linksForLine(2)).find(link => link.text === 'https://example.com/osc8?q=1');
        await raw?.activate(new MouseEvent('click'), raw.text);
        await osc8?.activate(new MouseEvent('click'), osc8.text);
        return { raw: Boolean(raw), osc8: Boolean(osc8), calls };
      } finally {
        term.dispose();
        host.remove();
        if (originalDesktop === undefined) delete window.passideckDesktop;
        else window.passideckDesktop = originalDesktop;
        window.confirm = originalConfirm;
      }
    })()`);
    assert.deepStrictEqual(terminalLinkProviders, {
      raw: true,
      osc8: true,
      calls: ['https://example.com/raw', 'https://example.com/osc8?q=1']
    }, 'raw URL and OSC 8 HTTP(S) link providers must both use the shared PassiDeck opener without a modifier key');

    const tuiClick = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const screen = entry.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      const mouseData = [];
      const listener = entry.term.onData(data => { if (data.includes('\\x1b[<')) mouseData.push(data); });
      const x = rect.left + rect.width / entry.term.cols * 4;
      const x2 = rect.left + rect.width / entry.term.cols * 9;
      const y = rect.top + rect.height / entry.term.rows * 2;
      screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointermove', { button: 0, buttons: 1, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      const protocolDuringSelection = entry.term._core.coreMouseService.activeProtocol;
      screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      listener.dispose();
      return {
        mouseData: mouseData.length,
        selection: entry.term.getSelection(),
        protocolDuringSelection,
        mouseProtocol: entry.term._core.coreMouseService.activeProtocol
      };
    })()`);
    assert.ok(tuiClick.mouseData > 0, `a plain TUI click must still reach Hermes after drag-selection handling: ${JSON.stringify(tuiClick)}`);
    assert.strictEqual(tuiClick.selection, '', `a click must not leave a one-character terminal selection: ${JSON.stringify(tuiClick)}`);
    assert.strictEqual(tuiClick.protocolDuringSelection, 'NONE', `a drag before a plain click must suspend TUI mouse reporting: ${JSON.stringify(tuiClick)}`);
    assert.strictEqual(tuiClick.mouseProtocol, tuiDragSelection.mouseProtocolBeforeDrag, `a plain click must restore TUI mouse reporting: ${JSON.stringify(tuiClick)}`);

    const tuiInterruptedDrag = await evalExpr(cdp, sid, `(() => {
      const source = [...state.sessions.values()][0];
      const target = [...state.sessions.values()][1];
      selectPanel(source.session.id, { persist: false });
      const screen = source.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      screen.dispatchEvent(new PointerEvent('pointerdown', {
        button: 0, buttons: 1, pointerId: 77, pointerType: 'mouse',
        clientX: rect.left + 20, clientY: rect.top + 20, bubbles: true, cancelable: true
      }));
      window.dispatchEvent(new Event('blur'));
      target.el.querySelector('.terminal').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
      const result = {
        selected: state.activeId === target.session.id,
        inputFocused: target.el.classList.contains('input-focused')
      };
      window.dispatchEvent(new PointerEvent('pointercancel'));
      return result;
    })()`);
    assert.deepStrictEqual(tuiInterruptedDrag, { selected: true, inputFocused: true }, 'losing window focus during a TUI drag must not leave a global mouse-event blocker that prevents selecting or typing in panes');

    const tuiWheelAfterSelection = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const screen = entry.el.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      const cellWidth = rect.width / entry.term.cols;
      const cellHeight = rect.height / entry.term.rows;
      const x1 = rect.left + cellWidth * 4;
      const x2 = rect.left + cellWidth * 9;
      const y = rect.top + cellHeight * 2;
      screen.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: x1, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointermove', { button: 0, buttons: 1, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      screen.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0, clientX: x2, clientY: y, bubbles: true, cancelable: true }));
      const protocolDuringSelection = entry.term._core.coreMouseService.activeProtocol;
      const mouseData = [];
      const listener = entry.term.onData(data => { if (data.includes('\\x1b[<')) mouseData.push(data); });
      screen.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: x1, clientY: y }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      listener.dispose();
      return {
        mouseData: mouseData.length,
        selection: entry.term.getSelection(),
        protocolDuringSelection,
        mouseProtocol: entry.term._core.coreMouseService.activeProtocol
      };
    })()`);
    assert.deepStrictEqual(tuiWheelAfterSelection, {
      mouseData: 1,
      selection: '',
      protocolDuringSelection: 'NONE',
      mouseProtocol: tuiDragSelection.mouseProtocolBeforeDrag
    }, `TUI wheel must clear the copy selection, restore mouse reporting and reach Hermes: ${JSON.stringify(tuiWheelAfterSelection)}`);

    const outputBatching = await evalExpr(cdp, sid, `(async () => {
      const id = state.activeId || [...state.sessions.keys()][0];
      const entry = state.sessions.get(id);
      const original = {
        activeId: state.activeId,
        desktop: state.panePrefs.paneDesktop[id],
        minimized: state.minimized.has(id),
        writeTerminalOutput,
        saveTerminalSnapshot,
        scheduleTerminalSnapshot,
        refreshTitleFromTerminal,
        outputBuffer: entry.outputBuffer,
        outputFlushTimer: entry.outputFlushTimer,
        outputWriteInFlight: entry.outputWriteInFlight,
        outputFrameHandle: entry.outputFrameHandle,
        outputCancelled: entry.outputCancelled,
        snapshotRaw: localStorage.getItem(snapshotKey(id))
      };
      const writes = [];
      let firstDone = null;
      let eagerSnapshots = 0;
      let snapshots = 0;
      let titles = 0;
      try {
        state.panePrefs.paneDesktop[id] = state.activeDesktopId;
        state.minimized.delete(id);
        state.activeId = id;
        const activeDelay = terminalOutputDelay(id);
        state.activeId = '__other__';
        const visibleDelay = terminalOutputDelay(id);
        state.panePrefs.paneDesktop[id] = '__hidden__';
        const hiddenDelay = terminalOutputDelay(id);
        state.panePrefs.paneDesktop[id] = state.activeDesktopId;
        state.activeId = id;
        clearTimeout(entry.outputFlushTimer);
        entry.outputBuffer = '';
        entry.outputFlushTimer = null;
        entry.outputWriteInFlight = false;
        entry.outputFrameHandle = null;
        entry.outputCancelled = false;
        writeTerminalOutput = (_term, data, done) => {
          writes.push(data);
          if (writes.length === 1) firstDone = () => done?.();
          else done?.();
        };
        scheduleTerminalSnapshot = () => { snapshots += 1; };
        refreshTitleFromTerminal = () => { titles += 1; };
        saveTerminalSnapshot(id);
        const stableSnapshotText = JSON.parse(localStorage.getItem(snapshotKey(id)) || '{}').text;
        saveTerminalSnapshot = () => { eagerSnapshots += 1; };
        queueTerminalOutput(id, entry.term, 'A');
        queueTerminalOutput(id, entry.term, 'B');
        const timerSet = Boolean(entry.outputFlushTimer);
        await new Promise(resolve => setTimeout(resolve, 40));
        original.saveTerminalSnapshot(id);
        const inFlightSnapshot = JSON.parse(localStorage.getItem(snapshotKey(id)) || '{}');
        const stableSnapshotPreserved = inFlightSnapshot.text === stableSnapshotText;
        const snapshotBounded = inFlightSnapshot.text?.length <= TERM_SNAPSHOT_MAX_CHARS;
        queueTerminalOutput(id, entry.term, 'C');
        queueTerminalOutput(id, entry.term, 'D');
        await new Promise(resolve => setTimeout(resolve, 40));
        const serializedBeforeCompletion = writes.join('|') === 'AB';
        firstDone?.();
        await new Promise(resolve => setTimeout(resolve, 40));
        entry.outputWriteInFlight = true;
        for (let i = 0; i < 5; i += 1) queueTerminalOutput(id, entry.term, 'X'.repeat(OUTPUT_FRAME_LIMIT));
        const overflowBounded = entry.outputBuffer.length <= TERM_OUTPUT_BUFFER_MAX_CHARS && entry.outputBuffer.startsWith('\x1bc');
        entry.outputWriteInFlight = false;
        entry.outputBuffer = '';
        return {
          activeDelay,
          visibleDelay,
          hiddenDelay,
          timerSet,
          stableSnapshotPreserved,
          snapshotBounded,
          serializedBeforeCompletion,
          overflowBounded,
          writes,
          eagerSnapshots,
          snapshots,
          titles,
          buffer: entry.outputBuffer,
          frameHandle: entry.outputFrameHandle,
          writeInFlight: entry.outputWriteInFlight,
          timerCleared: entry.outputFlushTimer === null
        };
      } finally {
        clearTimeout(entry.outputFlushTimer);
        entry.outputBuffer = original.outputBuffer;
        entry.outputFlushTimer = original.outputFlushTimer;
        entry.outputWriteInFlight = original.outputWriteInFlight;
        entry.outputFrameHandle = original.outputFrameHandle;
        entry.outputCancelled = original.outputCancelled;
        writeTerminalOutput = original.writeTerminalOutput;
        saveTerminalSnapshot = original.saveTerminalSnapshot;
        scheduleTerminalSnapshot = original.scheduleTerminalSnapshot;
        refreshTitleFromTerminal = original.refreshTitleFromTerminal;
        if (original.snapshotRaw === null) localStorage.removeItem(snapshotKey(id));
        else localStorage.setItem(snapshotKey(id), original.snapshotRaw);
        state.activeId = original.activeId;
        state.panePrefs.paneDesktop[id] = original.desktop;
        if (original.minimized) state.minimized.add(id); else state.minimized.delete(id);
      }
    })()`);
    assert.deepStrictEqual(outputBatching, {
      activeDelay: 16,
      visibleDelay: 250,
      hiddenDelay: 1000,
      timerSet: true,
      stableSnapshotPreserved: true,
      snapshotBounded: true,
      serializedBeforeCompletion: true,
      overflowBounded: true,
      writes: ['AB', 'CD'],
      eagerSnapshots: 0,
      snapshots: 1,
      titles: 2,
      buffer: '',
      frameHandle: null,
      writeInFlight: false,
      timerCleared: true
    }, 'terminal output bursts must coalesce once per latency class without dropping snapshot/title follow-up');

    const snapshotDebounce = await evalExpr(cdp, sid, `(async () => {
      const id = '__snapshot-debounce-test__';
      let staleSnapshots = 0;
      const entry = {
        outputBuffer: '',
        outputFlushTimer: null,
        outputWriteInFlight: true,
        outputCancelled: false,
        snapshotTimer: setTimeout(() => { staleSnapshots += 1; }, 25)
      };
      state.sessions.set(id, entry);
      try {
        queueTerminalOutput(id, null, 'A');
        await new Promise(resolve => setTimeout(resolve, 40));
        return { staleSnapshots, buffer: entry.outputBuffer, snapshotTimer: entry.snapshotTimer };
      } finally {
        clearTimeout(entry.snapshotTimer);
        state.sessions.delete(id);
      }
    })()`);
    assert.deepStrictEqual(snapshotDebounce, { staleSnapshots: 0, buffer: 'A', snapshotTimer: null }, 'new terminal output must cancel a pending stale snapshot before the next flush');

    const lifecycleSnapshot = await evalExpr(cdp, sid, `(() => {
      const id = '__lifecycle-snapshot-test__';
      const pendingOutput = '\\x1b[31mqueued\\x1b[0m';
      const entry = {
        term: {},
        serialize: { serialize: () => 'stable' },
        session: { meta: { command: '/bin/bash' } },
        outputWriteInFlight: false,
        outputBuffer: pendingOutput
      };
      const writes = [];
      const restoreTerm = {
        reset() {},
        write(data, done) { writes.push(data); done?.(); }
      };
      state.sessions.set(id, entry);
      try {
        saveTerminalSnapshot(id);
        const saved = JSON.parse(localStorage.getItem(snapshotKey(id)) || '{}');
        const restored = restoreTerminalSnapshot(id, restoreTerm);
        return { pendingOutput: saved.pendingOutput || '', restored, writes };
      } finally {
        localStorage.removeItem(snapshotKey(id));
        state.sessions.delete(id);
      }
    })()`);
    assert.deepStrictEqual(lifecycleSnapshot, {
      pendingOutput: '\\x1b[31mqueued\\x1b[0m',
      restored: true,
      writes: ['stable', '\\x1b[31mqueued\\x1b[0m']
    }, 'lifecycle snapshots must persist and restore queued output after the last stable terminal state');

    const chunkedWrite = await evalExpr(cdp, sid, `(async () => {
      const originalRaf = window.requestAnimationFrame;
      const chunks = [];
      let rafCount = 0;
      try {
        window.requestAnimationFrame = callback => {
          rafCount += 1;
          setTimeout(() => callback(performance.now()), 0);
          return rafCount;
        };
        await new Promise(resolve => writeTerminalOutput({ write(chunk, done) { chunks.push(chunk.length); done(); } }, 'X'.repeat(32769), resolve, false));
        return { chunks, rafCount };
      } finally {
        window.requestAnimationFrame = originalRaf;
      }
    })()`);
    assert.deepStrictEqual(chunkedWrite, { chunks: [32768, 1], rafCount: 1 }, 'chunked output must preserve offsets and complete without a final animation-frame delay');

    const reloadedTuiMouseMode = await evalExpr(cdp, sid, `(async () => {
      const entry = [...state.sessions.values()][0];
      const oldCommand = entry.session.meta.command;
      entry.session.meta.command = 'hermes --tui';
      entry.term.reset();
      await new Promise(resolve => entry.term.write('\\x1b[?1000h\\x1b[?1006h', resolve));
      saveTerminalSnapshot(entry.session.id);
      const saved = JSON.parse(localStorage.getItem(snapshotKey(entry.session.id)) || '{}').text || '';
      entry.term.reset();
      const mouseData = [];
      const dataListener = entry.term.onData(data => mouseData.push(data));
      const restored = restoreTerminalSnapshot(entry.session.id, entry.term, null, entry);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const target = entry.el.querySelector('.xterm-viewport') || entry.el.querySelector('.terminal');
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 40 }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = {
        restored,
        snapshotHasSgr: saved.includes('\\x1b[?1006h'),
        sgrMouseEvents: mouseData.filter(data => data.includes('\\x1b[<')).length
      };
      dataListener.dispose();
      localStorage.removeItem(snapshotKey(entry.session.id));
      await new Promise(resolve => entry.term.write('\\x1b[?1000l\\x1b[?1006l', resolve));
      entry.session.meta.command = oldCommand;
      return out;
    })()`);
    assert.deepStrictEqual(reloadedTuiMouseMode, { restored: true, snapshotHasSgr: true, sgrMouseEvents: 1 }, 'reloading a Hermes TUI snapshot must restore SGR mouse tracking so wheel events still reach the TUI');

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
      handleTerminalPaste({ clipboardData: {
        files: [new File(['same'], 'mirrored.png', { type: 'image/png', lastModified: 1 })],
        items: [{ kind: 'file', getAsFile: () => new File(['same'], 'mirrored.png', { type: 'image/png', lastModified: 1 }) }]
      }, preventDefault(){}, stopImmediatePropagation(){} });
      while (state.uploadBusy) await new Promise(resolve => setTimeout(resolve, 0));
      window.passideckDesktop = { readImage: async () => 'data:image/png;base64,cG5n' };
      handleTerminalPaste({ clipboardData: { files: [], items: [], getData: () => '' }, preventDefault(){}, stopImmediatePropagation(){} });
      for (let i = 0; i < 100 && sent.length < 4; i++) await new Promise(resolve => setTimeout(resolve, 10));
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
        '\u0001/image /tmp/mirrored.png\r',
        '\u0001/image /tmp/clipboard.png\r',
        '\u001b[200~/tmp/pasted.txt \u001b[201~',
        '\u001b[200~/tmp/notes.txt \u001b[201~'
      ],
      textPrevented: true,
      textStopped: true,
      keyStopped: true,
      keyPrevented: false
    }, 'Ctrl+V text, one item-only image, one files/items-mirrored image, clipboard fallback, and file drop must reach normal Hermes/TUI exactly once');

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
    const surfaceStyles = await evalExpr(cdp, sid, `(() => {
      const originalSkin = state.skin;
      const skins = {};
      const panel = document.querySelector('.term-panel');
      for (const skin of ['neon', 'stealth', 'prism']) {
        setSkin(skin, { persist: false });
        const style = getComputedStyle(document.body);
        const panelStyle = getComputedStyle(panel);
        skins[skin] = {
          radius: style.getPropertyValue('--tg-panel-radius').trim(),
          shadow: style.getPropertyValue('--tg-panel-shadow').trim(),
          borderImage: panelStyle.borderImageSource
        };
      }
      setSkin(originalSkin, { persist: false });
      return {
        modeControl: Boolean(document.getElementById('transparencyModeRow')),
        opacityControl: Boolean(document.getElementById('transparencyOpacityRow')),
        transparencyState: Object.hasOwn(state, 'transparencyMode') || Object.hasOwn(state, 'transparencyOpacity'),
        skins
      };
    })()`);
    assert.deepStrictEqual(
      { modeControl: surfaceStyles.modeControl, opacityControl: surfaceStyles.opacityControl, transparencyState: surfaceStyles.transparencyState },
      { modeControl: false, opacityControl: false, transparencyState: false },
      'transparency controls and client state must be removed'
    );
    assert.deepStrictEqual(
      Object.fromEntries(Object.entries(surfaceStyles.skins).map(([skin, value]) => [skin, value.radius])),
      { neon: '8px', stealth: '0px', prism: '2px' },
      'opaque surface styles must retain visibly distinct panel geometry'
    );
    assert.strictEqual(new Set(Object.values(surfaceStyles.skins).map(value => value.shadow)).size, 3, 'surface styles must retain three distinct depth treatments');
    assert.notStrictEqual(surfaceStyles.skins.prism.borderImage, 'none', 'prism must retain its visible gradient edge');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 12, y: 120, button: 'left', clickCount: 1 }, sid);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 12, y: 120, button: 'left', clickCount: 1 }, sid);
    await waitEval(cdp, sid, `document.getElementById('settingsPanel').hidden`);
    await evalExpr(cdp, sid, `document.getElementById('settingsToggle').click()`);
    await waitEval(cdp, sid, `document.activeElement?.id === 'themeSelect'`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sid);
    await waitEval(cdp, sid, `document.getElementById('settingsPanel').hidden && document.activeElement?.id === 'settingsToggle'`);

    const touchTap = async selector => {
      const point = await evalExpr(cdp, sid, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] }, sid);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
    };
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' }, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 390 && innerHeight === 844');
    await waitEval(cdp, sid, `(() => { const entry = state.sessions.get(state.activeId); const proposed = entry?.fit?.proposeDimensions?.(); return !proposed || (entry.term.cols === proposed.cols && entry.term.rows === proposed.rows); })()`);
    const smartphonePortrait = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden'));
      const panel = visible[0];
      const grid = document.getElementById('termGrid');
      const targets = [document.querySelector('#compactLaunchMenu > .compact-menu-toggle'), document.querySelector('#compactActionsMenu > .compact-menu-toggle'), document.getElementById('addDesktop'), document.querySelector('.switcher-btn'), document.querySelector('.switcher-close')]
        .map(el => ({ id: el?.id || el?.className || '', ...rect(el) }));
      const before = structuredClone(windowPrefs()[state.activeId]);
      startPointerDrag(state.activeId, panel.querySelector('.term-header'), { button: 0 });
      startWindowResize(state.activeId, { button: 0 });
      startSharedResize({ axis: 'vertical', beforeIds: [state.activeId], afterIds: [] }, { button: 0 });
      return {
        compact: isCompactViewport(),
        overflowFree: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth,
        topbar: rect(document.querySelector('.topbar')),
        center: rect(document.querySelector('.command-center')),
        left: rect(document.querySelector('.command-left')),
        targets,
        visible: visible.length,
        panel: rect(panel),
        grid: rect(grid),
        headerHeight: rect(panel.querySelector('.term-header')).height,
        terminal: rect(panel.querySelector('.terminal')),
        xterm: (() => { const entry = state.sessions.get(state.activeId); const proposed = entry?.fit?.proposeDimensions?.(); return { cols: entry?.term?.cols, rows: entry?.term?.rows, proposed }; })(),
        arrangeDisplay: getComputedStyle(panel.querySelector('.arrange')).display,
        resizeHandlesHidden: [...panel.querySelectorAll('.window-resize-handle')].every(handle => getComputedStyle(handle).display === 'none'),
        dragState: Boolean(state.pointerDrag || state.resizeDrag || state.sharedResizeDrag),
        geometryPreserved: JSON.stringify(before) === JSON.stringify(windowPrefs()[state.activeId])
      };
    })()`);
    assert.strictEqual(smartphonePortrait.compact, true, '390px portrait must use compact viewport behavior');
    assert.strictEqual(smartphonePortrait.overflowFree, true, `smartphone document must not overflow horizontally: ${JSON.stringify(smartphonePortrait)}`);
    assert.ok(smartphonePortrait.topbar.height >= 84 && smartphonePortrait.center.top < smartphonePortrait.left.top,
      `smartphone chrome must keep navigation above launch/actions in two touch rows: ${JSON.stringify(smartphonePortrait)}`);
    assert.ok(smartphonePortrait.targets.every(target => target.width >= 40 && target.height >= 40 && target.left >= 0 && target.right <= 390),
      `primary smartphone controls must expose in-bounds 40px touch targets: ${JSON.stringify(smartphonePortrait.targets)}`);
    assert.ok(smartphonePortrait.visible === 1 && smartphonePortrait.panel.left >= smartphonePortrait.grid.left && smartphonePortrait.panel.right <= smartphonePortrait.grid.right && smartphonePortrait.panel.bottom <= smartphonePortrait.grid.bottom,
      `smartphone portrait must expose exactly one full in-bounds pane: ${JSON.stringify(smartphonePortrait)}`);
    assert.ok(smartphonePortrait.headerHeight >= 44 && smartphonePortrait.terminal.width > 0 && smartphonePortrait.terminal.height > 0,
      `smartphone pane chrome and terminal must remain usable: ${JSON.stringify(smartphonePortrait)}`);
    assert.ok(smartphonePortrait.xterm.cols >= 2 && smartphonePortrait.xterm.rows >= 2 && (!smartphonePortrait.xterm.proposed || (smartphonePortrait.xterm.cols === smartphonePortrait.xterm.proposed.cols && smartphonePortrait.xterm.rows === smartphonePortrait.xterm.proposed.rows)),
      `smartphone xterm must fit the visible terminal: ${JSON.stringify(smartphonePortrait.xterm)}`);
    assert.deepStrictEqual(
      { arrangeDisplay: smartphonePortrait.arrangeDisplay, resizeHandlesHidden: smartphonePortrait.resizeHandlesHidden, dragState: smartphonePortrait.dragState, geometryPreserved: smartphonePortrait.geometryPreserved },
      { arrangeDisplay: 'none', resizeHandlesHidden: true, dragState: false, geometryPreserved: true },
      'compact viewport must disable desktop arrange/drag/resize without changing authoritative geometry'
    );

    await touchTap('#compactActionsMenu > .compact-menu-toggle');
    await waitEval(cdp, sid, `document.getElementById('compactActionsMenu').classList.contains('open')`);
    const compactActionDisplays = await evalExpr(cdp, sid, `(() => {
      const monitor = document.getElementById('systemMonitor');
      const wasHidden = monitor.hidden;
      monitor.hidden = false;
      const displays = {
        monitor: getComputedStyle(monitor).display,
        codex: getComputedStyle(document.getElementById('codexLimits')).display
      };
      monitor.hidden = wasHidden;
      return displays;
    })()`);
    assert.deepStrictEqual(compactActionDisplays, { monitor: 'flex', codex: 'flex' },
      `compact Actions menu must expose enabled monitor and Codex controls: ${JSON.stringify(compactActionDisplays)}`);
    await touchTap('#chromeToggle');
    await waitEval(cdp, sid, `document.body.classList.contains('chrome-hidden') && !document.getElementById('chromePeek').hidden`);
    const smartphonePeek = await evalExpr(cdp, sid, `(() => { const r = document.getElementById('chromePeek').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`);
    assert.ok(smartphonePeek.left >= 0 && smartphonePeek.top >= 0 && smartphonePeek.right <= 390 && smartphonePeek.bottom <= 844 && smartphonePeek.width >= 44,
      `smartphone chrome restore control must remain touch-sized and in bounds: ${JSON.stringify(smartphonePeek)}`);
    await touchTap('#chromePeek');
    await waitEval(cdp, sid, `!document.body.classList.contains('chrome-hidden')`);
    await touchTap('#compactActionsMenu > .compact-menu-toggle');
    await waitEval(cdp, sid, `document.getElementById('compactActionsMenu').classList.contains('open')`);
    await touchTap('#settingsToggle');
    await waitEval(cdp, sid, `!document.getElementById('settingsPanel').hidden`);
    const smartphoneSettings = await evalExpr(cdp, sid, `(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const panel = document.getElementById('settingsPanel');
      return {
        panel: box(panel),
        close: box(document.getElementById('settingsClose')),
        selectHeights: [...panel.querySelectorAll('select')].map(el => box(el).height),
        bodyOverflow: getComputedStyle(panel.querySelector('.settings-body')).overflowY
      };
    })()`);
    assert.ok(smartphoneSettings.panel.left >= 0 && smartphoneSettings.panel.top >= 0 && smartphoneSettings.panel.right <= 390 && smartphoneSettings.panel.bottom <= 844,
      `smartphone settings must fill but not escape the viewport: ${JSON.stringify(smartphoneSettings)}`);
    assert.ok(smartphoneSettings.close.width >= 44 && smartphoneSettings.close.height >= 44 && smartphoneSettings.selectHeights.every(height => height >= 44) && smartphoneSettings.bodyOverflow === 'auto',
      `smartphone settings controls must be touch-sized and internally scrollable: ${JSON.stringify(smartphoneSettings)}`);
    await touchTap('#settingsClose');
    await waitEval(cdp, sid, `document.getElementById('settingsPanel').hidden`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 360 && innerHeight === 640');
    await touchTap('#compactActionsMenu > .compact-menu-toggle');
    await waitEval(cdp, sid, `document.getElementById('compactActionsMenu').classList.contains('open')`);
    await touchTap('#settingsToggle');
    await waitEval(cdp, sid, `!document.getElementById('settingsPanel').hidden`);
    const shortSettingsScroll = await evalExpr(cdp, sid, `(() => { const body = document.querySelector('.settings-body'); return { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight }; })()`);
    assert.ok(shortSettingsScroll.scrollHeight > shortSettingsScroll.clientHeight, `short smartphone settings must scroll internally: ${JSON.stringify(shortSettingsScroll)}`);
    await touchTap('#settingsClose');

    await touchTap('.term-panel:not(.layout-hidden) button.danger');
    await waitEval(cdp, sid, `document.getElementById('closeModal').classList.contains('open') && !document.getElementById('closeModal').hidden`);
    const smartphoneModal = await evalExpr(cdp, sid, `(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const modal = document.querySelector('.modal-box');
      return { modal: box(modal), buttons: [...modal.querySelectorAll('button')].map(box) };
    })()`);
    assert.ok(smartphoneModal.modal.left >= 0 && smartphoneModal.modal.right <= 360 && smartphoneModal.buttons.every(button => button.height >= 44),
      `smartphone confirmation must fit with touch-sized actions: ${JSON.stringify(smartphoneModal)}`);
    await touchTap('#closeModalCancel');
    await waitEval(cdp, sid, `document.getElementById('closeModal').hidden`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 844 && innerHeight === 390');
    const smartphoneLandscape = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden'));
      const topbar = document.querySelector('.topbar').getBoundingClientRect();
      const grid = document.getElementById('termGrid').getBoundingClientRect();
      const panel = visible[0].getBoundingClientRect();
      return { compact: isCompactViewport(), visible: visible.length, topbarHeight: topbar.height, inBounds: panel.left >= grid.left && panel.top >= grid.top && panel.right <= grid.right && panel.bottom <= grid.bottom };
    })()`);
    assert.deepStrictEqual(smartphoneLandscape, { compact: true, visible: 1, topbarHeight: smartphoneLandscape.topbarHeight, inBounds: true }, `short landscape phone must retain compact one-pane layout: ${JSON.stringify(smartphoneLandscape)}`);
    assert.ok(smartphoneLandscape.topbarHeight >= 84, `short landscape phone must retain touch chrome: ${JSON.stringify(smartphoneLandscape)}`);

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 430, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 1280 && innerHeight === 430');
    const desktopHeightBoundary = await evalExpr(cdp, sid, `({ jsCompact: isCompactViewport(), cssCompact: matchMedia('(max-height: 419px)').matches })`);
    assert.deepStrictEqual(desktopHeightBoundary, { jsCompact: false, cssCompact: false },
      `JS and CSS must leave the 430px desktop viewport outside compact mode: ${JSON.stringify(desktopHeightBoundary)}`);

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' }, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 884, height: 1104, deviceScaleFactor: 2.5, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 884 && innerHeight === 1104');
    const foldPortrait = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const visible = [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden'));
      const launch = document.getElementById('compactLaunchMenu');
      const actions = document.getElementById('compactActionsMenu');
      const summaryBox = el => { const r = el?.querySelector('.compact-menu-toggle')?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, width: r.width, height: r.height } : null; };
      const probe = document.createElement('div');
      probe.className = 'settings-body';
      Object.assign(probe.style, { position: 'fixed', left: '-100px', top: '0', width: '40px', height: '40px', overflowY: 'scroll' });
      probe.innerHTML = '<div style="height:100px"></div>';
      document.body.append(probe);
      const scrollbarWidth = probe.offsetWidth - probe.clientWidth;
      probe.remove();
      return {
        compact: isCompactViewport(),
        coarse: matchMedia('(pointer: coarse)').matches,
        visible: visible.length,
        launchDisplay: launch && getComputedStyle(launch).display,
        actionDisplay: actions && getComputedStyle(actions).display,
        summaries: [summaryBox(launch), summaryBox(actions)],
        scrollbarWidth
      };
    })()`);
    assert.ok(foldPortrait.compact && foldPortrait.coarse && foldPortrait.visible === 1,
      `unfolded Fold portrait must use the compact one-pane layout: ${JSON.stringify(foldPortrait)}`);
    assert.ok(foldPortrait.launchDisplay !== 'contents' && foldPortrait.actionDisplay !== 'contents' && foldPortrait.summaries.every(box => box && box.width >= 40 && box.height >= 40 && box.left >= 0 && box.right <= 884),
      `tight Fold chrome must expose in-bounds dropdown triggers: ${JSON.stringify(foldPortrait)}`);
    assert.strictEqual(foldPortrait.scrollbarWidth, 4, `Chromium PassiDeck scrollbars must render at a visibly slim 4px: ${JSON.stringify(foldPortrait)}`);

    await touchTap('#compactActionsMenu > .compact-menu-toggle');
    await waitEval(cdp, sid, `document.getElementById('compactActionsMenu').classList.contains('open')`);
    const foldActionMenu = await evalExpr(cdp, sid, `(() => {
      const menu = document.querySelector('#compactActionsMenu .compact-menu-list');
      const box = menu.getBoundingClientRect();
      const buttons = [...menu.querySelectorAll('button')].filter(button => getComputedStyle(button).display !== 'none').map(button => {
        const r = button.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      });
      return { open: getComputedStyle(menu).display !== 'none', box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, buttons };
    })()`);
    assert.ok(foldActionMenu.open && foldActionMenu.box.left >= 0 && foldActionMenu.box.right <= 884 && foldActionMenu.buttons.every(button => button.width >= 44 && button.height >= 44),
      `Fold action dropdown must stay in bounds with touch-sized actions: ${JSON.stringify(foldActionMenu)}`);
    await touchTap('#settingsToggle');
    await waitEval(cdp, sid, `!document.getElementById('settingsPanel').hidden && !document.getElementById('compactActionsMenu').classList.contains('open')`);
    await touchTap('#settingsClose');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1104, height: 884, deviceScaleFactor: 2.5, mobile: true }, sid);
    await waitEval(cdp, sid, 'innerWidth === 1104 && innerHeight === 884');
    const foldLandscape = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      return {
        compact: isCompactViewport(),
        coarse: matchMedia('(pointer: coarse)').matches,
        visible: [...document.querySelectorAll('.term-panel')].filter(panel => !panel.classList.contains('layout-hidden')).length,
        menuTrigger: getComputedStyle(document.querySelector('#compactActionsMenu > .compact-menu-toggle')).display
      };
    })()`);
    assert.ok(foldLandscape.compact && foldLandscape.coarse && foldLandscape.visible === 1 && foldLandscape.menuTrigger !== 'none',
      `unfolded Fold landscape must remain compact on a coarse pointer display: ${JSON.stringify(foldLandscape)}`);

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sid);
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
        persisted: activeDesktop().minimized,
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
    await waitEval(cdp, sid, `!uiSavePending()`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 700, deviceScaleFactor: 1, mobile: false }, sid);
    await waitEval(cdp, sid, 'innerWidth === 760');
    const remoteMinimizeId = await evalExpr(cdp, sid, `(() => {
      responsiveMinimizeForViewport();
      applyLayoutVisibility();
      const id = [...state.responsiveMinimized][0];
      const ui = uiPayload();
      ui.revision = state.uiRevision + 1;
      ui.panePrefs = structuredClone(state.panePrefs);
      const desktop = ui.panePrefs.desktops[state.activeDesktopId];
      desktop.minimized = [...new Set([...persistentMinimizedIds(), id])];
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
    await waitEval(cdp, sid, 'state?.activeId && state.sessions.has(state.activeId)');
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
    assert.ok(resumeLifecycle.healthy.sent.includes('ping') && resumeLifecycle.healthy.sent.includes('resize') && resumeLifecycle.healthy.sent.includes('redraw') && resumeLifecycle.healthy.refreshes >= 2,
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

    const backendLatency = await evalExpr(cdp, sid, `(async () => {
      const entry = state.sessions.get(state.activeId);
      entry.ws.latencyMs = Number.NaN;
      entry.ws.pingStartedAt = 0;
      probeActiveBackend();
      for (let i = 0; i < 30 && !Number.isFinite(entry.ws.latencyMs); i += 1) await new Promise(resolve => setTimeout(resolve, 20));
      const chip = document.getElementById('backendLatency');
      return {
        latency: entry.ws.latencyMs,
        text: chip.textContent.replace(/\\s+/g, ' ').trim(),
        level: chip.dataset.level,
        label: chip.getAttribute('aria-label')
      };
    })()`);
    assert.ok(Number.isFinite(backendLatency.latency) && backendLatency.latency >= 0, `backend latency must use a real WebSocket ping/pong round trip: ${JSON.stringify(backendLatency)}`);
    assert.strictEqual(backendLatency.text, `NET ${backendLatency.latency} ms`, `latency chip must show the active terminal round trip: ${JSON.stringify(backendLatency)}`);
    assert.ok(['good', 'warn', 'bad'].includes(backendLatency.level) && backendLatency.label === `Backend round trip: ${backendLatency.latency} ms`,
      `latency chip must expose threshold color and accessible context: ${JSON.stringify(backendLatency)}`);

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
        if (entry.url?.endsWith('/api/codex-limits') && entry.text?.includes('503 (Service Unavailable)')) return false;
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
