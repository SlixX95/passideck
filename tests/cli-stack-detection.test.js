// Sprint 24 T4 — unit tests for shouldAutoOrchestrate().
//
// Verifies the detection rule that decides whether plain `termdeck`
// should route through stack.js. Uses a temp HOME so the test never
// touches the developer's real ~/.termdeck/.
//
// Run: node --test tests/cli-stack-detection.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { shouldAutoOrchestrate } = require('../packages/cli/src/auto-orchestrate.js');

function makeFixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'termdeck-test-'));
  fs.mkdirSync(path.join(home, '.termdeck'), { recursive: true });
  return home;
}

function writeConfig(home, body) {
  fs.writeFileSync(path.join(home, '.termdeck', 'config.yaml'), body);
}

function writeSecrets(home) {
  fs.writeFileSync(path.join(home, '.termdeck', 'secrets.env'), 'SUPABASE_URL=https://x.supabase.co\n');
}

test('fresh machine — no ~/.termdeck/ at all', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'termdeck-test-'));
  assert.equal(shouldAutoOrchestrate(home), false);
});

test('secrets.env exists but no config.yaml', () => {
  const home = makeFixture();
  writeSecrets(home);
  assert.equal(shouldAutoOrchestrate(home), false);
});

test('config.yaml exists but no secrets.env', () => {
  const home = makeFixture();
  writeConfig(home, 'mnestra:\n  autoStart: true\n');
  assert.equal(shouldAutoOrchestrate(home), false);
});

test('secrets.env + config.yaml with mnestra.autoStart: true', () => {
  const home = makeFixture();
  writeSecrets(home);
  writeConfig(home, 'mnestra:\n  autoStart: true\n');
  assert.equal(shouldAutoOrchestrate(home), true);
});

test('secrets.env + config.yaml with rag.enabled: true', () => {
  const home = makeFixture();
  writeSecrets(home);
  writeConfig(home, 'rag:\n  enabled: true\n');
  assert.equal(shouldAutoOrchestrate(home), true);
});

test('both flags false → no orchestration', () => {
  const home = makeFixture();
  writeSecrets(home);
  writeConfig(home, 'mnestra:\n  autoStart: false\nrag:\n  enabled: false\n');
  assert.equal(shouldAutoOrchestrate(home), false);
});

test('malformed YAML returns false (no throw)', () => {
  const home = makeFixture();
  writeSecrets(home);
  writeConfig(home, ':\n  bad: [broken\n');
  assert.doesNotThrow(() => shouldAutoOrchestrate(home));
  assert.equal(shouldAutoOrchestrate(home), false);
});

test('autoStart: true OR rag.enabled: true — either triggers', () => {
  const home = makeFixture();
  writeSecrets(home);
  writeConfig(home, 'mnestra:\n  autoStart: false\nrag:\n  enabled: true\n');
  assert.equal(shouldAutoOrchestrate(home), true);
});
