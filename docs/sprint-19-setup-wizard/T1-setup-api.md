# T1 — Setup Detection API

Create `GET /api/setup` that returns the current tier status:

```json
{
  "tier": 2,
  "tiers": {
    "1": { "status": "active", "detail": "TermDeck running on :3000" },
    "2": { "status": "partial", "detail": "Mnestra reachable but DATABASE_URL not in config" },
    "3": { "status": "not_configured", "detail": "Rumen not deployed" },
    "4": { "status": "not_configured", "detail": "No project paths in config.yaml" }
  },
  "config": {
    "hasSecretsFile": true,
    "hasConfigFile": true,
    "hasDatabaseUrl": true,
    "hasMnestraRunning": false,
    "hasRumenDeployed": false,
    "projectCount": 0
  },
  "firstRun": true
}
```

Reuse preflight check results where possible. Cache for 60s.

## Files you own
- packages/server/src/index.js (GET /api/setup endpoint only)

## Acceptance criteria
- [ ] GET /api/setup returns tier status
- [ ] firstRun is true when no config.yaml exists
- [ ] Reuses preflight data where possible
- [ ] Write [T1] DONE to STATUS.md
