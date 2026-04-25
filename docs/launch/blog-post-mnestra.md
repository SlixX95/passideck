# Mnestra — a persistent memory MCP for Claude Code, Cursor, and every other LLM tool

**Target publication:** dev.to + Hashnode, 3 days after the TermDeck Show HN.
**Length:** ~850 words.
**Audience:** developers using Claude Code / Cursor / Windsurf / Cline / Continue who want persistent memory across sessions, who may or may not care about TermDeck's visual layer.
**Hero image:** a schematic showing Mnestra sitting between the MCP client and Supabase pgvector (T4 does not have this diagram yet — Josh to produce or leave as a text-only post).

---

Every developer who works with an LLM assistant has the same problem: the model forgets. Each session starts from zero. You explain the architecture. You explain the three quirks of your ORM. You explain why the `sync_worker` has that strange retry loop around EOL. Three days later you open a new session and you explain all of it again.

The usual answer is "just add memory." That's been the shape of about twenty products in the last eighteen months: Mem0, Letta (formerly MemGPT), Zep, claude-mem, Chroma, and a long tail of MCP memory servers launched during the 2026 AI-memory gold rush. They all work. They all store things. They all make you *ask*.

Mnestra is a persistent developer memory MCP server that fits into the Claude Code / Cursor / Windsurf / Cline / Continue ecosystem through the Model Context Protocol. It stores your development memories — fixes, decisions, architecture notes, gotchas — in Supabase Postgres using pgvector, and surfaces them back to whichever LLM tool you happen to be using that day.

## Why memory matters for LLM coding

A memory store earns its keep on the third day, not the first day. The first day you have context in your head. The third day, the thing you reach for is the fix you worked out on the first day — and that fix is either in a git commit message you won't remember to search for, or it isn't written down at all.

Memory-for-LLM-coding is specifically about **closing the distance between the moment you solved something and the moment you need it again.** The usual distance is hours to days. The good case with a memory tool is seconds. The bad case is that the memory tool stores everything but you forgot to query it. Mnestra is built to make the query path cheap (for humans) and sometimes automatic (for TermDeck's Flashback feature, which is the visual surface that queries Mnestra without being asked).

Standalone, Mnestra is just the memory. Six MCP tools, one webhook bridge, a three-layer search API, and a Postgres schema that fits in one migration file. If you don't care about the visual layer, you can use Mnestra directly with your existing MCP client and never install TermDeck.

## The six MCP tools

Mnestra exposes six tools through the Model Context Protocol:

1. **`remember`** — write a memory. Takes `text`, `project`, `source_type` (one of `bug_fix`, `decision`, `architecture`, `fact`, `preference`, `code_context`), optional `category`, optional `privacy_tag`.
2. **`recall`** — hybrid search over memories. Takes a `query` string, returns the top N hits ranked by a blend of vector similarity and recency decay. Source-type-aware: bug fixes decay slower than generic facts because they're more reusable.
3. **`forget`** — soft-delete a memory by UUID.
4. **`memory_search`** — lower-level search with filters (`source_type`, `project`, `category`, date ranges). For when `recall`'s blend isn't what you want.
5. **`memory_summarize_session`** — ingests a raw session transcript and extracts memorable facts via Haiku. Turns a 40-minute debugging session into 3–5 memory entries automatically.
6. **`memory_status`** — system stats. Total memories, breakdowns by project/source_type/recency, last sync time.

Each tool returns structured JSON that any MCP client can render. Claude Code displays the result in the tool-call UI. Cursor and Windsurf render similarly. Mnestra doesn't care which client queries it — the protocol is uniform.

## Three-layer progressive disclosure

The thing Mnestra does that most memory stores don't: **it doesn't dump twenty raw documents in response to a query.** The default `recall` path returns a three-layer response:

1. **Index layer** — a one-line summary of the top 5 hits. The LLM reads this first and decides whether any of them look relevant to the current task.
2. **Timeline layer** — if the LLM (or the user) picks a hit, Mnestra returns the 3–5 memories immediately adjacent to it in time. This catches the common case where a bug fix makes sense only in the context of the decision or the commit right before it.
3. **Get layer** — the full memory content, only when the LLM actually needs the prose text.

This matters because token budgets are real. Dumping twenty 500-token memories into an LLM's context window is wasteful and usually doesn't help. The progressive-disclosure path averages about 300 tokens per query instead of 10,000, and the quality of the response is almost always better because the LLM can make a relevance decision before paying for the tokens.

## Setup

```
npm install -g @jhizzard/mnestra
mnestra init
```

`mnestra init` walks you through the six prompts: Supabase URL, service-role key, OpenAI API key (for embeddings), optional Anthropic key (for `memory_summarize_session`), a developer ID (how your memories are tagged in multi-user setups), and a starting project list. Then it applies six SQL migrations to your Supabase instance and verifies the connection with a `memory_status` RPC call. Fifteen minutes end to end, mostly spent waiting for the migrations to apply.

After that, add Mnestra to your MCP client's config. For Claude Code, that's `~/.config/claude/mcp-servers.json`:

```json
{
  "mcpServers": {
    "mnestra": {
      "command": "mnestra",
      "args": ["serve"]
    }
  }
}
```

Cursor, Windsurf, Cline, and Continue each have slightly different config locations but the same shape. Restart the client and Mnestra's six tools will appear in the tool list.

## Hybrid search with recency decay, in one paragraph

The default `recall` ranking is a weighted sum of cosine similarity (from OpenAI's `text-embedding-3-large`) and an exponential recency decay tuned per source type. `bug_fix` memories decay slowly (half-life of 180 days) because a fix you made six months ago is still useful today. `fact` memories decay faster (half-life of 45 days) because facts about an evolving codebase go stale. `decision` memories decay almost not at all because architectural decisions are the load-bearing memory. The weighting is configurable in `~/.mnestra/config.yaml`. Defaults tuned by querying a 3,451-memory store and eyeballing the top 10 results for a bunch of realistic developer queries.

## And if you want the visual layer

Mnestra is the memory store behind TermDeck's **Flashback** feature — the proactive recall that fires automatically when a terminal panel enters an error state. If you want to see memories surface without typing a query, install TermDeck on top:

```
npx @jhizzard/termdeck
```

But Mnestra stands alone. Half the people who try it will never install TermDeck, and that's fine — the memory layer is the product, the visual layer is the pitch.

GitHub: https://github.com/jhizzard/mnestra
Docs: https://termdeck-docs.vercel.app/mnestra/

---

**Word count:** 852 (target 800).

**Note for Josh:** this post is specifically aimed at MCP-client users who may never care about TermDeck. Keep the TermDeck plug short and at the end. The audience for this post is bigger than TermDeck's — anyone already running Claude Code / Cursor / Windsurf is a prospect even if they want nothing to do with browser terminals.

**End of blog-post-mnestra.md.**
