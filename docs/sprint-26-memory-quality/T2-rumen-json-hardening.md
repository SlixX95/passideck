# T2 — Rumen JSON Parse Hardening

## Goal

Drop Rumen's Haiku-synthesized-insight JSON parse failure rate from 19% (31/166 placeholder fallbacks observed on 2026-04-19) to under 5%. Today a single malformed character in Haiku's output → the entire insight becomes a placeholder. After this work, the synthesizer should repair common malformations and only fall back to placeholder when the response is unsalvageable.

## Repo + working directory

You work in the **Rumen repo**: `~/Documents/Graciella/rumen`. First action: `cd ~/Documents/Graciella/rumen`.

## What's broken

`src/synthesize.ts` line ~344: `return JSON.parse(s);`

This is wrapped in a try/catch elsewhere that converts any throw into a placeholder insight. The 19% rate means ~31 of 166 Haiku responses were rejected. Most failures are recoverable — Haiku's common failure modes are:

1. Trailing commas in arrays/objects (valid JS, invalid JSON)
2. Trailing prose after the JSON closes (e.g. `{...} \n\nLet me know if...`)
3. Markdown code fences (```json ... ```)
4. Unescaped newlines inside string values
5. Truncation when response hits token limit

## Implementation

### 1. Build a layered parse helper

In `src/synthesize.ts`, replace the bare `JSON.parse(s)` call with a `tryParseInsight(raw: string)` helper that attempts three passes in order, returning the first one that succeeds:

```ts
function tryParseInsight(raw: string): unknown | null {
  // Pass 1: strict JSON.parse — fast path for clean responses
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // Pass 2: strip code fences + trailing prose, retry
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  // Find the first `{` or `[` and the matching close, ignore everything else
  const sliced = sliceFirstJsonBlock(raw);
  if (sliced) {
    try { return JSON.parse(sliced); } catch { /* fall through */ }
  }

  // Pass 3: light repair — strip trailing commas, escape lone newlines in strings
  const repaired = repairCommonJsonIssues(sliced || raw);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* give up */ }
  }
  return null;
}
```

Implement `sliceFirstJsonBlock` (find balanced `{...}` or `[...]` from the first opener) and `repairCommonJsonIssues` (regex out `,(\s*[}\]])` and replace literal newlines inside string values with `\\n`). Keep both helpers small and well-named — no third-party dep.

The caller (the existing throw-to-placeholder catch site) becomes:

```ts
const parsed = tryParseInsight(haikuResponse);
if (parsed === null) {
  // existing placeholder fallback
} else {
  // existing insight construction
}
```

### 2. Test fixtures

Add `tests/synthesize.test.ts` cases:

| Fixture | Expected behavior |
|---------|-------------------|
| Clean JSON | Pass 1 succeeds, parsed object returned |
| `{...} trailing prose here` | Pass 2 sliceFirstJsonBlock succeeds |
| ` ```json\n{...}\n``` ` (with newlines) | Pass 2 fence stripper succeeds |
| `{ "x": 1, }` (trailing comma) | Pass 3 repair succeeds |
| `{ "msg": "line1\nline2" }` (literal newline in string) | Pass 3 repair succeeds |
| `{ "broken: "missing quote` (truncated) | Returns `null`, caller falls back to placeholder |

Co-locate fixtures inline as string literals in the test file — these are tiny, no need for a fixtures dir.

## Files you own

- `src/synthesize.ts`
- `tests/synthesize.test.ts`

## Files you must NOT touch

- `src/relate.ts` (T3)
- `src/confidence.ts` (T3)
- `tests/relate.test.ts` (T3)
- Anything in the TermDeck repo (T1, T4)

## Acceptance criteria

- [ ] `tryParseInsight` exists, is testable in isolation, and is called from the existing parse site.
- [ ] All six fixture cases above pass via `npm test` from `~/Documents/Graciella/rumen`.
- [ ] No regression on existing tests (`npm test` runs all four phases).
- [ ] Append `[T2] DONE` to the sprint STATUS.md (back in the TermDeck repo at `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/sprint-26-memory-quality/STATUS.md`).
- [ ] Do NOT bump Rumen's version, do NOT commit, do NOT publish — orchestrator handles all that.

## Sign-off format

Append a section like this to the sprint STATUS.md (in the TermDeck repo):

```
### [T2] Rumen JSON parse hardening

- Added tryParseInsight in src/synthesize.ts with three-pass strategy: strict → fence/slice → repair.
- Helpers sliceFirstJsonBlock and repairCommonJsonIssues at module scope (testable in isolation).
- Test cases added in tests/synthesize.test.ts: clean, trailing-prose, code-fence, trailing-comma, literal-newline-in-string, truncated-unrecoverable.
- npm test green, all four phases pass.

[T2] DONE
```
