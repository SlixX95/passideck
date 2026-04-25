# T1 — Rumen test suite

## Why this matters

Both independent audits (Claude Opus 4.6 and Gemini 3.1 Pro) flagged Rumen's **zero test coverage** as the single highest-risk gap in the stack. Verbatim:

> "The most complex and vulnerable code in the entire stack—the `synthesize.ts` JSON parser, citation verifier, and `extract.ts` heuristic matching—runs entirely unchecked. You even exported an `AnthropicLike` interface in `synthesize.ts` specifically to mock the LLM client for tests, but never wrote the tests. Rumen is a ticking time bomb for regressions." — Gemini audit

> "This is the most glaring gap. The EnGram repo has 531 lines of tests. The TermDeck server has 329 lines. Rumen — the component that makes unsupervised LLM calls on a schedule — has zero." — Claude audit

Rumen runs unsupervised on a `pg_cron` schedule every 15 minutes, makes Claude Haiku API calls, and writes to a production memory store. A regression in the `parseBatchResponse` three-stage JSON parser, in `filterValidCitations`, or in the confidence calculator would fail silently and corrupt insight quality for every developer using Rumen. This sprint item makes that risk observable.

## Scope (T1 exclusive ownership)

- `~/Documents/Graciella/rumen/tests/` — create this directory
- `~/Documents/Graciella/rumen/tests/**/*.test.ts` — create all test files
- `~/Documents/Graciella/rumen/package.json` — add `"test"` script entry only. Do NOT add new dependencies.
- `~/Documents/Graciella/rumen/tests/fixtures/` — may add fixture files (sample Haiku responses, etc.)

**Do NOT touch anything under `rumen/src/`**. That's T3's territory (specifically `relate.ts`). If you find a bug in existing src code while writing tests, write a `[T1] FOUND BUG` entry in STATUS.md with the reproduction and let the orchestrator route it — do not fix it yourself.

## Deliverable

A functional `node --test` suite in `rumen/tests/` covering at minimum the following surfaces. Each item is a hard requirement; the aggregate minimum is **30 tests**.

### `synthesize.test.ts` — the crown jewel
Test the parseBatchResponse three-stage recovery parser, which is what both auditors called "remarkable" / "crown jewel":

- **Stage 1 (strict parse):** valid JSON with one insight → returns correct map. Valid JSON with three insights → returns correct map with all three keys.
- **Stage 2 (trailing-comma strip):** JSON with a trailing comma before `]` → recovers via the stripper. JSON with a trailing comma before `}` → recovers. Log message includes "recovered via trailing-comma strip".
- **Stage 3 (per-object regex salvage):** malformed JSON where the outer array is broken but individual `{...}` objects are well-formed → salvages valid objects, drops malformed ones. One malformed sibling must NOT poison the whole batch.
- **Complete failure:** JSON with no recoverable structure → returns empty Map, logs "JSON parse failed at all three stages".
- **Markdown fencing:** response wrapped in ` ```json ... ``` ` → `extractJsonBlock` unwraps, parser succeeds.
- **`filterValidCitations`:** when the LLM hallucinates a citation UUID that doesn't appear in `rs.related`, that UUID must be filtered out. When it cites a valid UUID, it must be preserved. Empty `cited_ids` → falls back to all related IDs.
- **Confidence calculator:** the formula `0.5 * maxSimilarity + 0.3 * crossProjectBonus + 0.2 * ageSpreadBonus` produces correct values for:
  - single-project same-day signals (only maxSimilarity contributes)
  - cross-project recent signals (crossProjectBonus maxes)
  - same-project wide-age-spread signals (ageSpreadBonus maxes)
  - all-bonuses signals (composite)
- **Budget caps:** `synthesizeBatch` respects `softCap` by falling back to placeholders, respects `hardCap` by throwing.
- **Placeholder fallback:** `makePlaceholderInsight` produces a well-formed Insight when called with a RelatedSignal.
- **AnthropicLike mock:** use the exported `AnthropicLike` interface to inject a test double. Verify that when `ANTHROPIC_API_KEY` is unset (`apiKeyMissing: true`), synthesize falls back to placeholders without touching the mock.

### `extract.test.ts`
- **Candidate query shape:** mock a pg.Pool that returns 3 candidate rows; verify extract builds 3 signals, calls the query with the expected `[lookbackHours, fetchLimit, minEventCount]` bind args.
- **Trivial filter:** rows with `event_count < minEventCount` are dropped; `skippedTrivial` is populated.
- **Already-processed dedup:** a session ID that appears in a prior `rumen_jobs.source_session_ids` row with `status='done'` is skipped; `skippedAlreadyProcessed` is populated.
- **maxSessions cap:** when fresh candidates exceed `maxSessions`, the list is truncated and logged.
- **Empty memory items fallback:** when a session's `memory_items` content is empty, `buildSignal` returns null and the session is silently dropped.
- **Stable signal keys:** `signal.key` is always `session:<source_session_id>` — verify format for three different inputs.

