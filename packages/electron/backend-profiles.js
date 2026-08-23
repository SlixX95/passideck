const { randomUUID } = require('crypto');

const CONFIG_VERSION = 5;
const LEGACY_MATHILDA_URL = 'http://100.77.97.64:8791/';
const DEFAULT_BACKENDS = [
  { id: 'maeve', name: 'Maeve', url: 'http://42.69.42.44:8791/', color: '#5fffd1' },
  { id: 'passideck-dev', name: 'PassiDeck Dev', url: 'http://42.69.42.44:8792/', color: '#e0af68' },
  { id: 'mathilda', name: 'Mathilda', url: 'http://100.74.164.4:8791/', color: '#bb9af7' }
];

function normalizeUrl(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Backend URL must start with http:// or https://');
  return url.href;
}

function normalizeBackend(value, fallback = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(value?.color || '') ? value.color : fallback.color || '#5fffd1';
  return {
    id: String(value?.id || fallback.id || randomUUID()),
    name: String(value?.name || fallback.name || 'PassiDeck').trim() || 'PassiDeck',
    url: normalizeUrl(value?.url || fallback.url),
    color
  };
}

function normalizeWindowRect(value, minWidth, minHeight) {
  if (!value || typeof value !== 'object') return null;
  const numbers = ['x', 'y', 'width', 'height'].map(key => Number(value[key]));
  if (!numbers.every(Number.isFinite) || numbers[2] < minWidth || numbers[3] < minHeight) return null;
  const [x, y, width, height] = numbers.map(Math.round);
  return { x, y, width, height };
}

function normalizeMainWindowState(value) {
  const rect = normalizeWindowRect(value, 800, 500);
  return rect ? { ...rect, maximized: value.maximized === true } : null;
}

function normalizePopoutPrefs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prefs = {};
  for (const [sessionId, pref] of Object.entries(value).slice(0, 256)) {
    const rect = normalizeWindowRect(pref, 320, 240);
    const backendId = typeof pref?.backendId === 'string' ? pref.backendId.trim() : '';
    if (!sessionId || !backendId || !rect) continue;
    prefs[sessionId] = { backendId, ...rect, alwaysOnTop: pref.alwaysOnTop === true, open: pref.open === true };
  }
  return prefs;
}

function normalizeConfig(value = {}) {
  let backends;
  if (Array.isArray(value.backends) && value.backends.length) {
    backends = value.backends.map(backend => normalizeBackend(backend));
    if (value.configVersion !== CONFIG_VERSION) {
      for (const backend of DEFAULT_BACKENDS) {
        if (!backends.some(item => item.id === backend.id)) backends.push({ ...backend });
      }
    }
  } else {
    backends = DEFAULT_BACKENDS.map(backend => ({ ...backend }));
    if (value.backendUrl) backends[0].url = normalizeUrl(value.backendUrl);
  }
  if (Number(value.configVersion || 0) < 4) {
    const dev = backends.find(backend => backend.id === 'passideck-dev');
    if (dev?.url === DEFAULT_BACKENDS[0].url) dev.url = DEFAULT_BACKENDS[1].url;
  }
  if (Number(value.configVersion || 0) < 5) {
    const mathilda = backends.find(backend => backend.id === 'mathilda');
    if (mathilda?.url === LEGACY_MATHILDA_URL) mathilda.url = DEFAULT_BACKENDS[2].url;
  }
  const activeBackendId = backends.some(backend => backend.id === value.activeBackendId)
    ? value.activeBackendId
    : backends[0].id;
  return {
    configVersion: CONFIG_VERSION,
    activeBackendId,
    globalSoundEnabled: value.globalSoundEnabled !== false,
    notifyBlinking: value.notifyBlinking !== false,
    popoutRememberGeometry: value.popoutRememberGeometry !== false,
    mainWindowState: normalizeMainWindowState(value.mainWindowState),
    popoutPrefs: normalizePopoutPrefs(value.popoutPrefs),
    backends
  };
}

module.exports = { CONFIG_VERSION, DEFAULT_BACKENDS, normalizeUrl, normalizeBackend, normalizeMainWindowState, normalizePopoutPrefs, normalizeConfig };
