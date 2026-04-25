# T4 — Returning User "Welcome Back" Flow

## Goal

Distinguish between first install and returning user. On return visits, show a brief "Welcome back" state instead of the full setup wizard.

## Implementation

### Detect returning user

In `packages/client/public/app.js`:
- On load, fetch `/api/setup`
- If `firstRun: false` AND tier >= 1: show a brief "Welcome back" toast (not the full wizard)
- The toast says: "Stack: [tier description]. [N] memories. Last Rumen job: [X] ago."
- Dismisses after 5 seconds or on click
- Config button still opens the full wizard for manual inspection

### start.sh integration

In `scripts/start.sh`:
- On first run (no config.yaml), the script already creates a minimal config
- Add: after first-run config creation, print "Open http://localhost:3000 and click 'config' to complete setup"
- On returning runs, print the stack summary (already done)

## Files you own
- packages/client/public/app.js (welcome-back toast only — coordinate with T2 on wizard)
- scripts/start.sh (first-run messaging only)

## Acceptance criteria
- [ ] Returning users see a brief welcome toast, not the full wizard
- [ ] Toast shows tier status + memory count
- [ ] Config button still opens full wizard
- [ ] First-run users still see the full wizard
- [ ] Write [T4] DONE to STATUS.md
