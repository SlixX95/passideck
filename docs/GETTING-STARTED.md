# Getting Started: TermDeck + Mnestra + Rumen

The full stack in four tiers. Each tier is independent — stop wherever you have what you need.

**Quick path (Quick mode):** Tier 1 takes 2 minutes, zero config. You get a working terminal multiplexer. Stop there if that's all you want. Each subsequent tier adds a heading that says what you gain and what it costs.

**Full path (Full stack mode):** All four tiers take ~30 minutes. You get a closed-loop cognitive system where your terminals remember what you fixed, learn while you sleep, and surface relevant memories when you hit the same error on a different project. Read straight through.

---

## Prerequisites

| Requirement | Tier | Notes |
|---|---|---|
| **Node 18+** | 1+ | `node --version` to check |
| **macOS or Linux** | 1+ | Windows not supported. Alpine/musl not supported (no prebuilt PTY binaries). |
| **Supabase project** | 2+ | Free tier works. [supabase.com](https://supabase.com) |
| **OpenAI API key** | 2+ | For `text-embedding-3-large` embeddings in Mnestra |
| **Anthropic API key** | 3 | For Haiku synthesis in Rumen |
| **Supabase CLI + Deno** | 3 | Required only for Edge Function deployment |

---

## Quick start (any tier)

The stack launcher handles everything — loads secrets, kills stale processes, starts Mnestra if installed, boots TermDeck:

**npm-installed (v0.4.6+):**

```bash
termdeck stack
```

**Repo clone:**

```bash
./scripts/start.sh
```

Both produce identical numbered four-step output. From v0.5.0, plain `termdeck` auto-detects a configured stack and routes through the orchestrator — `termdeck stack` becomes the explicit-force form. Use `termdeck --no-stack` to force a Tier-1-only boot.

It gracefully skips anything that isn't installed. Tier 1 users get a working dashboard. Full-stack users get the whole pipeline.

---

## Tier 1: Terminal Multiplexer (2 minutes)

Two ways to launch, depending on whether you've cloned the repo:

**npm users (no repo clone):**

```bash
npx @jhizzard/termdeck
```

This pulls the published package and runs the `termdeck` bin. Requires Node 18+ and a working `npx`. If `npx` can't resolve the bin (older versions of the package shipped without the bin wired up), upgrade with `npm install -g @jhizzard/termdeck@latest` and run `termdeck` directly.

**Repo-clone users (always works):**

```bash
./scripts/start.sh
```

From the cloned repo root. This launcher doesn't depend on the published bin — it runs the server directly from `packages/cli/src/index.js`, loads secrets, and handles stale-process cleanup. Use this if you're hacking on TermDeck or if `npx` gives you trouble.

Either path opens the browser at `http://127.0.0.1:3000`. No accounts, no credentials, no database.

**What you get:** real PTY shells via prebuilt `node-pty` (no C++ toolchain), 7 grid layouts (1x1 through 4x2 plus focus/half modes), 8 themes (Tokyo Night, Catppuccin Mocha, Rose Pine Dawn, Dracula, Nord, Gruvbox Dark, Solarized Dark, GitHub Light), per-panel metadata overlays, output analyzer for Claude Code / Gemini CLI / Python servers, onboarding tour, local SQLite persistence, health badge in the toolbar.

**Verify:**

1. Type `bash` in the prompt bar, click Launch — terminal panel appears
2. Run `echo hello && ls` to confirm interactivity
3. Open 2-3 more terminals, switch layouts with `Cmd+Shift+1` through `6`
4. Health badge in the top bar shows "Tier 1: OK" in green

**What's not active yet:** Flashback toasts (need Mnestra). Morning briefing (needs Rumen). Transcript backup to cloud (needs DATABASE_URL). All of these are silent — no errors, just features waiting for their tier.

**Setup wizard:** Click **config** in the toolbar to see your setup status and get guided instructions for each tier. The wizard detects which tiers are active, flags missing pieces, and links back into the steps below.

### >> STOP HERE if you just want a browser terminal multiplexer.

---

## Tier 2: Mnestra Memory (10 minutes)

**What you gain:** Flashback — when a terminal panel errors, TermDeck queries your memory store for similar past errors across all projects and surfaces the match as a toast. Plus: your AI editor (Claude Code, Cursor, Windsurf, Cline) gains persistent memory via MCP.

**What it costs:** A Supabase project (free tier), an OpenAI API key, ~10 minutes of setup.

### Step 1 — Install Mnestra and create Supabase project

```bash
npm install -g @jhizzard/mnestra
mnestra --version  # verify
```

Create a project at [supabase.com](https://supabase.com). Copy **Project URL** and **service_role key** from Project Settings > API.

### Step 2 — Get your DATABASE_URL

Dashboard > **Connect** (green button) > **Transaction pooler** tab > **toggle ON "Use IPv4 connection (Shared Pooler)"** (this is critical — see [RUMEN-UNBLOCK.md](./RUMEN-UNBLOCK.md) gotcha #1). Copy the displayed URL. Type your password in the password field at the top — it substitutes into the URL.

### Step 3 — Apply migrations

```bash
export DATABASE_URL="<paste the URL you just copied>"

for i in 001 002 003 004 005 006; do
  psql "$DATABASE_URL" -f "$(npm root -g)/@jhizzard/mnestra/migrations/${i}_*.sql"
done
```

Verify: `psql "$DATABASE_URL" -c "SELECT count(*) FROM memory_items"` returns `0` with no errors.

### Step 4 — Create secrets and config

```bash
mkdir -p ~/.termdeck

cat > ~/.termdeck/secrets.env <<'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
EOF
```

```bash
cat > ~/.termdeck/config.yaml <<'YAML'
port: 3000
defaultTheme: tokyo-night

rag:
  enabled: true
  supabaseUrl: ${SUPABASE_URL}
  supabaseKey: ${SUPABASE_SERVICE_ROLE_KEY}

projects:
  my-project:
    path: ~/path/to/your/project
    defaultTheme: tokyo-night
    defaultCommand: claude
YAML
```

Verify: `grep -c '=' ~/.termdeck/secrets.env` returns `5`.

### Step 5 — Restart TermDeck

```bash
npx @jhizzard/termdeck
```

Health badge now shows "Stack: OK" (or "Stack: 4/6" — Mnestra reachable and Rumen checks depend on whether you start the Mnestra server and set up Rumen).

### Step 6 (optional) — Mnestra as Claude Code MCP server

This gives Claude Code six persistent memory tools (`memory_recall`, `memory_remember`, `memory_search`, `memory_forget`, `memory_status`, `memory_summarize_session`).

Edit `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "mnestra": {
      "command": "mnestra",
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_...",
        "OPENAI_API_KEY": "sk-proj-...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart Claude Code. Verify: `/mcp` shows six `memory_*` tools.

### >> STOP HERE if you want Flashback + MCP memory but not the async learning loop.

---

## Tier 3: Rumen Async Learning (15 minutes)

**What you gain:** A Supabase Edge Function on a 15-minute `pg_cron` schedule that reads your recent memories, cross-references them via hybrid search (keyword + vector), synthesizes higher-order insights via Claude Haiku, and writes those insights back into Mnestra. Flashback then surfaces cross-project patterns you never explicitly saved.

**What it costs:** Anthropic API key (Haiku is cheap — soft cap 100 calls/day), Deno, Supabase CLI, ~15 minutes.

### Five gotchas (read before starting)

Full detail in [RUMEN-UNBLOCK.md](./RUMEN-UNBLOCK.md). Summary:

| # | Gotcha | Fix |
|---|---|---|
| 1 | Supabase Connect modal defaults to IPv6-only Dedicated Pooler | Toggle ON "Use IPv4 connection (Shared Pooler)" before copying URL |
| 2 | Password reset takes the literal string (no URL-decoding) | Use alphanumeric-only passwords |
| 3 | Setting `DIRECT_URL` alongside `DATABASE_URL` breaks auth | Set `DATABASE_URL` only |
| 4 | `brew install deno` fails on macOS 13 (needs Xcode 15) | Use `curl -fsSL https://deno.land/install.sh \| sh` |
| 5 | Schema drift from earlier failed installs | Run backfill SQL from RUMEN-UNBLOCK.md Step 5a first |

### Step 1 — Install Deno and Supabase CLI

```bash
curl -fsSL https://deno.land/install.sh | sh  # NOT brew on macOS 13
brew install supabase/tap/supabase
```

Add to `~/.zshrc`:

```bash
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
```

Verify: `source ~/.zshrc && deno --version && supabase --version`

### Step 2 — Supabase access token

Generate at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). Add to `~/.zshrc`:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
```

Verify: `source ~/.zshrc && supabase projects list` (no 401 error).

### Step 3 — Enable extensions and Vault secret

In Supabase Dashboard > Integrations: enable **Cron** (`pg_catalog` schema). Then in SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');  -- expect 2 rows
```

Add Vault secret: Dashboard > Database > Vault > New secret. Name: `rumen_service_role_key` (exact). Value: your service_role key from Settings > API.

### Step 4 — Run the init wizard

```bash
termdeck init --rumen
```

If not globally installed: `node packages/cli/src/index.js init --rumen`

The wizard checks prerequisites, links your Supabase project, applies the Rumen migration, deploys the `rumen-tick` Edge Function, sets secrets, fires a manual test POST, and schedules `pg_cron`.

### Step 5 — Verify

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'rumen%';
```

Expect one row, `active = true`. Wait ~15 minutes, then:

```bash
psql "$DATABASE_URL" -c "SELECT id, status, sessions_processed, insights_generated FROM rumen_jobs ORDER BY started_at DESC LIMIT 3"
```

At least one row with `status = done`.

### >> STOP HERE if you don't need project path awareness or CLAUDE.md integration.

---

## Tier 4: Full Integration — CLAUDE.md and Project Path Awareness

This tier isn't about installing new software. It's about making the tools you already installed in Tiers 1-3 aware of each other and of your project layout. This is what makes Claude Code inside TermDeck able to find your repos, recall your memories, and work across projects without you manually providing paths.

### What goes where: the three CLAUDE.md files

There are three different CLAUDE.md files with different scopes. You need to know which one to edit for what purpose.

| File | Scope | Who reads it | What goes in it |
|------|-------|-------------|-----------------|
| **`~/.claude/CLAUDE.md`** | Global — every Claude Code session, every folder | Every Claude Code instance on your machine | Memory-first instructions, project directory map, tool conventions |
| **`<project>/CLAUDE.md`** | Per-project — only when Claude Code is in that project directory | Claude Code sessions in that specific repo | Build commands, architecture decisions, coding conventions, file structure |
| **`~/.claude/projects/<path>/MEMORY.md`** | Per-project auto-memory — Claude Code's own notes | Claude Code's auto-memory system (not the same as Mnestra) | Auto-generated by Claude Code. Don't edit directly. |

### Step 1 — Global CLAUDE.md: Memory-first instructions

Add this to `~/.claude/CLAUDE.md`. This ensures every Claude Code session — whether inside TermDeck or in a standalone terminal — checks Mnestra before doing anything.

```markdown
## MANDATORY: Check Memory First

At the START of every conversation, before doing ANY work:

1. Call `memory_recall` with a query relevant to the current working directory/project
2. Call `memory_recall` with a query about recent sessions and decisions
3. If the user references something you don't have context for, ALWAYS
   check `memory_recall` and `memory_search` BEFORE saying you don't know

This is non-negotiable. Never start work without checking memory. Never say
"I don't have context" without first searching memory.
```

**Why this matters:** Without this, Claude Code sessions inside TermDeck start cold. They don't know about your prior decisions, recent bugs, or project history. The Mnestra MCP server provides the memory tools, but Claude Code won't use them proactively unless instructed to. This instruction is what closes the loop between Mnestra's memory store and Claude Code's behavior.

### Step 2 — Global CLAUDE.md: Project directory map

Also add to `~/.claude/CLAUDE.md`. This tells Claude Code where every project lives on disk, so it never fails to find a repo when asked.

```markdown
## Project Directory Map

| Project | Path |
|---------|------|
| my-saas | ~/projects/my-saas |
| api-service | ~/projects/api-service |
| mobile-app | ~/projects/mobile-app |

Never say "I can't find project X" without checking this table first.
```

**Why this matters:** During a live demo on 2026-04-16, Claude Code inside TermDeck was asked to "review rumen work from yesterday" and couldn't find the Rumen project — it searched by name and found nothing. The project map prevents this by giving Claude Code an explicit path table it checks before searching blindly.

### Step 3 — Per-project CLAUDE.md files

Each of your repos should have its own `CLAUDE.md` at the root with project-specific instructions. This file is read when Claude Code opens in that directory. Example for a Next.js project:

```markdown
# My SaaS — CLAUDE.md

## What this project is
A Next.js 14 SaaS with Supabase auth, Stripe billing, and a Postgres backend.

## Build and test
- `npm run dev` — starts dev server on :3000
- `npm test` — runs vitest suite
- `npm run build` — production build

## Architecture decisions
- App Router, not Pages
- Server Components by default
- Supabase Auth via @supabase/ssr
```

This file does NOT need memory instructions (those are global). It just needs project-specific context that helps Claude Code work effectively in that repo.

### Step 4 — Configure project paths in TermDeck

Edit `~/.termdeck/config.yaml` and add your actual project paths:

```yaml
projects:
  my-saas:
    path: ~/projects/my-saas
    defaultTheme: tokyo-night
    defaultCommand: claude
  api-service:
    path: ~/projects/api-service
    defaultTheme: catppuccin-mocha
    defaultCommand: claude
  mobile-app:
    path: ~/projects/mobile-app
    defaultTheme: nord
    defaultCommand: bash
```

### Step 5 — Verify the full stack

Restart TermDeck. Check:

1. Health badge shows "Stack: OK" (green) with all checks passing
2. Project dropdown in prompt bar lists your configured projects
3. Selecting a project launches a terminal `cd`'d to that path
4. Panel header shows project tag with theme color
5. Open Claude Code in a panel — it should immediately call `memory_recall`
6. Ask Claude Code "where is the [project-name] project?" — it should answer from the directory map, not search blindly

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npx` fails with compilation error | Native module build issue | v0.3+ uses prebuilts — `npm cache clean --force` and retry. macOS: `xcode-select --install`. |
| Blank page at localhost:3000 | xterm.js CDN unreachable | Check network. Dashboard loads from `cdn.jsdelivr.net`. |
| `EADDRINUSE: port 3000` (or 37778) on startup | Stale TermDeck/Mnestra process from a prior run | `./scripts/start.sh` kills stale PIDs automatically. Or manually: `lsof -ti :3000 \| xargs kill`. |
| Mnestra check red even though `mnestra serve` is running | Preflight hits `/healthz` (not `/health`) and parses `store.rows` — older Mnestra builds lacked that endpoint | Upgrade: `npm install -g @jhizzard/mnestra@latest` (≥0.2.0 required). |
| Tier 2 features silent despite `secrets.env` being populated | Vars exist in the file but weren't exported into the shell launching `npx termdeck` | Use `./scripts/start.sh` (auto-exports via `set -a; source`). Or manually: `set -a; source ~/.termdeck/secrets.env; set +a` before launching. |
| Health badge shows "Tier 1: OK" | DATABASE_URL not set | Expected for Tier 1. Add DATABASE_URL to `~/.termdeck/secrets.env` for full stack. |
| Health badge shows red | Mnestra/Rumen/DB not configured | Click badge for detail per check. Each failed check shows a remediation hint. |
| Flashback never fires | Empty memory store or Mnestra not running | Flashback needs memories. Use Mnestra for a few days first, or `mnestra serve` to start the server. |
| Claude Code says "I can't find project X" | No directory map in global CLAUDE.md | Add the Project Directory Map to `~/.claude/CLAUDE.md` (see Tier 4 Step 2). |
| Claude Code doesn't check memory on startup | No memory-first instruction | Add the MANDATORY section to `~/.claude/CLAUDE.md` (see Tier 4 Step 1). |
| `Connection refused` to Supabase | IPv6 Dedicated Pooler URL | Toggle ON "Use IPv4 (Shared Pooler)" in Supabase Connect modal, re-copy URL. |
| `password authentication failed` | Special chars in DB password | Reset to alphanumeric-only in dashboard. Do not URL-encode. |
| `Tenant or user not found` | `DIRECT_URL` set | Remove `DIRECT_URL`. Rumen uses `DATABASE_URL` only. |
| `init --rumen` fails on Deno | Homebrew Deno on macOS 13 | Use `curl -fsSL https://deno.land/install.sh \| sh` instead. |
| Edge Function version error | Pinned npm version not published | `npm view @jhizzard/rumen version`, update import in `rumen-tick/index.ts`. |
| `column "X" does not exist` | Schema drift from earlier install | Run backfill from RUMEN-UNBLOCK.md Step 5a, re-run wizard. |
| pg_cron not firing | Extension or schedule missing | `SELECT * FROM cron.job WHERE jobname LIKE 'rumen%'` — if empty, re-run wizard. |
