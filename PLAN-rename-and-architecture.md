# Project Rename and Architecture Plan

## The Two Projects

### 1. TermDeck — the terminal multiplexer

**Recommendation: keep the name TermDeck.** It's not restrictive — "deck" evokes a control deck, a dashboard, a surface you work from. It says exactly what it is. `termdeck.dev` is a strong domain. The npm package would be `termdeck` (`npx termdeck`).

Rename from `termgrid` → `termdeck` across the codebase.

### 2. Mnemos — the developer memory system

The persistent, cross-project, AI-curated RAG layer deserves its own identity. "Mnemos" is the neuroscience term for a physical memory trace stored in the brain — a pattern of neural connections that encodes a specific memory. This is exactly what the system does: it encodes developer breakthroughs, failures, patterns, and code snippets as retrievable memory traces that grow smarter over time.

- npm package: `mnemos` or `@termdeck/mnemos`
- Could be used standalone (any CLI tool, any IDE, any workflow)
- TermDeck becomes a first-class consumer of Mnemos, not the only one
- Supabase tables prefix: `mnemos_*` instead of `termgrid_*`

#### Existing Foundation: `/Users/joshuaizzard/Documents/Graciella/rag-system/`

Mnemos is NOT built from scratch. Josh already has a battle-tested dev-memory system:

- **Stack:** TypeScript + Supabase pgvector (1536d, OpenAI `text-embedding-3-large`) + hybrid search (vector + tsvector + recency boosting with 30-day half-life)
- **Schema:** 3 tables — `memory_items`, `memory_sessions`, `memory_relationships` — with HNSW indexes and RLS
- **MCP server:** 6 tools (`memory_remember`, `memory_recall`, `memory_forget`, `memory_search`, `memory_summarize_session`, `memory_status`) registered globally in `~/.claude.json`
- **Scale:** 2,600+ memories across 7 projects (pvb, chopin-scheduler, gorgias, imessage-reader, chopin-nashville, antigravity, global)
- **Codebase:** `src/lib/` (types, supabase, embeddings, extraction, deduplication, chunking, session), `src/scripts/` (embed, search, extract, process-session, index-docs, bootstrap, stats, cleanup), `mcp-server/`
- **Design docs:** `RAG-SYSTEM-DESIGN.md` covers Mem0/Letta/Zep architecture comparison and the chosen Supabase pgvector approach

Mnemos's job is to package this into a publishable, one-command-install experience. The existing rag-system is the reference implementation. Key decisions for packaging:

1. Keep Supabase + pgvector as the storage layer (proven at scale)
2. Keep the MCP server interface (already works with Claude Code, extensible to other tools)
3. Add `npx mnemos init` setup wizard that provisions tables and writes config
4. Add `npx mnemos stats` / `npx mnemos search` CLI commands wrapping the existing scripts
5. TermDeck's Tier 3 integration calls Mnemos's MCP tools or library API directly

---

## Three Tiers of Depth

### Tier 1: Terminal Deck (zero config)
**`npx termdeck`** — just works.

- Browser-based terminal multiplexer with PTY panels
- Grid layouts, per-terminal theming, metadata overlays
- Optional: on terminal close, an LLM summarizes the session into a markdown file
  - Stored in `~/.termdeck/sessions/YYYY-MM-DD-HH-MM-label.md`
  - Toggle: `termdeck --session-logs` or set in config
  - Uses a local LLM call (ollama) or a lightweight cloud call (user provides API key)
  - The markdown captures: commands run, files edited, errors encountered, what was accomplished
- No database required. No accounts. No Supabase.

### Tier 2: Session RAG (one config value)
**Set `rag.enabled: true` in `~/.termdeck/config.yaml`**

- SQLite-backed memory for the current TermDeck instance
- Cross-terminal context: "what did I do in the other terminal 5 minutes ago?"
- Session history persists across server restarts
- Queryable from the prompt bar: "which terminal had the migration error?"
- Still fully local. No cloud dependency.

### Tier 3: Mnemos — Developer Memory (connect Supabase)
**Add `mnemos.supabaseUrl` and `mnemos.supabaseKey` to config, or `npx mnemos init`**

- Three-layer persistent memory: session → project → developer
- AI-curated: an LLM periodically distills raw events into insights
  - "You've fixed this same CORS issue 3 times across 2 projects — here's the pattern"
  - "This refactoring approach worked well in scheduling-saas, consider it for claimsguard"
- Supabase tables with trigram search, embeddings (pgvector), and RLS
- Cross-project knowledge graph that grows over time
- Mnemos is its own npm package, usable outside TermDeck
- TermDeck ships with Mnemos integration built in, but Mnemos can also be wired into:
  - VS Code extensions
  - CI/CD pipelines
  - Other CLI tools
  - Custom scripts

---

## Setup Flow (one-click philosophy)

```
# Tier 1 — immediate
npx termdeck

# Tier 1 + session logs — one flag
npx termdeck --session-logs

# Tier 2 — happens automatically (SQLite, no config needed beyond tier 1)
# (SQLite is already created on first run)

# Tier 3 — one command to connect Mnemos
npx mnemos init
# → prompts for Supabase URL + key
# → runs migration automatically
# → writes config to ~/.termdeck/config.yaml
# → done
```

---

## What to Rename Now

| Current | New |
|---------|-----|
| `termgrid` (package name) | `termdeck` |
| `@termgrid/server` | `@termdeck/server` |
| `@termgrid/client` | `@termdeck/client` |
| `@termgrid/cli` | `@termdeck/cli` |
| `~/.termgrid/` | `~/.termdeck/` |
| `termgrid.db` | `termdeck.db` |
| `TERMGRID_SESSION` env var | `TERMDECK_SESSION` |
| `TERMGRID_PROJECT` env var | `TERMDECK_PROJECT` |
| `termgrid_*` Supabase tables | `mnemos_*` |
| `[rag]` log prefix | `[mnemos]` |
| TermGrid references in UI | TermDeck |
| Repository name | `termdeck` |

---

## The Hub Website (noted, deferred)

A hub site for Joshua Izzard's open source projects. Smooth interface, project docs, auto-updates. This is out of scope for now but noted for after TermDeck ships. Considerations captured here so they're not lost:

- Could live at a personal brand domain (e.g., `izzardlabs.dev`, `joshuaizzard.dev`, or a brand name)
- Auto-generated docs from README + CLAUDE.md
- Project cards with live status, GitHub stars, npm downloads
- Blog/changelog feed
- Could be a simple Astro/Next.js static site deployed to Vercel

---

## Recommended Course of Action

1. **Now:** Approve the rename from `termgrid` → `termdeck` and the Mnemos naming
2. **Now:** I execute the rename across the entire codebase (mechanical find-and-replace)
3. **Resume milestones:** Continue with Milestones 3-8 using the new names
4. **After Milestone 8:** Build the Tier 1 session log feature (LLM markdown summaries)
5. **After that:** Extract Mnemos into its own package under `packages/mnemos/`
6. **Publish:** `termdeck` to npm, `mnemos` to npm
7. **Later:** Hub website
