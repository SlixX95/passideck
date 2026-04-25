# LinkedIn launch post — TermDeck v0.4.5 (Sprint 12 final pass)

Single post, no thread. Target: 1,300–3,000 characters.

---

For the last four sprints I've been trying to answer a specific frustration: why do I keep losing hours re-debugging problems I already fixed on a different project last month?

The LLM in my editor doesn't remember. Every new chat starts from zero. My grep history isn't a memory — it's a log. And the thing I actually want, the moment where the tool says "you hit this same error on November 12, here's what worked," has never existed for me.

So I built it. It's called TermDeck.

TermDeck is a browser-based terminal multiplexer (PTY + xterm.js, seven grid layouts, eight themes, one `npx` command to launch) with a three-tier memory stack underneath:

• **Tier 1 — the terminal.** Real PTYs, full emulation, per-panel metadata overlays.
• **Tier 2 — Mnestra.** A pgvector-backed memory store with an MCP server and six SQL migrations. Claude Code, Cursor, Windsurf and Cline all read and write to it directly. My own store holds ~3,527 memories today.
• **Tier 3 — Rumen.** An async learning loop. A Supabase Edge Function on a 15-minute pg_cron schedule that reads recent sessions, relates them against the full history, synthesizes insights via Claude Haiku, and writes the results back into the same store so Tier 2 surfaces them automatically.

The whole loop closed end-to-end for the first time on 2026-04-15 at 19:47 UTC. The first full Rumen kickstart ran against 3,527 memories and wrote 111 insights back in one pass. That's the first time a tool I built kept thinking after I stopped working.

Two independent post-sprint audits — one by Claude Opus 4.6, one by Gemini 3.1 Pro — scored the stack at 9.25/10 and 9.5/9.0/8.5. Both reports are in the repo; I'd rather ship the reviews alongside the code than quote them selectively.

Honest limits, because I care more about this than the pitch: Flashback only fires when the PTY output analyzer pattern-matches a known error class. If it misses your error, no flashback fires. It's a shortest-path to a memory you already wrote — if the memory isn't there, the feature does nothing. Mnestra currently needs Supabase and OpenAI; a fully-local SQLite + local-embedding path is on the roadmap and not shipped in v0.4.5. Validated against one developer's store. No multi-user data yet.

v0.4.5 is live on npm as `@jhizzard/termdeck`. Try it with `npx @jhizzard/termdeck` — Node 18+, no global install needed. Recent releases added startup health checks (a "Stack: OK" badge in the top bar), session transcript backup, contract tests, a two-row toolbar, optional token auth with a refuse-to-bind-0.0.0.0-without-auth guardrail, and a `verify-release.sh` pre-publish script. I'd love feedback from anyone who has hit the same "my tools don't remember" wall.

Repo: https://github.com/jhizzard/termdeck
npm: https://www.npmjs.com/package/@jhizzard/termdeck

#DeveloperTools #LLM #OpenSource #DevExperience #CognitiveArchitecture
