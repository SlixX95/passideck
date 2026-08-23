const assert = require('assert');
const {
  DEFAULT_BACKENDS,
  normalizeConfig,
  normalizeMainWindowState,
  normalizePopoutPrefs
} = require('../packages/electron/backend-profiles');

assert.deepStrictEqual(
  DEFAULT_BACKENDS.map(({ name, url, color }) => ({ name, url, color })),
  [
    { name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
    { name: 'PassiDeck Dev', url: 'http://42.69.42.44:8792/', color: '#e0af68' },
    { name: 'Mathilda', url: 'http://100.74.164.4:8791/', color: '#bb9af7' }
  ],
  'desktop should start with all current PassiDeck backends'
);

const migrated = normalizeConfig({ backendUrl: 'http://42.69.42.44:8791/' });
assert.strictEqual(migrated.backends.length, 3, 'legacy single-backend settings should gain enabled default tabs');
assert.strictEqual(migrated.activeBackendId, migrated.backends[0].id, 'legacy active backend should remain selected');
assert.ok(migrated.backends.every(backend => backend.id && backend.name && backend.url && backend.color), 'every backend profile must be complete');
assert.strictEqual(migrated.globalSoundEnabled, true, 'desktop response sounds should default to enabled');
assert.strictEqual(migrated.notifyBlinking, true, 'response blinking should default to enabled');

const muted = normalizeConfig({ ...migrated, globalSoundEnabled: false });
assert.strictEqual(muted.globalSoundEnabled, false, 'desktop global sound toggle must persist independently of backend settings');

const staticAttention = normalizeConfig({ ...migrated, notifyBlinking: false });
assert.strictEqual(staticAttention.notifyBlinking, false, 'desktop response blinking preference must persist independently of sound');

const upgraded = normalizeConfig({
  configVersion: 2,
  activeBackendId: 'mathilda',
  backends: [
    { id: 'maeve', name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
    { id: 'mathilda', name: 'Mathilda', url: 'http://100.77.97.64:8791/', color: '#bb9af7' }
  ]
});
assert.ok(upgraded.backends.some(backend => backend.id === 'passideck-dev'), 'existing settings should gain PassiDeck Dev once');
assert.strictEqual(upgraded.backends.find(backend => backend.id === 'mathilda').url, 'http://100.74.164.4:8791/', 'legacy Mathilda URL must migrate to the current host');
assert.strictEqual(upgraded.activeBackendId, 'mathilda', 'active Mathilda profile must remain selected after migration');

const v4WithoutMathilda = normalizeConfig({
  configVersion: 4,
  activeBackendId: 'maeve',
  backends: [
    { id: 'maeve', name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
    { id: 'passideck-dev', name: 'PassiDeck Dev', url: 'http://42.69.42.44:8792/', color: '#e0af68' }
  ]
});
assert.strictEqual(v4WithoutMathilda.backends.find(backend => backend.id === 'mathilda').url, 'http://100.74.164.4:8791/', 'v4 settings must gain the newly enabled Mathilda backend');

const customMathilda = normalizeConfig({
  configVersion: v4WithoutMathilda.configVersion,
  activeBackendId: 'mathilda',
  backends: [
    ...v4WithoutMathilda.backends.filter(backend => backend.id !== 'mathilda'),
    { id: 'mathilda', name: 'Custom Mathilda', url: 'http://100.74.164.4:8891/', color: '#cf0c0c' }
  ]
});
assert.strictEqual(customMathilda.backends.find(backend => backend.id === 'mathilda').url, 'http://100.74.164.4:8891/', 'current settings must preserve a user-entered custom Mathilda URL');

const repairedDev = normalizeConfig({
  configVersion: 3,
  activeBackendId: 'maeve',
  backends: [
    { id: 'maeve', name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
    { id: 'passideck-dev', name: 'PassiDeck Dev', url: 'http://42.69.42.44:8791/', color: '#cf0c0c' }
  ]
});
const repairedDevBackend = repairedDev.backends.find(backend => backend.id === 'passideck-dev');
assert.strictEqual(repairedDevBackend.url, 'http://42.69.42.44:8792/', 'v3 settings corrupted by release migration must restore the Dev URL');
assert.strictEqual(repairedDevBackend.color, '#cf0c0c', 'Dev URL repair must preserve the user-selected color');

const customDev = normalizeConfig({
  configVersion: repairedDev.configVersion,
  activeBackendId: 'passideck-dev',
  backends: [
    { id: 'maeve', name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
    { id: 'passideck-dev', name: 'Custom Dev', url: 'http://42.69.42.44:8892/', color: '#cf0c0c' }
  ]
});
assert.strictEqual(customDev.backends.find(backend => backend.id === 'passideck-dev').url,
  'http://42.69.42.44:8892/', 'current settings must preserve a user-entered custom Dev URL');

const deliberateRemoval = normalizeConfig({
  configVersion: upgraded.configVersion,
  activeBackendId: 'maeve',
  backends: upgraded.backends.filter(backend => backend.id !== 'passideck-dev')
});
assert.ok(!deliberateRemoval.backends.some(backend => backend.id === 'passideck-dev'), 'current settings must respect deliberate backend removal');

assert.deepStrictEqual(
  normalizeMainWindowState({ x: -1200.4, y: 44.6, width: 1333.2, height: 777.8, maximized: true }),
  { x: -1200, y: 45, width: 1333, height: 778, maximized: true },
  'main app window geometry must survive restart with native integer bounds and maximized state'
);
assert.strictEqual(normalizeMainWindowState({ width: 10, height: Infinity }), null, 'invalid main app geometry must fail closed');

assert.deepStrictEqual(
  normalizePopoutPrefs({
    paneA: { backendId: 'maeve', x: 1800.1, y: -20.7, width: 720.4, height: 480.6, alwaysOnTop: true, open: true },
    paneB: { backendId: '', x: 1, y: 2, width: 3, height: 4 },
    paneC: 'invalid'
  }),
  {
    paneA: { backendId: 'maeve', x: 1800, y: -21, width: 720, height: 481, alwaysOnTop: true, open: true }
  },
  'only complete detached-window geometry may be restored after restart'
);

const rememberedWindows = normalizeConfig({
  ...migrated,
  mainWindowState: { x: 10, y: 20, width: 1400, height: 900, maximized: false },
  popoutPrefs: { paneA: { backendId: 'maeve', x: 100, y: 200, width: 700, height: 500, open: true } }
});
assert.deepStrictEqual(rememberedWindows.mainWindowState, { x: 10, y: 20, width: 1400, height: 900, maximized: false }, 'normalized config must retain the main app window');
assert.strictEqual(rememberedWindows.popoutPrefs.paneA.open, true, 'normalized config must retain which detached windows were open');

console.log('electron-backends ok');
