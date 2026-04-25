# T4 — Insight Quality Filter + Audit Guide

## Goal

Filter low-quality Rumen insights from the UI and create a guide for insight quality auditing.

### Fix 1: Confidence threshold on /api/rumen/insights

In `packages/server/src/index.js`, find the `GET /api/rumen/insights` endpoint. Add a `minConfidence` query parameter (default 0.15) that filters out insights below that threshold:

```sql
WHERE confidence >= $N
```

This removes the 0.08-0.09 noise (sprint process observations) while keeping the 0.38+ insights (actual developer knowledge).

Also add a `minConfidence` filter to the Rumen insights modal in the client (the badge click). If the server already filters, this may be redundant — but the client should pass `?minConfidence=0.15` by default.

### Fix 2: Create docs/INSIGHT-QUALITY.md

Write a guide (under 100 lines) covering:

1. **What good Rumen insights look like:** Cross-project patterns, reusable solutions, non-obvious connections between codebases. Examples from the live 157-insight set: the portrait centering pattern, the Vercel env-vars guidance, the AdBliss OAuth finding.

2. **What bad Rumen insights look like:** Meta-observations about sprint orchestration process, restating obvious file ownership rules, insights with confidence < 0.15. These are noise from Rumen synthesizing its own artifacts.

3. **How to tune quality:**
   - Increase `minConfidence` threshold to filter more aggressively
   - Exclude sprint STATUS.md files from Rumen's Extract phase (they're coordination artifacts, not developer knowledge)
   - Review insights periodically and mark low-quality patterns for Rumen to learn from

4. **Confidence score interpretation:**
   - 0.0-0.15: Noise — typically meta-process observations
   - 0.15-0.40: Moderate — may be useful, worth reviewing
   - 0.40-0.70: Good — cross-project patterns with real signal
   - 0.70-1.0: Strong — high-confidence actionable insights

## Files you own
- packages/server/src/index.js (minConfidence filter on /api/rumen/insights only)
- docs/INSIGHT-QUALITY.md (new)

## Acceptance criteria
- [ ] /api/rumen/insights accepts ?minConfidence=0.15 parameter
- [ ] Default minConfidence filters out sub-0.15 noise
- [ ] docs/INSIGHT-QUALITY.md exists with quality guide
- [ ] All catch blocks use catch (err)
- [ ] Write [T4] DONE to STATUS.md
