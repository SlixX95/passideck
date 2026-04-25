# T2 — Setup Wizard Phase 2: Write Config + Credentials

## Goal

The Sprint 19 setup wizard detects tier status but can't write config. Make it interactive — user pastes credentials in the browser, wizard writes secrets.env and config.yaml.

## Implementation

### Server: POST /api/setup/configure

In `packages/server/src/index.js`, add:

```
POST /api/setup/configure
Body: {
  supabaseUrl: "https://...",
  supabaseServiceRoleKey: "sb_secret_...",
  openaiApiKey: "sk-proj-...",
  anthropicApiKey: "sk-ant-..." (optional),
  databaseUrl: "postgresql://..." 
}
```

The endpoint:
1. Validates each credential (test connection for Supabase, test embedding for OpenAI)
2. Writes `~/.termdeck/secrets.env` (creates dir if needed)
3. Writes/updates `~/.termdeck/config.yaml` with `rag.enabled: true` and credential references
4. Returns `{ success: true, tier: 2, detail: "Secrets saved, RAG enabled" }`

### Client: credential form in setup wizard

In `packages/client/public/app.js`, update the setup wizard modal:
- For Tier 2 "not configured" state, show input fields: Supabase URL, Service Role Key, OpenAI Key, Database URL
- "Save & Connect" button POSTs to `/api/setup/configure`
- On success, re-fetch `/api/setup` to update the tier status display
- Show green checkmark per credential as validation passes

### Security
- Credentials only travel over localhost (127.0.0.1)
- The bind guardrail prevents this endpoint from being exposed on 0.0.0.0
- Credentials are written to secrets.env with chmod 600

## Files you own
- packages/server/src/index.js (POST /api/setup/configure endpoint only)
- packages/client/public/app.js (wizard form + submission only — coordinate with T4 on the returning-user flow)

## Acceptance criteria
- [ ] User can paste credentials in the browser wizard
- [ ] Wizard validates credentials before saving
- [ ] secrets.env and config.yaml written correctly
- [ ] Tier status updates after saving
- [ ] Write [T2] DONE to STATUS.md
