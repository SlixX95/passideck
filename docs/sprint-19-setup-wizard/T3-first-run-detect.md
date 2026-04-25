# T3 — First-Run Detection

Detect first-run state and signal it to the client.

In `packages/server/src/index.js`:
- Check if `~/.termdeck/config.yaml` exists at startup
- If it doesn't, set a flag `state.firstRun = true`
- Include `firstRun` in the initial config broadcast to the client

In `packages/cli/src/index.js`:
- On first run (no config.yaml), print: "First run detected. Open http://localhost:3000 and click 'config' to set up."

## Files you own
- packages/server/src/index.js (firstRun detection only — coordinate with T1)
- packages/cli/src/index.js (first-run message only)

## Acceptance criteria
- [ ] firstRun detected when no config.yaml
- [ ] Client receives firstRun flag
- [ ] CLI prints hint on first run
- [ ] Write [T3] DONE to STATUS.md
