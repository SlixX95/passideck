# TermDeck / Mnestra / Rumen — Parallel Build Plan

**Date:** 2026-04-13
**Owner:** Joshua Izzard
**Goal:** Close the gap between the three-tier stack (TermDeck → Mnestra → Rumen) and the bar set by comparable tools (`claude-mem` v6.5), using four Claude Code terminals running in parallel.

This document is the single source of truth for the next build session. Every terminal reads it at startup, executes only its own section, and writes progress back to `docs/STATUS.md` (see "Coordination protocol" below).

---

## 0. Context — what already works and what doesn't

### What works today (verified 2026-04-13)

| Area | State |
|---|---|
| TermDeck milestones 1–8 | ✅ Complete. PTYs, layouts, themes, metadata, SQLite, local RAG events, auto-reconnect, 8-session stress test passed. |
| TermDeck `/api/ai/query` | ✅ Wired end-to-end. `client:942 askAI()` → `server:375 POST /api/ai/query` → OpenAI embeddings → Supabase `memory_hybrid_search`. Returns top 5 memories scoped to the panel's project (`all:` prefix = cross-project). |
| Mnestra v0.1.0 | ✅ Published as `@jhizzard/mnestra`. Six MCP tools, hybrid search with tiered recency decay, source-type weighting, project affinity, consolidation via Haiku. 2,600+ memories in the production store. |
| Rumen v0.1.0 | ✅ Published as `@jhizzard/rumen`. Extract + Relate + Surface phases. No LLM calls. Designed as a Supabase Edge Function triggered by `pg_cron` every 15 min. |
| Portfolio site + blog | ✅ Shipped (joshuaizzard-com.vercel.app), 10 posts, Callout/PullQuote components. |
| Devcontainers | ✅ All 3 repos have `.devcontainer/devcontainer.json`. |

### What is missing (the work for this session)

**From prior session memories and gap analysis (2026-04-11 / 04-12):**

1. TermDeck first-user experience bounces:
   - `npx termdeck` is broken — the `termdeck` npm name is taken by an unrelated Stream Deck Electron app.
   - `npm install` needs a C++ compiler because `node-pty` and `better-sqlite3` are not shipped as prebuilds.
   - Empty dashboard has no first-run guidance.
2. No panel info tabs — there's a single `.ctrl-input` "Ask about this terminal" and nothing else. No way to browse per-panel command history, memory hits, or status log.
3. No terminal switcher UI beyond `Ctrl+Shift+[` / `]` cycling. No floating switcher, no quick-jump grid, no click-to-focus target.
4. No **reply / send-to-terminal** button — you cannot route text from one panel into another, which blocks agent-to-agent workflows.
5. No centralized control dashboard aggregating activity across panels.
6. No proactive memory queries — the output analyzer detects errors but never fires an automatic Mnestra lookup.
7. No LLM session-log summarizer (Tier 1 feature from `PLAN-rename-and-architecture.md`).
8. `/api/ai/query` bypasses the published Mnestra package — it talks to Supabase directly, which means any improvement to Mnestra does not flow into TermDeck.
9. README has no hero screenshot or GIF.
10. Windows installer exists but is untested.

**From the `claude-mem` parity analysis (this session):**