### `relate.test.ts` (lightweight, since T3 is also editing relate.ts — keep these mock-heavy)
- **Top-K capping:** when `memory_hybrid_search` returns 10 rows, `relateOne` keeps only 5.
- **minSimilarity threshold:** rows below `minSimilarity` are dropped.
- **Error tolerance:** if `memory_hybrid_search` throws for one signal, `relateSignals` still processes the remaining signals and returns a RelatedSignal with `related: []` for the failed one.
- **Score-as-similarity aliasing:** the query selects `score AS similarity`, so the returned row has `similarity` set from `score`.

### `surface.test.ts`
- **Non-destructive INSERT:** verify `surfaceInsights` only issues INSERT statements, no UPDATE or DELETE.
- **Per-insight error tolerance:** if one INSERT throws, the remaining insights still get inserted and the total count reflects only the successful ones.
- **Empty input:** empty insights array → returns `{ insightsGenerated: 0 }`, no queries issued.

## Test framework

Use Node's built-in test runner, same as Mnestra and TermDeck:

```js
// tests/synthesize.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchResponse, filterValidCitations, computeConfidence } from '../src/synthesize.ts';
// ... or the dist/ equivalent if tsx doesn't cover test imports
```

**Dependency policy:** do NOT add `vitest`, `jest`, or any new test framework. `node:test` + `node:assert` is already in `node --test` and works with the existing `tsx` dev dep. If you need TypeScript in tests, use `tsx --test tests/**/*.test.ts` or similar — document your choice in `rumen/package.json`'s `"test"` script.

## Mocking strategy

**Do NOT hit a real database.** Mock `pg.Pool` with a simple object that implements `query` returning a promise. Example:

```ts
function mockPool(responses: Array<{ rows: any[] }>) {
  let call = 0;
  return {
    query: async () => responses[call++] ?? { rows: [] },
    end: async () => {},
  };
}
```

**Do NOT hit the real Anthropic API.** Use the `AnthropicLike` interface to inject a test double:

```ts
const mockAnthropic: AnthropicLike = {
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: '```json\n{"insights":[{"key":"session:abc","text":"...","cited_ids":[]}]}\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  },
};
```

## Acceptance criteria

- [ ] `rumen/tests/` directory exists with at least 4 test files (`synthesize.test.ts`, `extract.test.ts`, `relate.test.ts`, `surface.test.ts`).
- [ ] Aggregate test count ≥ 30.
- [ ] `cd ~/Documents/Graciella/rumen && npm test` runs all tests to completion with zero failures.
- [ ] `rumen/package.json` has a `"test"` script that runs the suite.
- [ ] No new dependencies added to `rumen/package.json` — only `node:test`, `node:assert`, and existing `tsx`/`typescript`.
- [ ] Tests do NOT make real network calls or database connections.
- [ ] Each test has a clear description that reads like a spec sentence (e.g. `test('parseBatchResponse salvages valid objects when outer array is malformed', ...)`).
- [ ] The 3-stage JSON parser has ≥ 6 tests covering all recovery branches + complete failure.
- [ ] At least one test uses the `AnthropicLike` mock to prove the interface works for test doubles.

## Non-goals

- Do NOT refactor src code even if you spot something questionable. Write a `FOUND BUG` note in STATUS.md.
- Do NOT add integration tests that hit a real Postgres or real Anthropic endpoint. That's a v0.4 item.
- Do NOT touch `rumen/src/relate.ts` — T3 is rewriting it. If T3 finishes before you, re-read the file before writing `relate.test.ts` tests to match the new code.
- Do NOT add testing for the `db.ts` singleton pool helper — that's better covered by integration tests later.

## Coordination

- Append significant progress to `docs/sprint-5-audit-delta/STATUS.md` using the format at the bottom of that file.
- **Sequencing with T3:** if you start `relate.test.ts` before T3's `[T3] DONE` entry, write the tests against the CURRENT `relate.ts` (keyword-only, `NULL::vector`, `semantic_weight:0`). When T3 lands, it will either update your test expectations or you'll need to re-align. Prefer writing `synthesize.test.ts` and `extract.test.ts` first — those are stable surfaces T3 will not touch.
- Write `[T1] DONE` with final test count and `npm test` output summary when complete.
