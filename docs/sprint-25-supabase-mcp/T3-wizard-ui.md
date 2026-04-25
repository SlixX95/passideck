# T3 — Wizard UI: PAT Field + Project Picker

## Goal

Add a Supabase MCP path to the existing Sprint 23 setup wizard. The user pastes a PAT, the wizard lists their projects, the user picks one, the wizard submits. Manual paste stays as a fallback.

## Scope

You touch **one file**: `packages/client/public/app.js`. Inline styles only — do NOT touch `style.css` (Sprint 23 T1 owns it). HTML is generated dynamically inside `app.js` already; you're extending the existing setup wizard render path.

## Implementation

### 1. Add a "Connect Supabase automatically" toggle to Tier 2 wizard render

Today the Tier 2 setup form (built in Sprint 23 T2) shows five inputs (Supabase URL, service role key, OpenAI key, database URL, optional Anthropic key). Above that form, add a small section:

```
┌─ Faster: connect Supabase automatically ────────────────┐
│  Paste a Supabase Personal Access Token and pick your   │
│  project from a list — we'll fetch the credentials for  │
│  you. Mint a PAT at supabase.com/dashboard/account/tokens│
│                                                          │
│  [PAT input]  [Connect]                                  │
└──────────────────────────────────────────────────────────┘
                ─ or paste credentials manually below ─
[existing 5-field form]
```

Use a div with inline styles only. Render conditionally — only show the auto path when `tiers[2].status === 'not_configured' || === 'partial'`.

### 2. Auto-flow

- On Connect: POST `/api/setup/supabase/connect` with the PAT. Spinner inline next to the button.
- On `ok`: replace the section with a project picker (`<select>` of project name+region, plus a "Use this project" button).
- On `code: 'mcp_not_installed'`: show inline message — "The Supabase MCP isn't installed on this machine. Run `npx @jhizzard/termdeck-stack --tier 4` to install it, or paste credentials manually below." Keep the manual form visible.
- On `code: 'pat_invalid'`: show inline message — "Token rejected: <detail>. Mint a fresh PAT and try again."
- On `code: 'mcp_timeout'`: "Supabase didn't respond in time. Try again or paste manually."

### 3. Project picker → submit

- On "Use this project": POST `/api/setup/supabase/select` with `{ pat, projectId }`.
- On success, call the existing `refreshSetupStatus()` (already in app.js from Sprint 23) so the tier badge flips to active.
- On failure, show the error inline and unlock the manual form.

### 4. Security

- The PAT input must use `type="password"`, `autocomplete="new-password"`, `spellcheck="false"`.
- After a successful `/connect`, **do not store the PAT in any global JS variable that outlives the wizard**. Hold it in a closure for the lifetime of the picker only. After `/select` succeeds, null it out.
- Never log the PAT.

### 5. Handle re-render

The setup wizard re-renders on tier-status changes (Sprint 23 wired this). Make sure your auto-flow section doesn't get re-mounted mid-flight. Keep the in-flight state in a single object `supabaseAutoState = { pat?, projects?, picking? }` scoped to the wizard module. On re-render, if `supabaseAutoState.picking` is true, render the picker, not the PAT entry.

## Files you own

- `packages/client/public/app.js` (the new auto-flow section + handlers, inside the existing wizard render code)

## Files you must NOT touch

- `packages/client/public/style.css` (Sprint 23 T1's file)
- `packages/server/src/index.js` (T2)
- `packages/server/src/setup/supabase-mcp.js` (T1)
- `packages/cli/src/index.js` (T4)

## Acceptance criteria

- [ ] Wizard's Tier 2 section renders the auto-flow above the manual form when status is `not_configured` or `partial`.
- [ ] Each of the four `/connect` error codes has a distinct, useful inline message.
- [ ] PAT field uses password autocomplete attributes; closure-only storage; nulled on success.
- [ ] `node --check packages/client/public/app.js` clean.
- [ ] Append `[T3] DONE` to `docs/sprint-25-supabase-mcp/STATUS.md`.

## Sign-off format

```
### [T3] Wizard UI for Supabase MCP

- Auto-flow section added to renderSetupTiers in packages/client/public/app.js.
- Three states wired: PAT entry → project picker → submit. Inline error messages for mcp_not_installed, pat_invalid, mcp_timeout, configure/migrate failure.
- supabaseAutoState held in module-scope closure; nulled on /select success.
- Inline styles only — no style.css edits.
- node --check clean.

[T3] DONE
```
