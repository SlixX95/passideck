// Regression tests for packages/server/src/setup/prompts.js askSecret.
//
// Brad reported on 2026-04-25 (twice) that the CLI init wizard aborted as
// if Ctrl-C was pressed after the Anthropic key prompt on MobaXterm SSH.
// These fixtures lock down the three classes of bugs that were found:
//
//   1. CRLF leak — terminal sends `\r\n` as a single chunk; resolver must
//      not leak the trailing `\n` into the next prompt's stream.
//   2. ANSI escape sequences inside the prompt window must be silently
//      consumed, not stuffed into the password buffer.
//   3. Ctrl-C inside a secret prompt is a soft cancel (resolve with empty
//      string), not a SIGINT to the parent process.
//
// We exercise askSecret by pretending stdin is a TTY (override `isTTY`),
// pushing chunks at the data listener, and asserting the resolved value.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// Keep the prompts module load isolated per test — askSecret is async and
// we mutate process.stdin, so a fresh require keeps state crisp.
function loadPrompts() {
  const id = require.resolve(path.resolve(__dirname, '..', 'packages', 'server', 'src', 'setup', 'prompts.js'));
  delete require.cache[id];
  return require(id);
}

// Minimal fake stdin that supports only what askSecret touches:
//   - on('data', fn) / removeListener
//   - setRawMode(bool)
//   - resume() / pause()
//   - setEncoding()
//   - unshift(buf) — re-emit on next macrotask
function makeFakeStdin() {
  const ee = new EventEmitter();
  ee.isTTY = true;
  ee.setRawMode = () => {};
  ee.resume = () => {};
  ee.pause = () => {};
  ee.setEncoding = () => {};
  ee._unshifted = [];
  ee.unshift = (buf) => { ee._unshifted.push(buf); };
  return ee;
}

// Drive a single chunk into the fake stdin's data listener.
function emitChunk(stdin, str) {
  stdin.emit('data', str);
}

// Run askSecret against a fake stdin and return the eventual resolution.
async function captureSecret(stdin, chunks) {
  const realStdin = process.stdin;
  const realIsTTY = realStdin.isTTY;
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
  // Silence the *-echo + final \n on stdout for test cleanliness.
  const realWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const prompts = loadPrompts();
    const promise = prompts.askSecret('test');
    // Yield once so askSecret installs its data listener before we emit.
    await new Promise((r) => setImmediate(r));
    for (const chunk of chunks) {
      emitChunk(stdin, chunk);
    }
    return await promise;
  } finally {
    process.stdout.write = realWrite;
    Object.defineProperty(process, 'stdin', { value: realStdin, configurable: true });
    realStdin.isTTY = realIsTTY;
  }
}

// ── Bug 1: CRLF leak ────────────────────────────────────────────────────────

test('askSecret resolves with the buffer on a Unix LF terminator', async () => {
  const stdin = makeFakeStdin();
  const result = await captureSecret(stdin, ['secret\n']);
  assert.equal(result, 'secret');
});

test('askSecret resolves with the buffer on Windows CRLF and does not leak the \\n', async () => {
  const stdin = makeFakeStdin();
  const result = await captureSecret(stdin, ['secret\r\n']);
  assert.equal(result, 'secret');
  // The trailing \n was consumed inside the same chunk — nothing should be
  // unshifted (it would otherwise propagate to the next prompt and cause
  // empty answers / spurious cancels).
  assert.equal(stdin._unshifted.length, 0,
    'CRLF leak: trailing \\n was pushed back when it should have been swallowed');
});

test('askSecret carries over only non-newline trailing bytes via stdin.unshift', async () => {
  // If the user pre-types into the next prompt, those bytes arrive in the
  // same chunk after Enter. They should be unshifted so readline reads them.
  const stdin = makeFakeStdin();
  const result = await captureSecret(stdin, ['secret\rnext-prompt-typeahead']);
  assert.equal(result, 'secret');
  assert.equal(stdin._unshifted.length, 1);
  assert.equal(stdin._unshifted[0].toString('utf-8'), 'next-prompt-typeahead');
});

// ── Bug 2: ANSI escape sequences ────────────────────────────────────────────

test('askSecret silently drops ANSI cursor-position-report escape sequences', async () => {
  const stdin = makeFakeStdin();
  // ESC [ 24 ; 80 R is a typical CPR. Embedding it mid-password should not
  // contaminate the buffer.
  const result = await captureSecret(stdin, ['sec', '[24;80R', 'ret\n']);
  assert.equal(result, 'secret');
});

test('askSecret silently drops bracketed-paste markers', async () => {
  const stdin = makeFakeStdin();
  // ESC [ 200 ~ … ESC [ 201 ~ wraps a paste in xterm.
  const result = await captureSecret(stdin, ['[200~', 'pa', 'ssword', '[201~', '\n']);
  assert.equal(result, 'password');
});

// ── Bug 3: Ctrl-C is a soft cancel ──────────────────────────────────────────

test('askSecret returns empty string on Ctrl-C instead of killing the process', async () => {
  const stdin = makeFakeStdin();
  // Simulate the user typing two chars, then a stray Ctrl-C arrives in a
  // later chunk. With the old behavior this would SIGINT the wizard.
  const result = await captureSecret(stdin, ['ab', '']);
  assert.equal(result, '');
});

// ── DEL / backspace still works ─────────────────────────────────────────────

test('askSecret honors backspace and DEL within the buffer', async () => {
  const stdin = makeFakeStdin();
  // type "abx", DEL, type "c", Enter → "abc"
  const result = await captureSecret(stdin, ['ab', 'x', '', 'c', '\n']);
  assert.equal(result, 'abc');
});
