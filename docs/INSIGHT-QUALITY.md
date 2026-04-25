# Insight Quality Guide

TermDeck surfaces Rumen insights in the dashboard (the insight badge → modal). Not every insight is worth your attention. This guide explains how to tell signal from noise and how to tune the filter.

## What good insights look like

Good insights are **cross-project patterns**, **reusable solutions**, or **non-obvious connections** between codebases. They usually carry confidence ≥ 0.40 and name concrete artifacts (files, env vars, code patterns).

Examples from the live 157-insight set:

- **Portrait centering pattern** — a CSS recipe that first shipped in the portfolio repo and was reused in Chopin Nashville landing pages. Good cross-project signal.
- **Vercel env-vars guidance** — a rule about keeping `NEXT_PUBLIC_*` and secret keys separate, extracted from multiple Next.js repos.
- **AdBliss OAuth finding** — a specific failure mode on the auth callback that applies to any Marketplace integration using the same OAuth flow.

These tell you something you would not derive from reading one file.

## What bad insights look like

Bad insights are **meta-observations about process** or **obvious restatements** of documented rules. They typically score below 0.15 because Rumen is partly synthesizing its own coordination artifacts.

Common patterns:

- "The T4 terminal owns the Rumen endpoint filter." (Sprint STATUS.md restatement.)
- "Sprints follow a 4+1 terminal pattern with append-only status logs." (Process observation.)
- "Commits on branch main include co-author trailers." (Obvious from git history.)

If an insight reads like a sprint retrospective, it is noise.

## How to tune quality

1. **Raise `minConfidence`.** The default on `/api/rumen/insights` is `0.15`. For a stricter view, pass `?minConfidence=0.4`:

   ```
   curl 'http://localhost:3000/api/rumen/insights?minConfidence=0.4'
   ```

2. **Exclude coordination artifacts from Extract.** Sprint `STATUS.md` files and `docs/sprint-*/` logs are not developer knowledge — they are scheduling metadata. Configure Rumen's Extract phase to skip them so they never reach synthesis.

3. **Review and mark periodically.** Open the insight modal weekly. Flag low-quality entries via `POST /api/rumen/insights/:id/seen` (acted_upon = true hides them). Patterns you repeatedly dismiss become training signal for Rumen's next synthesis pass.

## Confidence score interpretation

| Range        | Label    | What to do                                                 |
|--------------|----------|------------------------------------------------------------|
| 0.00 – 0.15  | Noise    | Filtered out by default. Usually meta-process observations.|
| 0.15 – 0.40  | Moderate | Worth skimming. May contain small reusable patterns.       |
| 0.40 – 0.70  | Good     | Real cross-project signal. Read and consider acting.       |
| 0.70 – 1.00  | Strong   | High-confidence, actionable. Treat as a recommendation.    |

## Endpoint reference

```
GET /api/rumen/insights?minConfidence=0.15&limit=20&unseen=true&project=termdeck
```

- `minConfidence` — float, `0`–`1`, default `0.15`
- `limit` — int, `1`–`100`, default `20`
- `project` — string, filters to insights tagged with that project
- `since` — ISO 8601 timestamp
- `unseen` — `1|true|yes` to hide insights already marked `acted_upon`

The filter is applied server-side in SQL (`WHERE confidence >= $N`), so raising the threshold is cheap and does not require a client change.
