# T3 — CLI Wizard Bug Fix (Brad's Anthropic-Key Abort)

## Goal

Brad reported on 2026-04-25 (twice): `termdeck init --mnestra` aborts as if Ctrl-C was pressed immediately after he submits the Anthropic API key. The wizard runs through Supabase URL → service role key → DATABASE_URL → OpenAI key → Anthropic key, then exits with no error message.

Reproduce + fix.

## Suspect: `askSecret` raw-mode stdin handling

`packages/server/src/setup/prompts.js` switches stdin to raw mode for secret prompts, reads characters one at a time, and exits raw mode on `\n`/`\r`/``. Likely failure modes:

1. **CRLF line endings (Windows / MobaXterm).** The user hits Enter; stdin delivers `\r\n` as a single chunk. The loop matches `\r`, resolves, removes its listener — but the `\n` byte remains in the chunk. The next `askSecret` (or the `confirm` that follows the Anthropic prompt) reads that orphan `\n` from the readline interface, returning an empty line immediately.

2. **Buffered echo through SSH.** MobaXterm's SSH path may inject control sequences (`[…]`) after Enter. If any byte equals `` (Ctrl-C), the askSecret's existing handler does `process.kill(process.pid, 'SIGINT')` and the wizard exits.

3. **Race between rl.pause()/resume() and the data listener.** When askSecret exits, it calls `rl.resume()` while raw-mode bytes might still be queued for the data listener. If a chunk arrives in that window, the *new* listener is gone and the bytes go nowhere — but a subsequent prompt that sets up a new data listener could pick up stale bytes.

## Implementation

### 1. Reproduce in tests first

Create `tests/setup-prompts.test.js`. Use `node:test` + `node:assert/strict`. Don't go through the real readline — instead call `askSecret` directly with a fake stdin (an `EventEmitter` that you push chunks into).

Three required fixtures:

| Fixture | Chunks pushed | Expected result |
|---------|---------------|-----------------|
| Unix LF | `['secret\n']` | resolves to `'secret'`, no SIGINT |
| Windows CRLF | `['secret\r\n']` | resolves to `'secret'`, the trailing `\n` does NOT propagate to subsequent reads |
| MobaXterm SSH style | `['secret\r', '\n']` (split across two events) | resolves to `'secret'` on first chunk, second chunk's `\n` is consumed silently |

For #2 and #3, after the resolve, fire a second `askSecret` and assert that it does NOT immediately resolve with empty string (i.e., the orphan `\n` was absorbed).

If you find the existing `askSecret` doesn't pass these tests as-is — that's the bug.

### 2. Fix

The cleanest fix: after resolving on `\r` or `\n`, drain any immediately-following whitespace bytes from the same chunk. Replace:

```js
if (ch === '\n' || ch === '\r' || ch === '') {
  stdin.setRawMode(false);
  stdin.removeListener('data', onData);
  process.stdout.write('\n');
  if (rl) rl.resume();
  resolve(buffer);
  return;
}
```

with logic that, on `\r`, peeks the rest of the chunk and skips a paired `\n` before resuming readline. Pseudocode:

```js
const onData = (chunk) => {
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === '\n' || ch === '\r' || ch === '') {
      // Drain immediately-following \n if we just consumed \r (CRLF on Windows/MobaXterm)
      if (ch === '\r' && chunk[i + 1] === '\n') i++;
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (rl) rl.resume();
      resolve(buffer);
      return;
    }
    if (ch === '') { /* unchanged */ }
    /* …rest of loop… */
  }
};
```

Also: change the iteration from `for (const ch of chunk)` to `for (let i = 0; i < chunk.length; i++)` so we can index ahead by one.

If the test fixture for "split across two events" (#3) still fails after the inline drain, add a one-shot `data` listener in the `\r` branch that consumes any `\n` from the next chunk before letting readline resume:

```js
if (ch === '\r') {
  stdin.once('data', (next) => {
    if (next[0] === '\n' && next.length > 1) {
      // re-emit only the bytes after the consumed \n
      stdin.unshift(Buffer.from(next.slice(1)));
    } else if (next[0] !== '\n') {
      stdin.unshift(next);
    }
    // else: just \n alone, swallow it
    stdin.removeListener('data', onData);
    if (rl) rl.resume();
    resolve(buffer);
  });
  stdin.setRawMode(false);
  return;
}
```

The `stdin.unshift()` puts unconsumed bytes back at the head of the stream so readline picks them up correctly.

### 3. Documentation

Append a paragraph to `packages/server/src/setup/prompts.js`'s top-level comment explaining the CRLF-drain logic and pointing at `tests/setup-prompts.test.js` for regression coverage. Future readers won't have to rediscover this trap.

## Files you own

- `packages/server/src/setup/prompts.js`
- `tests/setup-prompts.test.js` (new)

## Files you must NOT touch

- `packages/cli/src/init-mnestra.js` (the caller — leave the call sites alone)
- Anything else outside `prompts.js`

## Acceptance criteria

- [ ] Three fixtures in `tests/setup-prompts.test.js` all pass: Unix LF, Windows CRLF, split-chunk SSH.
- [ ] Manual smoke test: `printf 'a\nb\nc\nd\ne\n' | node packages/cli/src/index.js init --mnestra --dry-run` runs end-to-end without aborting.
- [ ] `node --check packages/server/src/setup/prompts.js` clean.
- [ ] Append `[T3] DONE` to STATUS.md with one-line root-cause description.
- [ ] Do not commit — orchestrator only.

## Sign-off format

```
### [T3] Wizard CRLF/SSH abort bug

- Root cause: <one sentence — which of the three suspects above>.
- Fix: drain trailing \n on \r within and across chunks; for cross-chunk case, use stdin.once + stdin.unshift to put non-\n bytes back.
- Tests: tests/setup-prompts.test.js — 3 fixtures, all pass.
- Manual smoke test passes for piped stdin.

[T3] DONE
```
