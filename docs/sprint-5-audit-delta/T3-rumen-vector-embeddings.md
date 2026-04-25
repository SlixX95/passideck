# T3 — Rumen Relate phase uses vector embeddings

## Why this matters

Both independent audits flagged Rumen's keyword-only Relate phase as the single biggest functional limitation:

> "Rumen's cross-project discovery is limited to keyword overlap. For developer memory, this is often sufficient (error messages, library names, and command patterns are keyword-rich), but it means Rumen won't find conceptually related memories that use different terminology. A session about debugging a Python `ImportError` won't find a prior session about a Node.js `MODULE_NOT_FOUND` even though the pattern is identical." — Claude audit

> "Until standard embeddings are generated in the Edge Function for `query_embedding`, Rumen's cross-project conceptual retrieval cannot fulfill its true potential." — Gemini audit

Right now `relate.ts` calls `memory_hybrid_search` with `NULL::vector` and `semantic_weight: 0.0`. This means Rumen only matches memories by keyword/tsvector overlap. It cannot find semantically-related memories that use different vocabulary. Mnestra already has the pgvector infrastructure and the `memory_hybrid_search` function accepts vectors — it's only Rumen that's passing null.

This sprint item unlocks true cross-project conceptual retrieval by generating an OpenAI embedding for each signal's search text and passing it to the hybrid search function.

## Scope (T3 exclusive ownership)

- `~/Documents/Graciella/rumen/src/relate.ts` — add embedding generation, update the SQL call
- `~/Documents/Graciella/rumen/src/types.ts` — if new types are needed for the embedding response
- `~/Documents/Graciella/rumen/package.json` — bump version to `0.4.0` (this is a semantically meaningful change). Do NOT add new npm dependencies — use `fetch` for the OpenAI API call.
- `packages/server/src/setup/init-rumen.js` — forward `OPENAI_API_KEY` into Edge Function secrets alongside `ANTHROPIC_API_KEY` and `DATABASE_URL`.

**Do NOT touch anything else.** T1 is writing tests in `rumen/tests/`, T2 is splitting client files, T4 is writing launch copy. If you need a new env var to propagate elsewhere, flag it in STATUS.md — do not edit other files.

## Deliverable

After your work, Rumen's Relate phase:

1. **Reads `OPENAI_API_KEY` from the environment.** If missing, log a warning and fall back to keyword-only mode (current behavior — `NULL::vector`, `semantic_weight: 0.0`). The Edge Function and local kickstart both need to degrade gracefully, never crash.

2. **Generates a 1536-dimensional embedding** for each signal's `search_text` via OpenAI's `text-embedding-3-large` model. Match Mnestra's embedding model exactly — different models produce incompatible vectors that won't score against Mnestra's stored `memory_items.embedding` column.

3. **Passes the embedding to `memory_hybrid_search`** as the `query_embedding` parameter. Update the `semantic_weight` to a non-zero value. Suggested: `full_text_weight: 0.4, semantic_weight: 0.6` — semantic-dominant for conceptual retrieval, keyword still contributes for exact technical terms. These are tunable via env vars if you want.

4. **Wraps the OpenAI call with reasonable error handling:**
   - Timeout: 10 seconds. If the API call times out, log a warning for that specific signal and fall back to `NULL::vector` for that signal only (other signals in the batch proceed normally).
   - 429 rate limit: log and back off to keyword-only for that signal.
   - 5xx: same, log and fall back.
   - Invalid response shape: log and fall back.

5. **init-rumen.js forwards `OPENAI_API_KEY`** into the Edge Function's secrets via `supabase secrets set OPENAI_API_KEY=$OPENAI_API_KEY` alongside the existing `DATABASE_URL` and `ANTHROPIC_API_KEY` sets. If `OPENAI_API_KEY` is missing from `~/.termdeck/secrets.env`, the wizard should warn clearly ("Rumen will run in keyword-only mode — for full cross-project conceptual retrieval, add `OPENAI_API_KEY` to secrets.env and re-run init-rumen") and continue, NOT fail.

## Implementation notes

**Use `fetch`, not the OpenAI SDK.** Do not add the `openai` npm package as a dependency. The Edge Function bundler prefers zero-dep code, and the Embeddings endpoint is a single POST — `fetch` is three lines.

Example shape (adapt as needed):

