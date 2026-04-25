# T1 — Fill Blog Post Stubs

## Goal

The docs site has 3 blog posts in the sidebar that are 18-19 line stubs saying "Terminal 4 will fill in the narrative before launch." Fill them with real content.

## Files to fix

### 1. `docs-site/src/content/docs/blog/mnestra-deep-dive.mdx`

Write a real blog post about Mnestra (400-600 words). Cover:
- What Mnestra is (persistent developer memory MCP server)
- pgvector + hybrid search (keyword + semantic + recency)
- The 9 MCP tools
- How it integrates with Claude Code, Cursor, Windsurf
- The "Fresh sessions, not cold sessions" angle — with Mnestra, you pick /resume vs. fresh based on whether you want conversation continuity or clean context, not based on fear of losing state
- Current store: ~3,855 memories
- Link to github.com/jhizzard/mnestra and npm

### 2. `docs-site/src/content/docs/blog/rumen-deep-dive.mdx`

Write a real blog post about Rumen (400-600 words). Cover:
- What Rumen is (async learning loop)
- The 4-phase cognitive loop: Extract → Relate → Synthesize → Surface
- Supabase Edge Function on 15-minute pg_cron
- Hybrid embeddings (text-embedding-3-large, 0.6 semantic / 0.4 keyword)
- First kickstart: 111 insights from 3,527 memories
- Cost controls: Haiku-first, soft cap 100/day, hard cap 500
- Link to github.com/jhizzard/rumen and npm

### 3. `docs-site/src/content/docs/blog/termdeck-launch.mdx`

Write a real blog post about the TermDeck launch (400-600 words). Cover:
- What TermDeck is (browser terminal multiplexer with memory)
- The three-tier stack
- Flashback — how it works, what it does
- The 4+1 orchestration pattern
- The 5-auditor 360 review (9.53 average)
- `npx @jhizzard/termdeck` quickstart
- Link to github.com/jhizzard/termdeck and npm

Keep the existing frontmatter (title, description) but update it if needed. Replace ALL stub content.

## Files you own
- docs-site/src/content/docs/blog/mnestra-deep-dive.mdx
- docs-site/src/content/docs/blog/rumen-deep-dive.mdx
- docs-site/src/content/docs/blog/termdeck-launch.mdx

## Acceptance criteria
- [ ] All 3 blog posts have 400-600 words of real content
- [ ] No stub language remains ("Terminal 4 will fill in")
- [ ] Each post links to the relevant GitHub repo and npm package
- [ ] Write [T1] DONE to STATUS.md
