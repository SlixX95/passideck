# TermDeck Session History — 2026-03-19

## Session Summary

First build session for TermDeck (formerly TermGrid). Completed Milestones 1-2, renamed the project, and planned the architecture for publishing.

---

## Milestone 1: Core PTY + WebSocket Loop — COMPLETED

### What was done
1. Ran `npm install` — all 123 packages installed cleanly, 0 vulnerabilities
2. **node-pty compilation fix:** node-pty 1.0.0 failed with `posix_spawnp failed` on Node v23.11.0 (macOS Darwin 22.6.0). Fixed by upgrading to `node-pty@1.2.0-beta.12` in `packages/server/package.json`
3. better-sqlite3 compiled and loaded without issues
4. Server started successfully — SQLite initialized, PTY available, all systems green
5. Verified REST API endpoints:
   - `GET /api/sessions` → returns `[]`
   - `GET /api/themes` → returns all 8 themes
   - `GET /` → serves the dashboard HTML
   - `POST /api/sessions` → creates session with PTY (PID assigned, status "active")
   - `DELETE /api/sessions/:id` → kills PTY and removes session
6. Opened browser at `http://127.0.0.1:3000` — dashboard UI rendered correctly
7. User verified: terminals launch, are interactive, multiple terminals work independently, close button kills PTY, resize works

### Bug fixed during Milestone 1
- **Theme switching not working:** The `GET /api/themes` endpoint was returning only `id`, `label`, `category`, `background`, `foreground` — missing the full `theme` object. The client's `getThemeObject()` checked for `known.theme` which was undefined, so it always fell back to the default Tokyo Night colors. Fixed by adding `theme: t.theme` to the themes list API response in `packages/server/src/index.js`.

---

## Milestone 2: Layout Modes — COMPLETED

### What was done
1. Created 4 additional terminal sessions via API for testing (5 total)
2. User verified in browser:
   - All 6 layout buttons work (1x1, 2x1, 2x2, 3x2, 2x4, 4x2)
   - Terminals re-fit on layout change
   - Focus mode (□ button) works
   - Half mode (▯ button) works
   - Escape exits focus/half mode
   - Keyboard shortcuts Ctrl+Shift+1-6 work

No bugs found during Milestone 2.

---

## Project Rename: TermGrid → TermDeck

### All references updated across:
| File | Changes |
|------|---------|
| `package.json` (root) | name, description, keywords |
| `packages/server/package.json` | name, description |
| `packages/client/package.json` | name, description |
| `packages/cli/package.json` | name, description, bin entry |
| `packages/server/src/index.js` | TermDeck branding, `.termdeck` config dir, `TERMDECK_*` env vars, `mnemos_*` table defaults |
| `packages/server/src/database.js` | `.termdeck` dir, `termdeck.db` filename |
| `packages/server/src/rag.js` | `mnemos_*` table prefixes, `[mnemos]` log prefix |
| `packages/cli/src/index.js` | TermDeck branding, `termdeck` CLI name, `.termdeck` config dir |
| `packages/client/public/index.html` | TermDeck in title and logo |
| `config/config.example.yaml` | TermDeck branding, `.termdeck` path, `mnemos_*` tables |
| `config/supabase-migration.sql` | All tables/indexes/policies/views renamed `mnemos_*` |
| `README.md` | All TermGrid → TermDeck, termgrid → termdeck |
| `CLAUDE.md` | All TermGrid → TermDeck, termgrid → termdeck |
| `package-lock.json` | Regenerated from scratch |

### Directory rename (done by user in Finder):
- `/SideHustles/TermGrid/termgrid/` → `/SideHustles/TermDeck/termdeck/`

---

## Architecture Plan: Three Tiers + Mnemos

Full plan documented in `PLAN-rename-and-architecture.md`. Summary:

### Tier 1: Terminal Deck (zero config)
- `npx termdeck` — browser terminals, optional LLM session logs on close

### Tier 2: Session RAG (automatic)
- SQLite-backed, fully local, cross-terminal context

### Tier 3: Mnemos — Developer Memory
- Persistent AI-curated RAG via Supabase pgvector
- Based on Josh's existing rag-system at `/Users/joshuaizzard/Documents/Graciella/rag-system/`
- Existing system has 2,600+ memories across 7 projects, 6 MCP tools, hybrid search with recency boosting
- Mnemos packages this into a publishable `npx mnemos init` experience
- Separate npm package, TermDeck is a first-class consumer

---

## Key Technical Facts

| Item | Value |
|------|-------|
| Node.js version | v23.11.0 |
| Platform | macOS Darwin 22.6.0 |
| node-pty version | 1.2.0-beta.12 (upgraded from 1.0.0) |
| better-sqlite3 version | 11.x |
| Server port | 3000 |
| Default shell | /bin/zsh |
| xterm.js version | 5.5.0 (CDN) |
| Config dir | `~/.termdeck/` |
| Database | `~/.termdeck/termdeck.db` (SQLite, WAL mode) |

---

## What's Next: Milestone 3

**Goal:** Terminal panels show live, accurate metadata.

1. Open a shell, run commands — verify "last command" updates in metadata strip
2. Open a Python web server — verify port detection, type changes, status shows "listening"
3. Test status dot colors for each state
4. Verify "opened X ago" timestamps
5. Test global stats in top bar (active/thinking/idle counts)
6. Tune output analyzer patterns in `session.js` if detection is wrong

Then continue through Milestones 4-8 as documented in CLAUDE.md.
