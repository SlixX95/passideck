// Unit tests for packages/server/src/session.js
//
// Covers the highest-risk surfaces flagged by the external code audit:
//   - stripAnsi: escape-sequence removal before pattern matching
//   - PATTERNS regexes: claude-code / gemini / python-server / shell / error
//   - Session.analyzeOutput: type detection, port detection, status transitions
//   - Session.trackInput: character-level command extraction with backspace +
//     escape-sequence handling (arrow keys must NOT pollute the command log)
//   - Session.onErrorDetected rate limiting (30s per session)
//   - SessionManager.updateMeta whitelist (no arbitrary metadata injection)
//
// Run: node --test packages/server/tests/session.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { Session, SessionManager } = require('../src/session');

// ─────────────────────────────────────────────────────────────────────────────
// stripAnsi — the first guard before every pattern match. Bugs here cascade.
// ─────────────────────────────────────────────────────────────────────────────

test('stripAnsi removes standard CSI sequences (SGR colors)', () => {
  // Red bold text
  const input = '\x1b[31;1mERROR\x1b[0m: not found';
  // stripAnsi is not exported, but we can exercise it indirectly through
  // analyzeOutput by feeding colored input to a session and observing that
  // the error pattern still matches.
  const s = new Session({ id: 'test-1', type: 'shell' });
  s.analyzeOutput(input);
  assert.equal(s.meta.status, 'errored', 'colored ERROR should still match error pattern');
});

test('stripAnsi removes zsh bracketed-paste sequences', () => {
  // Real zsh prompt with bracketed paste mode enable + CSI cursor move
  const input = '\x1b[?2004h\x1b[?1049h\x1b[0muser@host ~ % ';
  const s = new Session({ id: 'test-2', type: 'shell' });
  s.analyzeOutput(input);
  assert.equal(s.meta.status, 'idle', 'stripped zsh prompt should classify as idle');
});

test('stripAnsi removes OSC (title bar) sequences', () => {
  const input = '\x1b]0;custom title\x07user@host $ ls';
  const s = new Session({ id: 'test-3', type: 'shell' });
  s.analyzeOutput(input);
  // Just needs to not crash and still process the underlying content
  assert.ok(s.meta.status !== 'errored', 'OSC sequences are not errors');
});

// ─────────────────────────────────────────────────────────────────────────────
// Terminal type detection — identifying Claude Code vs Gemini vs Python server
// from raw stdout. This routes every downstream decision.
// ─────────────────────────────────────────────────────────────────────────────

test('Claude Code detection: recognizes the ❯ prompt marker', () => {
  const s = new Session({ id: 't-cc-1', type: 'shell' });
  s.analyzeOutput('❯ ');
  assert.equal(s.meta.type, 'claude-code');
});

test('Claude Code detection: command-name inference when prompt not yet visible', () => {
  const s = new Session({ id: 't-cc-2', type: 'shell', command: 'claude --resume' });
  s.analyzeOutput('starting up...');
  assert.equal(s.meta.type, 'claude-code');
});

test('Claude Code status: "thinking" transition from Thinking keyword', () => {
  const s = new Session({ id: 't-cc-3', type: 'claude-code' });
  s.analyzeOutput('Thinking about how to refactor the engram-bridge');
  assert.equal(s.meta.status, 'thinking');
});

test('Claude Code status: editing detection from Edit marker', () => {
  const s = new Session({ id: 't-cc-4', type: 'claude-code' });
  s.analyzeOutput('Edit packages/server/src/session.js');
  assert.equal(s.meta.status, 'editing');
  assert.ok(s.meta.statusDetail.startsWith('Edit '));
});

test('Gemini CLI detection: prompt marker', () => {
  const s = new Session({ id: 't-gem', type: 'shell' });
  s.analyzeOutput('gemini> ');
  assert.equal(s.meta.type, 'gemini');
});

test('Python server detection: Uvicorn banner', () => {
  const s = new Session({ id: 't-py-1', type: 'shell' });
  s.analyzeOutput('INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)');
  assert.equal(s.meta.type, 'python-server');
});

test('Python server detection: http.server banner', () => {
  const s = new Session({ id: 't-py-2', type: 'shell' });
  s.analyzeOutput('Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...');
  assert.equal(s.meta.type, 'python-server');
});

test('Python server detection: Django dev server banner', () => {
  const s = new Session({ id: 't-py-3', type: 'shell' });
  s.analyzeOutput('Starting development server at http://127.0.0.1:8000/');
  assert.equal(s.meta.type, 'python-server');
});

// ─────────────────────────────────────────────────────────────────────────────
// Port detection — fills meta.detectedPort from multiple common phrasings
// ─────────────────────────────────────────────────────────────────────────────

test('Port detection: "port 3000" form', () => {
  const s = new Session({ id: 't-port-1', type: 'python-server' });
  s.analyzeOutput('Server listening on port 3000');
  assert.equal(s.meta.detectedPort, 3000);
});

