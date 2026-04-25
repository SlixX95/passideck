# T3 — Rumen Confidence Score Normalization

## Goal

Today Rumen's `computeConfidence()` produces raw scores that aren't comparable across runs or contexts — a 0.6 from a small relate-cluster means something different from a 0.6 from a large one. Cross-project ranking in TermDeck's Flashback feed is therefore meaningless past the trivial top-1 case. Add a pure normalization function that maps raw scores onto a stable 0..1 interpretation taking context size into account.

## Repo + working directory

You work in the **Rumen repo**: `~/Documents/Graciella/rumen`. First action: `cd ~/Documents/Graciella/rumen`.

## Implementation

### 1. New file `src/confidence.ts`

A single pure function plus its tiny support cast. No I/O, no side effects, no dependencies beyond Node built-ins.

```ts
/**
 * Map a raw Rumen confidence score onto a normalized 0..1 value that is
 * comparable across runs and context sizes.
 *
 * The intuition: a small relate-cluster (few citations) caps at lower
 * confidence even with a high raw score, because we have less evidence.
 * A large cluster can reach the full range. Below a minimum context
 * size we treat the score as untrustworthy and clamp aggressively.
 */
export function normalize(rawScore: number, contextSize: number): number {
  if (!Number.isFinite(rawScore)) return 0;
  const clamped = Math.max(0, Math.min(1, rawScore));
  if (contextSize <= 1) return clamped * 0.4;       // single-source, low ceiling
  if (contextSize < 5) return clamped * 0.7;        // small cluster
  if (contextSize < 15) return clamped * 0.9;       // medium cluster
  return clamped;                                    // large cluster — full range
}

export const NORMALIZE_VERSION = 1; // bump if curve changes; written into insight metadata
```

The thresholds (1, 5, 15) and ceilings (0.4, 0.7, 0.9, 1.0) are deliberate first-pass values — calibration can iterate. Document them inline so future tuning is obvious.

### 2. Wire into `src/relate.ts`

Find every place an insight is constructed for return / insertion. Where the raw confidence is set on the insight object, replace:

```ts
confidence: rawConfidence,
```

with:

```ts
confidence: normalize(rawConfidence, citations.length),
```

Use whatever variable in scope represents the citation/cluster count — typical names are `citations`, `relatedCount`, `cluster.length`. If the count isn't yet computed at that site, compute it locally rather than threading state across functions.

Add the import at the top: `import { normalize } from './confidence.js';`

### 3. Unit tests in `tests/relate.test.ts`

Add cases covering the normalize curve directly (don't go through the full relate pipeline for these):

| `rawScore` | `contextSize` | Expected |
|------------|---------------|----------|
| `0` | `10` | `0` |
| `0.5` | `1` | `0.2` (0.5 × 0.4) |
| `0.5` | `3` | `0.35` (0.5 × 0.7) |
| `0.5` | `10` | `0.45` (0.5 × 0.9) |
| `0.5` | `20` | `0.5` (full range) |
| `1.5` | `10` | `0.9` (clamp + medium ceiling) |
| `NaN` | `10` | `0` |

Then add one integration-style case that runs the existing relate pipeline against a mock and asserts the returned insight has `confidence ≤ NORMALIZE * raw` for the right context size. If the existing relate test scaffolding makes this hard, skip the integration check — the unit tests on `normalize` directly are the primary acceptance.

## Files you own

- `src/confidence.ts` (new)
- `src/relate.ts`
- `tests/relate.test.ts`

## Files you must NOT touch

- `src/synthesize.ts` (T2 — even though it also imports the relate output, T2's diff shouldn't touch the confidence wiring; if you find a synthesize-side call site that needs `normalize`, append a `[T3] BLOCKED needs T2 coordination` to STATUS and stop)
- `tests/synthesize.test.ts` (T2)
- Anything in the TermDeck repo (T1, T4)

## Acceptance criteria

- [ ] `src/confidence.ts` exists with the `normalize` function and unit tests covering all seven rows above.
- [ ] `src/relate.ts` imports and calls `normalize` at every confidence-set site.
- [ ] `npm test` from `~/Documents/Graciella/rumen` is green.
- [ ] Append `[T3] DONE` to the sprint STATUS.md in the TermDeck repo.
- [ ] No version bump, no commit, no publish — orchestrator only.

## Sign-off format

```
### [T3] Rumen confidence normalization

- New src/confidence.ts with pure normalize(rawScore, contextSize) and NORMALIZE_VERSION constant.
- Curve: 0.4 ceiling at size ≤ 1, 0.7 at < 5, 0.9 at < 15, full range at ≥ 15. Clamps NaN/out-of-range inputs.
- Integrated into src/relate.ts at <N> confidence-set sites.
- Tests added in tests/relate.test.ts: <list cases>.
- npm test green.

[T3] DONE
```
