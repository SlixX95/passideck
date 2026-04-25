# T3 — Rumen Re-Kickstart with PVB Memories

## Goal

Re-run Rumen with the fixed pipeline (correct project names, hybrid embeddings) to generate high-quality insights — especially from the 1,599 PVB memories that were never properly processed.

## Steps

1. Source secrets: `set -a; source ~/.termdeck/secrets.env; set +a`

2. Check current state:
```sql
SELECT COUNT(*) FROM rumen_insights;
SELECT COUNT(*) FROM rumen_jobs ORDER BY started_at DESC LIMIT 5;
SELECT project, COUNT(*) FROM memory_items GROUP BY project ORDER BY count DESC LIMIT 10;
```

3. Reset Rumen's processed session tracking so it re-processes everything:
```sql
-- Clear source_session_ids from the most recent job so the next kickstart
-- processes ALL sessions, not just new ones since the last run
UPDATE rumen_jobs SET source_session_ids = '{}' WHERE id = (
  SELECT id FROM rumen_jobs ORDER BY started_at DESC LIMIT 1
);
```

4. Trigger a manual kickstart:
```bash
cd ~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck
node packages/cli/src/index.js init --rumen --yes
```
Or if the Edge Function is already deployed, trigger it directly via the Supabase function URL.

5. Wait for the job to complete and check results:
```sql
SELECT id, status, sessions_processed, insights_generated, started_at, completed_at
FROM rumen_jobs ORDER BY started_at DESC LIMIT 3;
```

6. Review the new insights:
```sql
SELECT insight_text, confidence, projects
FROM rumen_insights
WHERE confidence >= 0.15
ORDER BY confidence DESC
LIMIT 20;
```

7. Report: how many PVB-related insights were generated? Are they actionable? Document in STATUS.md.

## Files you own
- Database (via psql)
- packages/server/src/setup/rumen/ (only if Edge Function needs redeployment)

## Acceptance criteria
- [ ] Rumen re-processes all sessions including PVB's 1,599 memories
- [ ] New insights generated with hybrid embeddings
- [ ] PVB-specific patterns surfaced
- [ ] Confidence scores reported
- [ ] Write [T3] DONE to STATUS.md with insight quality assessment