test('Port detection: ":8080" URL form', () => {
  const s = new Session({ id: 't-port-2', type: 'python-server' });
  s.analyzeOutput('Running at http://0.0.0.0:8080/');
  assert.equal(s.meta.detectedPort, 8080);
});

test('Port detection: "listening on http://localhost:5173" form', () => {
  // The current regex requires "on" or "at" before the URL. Bare "➜  Local:
  // http://..." Vite output is not picked up — that's a known gap and a
  // followup (Sprint 4 — teach the port regex to match Vite/Next style
  // bullet lines). For this test, use a phrasing the regex does handle.
  const s = new Session({ id: 't-port-3', type: 'python-server' });
  s.analyzeOutput('ready - started server on 0.0.0.0, url: http://localhost:5173');
  assert.equal(s.meta.detectedPort, 5173);
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP request counting — the python-server telemetry panel
// ─────────────────────────────────────────────────────────────────────────────

test('Request counting: GET / 200 increments the counter', () => {
  const s = new Session({ id: 't-req-1', type: 'python-server' });
  s.analyzeOutput('127.0.0.1 - - [15/Apr/2026] "GET /api/sessions HTTP/1.1" 200 -');
  assert.ok(s.meta.requestCount >= 1);
});

test('Request counting: multiple status codes on multiple lines', () => {
  const s = new Session({ id: 't-req-2', type: 'python-server' });
  const log = [
    '"GET / HTTP/1.1" 200 -',
    '"POST /api/sessions HTTP/1.1" 201 -',
    '"DELETE /api/sessions/abc HTTP/1.1" 204 -'
  ].join('\n');
  s.analyzeOutput(log);
  assert.ok(s.meta.requestCount >= 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// Error detection — the most critical pattern surface; feeds Flashback
// ─────────────────────────────────────────────────────────────────────────────

test('Error detection: lowercase "error" in output transitions to errored', () => {
  const s = new Session({ id: 't-err-1', type: 'shell' });
  s.analyzeOutput('error: could not find symbol foo in bar.c');
  assert.equal(s.meta.status, 'errored');
});

test('Error detection: Python traceback', () => {
  const s = new Session({ id: 't-err-2', type: 'shell' });
  s.analyzeOutput('Traceback (most recent call last):\n  File "x.py"');
  assert.equal(s.meta.status, 'errored');
});

test('Error detection: common Node errno codes', () => {
  const s = new Session({ id: 't-err-3', type: 'shell' });
  s.analyzeOutput('ENOENT: no such file or directory');
  assert.equal(s.meta.status, 'errored');
});

test('Error detection: zsh command-not-found', () => {
  const s = new Session({ id: 't-err-4', type: 'shell' });
  s.analyzeOutput('zsh: command not found: kubectl');
  assert.equal(s.meta.status, 'errored');
});

test('Error detection: HTTP 5xx from server log', () => {
  const s = new Session({ id: 't-err-5', type: 'python-server' });
  s.analyzeOutput('"GET /api/broken HTTP/1.1" 503 -');
  assert.equal(s.meta.status, 'errored');
});

test('Error detection: plural "errors" does NOT trigger (word-boundary guard)', () => {
  const s = new Session({ id: 't-err-6', type: 'shell' });
  // The pattern uses \berror\b with word boundaries — the trailing "s" in
  // "errors" is a word char, so \b does not match after "error" in "errors".
  // This is the intentional behavior: status-line recaps like "0 errors"
  // or "No errors reported" do NOT flood the Flashback pipeline.
  s.analyzeOutput('No errors reported in the build log');
  assert.notEqual(s.meta.status, 'errored', 'plural "errors" must not flip status');
});

test('Error rate limiting: onErrorDetected fires at most once per 30s per session', () => {
  const s = new Session({ id: 't-err-rate', type: 'shell' });
  let fireCount = 0;
  s.onErrorDetected = () => { fireCount += 1; };

  s.analyzeOutput('error: first failure');
  s.analyzeOutput('error: second failure one ms later');
  s.analyzeOutput('error: third failure');

  assert.equal(fireCount, 1, 'onErrorDetected should fire exactly once in a burst');
});

// ─────────────────────────────────────────────────────────────────────────────
// trackInput — character-level command capture, the feature that makes the
// command history useful. Bugs here pollute the RAG event log.
// ─────────────────────────────────────────────────────────────────────────────

test('trackInput: basic command extraction on \\r', () => {
  const s = new Session({ id: 't-in-1', type: 'shell' });
  s.trackInput('echo hello\r');
  assert.equal(s.meta.lastCommands.length, 1);
  assert.equal(s.meta.lastCommands[0].command, 'echo hello');
});

test('trackInput: backspace correctly removes characters', () => {
  const s = new Session({ id: 't-in-2', type: 'shell' });
  // Type "ls X", backspace, "-la"
  s.trackInput('ls X\x7f-la\r');
  assert.equal(s.meta.lastCommands[0].command, 'ls -la');
});

test('trackInput: empty input produces no command', () => {
  const s = new Session({ id: 't-in-3', type: 'shell' });
  s.trackInput('\r\r\r');
  assert.equal(s.meta.lastCommands.length, 0);
});

test('trackInput: arrow-key escape sequences do NOT pollute the command log', () => {
  const s = new Session({ id: 't-in-4', type: 'shell' });
  // Right arrow = \x1b[C, left arrow = \x1b[D, up arrow = \x1b[A, down = \x1b[B
  // User types: up-arrow (history), right-arrow (cursor move), "foo", enter
  s.trackInput('\x1b[A\x1b[Cfoo\r');
  assert.equal(s.meta.lastCommands.length, 1);
  assert.equal(s.meta.lastCommands[0].command, 'foo', 'escape sequences should be skipped, only foo remains');
});

test('trackInput: rolling buffer is capped at 10 entries', () => {
  const s = new Session({ id: 't-in-5', type: 'shell' });
  for (let i = 0; i < 15; i++) {
    s.trackInput(`cmd${i}\r`);
  }
  assert.equal(s.meta.lastCommands.length, 10);
  // Oldest should be cmd5, newest cmd14
  assert.equal(s.meta.lastCommands[0].command, 'cmd5');
  assert.equal(s.meta.lastCommands[9].command, 'cmd14');
});

test('trackInput: very long commands (>500 chars) are dropped', () => {
  const s = new Session({ id: 't-in-6', type: 'shell' });
  const longCmd = 'x'.repeat(501);
  s.trackInput(longCmd + '\r');
  assert.equal(s.meta.lastCommands.length, 0);
});

test('trackInput: onCommand callback fires with extracted command', () => {
  const s = new Session({ id: 't-in-7', type: 'shell' });
  const fired = [];
  s.onCommand = (id, cmd) => fired.push({ id, cmd });
  s.trackInput('git status\r');
  assert.equal(fired.length, 1);
  assert.equal(fired[0].cmd, 'git status');
  assert.equal(fired[0].id, 't-in-7');
});

// ─────────────────────────────────────────────────────────────────────────────
// SessionManager — the PATCH whitelist guard (added this round)
// ─────────────────────────────────────────────────────────────────────────────

test('SessionManager.updateMeta rejects non-whitelisted fields', () => {
  const mgr = new SessionManager(null);
  const session = mgr.create({ id: 'patch-1', type: 'shell' });
  session.meta.pid = 12345;
  session.meta.exitCode = null;

  mgr.updateMeta('patch-1', {
    theme: 'dracula',            // whitelisted → applied
    pid: 99999,                   // NOT whitelisted → must NOT be applied
    exitCode: 137,                // NOT whitelisted → must NOT be applied
    arbitraryField: 'injected',   // NOT whitelisted → must NOT be applied
    __proto__: { polluted: true } // must NOT reach the object
  });

  assert.equal(session.meta.theme, 'dracula', 'whitelisted theme should update');
  assert.equal(session.meta.pid, 12345, 'pid should be unchanged');
  assert.equal(session.meta.exitCode, null, 'exitCode should be unchanged');
  assert.equal(session.meta.arbitraryField, undefined, 'arbitrary field should not land on meta');
});

test('SessionManager.updateMeta accepts a valid label + project update', () => {
  const mgr = new SessionManager(null);
  mgr.create({ id: 'patch-2', type: 'shell' });
  mgr.updateMeta('patch-2', { label: 'debug panel', project: 'termdeck' });
  const s = mgr.sessions.get('patch-2');
  assert.equal(s.meta.label, 'debug panel');
  assert.equal(s.meta.project, 'termdeck');
});

test('SessionManager.updateMeta returns null for missing session', () => {
  const mgr = new SessionManager(null);
  const result = mgr.updateMeta('nonexistent', { theme: 'nord' });
  assert.equal(result, null);
});

test('SessionManager.updateMeta is a no-op on null/undefined updates', () => {
  const mgr = new SessionManager(null);
  mgr.create({ id: 'patch-3', type: 'shell' });
  const originalTheme = mgr.sessions.get('patch-3').meta.theme;
  mgr.updateMeta('patch-3', null);
  mgr.updateMeta('patch-3', undefined);
  assert.equal(mgr.sessions.get('patch-3').meta.theme, originalTheme);
});

// ─────────────────────────────────────────────────────────────────────────────
// Session serialization
// ─────────────────────────────────────────────────────────────────────────────

test('Session.toJSON returns id + meta + pid', () => {
  const s = new Session({ id: 't-json', type: 'shell', project: 'termdeck' });
  const json = s.toJSON();
  assert.equal(json.id, 't-json');
  assert.equal(json.meta.type, 'shell');
  assert.equal(json.meta.project, 'termdeck');
  assert.ok('pid' in json);
});
