# T1 — Merge Low-Risk Dependency PRs

## Goal

Merge the safe Dependabot PRs on both TermDeck and Mnestra. Leave Express 5 and Zod 4 for post-launch.

## Steps

1. TermDeck #2: `actions/checkout` v4→v6 — update `.github/workflows/ci.yml`, change `uses: actions/checkout@v4` to `@v6`
2. TermDeck #5: `uuid` 9→13 — run `npm install uuid@13`, verify `const { v4: uuidv4 } = require('uuid')` still works with `node -c`
3. Verify all tests still pass after the uuid bump

For Mnestra (separate repo at ~/Documents/Graciella/engram/):
4. Mnestra #1 + #2: actions/setup-node v4→v6, actions/checkout v4→v6 — update workflow files
5. Mnestra #4: `npm install @types/node@25` — run `npx tsc --noEmit`

Do NOT touch Express or Zod — those are Sprint 18.

## Files you own
- .github/workflows/ci.yml
- package.json (uuid bump only)
- package-lock.json

## Acceptance criteria
- [ ] CI workflow uses actions/checkout@v6
- [ ] uuid@13 installed and imports work
- [ ] node -c passes on all server files
- [ ] Write [T1] DONE to STATUS.md
