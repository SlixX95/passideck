# Release Checklist — `@jhizzard/termdeck`

Pre-publish checklist for cutting a new TermDeck release. Most of the
mechanical checks are automated by `./scripts/verify-release.sh`; this file
covers the human steps around it.

> Sister repos (`@jhizzard/mnestra`, `@jhizzard/rumen`) have their own release
> playbooks in their respective repos. If a release crosses package
> boundaries, publish in the order **Mnestra → Rumen → TermDeck** so the
> dependency graph stays clean.

---

## 1. Prepare the release

- [ ] On `main`, up to date with `origin/main` (`git pull --ff-only`)
- [ ] `npm whoami` returns the identity that owns `@jhizzard`
- [ ] Bump `version` in `package.json` (and any per-package `package.json` if
      relevant)
- [ ] Add a dated `## [X.Y.Z] - YYYY-MM-DD` entry to `CHANGELOG.md` with
      Added / Changed / Fixed sections
- [ ] Skim `README.md` and `docs/GETTING-STARTED.md` for any version refs that
      need to move

## 2. Run the automated verification

```bash
./scripts/verify-release.sh
```

This script must exit 0. It runs:

1. `package.json` version matches the latest `CHANGELOG.md` entry
2. Working tree is clean (`git status --porcelain` is empty)
3. `node -c` parses every JS file under `packages/`
4. `scripts/lint-docs.sh` passes (no banned names; version consistency)
5. `node --test tests/*.test.js` (skipped if no tests present)
6. The bin entry `packages/cli/src/index.js` starts with a `#!/usr/bin/env node`
   shebang
7. `npm pack --dry-run` would publish every path in the expected-publish list

If any check fails: fix the underlying issue and re-run. Do not bypass.

## 3. Commit, tag, push

- [ ] `git add package.json CHANGELOG.md` (plus any other touched files)
- [ ] `git commit -m "chore: release v<X.Y.Z>"`
- [ ] `git tag v<X.Y.Z>`
- [ ] `git push origin main --tags`

## 4. Publish

```bash
npm publish --access public --auth-type=web
```

- [ ] Browser opens for npm web auth; approve from a logged-in session
- [ ] Wait for `+ @jhizzard/termdeck@<X.Y.Z>` confirmation

## 5. Verify the publish

- [ ] `npm view @jhizzard/termdeck version` returns the new version
- [ ] https://www.npmjs.com/package/@jhizzard/termdeck shows the new version
      and a rendered README
- [ ] In a scratch directory: `npx -y @jhizzard/termdeck@<X.Y.Z> --no-open`
      starts the server, http://localhost:3000 loads, one panel can spawn a
      shell, no C++ compile happens during install

## 6. Announce (only for minor / major releases)

- [ ] Update `docs-site/` content sync if release ships user-visible changes
- [ ] Post to launch channels listed in `docs/launch/` (only if a notable
      feature shipped — patch releases stay quiet)

## 7. Rollback (if something went wrong)

- Within 72 hours of publish: `npm unpublish @jhizzard/termdeck@<X.Y.Z>`
- Otherwise: `npm deprecate @jhizzard/termdeck@<X.Y.Z> "see v<next>"`,
  `git revert` the release commit, bump to the next patch, repeat from §1
- Never republish the same version number — npm rejects it
