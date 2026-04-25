# T1 — termdeck forge CLI Command

Add `termdeck forge` subcommand to `packages/cli/src/index.js`.

Dispatch to a new `packages/cli/src/forge.js` module:

```js
// forge.js
module.exports = async function forge(args) {
  const flags = parseFlags(args); // --dry-run, --max-cost, --min-confidence
  
  // 1. Connect to Mnestra (read memories)
  // 2. Show cost projection
  // 3. Ask for confirmation (unless --yes)
  // 4. Send to Opus for analysis
  // 5. Parse generated skills
  // 6. Install to ~/.claude/skills/
  // 7. Report what was created
}
```

For this sprint, implement steps 1-3 (read memories, project cost, confirm). Steps 4-7 can be stubs that print "Skill generation coming in v0.4".

## Cost projection formula
- Count memories from Mnestra (via /healthz or direct DB query)
- Estimate tokens: memories × 200 avg tokens
- Opus pricing: $15/M input, $75/M output
- Print: "This will analyze N memories (~X tokens). Estimated cost: $Y.ZZ. Proceed? [y/n]"

## Files you own
- packages/cli/src/forge.js (new)
- packages/cli/src/index.js (add forge dispatch only)

## Acceptance criteria
- [ ] `termdeck forge` reads memory count
- [ ] Shows cost projection
- [ ] Prompts for confirmation
- [ ] --dry-run shows projection without prompting
- [ ] Write [T1] DONE to STATUS.md
