# Show HN draft — TermDeck v0.4.5 (Sprint 12 final pass)

Supersedes the earlier Sprint 3 draft at the same path. Written after the 2026-04-15 19:47 UTC Rumen kickstart and refreshed through Sprints 6–11.

## Title

Show HN: TermDeck – a terminal that remembers what you fixed last month

<!-- 71 / 80 chars, starts with "Show HN: ", no emoji -->

## Body

I built TermDeck because I kept losing hours re-debugging problems I'd already fixed on a different project. It's a browser-based terminal multiplexer (PTY + xterm.js + WebSocket, 7 grid layouts, 8 themes) with a three-tier memory stack underneath: the terminal, Mnestra (a pgvector memory store with an MCP server), and Rumen (an async learning loop that runs as a Supabase Edge Function on a 15-minute pg_cron schedule, synthesizing insights via Claude Haiku while I'm away).

The loop closed end-to-end for the first time on 2026-04-15 at 19:47 UTC. The first full Rumen kickstart ran against my ~3,527-item Mnestra store and wrote 111 insights back in one pass (see `docs/launch/LAUNCH-STATUS-2026-04-15.md` §2). Two independent post-sprint audits — Claude Opus 4.6 and Gemini 3.1 Pro — scored the stack at 9.25/10 and 9.5/9.0/8.5 respectively. Quickstart: `npx @jhizzard/termdeck`. Repo: https://github.com/jhizzard/termdeck. npm: https://www.npmjs.com/package/@jhizzard/termdeck.

Honest limits: Flashback fires on pattern-matched error strings from the PTY output analyzer — if the analyzer misses your error class, no flashback fires. It's a shortest-path to a memory you already wrote; if the memory isn't there, the feature does nothing. Mnestra currently reaches out to Supabase for storage and OpenAI for embeddings; a fully-local SQLite + local-embedding path is on the roadmap but not shipped in v0.3. Validated against one developer's store. No multi-user data yet.

<!-- body target: 500–1500 chars. Count at publish time; trim para 2 first if over. -->

## First comment

Author here. What I'd most like feedback on is Rumen's Extract → Relate → Synthesize → Surface loop. As of rumen@0.4.5 (Sprint 5), Relate uses real pgvector embeddings — the keyword-only path (`NULL::vector`, `semantic_weight: 0.0`) shipped in v0.3 has been replaced. Sprint 6 added startup health checks (the "Stack: OK" badge you see in the top bar) and automatic session transcript backup. I'm specifically curious about: (1) is 15 minutes the right pg_cron cadence, or should it be event-driven off session close? (2) Haiku-first with an escalate-on-similarity rule and a soft cap of 100 LLM calls/day/dev — does that cost posture hold up at real usage? (3) Writing synthesized insights back into the same store as first-class memories — is that sound, or will it drift into noise over a year? Code is MIT and all three repos are linked from https://github.com/jhizzard/termdeck.

<!-- first comment target: 300–800 chars -->
