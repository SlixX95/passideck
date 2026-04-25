# T1 — Tester-Facing Fixes

## Goal

Fix the two issues testers will hit immediately.

### Fix 1: npx @jhizzard/termdeck doesn't work

`npx @jhizzard/termdeck` fails with "command not found". Debug the bin entry in the root package.json. The bin field should map `termdeck` to `./packages/cli/src/index.js`. Verify:
- The file has a proper shebang (`#!/usr/bin/env node`)
- The bin field in package.json is correct
- The file is included in the `files` array (if one exists)
- Test locally: `npm link && termdeck --help`

### Fix 2: Toolbar overflow — config button off screen

The top toolbar in the TermDeck dashboard has too many buttons. On standard-width screens, the rightmost buttons (config, etc.) overflow off the right edge. 

Read `packages/client/public/style.css` and find the toolbar styles. Fix by:
- Making the toolbar scrollable horizontally, OR
- Reducing padding/margins between toolbar items, OR  
- Collapsing less-used buttons behind a "..." menu on narrow screens

The simplest fix: add `overflow-x: auto` to the toolbar container and reduce item spacing slightly.

Also check `packages/client/public/index.html` for the toolbar structure if needed.

## Files you own
- packages/cli/src/index.js
- packages/client/public/style.css
- packages/client/public/index.html (toolbar only)

## Acceptance criteria
- [ ] `npm link && termdeck` launches the server
- [ ] All toolbar buttons visible on a 1440px-wide screen
- [ ] Write [T1] DONE to STATUS.md
