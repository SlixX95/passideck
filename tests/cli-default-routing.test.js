// Sprint 24 T4 — dispatch integration tests.
//
// Spawns `node packages/cli/src/index.js` against a temp HOME and
// asserts on stdout. We don't actually want a server to come up —
// we just want to know whether stack.js was reached. The cheapest
// signal: stack.js prints "TermDeck Stack Launcher" before any
// PTY/Express work happens. Index.js without orchestration prints
// the boxed banner ("TermDeck v0.4.6"). Either signal is enough.
//
// Run: node --test tests/cli-default-routing.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'packages', 'cli', 'src', 'index.js');

function freshHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'termdeck-test-'));
}

function configuredHome() {
  const home = freshHome();
  fs.mkdirSync(path.join(home, '.termdeck'), { recursive: true });
  fs.writeFileSync(path.join(home, '.termdeck', 'secrets.env'), 'SUPABASE_URL=x\n');
  fs.writeFileSync(path.join(home, '.termdeck', 'config.yaml'), 'mnestra:\n  autoStart: true\n');
  return home;
}

// Spawn the CLI, capture stdout for `windowMs`, then kill. We never
// let it bind a port — kill the moment we see one of the marker
// strings or after the timeout elapses.
function captureCliOutput(args, env, windowMs = 1500) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args, '--no-open'], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let killed = false;
    const kill = () => {
      if (killed) return;
      killed = true;
      try { child.kill('SIGTERM'); } catch (_e) { /* already gone */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch (_e) { /* gone */ } }, 200);
    };
    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr.on('data', (b) => { out += b.toString('utf8'); });
    child.on('exit', () => resolve(out));
    setTimeout(kill, windowMs);
  });
}

test('fresh machine: plain `termdeck` does NOT enter stack.js', async () => {
  const home = freshHome();
  const out = await captureCliOutput([], { HOME: home, USERPROFILE: home, TERMDECK_PORT: '0' });
  assert.ok(!/TermDeck Stack Launcher/.test(out),
    `expected no "TermDeck Stack Launcher" header on a fresh machine, got:\n${out}`);
});

test('configured machine: plain `termdeck` routes through stack.js', async () => {
  const home = configuredHome();
  const out = await captureCliOutput([], { HOME: home, USERPROFILE: home, TERMDECK_PORT: '0' });
  assert.match(out, /TermDeck Stack Launcher/,
    `expected stack.js banner on a configured machine`);
});

test('configured machine: `termdeck --no-stack` skips orchestration', async () => {
  const home = configuredHome();
  const out = await captureCliOutput(['--no-stack'], { HOME: home, USERPROFILE: home, TERMDECK_PORT: '0' });
  assert.ok(!/TermDeck Stack Launcher/.test(out),
    `--no-stack should bypass stack.js, got:\n${out}`);
});

test('any machine: explicit `termdeck stack` always orchestrates', async () => {
  const home = freshHome();
  const out = await captureCliOutput(['stack'], { HOME: home, USERPROFILE: home, TERMDECK_PORT: '0' });
  assert.match(out, /TermDeck Stack Launcher/,
    `explicit "stack" should always run the orchestrator, even on fresh machines`);
});

test('--help is unaffected by orchestration detection', async () => {
  const home = configuredHome();
  const out = await captureCliOutput(['--help'], { HOME: home, USERPROFILE: home }, 800);
  assert.match(out, /TermDeck - Web-based terminal multiplexer/);
  assert.match(out, /--no-stack/);
});
