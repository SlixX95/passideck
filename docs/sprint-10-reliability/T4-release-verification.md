# T4 — Release Verification Script + Checklist Update

## Goal

Create an automated release verification script and update the release checklist to reflect the current v0.3.x process.

## Implementation

### 1. `scripts/verify-release.sh` (new)

A pre-publish sanity check that verifies everything is consistent before `npm publish`. Run with `./scripts/verify-release.sh`.

Checks:
1. `package.json` version matches latest `CHANGELOG.md` entry
2. No uncommitted changes (`git status --porcelain` is empty)
3. `node -c` passes on all JS files in packages/
4. `scripts/lint-docs.sh` passes (no banned names, version consistency)
5. All test files pass: `node --test tests/*.test.js` (skip if no tests found)
6. The bin entry (`packages/cli/src/index.js`) has a valid shebang
7. The `files` array in package.json includes all expected paths

Print green/red for each check. Exit 1 if any critical check fails.

### 2. Update `docs/RELEASE_CHECKLIST.md`

Read the existing file. Update it to reflect the current process:
- Version bump in package.json
- CHANGELOG.md entry added
- `./scripts/verify-release.sh` passes
- `git commit && git push`
- `npm publish --access public --auth-type=web`
- Verify on npm: `npm view @jhizzard/termdeck version`
- Post to launch channels if major release

Keep it concise — a checklist, not a manual.

## Files you own
- scripts/verify-release.sh (create)
- docs/RELEASE_CHECKLIST.md (update or create)

## Acceptance criteria
- [ ] verify-release.sh runs and passes on current repo
- [ ] RELEASE_CHECKLIST.md is current and actionable
- [ ] Script exits 1 on any critical failure
- [ ] Write [T4] DONE to STATUS.md
