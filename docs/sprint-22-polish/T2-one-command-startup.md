# T2 — Bulletproof One-Command Startup

## Goal

`./scripts/start.sh` must boot the entire stack flawlessly every time. No more manual Mnestra credential sourcing, no more port conflicts, no more "0 memories" because secrets weren't loaded.

## Current problems to fix

1. **Mnestra starts without credentials** — even with `mnestra.autoStart: true`, if the user runs `mnestra serve` manually first (without sourcing secrets), it starts with 0 memories. The start.sh script sources secrets correctly but manual launches don't.

2. **Port kill is fragile** — the `lsof` command to kill stale processes sometimes doesn't work on macOS.

3. **No sequential feedback** — the script starts everything and dumps output. The user should see a clear step-by-step:
   ```
   Step 1/4: Loading secrets .............. OK (5 keys)
   Step 2/4: Starting Mnestra ............ OK (3,855 memories)
   Step 3/4: Checking Rumen .............. OK (last job 12m ago)
   Step 4/4: Starting TermDeck ........... 
   
   TermDeck v0.4.3 — http://127.0.0.1:3000
   Stack: TermDeck :3000 | Mnestra :37778 (3,855) | Rumen (12m ago)
   ```

4. **First-run experience** — if no config.yaml exists, print a friendly message and create a minimal one with sensible defaults.

## Implementation

Rewrite `scripts/start.sh` with:
- Numbered steps with dotted-line status indicators
- If Mnestra is already running WITH memories, skip starting it (print "already running")
- If Mnestra is already running WITHOUT memories, kill it and restart with secrets
- If a port is occupied by a non-TermDeck process, warn and suggest a different port
- On first run (no config.yaml), create a minimal config with `mnestra.autoStart: true` and the default project paths

## Files you own
- scripts/start.sh
- packages/cli/src/index.js (only if the CLI startup message needs updating)

## Acceptance criteria
- [ ] `./scripts/start.sh` boots full stack from cold start (nothing running)
- [ ] `./scripts/start.sh` handles already-running Mnestra correctly
- [ ] `./scripts/start.sh` handles already-running TermDeck correctly
- [ ] Numbered step-by-step output
- [ ] First-run creates minimal config.yaml
- [ ] Write [T2] DONE to STATUS.md