```ts
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text.slice(0, 8000), // stay well under OpenAI's 8192 token cap
        dimensions: 1536, // match Mnestra's column type vector(1536)
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[rumen-relate] embedding fetch failed: ${res.status}`);
      return null;
    }
    const json = await res.json();
    const embedding = json?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      console.warn('[rumen-relate] embedding response malformed');
      return null;
    }
    return embedding;
  } catch (err) {
    console.warn('[rumen-relate] embedding call threw:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

Then in `relateOne`:

```ts
const apiKey = process.env['OPENAI_API_KEY'];
const embedding = apiKey ? await generateEmbedding(signal.search_text, apiKey) : null;
const embeddingParam = embedding ? `[${embedding.join(',')}]` : null;
const semanticWeight = embedding ? 0.6 : 0.0;
const fullTextWeight = embedding ? 0.4 : 1.0;
```

And pass `embeddingParam` and the weights into the existing `memory_hybrid_search` SQL call. The pgvector column accepts `'[0.1,0.2,...]'::vector` string cast syntax from a text parameter.

**Postgres vector parameter binding:** pgvector expects vectors as text in the `[num,num,...]` form, cast to `::vector`. `pg`'s parameter binding handles the cast automatically if you pass the string and use `$N::vector` in the SQL. You may need to update the SQL in `relate.ts` to use `$3::vector` instead of `NULL::vector`.

**Score threshold calibration:** the current `DEFAULT_MIN_SIMILARITY = 0.01` in `src/index.ts` was tuned for RRF + keyword-only scores. With semantic weight at 0.6, scores may move into a different range. Test locally and update the default if needed. Document any change in `src/index.ts` comments.

## Acceptance criteria

- [ ] `rumen/src/relate.ts` no longer passes `NULL::vector` unconditionally. When `OPENAI_API_KEY` is set, it generates a real embedding and passes it to `memory_hybrid_search`.
- [ ] Graceful fallback: when `OPENAI_API_KEY` is missing, Rumen runs in keyword-only mode with no errors (same behavior as before this sprint).
- [ ] Per-signal error tolerance: one failed embedding call (timeout, 429, 5xx) does not kill the whole batch — that signal falls back to keyword-only, others proceed normally.
- [ ] `rumen/package.json` version bumped to `0.4.0`.
- [ ] No new npm dependencies added. `fetch` and the existing `pg` + `@anthropic-ai/sdk` are the only network surfaces.
- [ ] `packages/server/src/setup/init-rumen.js` reads `OPENAI_API_KEY` from `~/.termdeck/secrets.env` and forwards it via `supabase secrets set` during the deploy step. When missing, prints a clear warning and continues.
- [ ] `npm run build` in the rumen repo succeeds with zero TypeScript errors.
- [ ] Manual test: running `npm run kickstart` with `OPENAI_API_KEY` set against the live pvb DB completes without errors. Embedding calls succeed. Insights get generated. Paste the final summary in STATUS.md.
- [ ] Manual test with `OPENAI_API_KEY` unset: kickstart still works, logs the fallback warning, produces keyword-only insights.

## Publishing + Edge Function redeploy

After your code changes are done:
1. Bump `rumen/package.json` to `0.4.0`.
2. Run `npm run build`.
3. Write `[T3] READY FOR PUBLISH` in STATUS.md — the orchestrator (Josh) will run `npm publish --access public` from his shell (automation token).
4. The existing `__RUMEN_VERSION__` substitution in the TermDeck init-rumen wizard will pick up `0.4.0` automatically — no hardcoded version edits needed.

## Non-goals

- Do NOT change anything in the Synthesize, Surface, Extract phases. Those are fine and both auditors praised them.
- Do NOT add batching to the embedding calls. Rumen processes one signal at a time; one embedding call per signal is acceptable — OpenAI rate limits (10K RPM for embeddings on tier 2) are well above Rumen's usage pattern.
- Do NOT implement embedding caching in this sprint. If the same signal text comes up twice, regenerate. Caching can be v0.5.
- Do NOT add an embedding model selector. Hardcode `text-embedding-3-large` with `dimensions: 1536`. Mnestra's column type is `vector(1536)` — using a different dim would break the SQL cast.
- Do NOT touch T1's test files. If you want tests for your new code, write `[T3] NEEDS TESTS` in STATUS.md and T1 will add them after `[T3] DONE`.

## Coordination

- Append significant progress to `docs/sprint-5-audit-delta/STATUS.md`.
- **You CANNOT publish to npm yourself** — that requires the automation token that only Josh has. Write `[T3] READY FOR PUBLISH` when ready, then wait for Josh to run `npm publish --access public` and `termdeck init --rumen --yes` to redeploy.
- Write `[T3] DONE` with the final `kickstart` output summary (sessions_processed, insights_generated, embedding call count) after Josh confirms the redeploy succeeded.