11. No MCP-shaped 3-layer progressive disclosure search API (`search` → `timeline` → `get_observations`). Mnestra has `memory_recall` which is close but single-shot and returns full rows — no token-efficient index → drill pattern.
12. No HTTP event webhook on Mnestra (Fix 6 second half from `docs/RAG-FIXES-APPLIED.md`). Every TermDeck ingest call spawns an MCP child or hits Supabase directly.
13. No privacy tags (`<private>…</private>` exclusion at write time).
14. No citation endpoint (`GET /observation/:id`) — memories have UUIDs but nothing exposes them for inline citations.
15. No `memory_export` / `memory_import` CLI (listed in Mnestra's "Unreleased" section).
16. No web viewer UI for Mnestra memories (`claude-mem` ships one on port 37777).
17. No documentation site (`claude-mem` ships `docs.claude-mem.ai`).
18. No Claude Code lifecycle-hooks capture path — Mnestra only ingests when an MCP client writes. `claude-mem` uses 5 hooks to auto-capture tool usage.

**From Mnestra's own CHANGELOG "Unreleased":**

19. `match_count` cap + EXPLAIN-friendly variant of `memory_hybrid_search`.

**From Rumen's roadmap:**

20. v0.2 — Claude Haiku synthesis replacing placeholder insight text, confidence scoring, batching.
21. LLM budget caps (100/day soft, 500/day hard).
22. Observation-ID citations in `rumen_insights.source_memory_ids` (already schema-ready, unused).
23. CI only runs `tsc --noEmit` + a basic SQL syntax check — no integration test against a real Mnestra schema.

This planning document splits every item above across four terminals such that no two terminals ever touch the same file.

---

## 1. Four-terminal split — ownership rules

| Terminal | Repo | Exclusive file ownership |
|---|---|---|
| **T1 — TermDeck Client UI** | `termdeck` | `packages/client/public/**` (only this directory) |
| **T2 — TermDeck Server / CLI / Config** | `termdeck` | `packages/server/src/**`, `packages/cli/src/**`, `packages/server/package.json`, `packages/cli/package.json`, `config/**`, root `package.json` |
| **T3 — Mnestra** | `mnestra` | the entire `/Users/joshuaizzard/Documents/Graciella/mnestra/` repo |
| **T4 — Rumen + shared docs site** | `rumen` + `termdeck/docs-site/` | the entire `/Users/joshuaizzard/Documents/Graciella/rumen/` repo, **plus** the new `termdeck/docs-site/` directory for the public documentation site |

**Shared writable files (append-only, coordinate via timestamps):**

- `termdeck/docs/STATUS.md` — every terminal appends here after each completed task.
- `termdeck/docs/PLANNING_DOCUMENT.md` — this file. **Read-only for all terminals.** If you want to change the plan, stop and tell Josh.

**Hard rules:**

1. A terminal may only edit files in its exclusive-ownership list. If you need a file owned by another terminal, open an entry in `STATUS.md` under "Cross-terminal requests" and wait.
2. Never `git commit` or `git push` without Josh's explicit go-ahead. Stage changes, write the diff summary to `STATUS.md`, and stop.
3. Each terminal runs `git status` at startup and verifies the working tree is clean on its owned paths. If it isn't, log the pre-existing diff to `STATUS.md` before starting — so nothing gets blamed on the wrong run.
4. Tests, lints, and type checks must pass before a task is marked ✅ done. Partial work stays ⏳ in-progress.
5. If two terminals discover a genuine file conflict mid-session (e.g. a shared config T2 needs to change but T1 also references), the terminal that started later pauses and posts a blocker to `STATUS.md`. The earlier terminal wins, the later one refactors around it.

---

## 2. Coordination protocol — `docs/STATUS.md`

Before writing any code, **every terminal runs these three steps:**

1. `Read docs/PLANNING_DOCUMENT.md` — this file.
2. `Read docs/STATUS.md` — see what other terminals have already done / claimed.
3. Append a "started" entry under your terminal's header in `STATUS.md`.

Status file schema (T4 creates the file if it does not exist):

```markdown
# TermDeck Parallel Build — Live Status

> Append-only. Never rewrite or delete other terminals' entries. Use ISO timestamps.

---

## Terminal 1 — TermDeck Client UI

- [2026-04-13T14:02:11Z] started — working tree clean on packages/client/public/
- [2026-04-13T14:18:44Z] ⏳ T1.1 panel info tabs — in progress, editing index.html (panel template + tab CSS)
- [2026-04-13T14:41:02Z] ✅ T1.1 panel info tabs — done, tested with 4 panels open, no regression on layout modes
- [2026-04-13T14:41:30Z] 🔒 claiming: packages/client/public/index.html for T1.2 terminal switcher

## Terminal 2 — TermDeck Server / CLI
...

## Terminal 3 — Mnestra
...

## Terminal 4 — Rumen + docs site
...

---

## Cross-terminal requests

(empty)

---

## Blockers

(empty)
```

Every task update uses one of these glyphs:

- `⏳` — in progress
- `✅` — done
- `❌` — failed / abandoned (with reason)
- `🔒` — file lock acquired
- `🔓` — file lock released
- `❓` — question for Josh
- `🛑` — blocker

**Lock protocol:** before editing a file that might be ambiguous (e.g. a `README.md` in a shared repo), post `🔒 claiming: <path>` in `STATUS.md`. Release with `🔓` when done. Terminals must check for existing locks before editing.

**Poll cadence:** every terminal checks `STATUS.md` at the start of each new task. No busy-polling.

---

## 3. Terminal 1 — TermDeck Client UI

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns (read + write):**
- `packages/client/public/**` — `index.html`, any new CSS/JS files you split off, any new images.

**Must not touch:**
- `packages/server/**`, `packages/cli/**`, `config/**`, any `package.json`, anything outside `packages/client/public/`.

**Context you need to load first:**

1. `packages/client/public/index.html` — the entire dashboard, 1307 lines as of 2026-04-13.
2. `packages/server/src/index.js:147–475` — **read-only** to understand the API surface you'll call. In particular:
   - `GET /api/sessions`, `POST /api/sessions`, `PATCH /api/sessions/:id`, `DELETE /api/sessions/:id`
   - `GET /api/sessions/:id/history`
   - `GET /api/themes`, `GET /api/config`, `GET /api/status`
   - `GET /api/rag/events`, `GET /api/rag/status`
   - `POST /api/ai/query` — request: `{ question, sessionId, project }`; response: `{ memories, sessionContext, total }`.
3. `docs/STATUS.md` — before starting, confirm no other terminal has claimed `packages/client/public/index.html`.

**Tasks (in priority order):**

### T1.1 — Panel info tabs (HIGHEST)

Replace the current single-row control strip at the bottom of each panel with a **tabbed drawer**. Tabs:

- **Overview** (default): the current metadata strip — project, status, type, port, opened-at, last command.
- **Commands**: a scrollable list of the last N commands for this panel, sourced from `GET /api/sessions/:id/history`. Click a row to copy to clipboard. Auto-scrolls on new entries.
- **Memory**: the last N Mnestra hits for this panel, sourced from a new in-memory cache populated by the existing `askAI` flow plus proactive queries (see T1.4). Each row shows `source_type`, project tag, similarity %, content snippet, timestamp. Click to expand full content inline.
- **Status log**: a chronological feed of status transitions (`active → thinking → idle → errored → exited`) sourced from the `status_broadcast` WebSocket messages you already receive. Timestamped. Colored by status.

Drawer starts collapsed (only the overview strip visible). Clicking a tab name expands the drawer to ~180px tall. Clicking the active tab collapses. Drawer state is per-panel, remembered across layout changes.

**Acceptance criteria:**

- [ ] All four tabs render for every panel type, including exited panels (tabs become read-only).
- [ ] Tab state survives layout switches (`Ctrl+Shift+1..6`) without data loss.
- [ ] xterm.js `fit()` is called after drawer open/close so the terminal resizes instead of clipping.
- [ ] Opening the drawer on one panel does not affect others.
- [ ] Works across all 7 grid layouts. In ultra-dense modes (4x2, 2x4) the drawer starts collapsed.
- [ ] No regression on the existing "Ask about this terminal" input — it stays on the Overview tab for now.

### T1.2 — Terminal switcher UI

Two components:

**(a) Floating number-grid switcher.** A small fixed-position overlay in the top-right showing numbered tiles 1..N for every open terminal, with color-coded status dot. Clicking a tile focuses that panel. Tiles show project tag color. In ≥4 panel layouts this is more useful than scrolling.

**(b) Keyboard quick-jump.** Extend the existing `Ctrl+Shift+1..6` (currently layout shortcuts) with an **additional** chord: `Alt+1..9` to focus panel N directly (does not change layout). `Alt+0` cycles focus. Do not break existing layout shortcuts — use `Alt`, not `Ctrl+Shift`.

**Acceptance criteria:**

- [ ] Switcher updates in real time as panels open and close.
- [ ] Focus highlight is visible (border, background tint) for ~600ms after switch.
- [ ] Keyboard chord does not interfere with xterm.js input capture — verify by launching vim and pressing Alt+1 (should still switch focus, vim should not receive a Meta key sequence that breaks it). Use `capture: true` on the listener if needed.
- [ ] Works with 1 panel (switcher hidden) up to 16 panels (scrolls).

### T1.3 — Reply / send-to-terminal button

On every panel add a `▸` send button in the Overview tab. Clicking it opens a small inline input + a target-panel dropdown. Typing text and hitting Enter posts to a **new** server endpoint `POST /api/sessions/:id/input` (coordinate with T2 — this endpoint does not exist yet; see cross-terminal request below).

Until T2 ships the endpoint, fall back to a **client-side local fallback**: directly call the target panel's WebSocket `.send({ type: 'input', data: text })`. This is strictly a local workaround — when T2's endpoint lands, flip to the API call so the server can log it to `command_history` with `source='reply'`.

**Cross-terminal request to T2:** post to `STATUS.md` under "Cross-terminal requests":

```
T1 → T2: need POST /api/sessions/:id/input accepting { text, source } — T1 will call it from the reply button. Source values: 'reply' (from another panel) | 'ai' (from askAI suggestions) | 'user' (manual). Until this lands T1 uses a direct WS workaround.
```

**Acceptance criteria:**

- [ ] Reply button visible on every panel, disabled when only one panel is open.
- [ ] Target dropdown excludes the current panel and any exited panels.
- [ ] Text is written into the target PTY, not just echoed in the UI.
- [ ] Newlines in the input field are sent as `\r` (not `\n` — zsh wants CR).
- [ ] When T2's endpoint ships, switch implementation by flipping a single `USE_SERVER_INPUT_API` flag you define at the top of the reply-button module.

### T1.4 — Proactive memory toast

Listen for status transitions to `errored` on the status_broadcast WS messages. When a panel enters `errored`, **automatically** call `POST /api/ai/query` with a synthesized query like `"${session.meta.type} error ${session.meta.lastCommands.slice(-1)[0]}"`. Show the top result as a toast notification anchored to the panel ("Mnestra found a similar error in project X — click to see"). Clicking opens the Memory tab pre-filtered.

Do not fire more than once per 30 seconds per panel. Respect `state.config.aiQueryAvailable` — if Mnestra is not configured, do nothing silently.

**Acceptance criteria:**

- [ ] Toast appears within 2 seconds of status → errored.
- [ ] Rate limiting works (manually trigger errors 10 times, only 2 toasts in 60s).
- [ ] No toasts when RAG is disabled.
- [ ] Toasts dismiss after 8 seconds or on click.

### T1.5 — First-run empty state

When `GET /api/sessions` returns `[]` and no panels exist, show a centered hero block:

- Headline: "No terminals yet."
- Three quickstart cards: "Open a shell", "Open Claude Code", "Open a Python server".
- A subtle bottom line: "Press `/` to focus the prompt bar, or `Ctrl+Shift+N` to open a shell."

Hide the hero as soon as the first panel opens. Show it again if the user closes all panels.

### T1.6 — Centralized control dashboard (stretch)

A new grid layout mode "Control" (button in the layout switcher row). Instead of PTY xterm panes, renders a vertical feed aggregating per-panel status transitions, last commands, recent errors, and recent Mnestra hits — like a Slack-style activity stream. Clicking a row focuses the source panel and returns to the 2x2 layout.

Only start T1.6 after T1.1–T1.5 are green.

### T1.7 — Screenshots for README (stretch)

Once T1.1–T1.5 are done and the UI is photogenic, run `npm run dev`, open 4 panels in a 2x2 with real work (one `claude`, one `htop`, one `node server`, one `ls`), and capture:

- A full-dashboard PNG at 1920×1080 → `docs/screenshots/dashboard-4panel.png`
- A close-up of the new info tabs drawer → `docs/screenshots/info-tabs.png`
- A shot of the switcher overlay with 8 panels → `docs/screenshots/switcher.png`

Commit the screenshots to the `termdeck` repo. T4 will reference them from the docs site.

**Subagent delegation guidance for T1:**

- T1.1 is too big for a single edit — delegate the CSS + tab-state-machine to an `Explore` subagent to produce a design first, then implement in the main agent.
- T1.6 (control dashboard) is a good candidate for a `general-purpose` subagent that designs the data flow, while you keep the main agent on T1.1–T1.5.
- Screenshot capture (T1.7) is a good candidate for a `general-purpose` subagent running Playwright against `localhost:3000`.

---

## 4. Terminal 2 — TermDeck Server / CLI / Config / Packaging

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`

**Owns (read + write):**
- `packages/server/src/**` — `index.js`, `session.js`, `database.js`, `rag.js`, `themes.js`
- `packages/cli/src/**` — `index.js`
- `packages/server/package.json`, `packages/cli/package.json`, `packages/client/package.json` (name/version only, not public/), root `package.json`
- `config/**` — `config.example.yaml`, `supabase-migration.sql`
- any new server subdirectories (e.g. `packages/server/src/mnestra-bridge/`)

**Must not touch:**
- `packages/client/public/**` — that is T1's.
- The `mnestra` or `rumen` repos — those are T3 / T4.

**Context to load first:**

1. `packages/server/src/index.js` in full.
2. `packages/server/src/session.js` — the output analyzer and event emitter.
3. `packages/server/src/rag.js` — the current RAG integration.
4. Mnestra's `src/index.ts`, `mcp-server/index.ts`, `README.md` — **read-only**. Understand the published interface you will consume.
5. `docs/STATUS.md`.

**Tasks (in priority order):**

### T2.1 — Mnestra bridge mode (HIGHEST)

`/api/ai/query` currently embeds and queries Supabase directly, duplicating logic that already exists inside the `@jhizzard/mnestra` package. This is the single biggest technical-debt item. Fix it by adding a configurable **Mnestra bridge**.

Introduce a new server module `packages/server/src/mnestra-bridge/index.js` that exports a single async function:

```js
async function queryMnestra({ question, project, searchAll, sessionContext }) { ... }
```

Behind a config toggle `rag.mnestraMode` (default: `direct`), the bridge supports three modes:

- `direct` — current behavior, unchanged. Preserves backward compat.
- `webhook` — POSTs to Mnestra's HTTP event webhook at `rag.mnestraWebhookUrl` (T3 is building this). Request body `{ op: 'recall', question, project, min_results: 5 }`. Expects `{ memories: [...] }`.
- `mcp` — spawns the `mnestra` binary (from `@jhizzard/mnestra` npm install) on first call, keeps the stdio transport alive, issues `memory_recall` / `memory_search` / `memory_get` via JSON-RPC.

Swap `POST /api/ai/query` to call `queryMnestra(...)` instead of inlining the OpenAI + Supabase fetches. Keep the existing response shape — **do not break T1's consumer.**

**Acceptance criteria:**

- [ ] All three modes pass a smoke test against a live Supabase instance (direct mode existing behavior) or against a Mnestra webhook stub / MCP child.
- [ ] Mode defaults to `direct` so no existing users break.
- [ ] Errors from any mode surface the same `{ error: string }` shape client already handles.
- [ ] The bridge handles MCP child crashes by respawning on next call.
- [ ] `docs/STATUS.md` records the cross-terminal dependency on T3 finishing the webhook before `webhook` mode can be tested end-to-end.

### T2.2 — `POST /api/sessions/:id/input` (unblocks T1.3)

New endpoint accepting `{ text, source }`. Writes `text` to `session.pty`, increments a new `session.meta.replyCount` counter, logs the event to SQLite `command_history` with a new `source` column (migrate the existing table — see T2.3).

Ship this **early** — T1.3 is waiting. Post `T2 → T1: /api/sessions/:id/input ready` in `STATUS.md` the moment it's merged.

**Acceptance criteria:**

- [ ] Text is CRLF-normalized before writing to PTY.
- [ ] Input from a different panel is logged with its originating session ID.
- [ ] Rate-limited to prevent a runaway loop (max 10 calls/sec per target session).
- [ ] Returns 404 if the target session is exited.

### T2.3 — SQLite migration for `command_history.source`

Add a `source TEXT DEFAULT 'user'` column to `command_history`. Migration runs automatically on server start if the column is missing (`PRAGMA table_info` check). Update `logCommand()` in `database.js` to accept and store `source`. Backfill existing rows with `'user'`.

### T2.4 — Proactive Mnestra queries from the output analyzer

Currently `session.js` emits `status_changed` events. Add a new event `error_detected` that fires when status transitions into `errored`, carrying the last-command context and a stripped tail of the PTY output (last 200 bytes, ANSI-stripped). In `index.js`, subscribe to this event and:

1. Call `queryMnestra({ question: "${meta.type} error ${lastCommand}", project: meta.project, sessionContext })`.
2. Push the top hit to the panel's WebSocket as a new message type `{ type: 'proactive_memory', hit }`.

T1.4 already listens for proactive toasts — keep the schema T1 expects.

**Acceptance criteria:**

- [ ] Fires at most once every 30s per session (server-side rate limit, independent of T1's client-side limit).
- [ ] Never fires when `rag.enabled` is false.
- [ ] Does not block the main PTY loop — always async, always `void`-return.

### T2.5 — LLM session-log summarizer (Tier 1 feature)

When a session exits, the server writes a markdown file to `~/.termdeck/sessions/YYYY-MM-DDTHH-MM-${sessionId}-${labelSlug}.md` containing:

- Frontmatter: session id, project, type, opened at, closed at, command count
- "What ran" — the full command history
- "What was edited" — any file-edit lines the analyzer caught
- "What errored" — any lines classified as errors
- "Summary" — a short paragraph produced by a single LLM call (model: whichever `rag.summaryModel` is, default `claude-haiku-4-5`)

Opt-in via CLI flag `termdeck --session-logs` or config `sessionLogs.enabled: true`. Requires `ANTHROPIC_API_KEY`.

**Acceptance criteria:**

- [ ] Works without any RAG / Supabase config (Tier 1 is zero-config).
- [ ] Graceful fallback: if no API key is set, write the markdown without the "Summary" section and log a one-time warning.
- [ ] Does not block session teardown — run in a fire-and-forget Promise.

### T2.6 — `prebuild-install` for `node-pty` and `better-sqlite3`

The blocker for `npx termdeck` is C++ compilation. Fix by:

1. Pin `node-pty` to a version that ships prebuilds for Node 20 / 22 / 24 (check npm). As of 2026-04 `node-pty@1.2.0-beta.12` is what TermDeck uses — verify it still ships prebuilds or bump to the latest stable with prebuilds.
2. Ensure `better-sqlite3` resolves via `prebuild-install`. It already does in normal installs — add `install` script fallback if not.
3. Test a clean install on a machine (or Docker image) with no C++ toolchain:
   ```
   docker run --rm -v $(pwd):/app -w /app node:24-bookworm-slim bash -lc "apt-get update && apt-get install -y python3 make g++ --no-install-recommends; rm -rf node_modules; npm install --no-save"
   ```
   Then flip to `node:24-alpine` with **no** build tools installed to prove prebuilds actually work. This is your real acceptance test.
4. Document the install flow in `config/config.example.yaml` comments.

**Delegate to a subagent:** spin up a `general-purpose` subagent to run the docker verification in parallel while you handle T2.7.

### T2.7 — npm package rename

`termdeck` is taken. Candidates to try (in order, check `npm view <name>` for availability):

1. `@jhizzard/termdeck` (scoped, guaranteed available since you own `@jhizzard`).
2. `termdeck-cli`
3. `termdeckjs`

**Default to `@jhizzard/termdeck`.** Scoped packages are the clean answer. Update:

- Root `package.json` name
- `packages/cli/package.json` name + bin entry still resolves to `termdeck` command (npm lets you alias bins)
- `README.md` install instructions (T4 owns `docs-site/`, not `README.md` — T2 edits the readme)
- `config/config.example.yaml` comments

**Acceptance criteria:**

- [ ] `npx @jhizzard/termdeck` launches the dashboard on a clean machine.
- [ ] The binary on `$PATH` is still `termdeck` (not `@jhizzard-termdeck`).
- [ ] `npm run dev` and `npm run build` still work in the workspace.

### T2.8 — Config schema for new knobs

Update `config/config.example.yaml` with the new keys:

```yaml
rag:
  enabled: false
  mnestraMode: direct  # direct | webhook | mcp
  mnestraWebhookUrl: http://localhost:37778/mnestra
  # ... existing keys ...
sessionLogs:
  enabled: false
  summaryModel: claude-haiku-4-5
```

**Subagent delegation guidance for T2:**

- T2.1 is the biggest task — delegate the `mcp` mode child-process management to a `general-purpose` subagent. The `direct` and `webhook` paths stay in the main agent because they're short.
- T2.6 docker verification is a classic delegation target.
- T2.5 summarizer prompt design can be delegated to a `claude-api` skill invocation.

---

## 5. Terminal 3 — Mnestra

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/mnestra`

**Owns:** the entire Mnestra repo.

**Must not touch:** anything outside `/Users/joshuaizzard/Documents/Graciella/mnestra/`. That includes `rumen` and `termdeck`.

**Context to load first:**

1. `README.md`, `CHANGELOG.md`, `docs/SCHEMA.md`, `docs/SOURCE-TYPES.md`, `docs/INTEGRATION.md`, `docs/RAG-FIXES-APPLIED.md`.
2. `src/index.ts`, `src/recall.ts`, `src/remember.ts`, `src/search.ts`, `src/consolidate.ts`.
3. `mcp-server/index.ts`.
4. `migrations/001_mnestra_tables.sql`, `migrations/002_mnestra_search_function.sql`, `migrations/003_mnestra_event_webhook.sql`.
5. `docs/STATUS.md` in the TermDeck repo (at `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/STATUS.md`). Yes, you post cross-repo status to the TermDeck STATUS.md — that is the single coordination surface.

**Tasks (in priority order):**

### T3.1 — HTTP event webhook server (UNBLOCKS T2.1 webhook mode)

`migrations/003_mnestra_event_webhook.sql` is currently a placeholder. Ship the server side:

Add a new module `src/webhook-server.ts` that exposes a tiny HTTP server (use `http` core module or `express` — match what Mnestra already depends on; do not add new deps if avoidable). Port: configurable via `MNESTRA_WEBHOOK_PORT`, default `37778`. Endpoints:

- `POST /mnestra` — body `{ op, ...args }` where `op` is one of `remember`, `recall`, `search`, `status`. Dispatches to the same functions the MCP server calls.
- `GET /healthz` — returns `{ ok: true, version, store: { rows, last_write } }`.
- `GET /observation/:id` — fetch a single memory by UUID. Returns `{ id, content, source_type, project, created_at, metadata }` or 404. **This is the citation endpoint** (T3.4).

Expose a new CLI subcommand `mnestra serve` that starts the webhook server. The MCP server keeps working unchanged — the two are additive.

**Acceptance criteria:**

- [ ] `mnestra serve` binds on `$MNESTRA_WEBHOOK_PORT`, logs startup line `[mnestra-webhook] listening on :37778`.
- [ ] `POST /mnestra` with `{ op: 'recall', question: 'hello' }` returns identical results to `memory_recall` via MCP stdio.
- [ ] Graceful shutdown on SIGTERM.
- [ ] Unit test: mock a recall and assert JSON shape.
- [ ] Post `T3 → T2: webhook ready at :37778` in STATUS.md the moment this lands, so T2 can flip the bridge.

### T3.2 — Three-layer search tools (`claude-mem` parity)

Add three new MCP tools and three matching webhook ops:

1. **`memory_index`** (a.k.a. `search` in `claude-mem`): returns a compact array of `{ id, snippet (≤120 chars), source_type, project, created_at }`. Target output: 80–120 tokens per result. Internally calls `memory_hybrid_search` but projects a compact shape. Supports the same filters as `memory_search`.

2. **`memory_timeline`** — input `{ query?: string, around_id?: uuid, window: '1h' | '24h' | '7d' }`. Returns memories from the same project chronologically surrounding either the query hit or a specific observation ID. Shape: same compact form as `memory_index`.

3. **`memory_get`** — input `{ ids: uuid[] }`. Returns full `memory_items` rows for the given IDs. Batch-only — do not allow single-ID calls that encourage N+1.

Expose all three in `mcp-server/index.ts` **and** through the webhook server from T3.1.

**Acceptance criteria:**

- [ ] Round-trip test: `memory_index` → pick 2 IDs → `memory_get` — confirm full rows match the index snippets.
- [ ] `memory_timeline` around a specific ID returns ±10 memories from the same project.
- [ ] All three tools appear in `ListTools` for MCP clients.
- [ ] Documented in `README.md` tool reference table **and** `docs/SCHEMA.md`.

### T3.3 — Privacy tags

Update `memory_remember` (and the consolidation job) to strip `<private>...</private>` blocks from the `content` **before** embedding and storing. The stripped block is replaced with `[redacted]` in the stored row.

Add a per-memory `metadata.had_private_content: boolean` flag so admin tooling can identify redacted memories without reading content.

Update `docs/SOURCE-TYPES.md` with a "Privacy" section documenting the behavior.

**Acceptance criteria:**

- [ ] A memory containing `foo <private>sk-123</private> bar` stores `foo [redacted] bar` with `metadata.had_private_content = true`.
- [ ] The embedding is computed on the redacted text, not the original.
- [ ] No private content ever reaches OpenAI.
- [ ] Unit test covering multi-line private blocks, nested tags, unclosed tags (treat as literal).

### T3.4 — Citation endpoint (already part of T3.1)

Covered by `GET /observation/:id` in T3.1. Verify the `memory_get` MCP tool is the stdio counterpart — they must return the same shape.

### T3.5 — `memory_export` / `memory_import` CLI

New CLI subcommands:

- `mnestra export --project <name> --since <iso> > dump.jsonl` — streams memory_items as JSONL, one row per line.
- `mnestra import < dump.jsonl` — reads JSONL, embeds missing embeddings (rows that already have an embedding are upserted as-is), deduplicates against existing rows.

This is the migration path out of Mnestra — important for credibility. Use streaming IO, do not load the whole store into memory.

### T3.6 — `match_count` cap + EXPLAIN variant

- Cap `match_count` in `memory_hybrid_search` at 200 (configurable). Currently unbounded, which risks expensive queries at scale.
- Ship an `EXPLAIN (ANALYZE, BUFFERS)` variant as a separate SQL function `memory_hybrid_search_explain` that returns the plan as text. Useful for `mnestra diagnose`.

### T3.7 — Docs updates

Update `README.md` and `CHANGELOG.md` with everything from T3.1–T3.6. Move items out of the `Unreleased` section into `[0.2.0]` with today's date and a short release note. **Do not bump `package.json` version** — that is Josh's call.

**Subagent delegation guidance for T3:**

- T3.1 and T3.2 can each spawn a `general-purpose` subagent to draft TypeScript scaffolding while you review.
- T3.3 privacy-tag regex is a good candidate for an independent subagent to enumerate edge cases (nested tags, attribute variations, HTML-entity encoding) and return a test matrix.
- T3.5 export/import logic is big enough to delegate end-to-end to a subagent, then code-review in the main agent.

---

## 6. Terminal 4 — Rumen v0.2 + shared docs site

**Working directory:** `/Users/joshuaizzard/Documents/Graciella/rumen` (primary) and `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site` (secondary, you will create this).

**Owns:**
- The entire Rumen repo.
- A new directory `docs-site/` inside the TermDeck repo — you create this from scratch. Nobody else touches it.

**Must not touch:**
- Anything inside `packages/` of the TermDeck repo.
- The `mnestra` repo (that is T3).

**Context to load first:**

1. `rumen/README.md`, `rumen/CHANGELOG.md`, `rumen/docs/MNESTRA-COMPATIBILITY.md`.
2. `rumen/src/extract.ts`, `relate.ts`, `surface.ts`, `db.ts`.
3. `rumen/migrations/001_rumen_tables.sql`, `002_pg_cron_schedule.sql`.
4. `rumen/supabase/functions/rumen-tick/index.ts`.
5. `termdeck/docs/STATUS.md`.

### T4.1 — Rumen v0.2 synthesize phase (HIGHEST)

Add `src/synthesize.ts` that takes the output of `relate.ts` (signal + top-5 related memories) and produces:

- `insight_text` — a 1–3 sentence human-readable insight synthesized by Claude Haiku (`claude-haiku-4-5-20251001`).
- `confidence` — 0..1 score based on: (a) max similarity across related memories, (b) number of cross-project hits, (c) age spread of sources.
- `source_memory_ids` — already computed by `relate.ts`, passed through unchanged.

Wire `synthesize.ts` into `runRumenJob`: Extract → Relate → **Synthesize** → Surface. The placeholder insight text in `surface.ts` is replaced with the real `insight_text`.

**Cost guardrails (hard requirement):**

- Track LLM call count in memory for the life of a job. Cap at `RUMEN_MAX_LLM_CALLS_SOFT` (default 100) — log a warning and continue using a fallback template. Cap at `RUMEN_MAX_LLM_CALLS_HARD` (default 500) — raise and abort the job.
- Track tokens spent. Log `[rumen-synthesize] tokens=<n>` per call.
- Batch where possible: pass up to 3 signals in a single synthesis prompt, ask the model to return `{ insights: [...] }`. Reduces overhead.

Update `package.json` to add `@anthropic-ai/sdk` as a dep. Update `src/types.ts` with `Insight` and `SynthesizeContext` types.

**Acceptance criteria:**

- [ ] Integration test `scripts/test-locally.ts` runs against a test Postgres and produces at least one `rumen_insights` row with real `insight_text`.
- [ ] Hard cap aborts the job cleanly — rows already written stay, no corruption.
- [ ] No LLM call if `ANTHROPIC_API_KEY` is missing — fall back to v0.1 placeholder and log `[rumen-synthesize] no API key, falling back to placeholder`.

### T4.2 — Rumen CI integration test

Extend the CI workflow to run `scripts/test-locally.ts` against an ephemeral Postgres (GitHub Actions `services: postgres`) seeded with a minimal `memory_items` fixture. Add the fixture under `tests/fixtures/mnestra-minimal.sql`.

**Acceptance criteria:**

- [ ] `.github/workflows/ci.yml` runs `tsc --noEmit`, `sql --lint`, and the new integration test on every PR.

### T4.3 — Observation-ID citations in insights

Rumen already writes `source_memory_ids[]` on `rumen_insights`. Add an explicit `citations` field in the `insight_text` rendering, formatted `[#<short-id>]` where `short-id` is the first 8 chars of the memory UUID. Example: `"Same CORS fix as [#a3c1d2e4] and [#5f8b0091]"`. Update the Haiku prompt to produce citations.

### T4.4 — Docs site scaffold

Create `termdeck/docs-site/` as an Astro **or** Next.js static site. Recommended: **Astro Starlight** for docs — fastest setup, native markdown + search, Vercel-ready.

Minimum pages:

- `/` — landing, one-pager describing the three-tier stack.
- `/termdeck` — TermDeck README rendered.
- `/mnestra` — Mnestra README rendered.
- `/rumen` — Rumen README rendered.
- `/architecture` — the three-tier diagram + how the pieces relate.
- `/roadmap` — copy of the roadmap sections from each CHANGELOG.

The site sources its content from the three repos via symlinks or a `pnpm run sync-content` script that copies README.md + docs/ from each repo into `docs-site/src/content/docs/` at build time. Do not hand-duplicate — it will rot.

Deploy target: Vercel. Domain: `termdeck.dev` (stretch — verify Josh owns it; if not, stage at a `*.vercel.app` preview URL and note it in STATUS.md).

**Acceptance criteria:**

- [ ] `pnpm --filter docs-site run dev` serves the site locally.
- [ ] `pnpm --filter docs-site run build` produces a static build with no broken links.
- [ ] The sync script runs cleanly even if Mnestra or Rumen are at different commits.

### T4.5 — Screenshot ingestion from T1

Once T1.7 ships screenshots into `termdeck/docs/screenshots/`, T4 references them in the docs site landing and in the `/termdeck` page. Coordinate via STATUS.md — do not start T4.5 until T1 posts `T1.7 ✅`.

### T4.6 — Release notes draft (stretch)

Draft `CHANGELOG.md` entries for the next minor of all three repos reflecting whatever T1–T3 landed in this session. Leave them as `## [Unreleased]` — Josh promotes to a version number and tags.

**Subagent delegation guidance for T4:**

- T4.1 synthesize prompt design — delegate to a `claude-api` skill invocation to produce a well-cached prompt (with the `cache_control` block on the system prompt for reuse across batch calls).
- T4.4 docs site scaffold — delegate the initial Astro Starlight setup to a `general-purpose` subagent ("scaffold Astro Starlight, wire symlink content sources from three repos, produce a working dev server"). Main agent reviews and customizes.
- T4.2 CI fixture creation — a small `general-purpose` subagent can pattern-match Mnestra's existing test setup if there is one.

---

## 7. Dependency graph — what blocks what

```
T2.1 bridge  ──depends on──►  T3.1 webhook   (for `webhook` mode only; `direct` mode ships independently)
T1.3 reply   ──depends on──►  T2.2 input API (until then T1 uses WS fallback)
T1.4 toast   ──depends on──►  T2.4 proactive event
T4.1 synth   ──depends on──►  (T3.3 privacy tags, soft dep — so redacted memories don't feed synthesis)
T4.5 screens ──depends on──►  T1.7 screenshots
T4.4 docs    ──depends on──►  nothing hard; can run in parallel from minute zero
```

Nothing blocks T3.1 or T4.1 — those are the two biggest independent critical-path tasks. Start them immediately in T3 and T4.

---

## 8. Starting prompts — copy / paste these into each TermDeck terminal

Open four terminals in TermDeck and paste one of these into each.

### Terminal 1 prompt

```
You are Terminal 1 (TermDeck Client UI), referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/PLANNING_DOCUMENT.md.

Execute only the section titled "3. Terminal 1 — TermDeck Client UI" and nothing else.
Do not edit any files outside packages/client/public/.
Before starting, read docs/PLANNING_DOCUMENT.md in full, read docs/STATUS.md, and append a
"started" entry under your Terminal 1 header. Check STATUS.md at the start of every new task.
Coordinate with other terminals exclusively through docs/STATUS.md — never assume another terminal
has finished something until it is marked ✅.

Start with T1.1 (panel info tabs). When T1.1 is ✅, proceed through T1.2 → T1.7 in order.
Never mark a task ✅ unless its acceptance criteria are met.
Do not commit or push anything without explicit approval.
```

### Terminal 2 prompt

```
You are Terminal 2 (TermDeck Server / CLI / Config), referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/PLANNING_DOCUMENT.md.

Execute only the section titled "4. Terminal 2 — TermDeck Server / CLI / Config / Packaging"
and nothing else. Do not edit any files under packages/client/public/ or either of the mnestra
or rumen repos. Before starting, read docs/PLANNING_DOCUMENT.md in full, read docs/STATUS.md,
and append a "started" entry under your Terminal 2 header.

Start with T2.2 (POST /api/sessions/:id/input) because Terminal 1 is blocked on it — ship it
first, post the cross-terminal "ready" note in STATUS.md, then continue with T2.1 → T2.8 in
order. Never mark a task ✅ unless its acceptance criteria are met.
Do not commit or push anything without explicit approval.
```

### Terminal 3 prompt

```
You are Terminal 3 (Mnestra), referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/PLANNING_DOCUMENT.md.

Your working directory is /Users/joshuaizzard/Documents/Graciella/mnestra. Execute only the
section titled "5. Terminal 3 — Mnestra" and nothing else. Do not edit anything outside the
mnestra repo. Before starting, read the planning document and the TermDeck STATUS.md file at
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/STATUS.md,
and append a "started" entry under your Terminal 3 header.

Start with T3.1 (HTTP webhook server) because Terminal 2 is blocked on its webhook mode. When
T3.1 is ✅ and you have posted "T3 → T2: webhook ready" in STATUS.md, proceed with T3.2 → T3.7
in order. Never mark a task ✅ unless its acceptance criteria are met.
Do not commit or push anything without explicit approval.
```

### Terminal 4 prompt

```
You are Terminal 4 (Rumen v0.2 + shared docs site), referenced in
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/PLANNING_DOCUMENT.md.

Your primary working directory is /Users/joshuaizzard/Documents/Graciella/rumen. You also
own /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site/
which you will create from scratch. Execute only the section titled "6. Terminal 4 — Rumen v0.2
+ shared docs site" and nothing else. Do not edit anything inside the packages/ directory of
TermDeck, and do not edit the mnestra repo.

Before starting, read the planning document and the TermDeck STATUS.md file at
/Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs/STATUS.md,
create docs/STATUS.md if it does not yet exist using the schema from section 2 of the planning
document, and append a "started" entry under your Terminal 4 header.

Start T4.1 (Rumen synthesize phase) and T4.4 (docs site scaffold) in parallel — they share no
files. Proceed with T4.2, T4.3, T4.5, T4.6 as they unblock. Never mark a task ✅ unless its
acceptance criteria are met. Do not commit or push anything without explicit approval.
```

---

## 9. End-of-session protocol

When your terminal has finished every task in its section (or as many as feasible in the session budget):

1. Append a final `— end of session —` entry to your terminal's STATUS.md header.
2. Summarize in STATUS.md: what shipped ✅, what is still ⏳, what is ❌ with reasons.
3. Leave the working tree staged but not committed — Josh reviews and commits.
4. Run `git status` one last time and log the result to STATUS.md so Josh can see the full diff footprint.

Josh comes back, reads `docs/STATUS.md` top to bottom, reviews each terminal's diffs, commits / squashes as needed, and ships.

---

## 10. Out of scope for this session

These are real gaps but explicitly parked to keep the four terminals from sprawling. Do not attempt them unless you have finished your whole section and coordinated with Josh first.

- Claude Code lifecycle-hooks auto-capture plugin (Mnestra-as-a-plugin distribution path, à la `claude-mem` `/plugin install`).
- Web viewer UI for Mnestra memories on a local port (parity with `claude-mem`'s `:37777`).
- TermDeck control dashboard aggregation view (T1.6 is a stretch within T1, but the full Slack-style feed is out of scope).
- Rumen v0.3 question generation.
- Rumen v0.4 self-tuning.
- Marketplace submission (`/plugin install termdeck` in Claude Code).
- Show HN post.
- Hub website (deferred since the 2026-03 plan).

These belong in the next session's planning document.

---

**End of PLANNING_DOCUMENT.md.**
