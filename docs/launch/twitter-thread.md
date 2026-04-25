# Twitter/X launch thread — TermDeck v0.4.5 (Sprint 12 final pass)

Char counts annotated `(n/280)` after each tweet for the author's final pass. Posted ~5 minutes after the Show HN submission on launch day.

---

**Tweet 1 — hook (standalone):**

I built a terminal that notices when I hit an error and surfaces the memory of how I fixed it last month. No querying. No asking. The LLM is stateless; my developer memory isn't anymore. 1/

`(191/280)`

---

**Tweet 2:**

It's called TermDeck. Browser-based terminal multiplexer — PTY + xterm.js, 7 grid layouts, 8 themes, zero build step. The interesting part is underneath: a three-tier memory stack I've been building in public across four sprints. 2/

`(234/280)`

---

**Tweet 3:**

Tier 1 is the terminal. Tier 2 is Mnestra — a pgvector memory store with an MCP server my editor already talks to (~3,527 memories in my own store today). Tier 3 is Rumen — an async learning loop that keeps thinking after I stop working. 3/

`(243/280)`

---

**Tweet 4:**

Rumen is a Supabase Edge Function on a 15-minute pg_cron. Every tick it reads recent sessions, relates them against the full corpus, synthesizes via Claude Haiku, and writes insights back into the same store. Extract → Relate → Synthesize → Surface. 4/

`(252/280)`

---

**Tweet 5 — [GIF ANCHOR] attach `docs/screenshots/flashback-demo.gif` here:**

The loop closed for real on 2026-04-15 at 19:47 UTC. First full Rumen kickstart ran against 3,527 memories and wrote 111 insights in one pass. First time the system kept thinking after I closed my laptop. 5/

`(226/280)`

---

**Tweet 6:**

Two independent post-sprint audits — Claude Opus 4.6 and Gemini 3.1 Pro — scored the stack at 9.25/10 and 9.5/9.0/8.5. I'm a solo dev shipping v0.3 and I put both audit reports in the repo. Honest limits matter more to me than hype. 6/

`(241/280)`

---

**Tweet 7 — honest limits:**

What it's not: Flashback only fires when the PTY output analyzer pattern-matches a known error class. No memory, no flashback. Mnestra currently needs Supabase + OpenAI; a local SQLite path is on the roadmap, not shipped in v0.4.5. 7/

`(238/280)`

---

**Tweet 7b — health badge:**

v0.4.5 ships startup health checks — Mnestra reachable, Rumen cron active, embedding provider live — plus optional token auth, session transcript backup, and a refuse-to-bind-0.0.0.0-without-auth guardrail. "Stack: OK" badge in the top bar so you know the full loop is wired. 7b/

`(247/280)`

---

**Tweet 8 — CTA:**

Try it:
npx @jhizzard/termdeck

Repo: https://github.com/jhizzard/termdeck
npm: https://www.npmjs.com/package/@jhizzard/termdeck

Solo dev, MIT, v0.4.5. Feedback very welcome — especially on the async loop design.

`(237/280)`
