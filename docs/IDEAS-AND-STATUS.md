# TermDeck / Mnestra / Rumen — Ideas & Status Overview

**Last updated:** 2026-04-25

---

## Every surfaced idea for upcoming sprints

### TermDeck UX/UI
1. **Responsive layouts** — layouts must work on small laptops AND large iMacs (NOT done yet)
2. **Drag-and-drop layout** — custom panel sizing with splitters (Phase 2, post v0.5)
3. **Flashback toast content** — modal built (Sprint 16) but verify it actually renders useful content
4. **Error detection false positives** — fixed for clean exits (Sprint 16) but still needs monitoring
5. **Control panel dashboard** — aggregate activity feed with Yes/No buttons for agent permissions (from March 31)
6. **Session ID display** — done (Sprint 17), verify visible in all layouts

### Installation / Onboarding
7. **In-browser setup wizard** — built in Sprint 19 (config button → tier status). Sprint 23 T2/T3 made it actually WRITE config and run migrations. DONE.
8. **One-command startup (repo)** — `scripts/start.sh` rewritten in Sprint 22 with numbered steps. DONE.
9. **One-command startup (npm)** — `termdeck stack` shipped in **v0.4.6 (2026-04-25)**: Node port of `start.sh`, lives in the published tarball, identical four-step output. Closes the gap surfaced when Brad (Unagi tester) tried `scripts/start.sh` from his npm install and the directory wasn't there.
10. **`termdeck` orchestrates by default** — Sprint 24 plan at `docs/sprint-24-stack-default/`. Folds the orchestrator into the no-args path so testers don't have to learn `stack` as a separate command. `--no-stack` is the opt-out.
11. **Mnestra auto-read secrets.env** — done in Sprint 22 T4 (Mnestra 0.2.1)
12. **The installation is still too hard** — a new user needs: npm install, Supabase project, 6 SQL migrations, secrets.env, config.yaml, mnestra serve, termdeck. That's 15+ steps minimum. The wizard work in Sprint 23 cuts this to "paste 4 credentials in the browser" — but the wizard still has to be reached, which means a user has to start TermDeck once first.

### What's missing for real adoption
11. **Supabase MCP** — would massively simplify setup. Instead of manual SQL migrations + credential copying, the setup wizard could use a Supabase MCP server to create the project, run migrations, and set secrets automatically
12. **One-click install button** — a web page or CLI wizard that: detects what's installed → provisions Supabase (or connects to existing) → runs migrations → writes config → starts everything
13. **"Start your installed instance" button** — distinguish between first install and returning user. The setup wizard (Sprint 19) detects firstRun but needs a clearer "Welcome back, starting your stack..." flow

### Mnestra / Rumen
14. **Mnestra auto-read secrets** — done in Sprint 22 T4
15. **Rumen JSON parse hardening** — 19% placeholder rate from Sprint 22 re-kickstart (31/166 fallbacks)
16. **Rumen confidence normalization** — flagged by T3
17. **SkillForge Opus wiring** — skeleton built (Sprint 20), actual API call is v0.5
18. **Insight quality audit mechanism** — periodic review of what Rumen produces

### Dependencies
19. **Express 5 migration** — high risk, deferred
20. **Zod 4 migration** (Mnestra) — high risk, deferred

---

## Installation Fear — The Real Problem

No one will follow the current GETTING-STARTED.md. It's 15+ manual steps. The people who WILL try are Jonathan (enjoys DIY) and other senior devs. Everyone else bounces at step 3.

### The fix: Supabase MCP in the setup wizard

```
User runs: npx @jhizzard/termdeck

First-run detected → Setup wizard opens in browser

Step 1: "Do you have a Supabase account?"
  → Yes: "Paste your project URL and service_role key"
  → No: "Click here to create one (free)" [opens supabase.com]

Step 2: Wizard uses Supabase MCP to:
  - Verify credentials work
  - Run all 6 Mnestra migrations automatically
  - Create termdeck_transcripts table
  - Write ~/.termdeck/secrets.env
  - Write ~/.termdeck/config.yaml

Step 3: "Do you want Rumen (async learning)?"
  → Yes: Wizard runs init --rumen automatically
  → No: Skip (can add later)

Step 4: "Stack is ready. Mnestra: 0 memories (will grow as you work).
        Flashback will start surfacing recalls after a few days of use."

Total user actions: paste 2 credentials, click 3 buttons.
```

### Do we need a Supabase MCP?

There's already one: @supabase/mcp-server-supabase or similar. Check if it can run migrations. If not, the wizard can use psql via the CLI (which is what init --mnestra already does). The MCP approach is cleaner but the psql approach works today.

---

## Sprint 23: Responsive Layouts + Installation Simplification — DONE 2026-04-19

| Terminal | Task | Status |
|----------|------|--------|
| T1 | Responsive CSS — all layouts work on 13" laptop through 27" iMac | DONE |
| T2 | Setup wizard Phase 2 — actually WRITES config + runs migrations | DONE |
| T3 | Supabase credential validation in the wizard | DONE |
| T4 | "Welcome back" returning-user flow + start.sh first-run hint | DONE |
| orch | Audit fix — wire `runSetupMigrations` into `submitSetupCredentials` | DONE |

## Sprint 24: `termdeck` Orchestrates the Stack by Default — PLANNED

Plan + per-terminal specs at `docs/sprint-24-stack-default/`. Mission: make plain `termdeck` route through the v0.4.6 orchestrator when a configured stack is detected, so testers don't need to learn `termdeck stack` as a separate command. `--no-stack` opts out for diagnostics.

| Terminal | Task |
|----------|------|
| T1 | Default-path detection (`shouldAutoOrchestrate()`) + dispatch into `stack.js` |
| T2 | `--no-stack` flag wiring + help-text update |
| T3 | README, INSTALL, GETTING-STARTED, and CLI help reflect new default |
| T4 | Detection unit tests + dispatch integration tests; verify v0.4.5 → v0.5.0 upgrade is silent for unconfigured users |

---

## The Harness (separate project)

Vision doc at ~/Documents/Graciella/ChopinNashville/SideHustles/TheHarness/VISION.md. Key concept: automate LLM chat interfaces (Claude.ai, ChatGPT, Gemini, Grok) via Playwright browser automation instead of consuming API tokens. Uses Mnestra/Rumen as shared memory layer. 22 MCP connectors on day 1. Separate project from TermDeck but shares memory infrastructure.
