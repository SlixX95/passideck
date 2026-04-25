# T1 — Version Consistency Pass

## Goal

Ensure every doc in the repo that mentions a version number matches the current published state: termdeck@0.3.5, mnestra@0.2.0, rumen@0.4.1.

## Steps

1. Add a 0.3.5 entry to CHANGELOG.md covering Sprints 9-10 (bind guardrail, toolbar two-row, auth, status/config buttons wired, Flashback e2e test, failure injection tests, verify-release.sh).

2. Grep the entire repo for `0\.3\.[0-4]` (stale termdeck versions). Fix any that should be 0.3.5. Exclude: git history, sprint STATUS.md logs (historical), NAMING-DECISIONS.md historical entries.

3. Grep for `0\.4\.0` referencing rumen (should be 0.4.1). Fix any stale refs.

4. Verify `scripts/lint-docs.sh` passes after your changes.

## Files you own
- CHANGELOG.md
- Any doc file with stale version refs (except sprint STATUS logs and NAMING-DECISIONS historical)

## Acceptance criteria
- [ ] CHANGELOG.md has 0.3.5 entry
- [ ] No stale version refs in active docs
- [ ] lint-docs.sh passes
- [ ] Write [T1] DONE to STATUS.md
