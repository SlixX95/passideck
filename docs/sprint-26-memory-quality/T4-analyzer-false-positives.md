# T4 — Output Analyzer False-Positive Narrowing

## Goal

`PATTERNS.error` in `packages/server/src/session.js` still flags completed Claude Code panels as `errored` when their output contains the literal word "error" in a non-error context (grep results, documentation passages, Haiku synthesis discussing "the error you saw earlier"). This was partially addressed in Sprint 16 but the regex is still too broad. Tighten the pattern to require error-line-shaped context, not just the substring `error`.

## Repo + working directory

You work in the **TermDeck repo**: `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`. First action: `cd ~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`.

## What's broken

`packages/server/src/session.js` defines `PATTERNS.error` and `PATTERNS.errorLineStart`. The error-detection branch (around lines 141, 302–320) chooses one based on session type. The `error` (non-line-start) variant matches anywhere in output, so any panel that scrolls a line containing the word "error" — including Claude's prose summaries — flips status to `errored` and triggers a Flashback toast.

## Implementation

### 1. Read the existing regex

Open `packages/server/src/session.js`, find the `PATTERNS` object. Note the current `error` and `errorLineStart` definitions. Copy them into your sign-off so the diff is reviewable.

### 2. Tighten `PATTERNS.error`

The new pattern should require **at least one of**:
- `Error:` followed by space and a non-empty message (Python/Node convention)
- `error:` at the start of a colon-prefixed log line (e.g. `error: cannot find module`)
- A traceback header (`Traceback (most recent call last):`)
- An npm/cargo error tag (`npm ERR!`, `error[E\d+]:` for Rust)
- An exit/exception keyword followed by capitalized noun (`Uncaught Exception`, `Fatal:`)

Combine into a single `RegExp` with alternation. Example shape (don't copy verbatim — calibrate to what you see in real fixtures):

```js
PATTERNS.error = /(?:^|\n)\s*(?:Error:\s+\S|error:\s+\S|Traceback \(most recent call last\):|npm ERR!|error\[E\d+\]:|Uncaught Exception|Fatal:)/m;
```

The `(?:^|\n)\s*` anchor is the key narrowing — it forces the match to be at the start of a line, not floating in mid-sentence prose.

Keep `PATTERNS.errorLineStart` intact — it's already line-anchored and is used for the more aggressive session types (shell). Only `PATTERNS.error` (used for Claude Code, Python servers, etc.) needs the narrowing.

### 3. Test fixtures in `tests/`

Add a new file `tests/analyzer-error-fixtures.test.js` with:

**Should NOT trigger** (false-positives we're fixing):
- `Looking at the error you mentioned, I think the cause is...` (Claude prose)
- `# Error handling pattern` (markdown heading)
- `grep error /var/log/syslog` (shell command output mentioning "error")
- `The error message in the previous session was unrelated.` (Haiku output)

**Should trigger** (real errors we must still catch):
- `Error: ENOENT: no such file or directory`
- `npm ERR! code ERESOLVE`
- `Traceback (most recent call last):\n  File "x.py"`
- `error[E0382]: borrow of moved value`
- `Fatal: not a git repository`

Use Node's built-in `node:test`. The test imports `PATTERNS` from `../packages/server/src/session.js` (export it if it isn't already — coordinate via `[T4] needs PATTERNS export` in STATUS only if it's not exported and the change to export it requires touching code beyond the regex itself). Assert `.test()` returns the expected boolean for each fixture string.

### 4. Verify against the existing flashback-e2e test

T1 owns `tests/flashback-e2e.test.js` and may be tightening assertions there. **Do not edit that file.** But after your regex change, eyeball the test names — if any depend on a string that your new regex won't match, leave a `[T4] heads-up T1 flashback-e2e fixture <name> may need refresh` line in STATUS so T1 sees it before sign-off.

## Files you own

- `packages/server/src/session.js` (PATTERNS.error only — not the rest of the file)
- `tests/analyzer-error-fixtures.test.js` (new)

## Files you must NOT touch

- `packages/server/src/mnestra-bridge/index.js` (T1)
- `packages/server/src/rag.js` (T1)
- `tests/flashback-e2e.test.js` (T1)
- Any Rumen repo file (T2, T3)

## Acceptance criteria

- [ ] `PATTERNS.error` regex updated with line-anchored alternation.
- [ ] All four "should NOT trigger" fixtures return `false` from `.test()`.
- [ ] All five "should trigger" fixtures return `true`.
- [ ] `node --test tests/analyzer-error-fixtures.test.js` passes.
- [ ] No other change in `session.js` — diff is the regex line plus any necessary export.
- [ ] Append `[T4] DONE` to the sprint STATUS.md.
- [ ] No commit, no push — orchestrator only.

## Sign-off format

```
### [T4] Output analyzer false-positive narrowing

- PATTERNS.error tightened in packages/server/src/session.js. New regex:
    <paste new regex>
- Old regex preserved in commit message for reviewability:
    <paste old regex>
- Test file tests/analyzer-error-fixtures.test.js added with 4 should-not-trigger and 5 should-trigger cases. All pass.
- node --test tests/analyzer-error-fixtures.test.js green.

[T4] DONE
```
