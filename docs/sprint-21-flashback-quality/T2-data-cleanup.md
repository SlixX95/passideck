# T2 — Data Quality Cleanup

## Goal

Fix the "chopin-nashville" project tags in the production Rumen insights database and clean up low-quality insights.

## Steps

1. Source secrets: `set -a; source ~/.termdeck/secrets.env; set +a`

2. Fix project tags in rumen_insights:
```sql
UPDATE rumen_insights 
SET projects = array_replace(projects, 'chopin-nashville', 'termdeck') 
WHERE 'chopin-nashville' = ANY(projects);
```

3. Check for other stale project names:
```sql
SELECT DISTINCT unnest(projects) AS project, COUNT(*) 
FROM rumen_insights 
GROUP BY project 
ORDER BY count DESC;
```
Fix any other directory-path-derived names.

4. Delete low-confidence noise (below 0.10):
```sql
DELETE FROM rumen_insights WHERE confidence < 0.10;
```
Report how many rows were removed.

5. Update `docs/CONTRADICTIONS.md` — mark #9 (chopin-nashville in Flashback) as resolved via data cleanup + Sprint 16 resolveProjectName fix.

## Files you own
- Database (via psql)
- docs/CONTRADICTIONS.md

## Acceptance criteria
- [ ] Zero "chopin-nashville" tags remain in rumen_insights
- [ ] Low-confidence noise removed
- [ ] CONTRADICTIONS #9 marked resolved
- [ ] Report counts in STATUS.md
- [ ] Write [T2] DONE to STATUS.md
