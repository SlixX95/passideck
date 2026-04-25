// Tests for `termdeck doctor` — Sprint 28 T2.
//
// We monkey-patch `_detectInstalled` and `_fetchLatest` on the module export
// so each case feeds canned versions through the resolve/classify/exit-code
// pipeline without touching npm or the real registry. process.stdout.write
// is stubbed for the duration of each call so the test runner output stays
// clean and so we can assert on JSON output verbatim.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const doctor = require(path.join(__dirname, '..', 'packages', 'cli', 'src', 'doctor.js'));
const PACKAGES = doctor.STACK_PACKAGES;

const origDetect = doctor._detectInstalled;
const origFetch = doctor._fetchLatest;

function restore() {
  doctor._detectInstalled = origDetect;
  doctor._fetchLatest = origFetch;
}

async function runWithStubs({ detect, fetch, argv = [] }) {
  doctor._detectInstalled = detect;
  doctor._fetchLatest = fetch;
  const captured = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  let code;
  try {
    code = await doctor(argv);
  } finally {
    process.stdout.write = origWrite;
    restore();
  }
  return { code, output: captured.join('') };
}

test('doctor: exit code 0 when every package is installed and current', async () => {
  const { code, output } = await runWithStubs({
    detect: async () => '1.2.3',
    fetch: async () => '1.2.3',
  });
  assert.equal(code, 0);
  assert.match(output, /up to date/);
  assert.match(output, /All packages up to date/);
});

test('doctor: exit code 1 when at least one package is behind', async () => {
  const behindPkg = PACKAGES[0];
  const { code, output } = await runWithStubs({
    detect: async (p) => (p === behindPkg ? '0.5.0' : '1.0.0'),
    fetch: async (p) => (p === behindPkg ? '0.5.1' : '1.0.0'),
  });
  assert.equal(code, 1);
  assert.match(output, /update available/);
  assert.match(output, /1 update available/);
});

test('doctor: exit code 2 when a registry fetch fails — even if other rows are current', async () => {
  const offlinePkg = PACKAGES[2];
  const { code, output } = await runWithStubs({
    detect: async () => '1.0.0',
    fetch: async (p) => (p === offlinePkg ? null : '1.0.0'),
  });
  assert.equal(code, 2);
  assert.match(output, /network error/);
  assert.match(output, /Could not reach npm registry/);
});

test('doctor: --json emits a parseable JSON document with the same exit code', async () => {
  const { code, output } = await runWithStubs({
    detect: async () => '1.0.0',
    fetch: async () => '1.0.0',
    argv: ['--json'],
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.rows.length, PACKAGES.length);
  for (const row of parsed.rows) {
    assert.ok(PACKAGES.includes(row.package), `unexpected package in JSON: ${row.package}`);
    assert.equal(row.status, doctor.STATUS.UP_TO_DATE);
  }
});
