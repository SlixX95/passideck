// Fixture tests for PATTERNS.error in packages/server/src/session.js.
//
// Sprint 26 T4 narrowed PATTERNS.error from a substring match against "error"
// to a line-anchored alternation that requires real error-line shapes
// (Error:, error:, Traceback, npm ERR!, error[Ennn]:, Uncaught Exception,
// Fatal:). These fixtures lock in both directions: prose mentioning the word
// "error" must NOT trigger, and canonical error-line shapes MUST trigger.
//
// Run: node --test tests/analyzer-error-fixtures.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { PATTERNS } = require('../packages/server/src/session.js');

const SHOULD_NOT_TRIGGER = [
  ['Claude prose mentioning a past error', 'Looking at the error you mentioned, I think the cause is...'],
  ['markdown heading with capital Error',  '# Error handling pattern'],
  ['shell command grepping for "error"',   'grep error /var/log/syslog'],
  ['Haiku synthesis referencing prior error', 'The error message in the previous session was unrelated.'],
];

const SHOULD_TRIGGER = [
  ['Node ENOENT Error: line',              'Error: ENOENT: no such file or directory'],
  ['npm ERR! tag',                          'npm ERR! code ERESOLVE'],
  ['Python Traceback header',               'Traceback (most recent call last):\n  File "x.py"'],
  ['Rust borrow-checker error code',        'error[E0382]: borrow of moved value'],
  ['git Fatal: line',                       'Fatal: not a git repository'],
];

test('PATTERNS.error does not trigger on non-error prose mentioning "error"', () => {
  for (const [name, fixture] of SHOULD_NOT_TRIGGER) {
    assert.equal(
      PATTERNS.error.test(fixture),
      false,
      `expected no match for ${name}: ${JSON.stringify(fixture)}`,
    );
  }
});

test('PATTERNS.error triggers on real error-line shapes', () => {
  for (const [name, fixture] of SHOULD_TRIGGER) {
    assert.equal(
      PATTERNS.error.test(fixture),
      true,
      `expected match for ${name}: ${JSON.stringify(fixture)}`,
    );
  }
});
