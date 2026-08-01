const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tmpRoot = path.join(os.homedir(), 'tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const home = fs.mkdtempSync(path.join(tmpRoot, 'passideck-retitle-test-'));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pluginManifest = fs.readFileSync(path.join(root, 'plugins/passideck-retitle/plugin.yaml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'scripts/install.sh'), 'utf8');
process.env.PASSIDECK_HOME = home;
process.env.PASSIDECK_TMUX_SOCKET = `passideck-retitle-${process.pid}`;
delete process.env.PASSIDECK_TITLE_GEN_LLM;

const { loadConfig, normalizeTitleGenLlm } = require('../packages/server/src/config');
const {
  createServer,
  isLoopbackAddress,
  isTitleBridgeAddress,
  passideckTitleEnv,
  syncHermesTitles
} = require('../packages/server/src/index');
const dbModule = require('../packages/server/src/database');

(async () => {
  let app;
  let persistedDb;
  let hermesDb;
  try {
    assert.deepStrictEqual(
      pkg.files.filter(file => file.startsWith('plugins/passideck-retitle/')).sort(),
      [
        'plugins/passideck-retitle/README.md',
        'plugins/passideck-retitle/__init__.py',
        'plugins/passideck-retitle/plugin.yaml'
      ],
      'the npm artifact must ship exactly the companion plugin sources'
    );
    assert.ok(pluginManifest.includes('name: passideck-retitle') && pluginManifest.includes('  - pre_llm_call') && pluginManifest.includes('  - post_llm_call') && pluginManifest.includes('  - on_session_end') && pluginManifest.includes('  - on_session_finalize') && pluginManifest.includes('  - on_session_reset'), 'the shipped Hermes manifest must declare the working-state and title lifecycle hooks');
    assert.ok(installer.includes('HERMES_HOME_DIR="$(dirname "$(hermes config path)")"'), 'the installer must target the active Hermes home');
    assert.ok(installer.includes('install -m 0644 "$ROOT/plugins/passideck-retitle/$file" "$PLUGIN_DIR/.$file.tmp"'), 'the installer must deploy its bundled title integration without requiring a Git checkout');
    assert.ok(installer.includes('hermes plugins enable passideck-retitle'), 'the PassiDeck installer must enable its Hermes title integration automatically');
    assert.ok(!installer.includes('hermes plugins install'), 'the bundled integration must not be fetched or installed as a separate Git plugin');
    assert.ok(!readme.includes('hermes plugins install SlixX95/passideck-dev/plugins/passideck-retitle --enable'), 'users must not need a separate title-plugin installation step');
    const loadedConfig = loadConfig();
    assert.strictEqual(loadedConfig.titleGenLlm, 'host_aux_title', 'dynamic titles must default to the Hermes title auxiliary model');
    assert.strictEqual(Object.hasOwn(loadedConfig, 'configDir'), false, 'runtime config must not expose its storage directory');
    assert.strictEqual(Object.hasOwn(loadedConfig, 'configPath'), false, 'runtime config must not expose its storage path');
    assert.strictEqual(normalizeTitleGenLlm('off'), 'off');
    assert.strictEqual(normalizeTitleGenLlm('HOST_AUX_TITLE'), 'host_aux_title');
    assert.strictEqual(normalizeTitleGenLlm('typo'), 'off', 'unknown model routes must fail closed');

    process.env.PASSIDECK_TITLE_GEN_LLM = 'off';
    assert.strictEqual(loadConfig().titleGenLlm, 'off', 'the environment must be able to disable the bridge');
    delete process.env.PASSIDECK_TITLE_GEN_LLM;

    assert.strictEqual(isLoopbackAddress('127.0.0.1'), true);
    assert.strictEqual(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.strictEqual(isLoopbackAddress('192.168.1.4'), false, 'the unauthenticated title bridge must reject non-loopback peers');
    assert.deepStrictEqual(
      passideckTitleEnv({ port: 9911, titleGenLlm: 'host_aux_title' }),
      [
        'PASSIDECK_TITLE_ENDPOINT=http://127.0.0.1:9911/internal/session-title',
        'PASSIDECK_TITLE_GEN_LLM=host_aux_title',
        'PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://127.0.0.1:9911/internal/session-title/settings'
      ],
      'wildcard/default binds must keep the bridge loopback-only'
    );
    const tailscaleConfig = { host: '100.74.164.4', port: 9911, titleGenLlm: 'host_aux_title' };
    assert.deepStrictEqual(
      passideckTitleEnv(tailscaleConfig),
      [
        'PASSIDECK_TITLE_ENDPOINT=http://100.74.164.4:9911/internal/session-title',
        'PASSIDECK_TITLE_GEN_LLM=host_aux_title',
        'PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://100.74.164.4:9911/internal/session-title/settings'
      ],
      'a server bound only to a local interface must point the plugin at that reachable address'
    );
    assert.deepStrictEqual(
      passideckTitleEnv({ port: 9911, titleGenLlm: 'host_aux_title' }, 'pane-1', 'hermes'),
      [
        'PASSIDECK_TITLE_ENDPOINT=http://127.0.0.1:9911/internal/session-title',
        'PASSIDECK_TITLE_GEN_LLM=host_aux_title',
        'PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://127.0.0.1:9911/internal/session-title/settings',
        'PASSIDECK_WORKING_ENDPOINT=http://127.0.0.1:9911/internal/session-working'
      ],
      'normal Hermes CLI panes must receive the working bridge without the TUI-only publisher'
    );
    assert.deepStrictEqual(
      passideckTitleEnv({ port: 9911, titleGenLlm: 'host_aux_title' }, 'pane-1', 'hermes --tui'),
      [
        'PASSIDECK_TITLE_ENDPOINT=http://127.0.0.1:9911/internal/session-title',
        'PASSIDECK_TITLE_GEN_LLM=host_aux_title',
        'PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://127.0.0.1:9911/internal/session-title/settings',
        'PASSIDECK_WORKING_ENDPOINT=http://127.0.0.1:9911/internal/session-working',
        'HERMES_TUI_SIDECAR_URL=ws://127.0.0.1:9911/ws?hermesEvents=pane-1'
      ],
      'TUI panes must retain their native publisher alongside the working bridge'
    );
    assert.deepStrictEqual(
      passideckTitleEnv({ port: 9911, titleGenLlm: 'host_aux_title' }, 'pane-1', '/bin/bash'),
      [
        'PASSIDECK_TITLE_ENDPOINT=http://127.0.0.1:9911/internal/session-title',
        'PASSIDECK_TITLE_GEN_LLM=host_aux_title',
        'PASSIDECK_TITLE_SETTINGS_ENDPOINT=http://127.0.0.1:9911/internal/session-title/settings'
      ],
      'ordinary shell panes must not inherit Hermes lifecycle bridges'
    );
    assert.strictEqual(isTitleBridgeAddress('::ffff:100.74.164.4', tailscaleConfig), true, 'the bound local interface must be accepted as a same-host bridge');
    assert.strictEqual(isTitleBridgeAddress('100.74.164.5', tailscaleConfig), false, 'other Tailscale peers must remain rejected');

    app = createServer({ host: '127.0.0.1', port: 0, shell: '/bin/bash', titleGenLlm: 'host_aux_title', hermesStateDb: path.join(home, 'missing-hermes.db') });
    const session = app.sessions.create({ id: 'retitle-pane', command: 'hermes' });
    const broadcasts = [];
    session.clients.add({ readyState: 1, send: payload => broadcasts.push(JSON.parse(payload)) });

    persistedDb = new Database(path.join(home, 'passideck.db'));
    dbModule.upsertSession(persistedDb, session);

    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const postTitle = body => fetch(`${base}/internal/session-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const postWorking = body => fetch(`${base}/internal/session-working`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const workingStartResponse = await postWorking({ sessionId: 'retitle-pane', working: true });
    assert.strictEqual(workingStartResponse.status, 200);
    assert.strictEqual(session.hermesRunning, true, 'the CLI lifecycle bridge must mark a pane as working');
    assert.ok(broadcasts.some(event => event.type === 'hermes-event' && event.event?.type === 'message.start'), 'the CLI working start must reach connected clients');
    const workingCompleteResponse = await postWorking({ sessionId: 'retitle-pane', working: false });
    assert.strictEqual(workingCompleteResponse.status, 200);
    assert.strictEqual(session.hermesRunning, false, 'the CLI lifecycle bridge must clear the working state');
    assert.ok(broadcasts.some(event => event.type === 'hermes-event' && event.event?.type === 'message.complete'), 'the CLI working completion must reach connected clients');
    assert.strictEqual((await postWorking({ sessionId: 'retitle-pane', working: 'yes' })).status, 400);
    assert.strictEqual((await postWorking({ sessionId: 'missing', working: true })).status, 404);
    const provisionalResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-1',
      title: '  Session   titles immediately  ',
      kind: 'provisional',
      generation: '1784647000000000000:1:0'
    });
    assert.strictEqual(provisionalResponse.status, 200);
    assert.strictEqual(session.meta.title, 'Session titles immediately');
    assert.strictEqual(session.meta.titleSource, 'passideck-provisional');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-1');
    assert.ok(broadcasts.some(event => event.type === 'meta' && event.session.meta.title === 'Session titles immediately'), 'title changes must reach connected PassiDeck clients immediately');

    const modelResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-1',
      title: 'Dynamic PassiDeck Session Titles',
      kind: 'model',
      generation: '1784647000000000000:1:1'
    });
    assert.strictEqual(modelResponse.status, 200);
    assert.strictEqual(session.meta.title, 'Dynamic PassiDeck Session Titles');
    assert.strictEqual(session.meta.titleSource, 'passideck-retitle');

    const staleResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-1',
      title: 'Stale provisional title',
      kind: 'provisional',
      generation: '1784647000000000000:1:0'
    });
    assert.strictEqual(staleResponse.status, 202, 'out-of-order title requests must be acknowledged without applying them');
    assert.strictEqual(session.meta.title, 'Dynamic PassiDeck Session Titles', 'an older bridge request must never overwrite the latest model title');

    const persisted = persistedDb.prepare('SELECT dynamic_title, title_source, hermes_session_id, title_generation FROM sessions WHERE id = ?').get('retitle-pane');
    assert.deepStrictEqual(persisted, {
      dynamic_title: 'Dynamic PassiDeck Session Titles',
      title_source: 'passideck-retitle',
      hermes_session_id: 'hermes-1',
      title_generation: '1784647000000000000:1:1'
    }, 'dynamic title state must survive a PassiDeck restart');

    const resetResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-2',
      title: '',
      kind: 'reset',
      generation: '1784647000000000000:2:0'
    });
    assert.strictEqual(resetResponse.status, 200, '/new must clear the PassiDeck title immediately');
    assert.strictEqual(session.meta.title, '');
    assert.strictEqual(session.meta.titleSource, 'passideck-reset');
    assert.strictEqual(session.meta.hermesSessionId, 'hermes-2');
    assert.ok(broadcasts.some(event => event.type === 'meta' && event.session.meta.title === ''), 'the cleared title must reach connected clients immediately');

    const resetPersisted = persistedDb.prepare('SELECT dynamic_title, title_source, hermes_session_id, title_generation FROM sessions WHERE id = ?').get('retitle-pane');
    assert.deepStrictEqual(resetPersisted, {
      dynamic_title: '',
      title_source: 'passideck-reset',
      hermes_session_id: 'hermes-2',
      title_generation: '1784647000000000000:2:0'
    });
    assert.strictEqual((await postTitle({ sessionId: 'retitle-pane', title: '', kind: 'reset' })).status, 400, 'a reset must identify the new Hermes session');
    assert.strictEqual((await postTitle({ sessionId: 'retitle-pane', hermesSessionId: 'hermes-2', title: 'Not empty', kind: 'reset' })).status, 400, 'a reset must never smuggle in a replacement title');

    hermesDb = new Database(':memory:');
    hermesDb.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, started_at REAL, title TEXT)');
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-1', 'passideck:retitle-pane', 1, 'One-shot Hermes Title');
    hermesDb.prepare('INSERT INTO sessions (id, source, started_at, title) VALUES (?, ?, ?, ?)').run('hermes-2', 'passideck:retitle-pane', 2, 'New Hermes Session');

    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb, () => 'hermes-2'), 1, 'a real Hermes session switch must replace the old dynamic title');
    assert.strictEqual(session.meta.title, 'New Hermes Session');
    assert.strictEqual(session.meta.titleSource, 'hermes-db');

    const oldSessionResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-1',
      title: 'Late title from old Hermes session',
      kind: 'model',
      generation: '1784647000000000000:2:1'
    });
    assert.strictEqual(oldSessionResponse.status, 202, 'a late result from the previous Hermes session must be rejected');
    assert.strictEqual((await oldSessionResponse.json()).stale, true);
    assert.strictEqual(session.meta.title, 'New Hermes Session');

    const currentSessionResponse = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-2',
      title: 'Dynamic PassiDeck Session Titles',
      kind: 'model',
      generation: '1784647000000000000:3:1'
    });
    assert.strictEqual(currentSessionResponse.status, 200, 'the current Hermes session must still be able to retitle');
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb, () => 'hermes-2'), 0, 'Hermes polling must not overwrite a model-refined title for the same session');

    session.meta.title = 'Temporary prompt title';
    session.meta.titleSource = 'passideck-provisional';
    session.meta.hermesSessionId = null;
    assert.strictEqual(syncHermesTitles(app.sessions, hermesDb, () => 'hermes-2'), 1, 'the canonical Hermes title may replace a provisional title if auxiliary refinement fails');
    assert.strictEqual(session.meta.title, 'New Hermes Session');
    assert.strictEqual(session.meta.titleSource, 'hermes-db');

    const blankResponse = await postTitle({ sessionId: 'retitle-pane', title: '\u0000\n\t', kind: 'model' });
    assert.strictEqual(blankResponse.status, 400, 'empty or control-only titles must be rejected');
    const oversizedResponse = await postTitle({ sessionId: 'retitle-pane', title: 'x'.repeat(9000), kind: 'model' });
    assert.strictEqual(oversizedResponse.status, 413, 'the local bridge must cap request bodies before parsing');
    const missingResponse = await postTitle({ sessionId: 'missing', title: 'Title', kind: 'model' });
    assert.strictEqual(missingResponse.status, 404);

    const settingsBefore = await (await fetch(`${base}/api/settings`)).json();
    assert.deepStrictEqual(settingsBefore, { dynamicTitles: true, appliesAt: 'next-session' });
    const settingsOffResponse = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dynamicTitles: false })
    });
    assert.strictEqual(settingsOffResponse.status, 200);
    assert.deepStrictEqual(await settingsOffResponse.json(), { dynamicTitles: false, appliesAt: 'next-session' });
    assert.match(fs.readFileSync(path.join(home, 'config.yaml'), 'utf8'), /titleGenLlm:\s*off/);

    const currentSessionAfterToggle = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-2',
      title: 'Current session keeps Retitle mode',
      kind: 'model',
      generation: '1784647000000000000:4:1'
    });
    assert.strictEqual(currentSessionAfterToggle.status, 200, 'a session that started with Retitle on must finish after the setting changes');

    const internalSettings = await (await fetch(`${base}/internal/session-title/settings`)).json();
    assert.deepStrictEqual(internalSettings, { dynamicTitles: false });
    const resetWithRetitleOff = await postTitle({
      sessionId: 'retitle-pane',
      hermesSessionId: 'hermes-3',
      title: '',
      kind: 'reset',
      generation: '1784647000000000000:5:0'
    });
    assert.strictEqual(resetWithRetitleOff.status, 200, 'session reset clearing must remain available when Retitle is off');

    console.log('title-retitle ok');
  } finally {
    try { hermesDb?.close(); } catch {}
    try { persistedDb?.close(); } catch {}
    try { await app?.close(); } catch {}
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
