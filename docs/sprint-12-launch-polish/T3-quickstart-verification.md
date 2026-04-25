# T3 — Quickstart Verification

## Goal

Read through GETTING-STARTED.md and README.md as if you're a first-time user. Fix anything that would confuse or break the experience.

## Steps

1. Read `docs/GETTING-STARTED.md` top to bottom. Check:
   - All commands are correct and would work if copy-pasted
   - Version references match 0.3.5
   - The `./scripts/start.sh` instructions are accurate
   - The Tier stop markers are clear
   - The CLAUDE.md section is actionable
   - The troubleshooting table covers the issues we hit today (Mnestra /healthz, EADDRINUSE, secrets not exported)

2. Read `README.md`. Check:
   - Hero GIF reference works
   - `npx @jhizzard/termdeck` is the primary quickstart
   - Documentation hierarchy section is present and links work
   - Version references match 0.3.5
   - Links to GitHub repos, npm packages, docs site all resolve

3. Fix anything that's wrong, stale, or confusing.

## Files you own
- docs/GETTING-STARTED.md
- README.md

## Acceptance criteria
- [ ] Every command in GETTING-STARTED.md is copy-paste correct
- [ ] README quickstart works
- [ ] All links resolve
- [ ] Version refs are 0.3.5
- [ ] Today's startup gotchas (healthz, EADDRINUSE, secrets) are in troubleshooting
- [ ] Write [T3] DONE to STATUS.md
