# HN Comment Playbook — TermDeck launch

Pre-drafted responses to the 10 most likely HN skeptic questions. Each answer is 2–4 sentences, specific, honest about limitations, paste-ready during the first 4 hours of the launch thread.

**Rules for using these:**
1. Never post one verbatim without reading the actual comment. HN commenters can tell when they got a canned reply.
2. Start each reply by restating the specific point the commenter made in your own words — shows you read it.
3. Then paste (or lightly edit) the drafted answer.
4. If the commenter asks a question not on this list, write an original reply. Speed matters more than perfection.
5. For hostile comments: acknowledge the specific concern, answer it honestly, don't get defensive. If they're right about something, say so.

---

## Q1. "How is this different from claude-mem?"

claude-mem is a Claude Code plugin that adds memory to Claude Code sessions via lifecycle hooks. It's query-on-demand — you ask the memory store, it answers. TermDeck is agent-agnostic (works with any terminal command, not just Claude Code) and adds **proactive** recall — Flashback fires automatically when a panel errors, without you asking. Different surface (browser dashboard vs. IDE plugin), different trigger model (passive vs. query), different audience (any terminal user vs. Claude Code users). Nothing here competes directly with claude-mem; if you're already happy there, keep using it. I built TermDeck because I run Codex and Gemini and plain zsh alongside Claude Code and wanted memory across all of them.

## Q2. "Why browser and not TUI?"

Three reasons. First, I wanted per-panel metadata overlays (status, project, last command, AI agent state) rendered as real HTML so they can be rich without fighting a TUI layout engine. Second, screen-sharing a browser is instant and works everywhere, which made the demo GIFs and the launch possible in the first place. Third, I wanted to own the rendering so I could ship animations and the onboarding tour without users installing fonts or configuring their terminal emulator. A TUI wrapper that embeds `node-pty` + `xterm.js`'s renderer is absolutely possible as a v0.4 effort — happy to take a PR from anyone who wants it.

## Q3. "Why not Tauri / Electron?"

Because `npx @jhizzard/termdeck` works on any machine with Node 18 in under a minute, no download, no trusting a binary, no code-sign hassles. I considered Tauri seriously — it would reduce memory footprint and feel more "native" — but it would also add an install step, a build step, and a platform-specific release pipeline. Zero-install was the higher-value trade for launch. If someone wants a Tauri wrapper on top of the same Express server, that's a 200-line project.

## Q4. "Why MIT and not AGPL?"

I optimized for adoption over commercial moat. MIT means anyone can fork, wrap, re-sell, or embed this without asking. AGPL would protect me from a SaaS fork but would also make Mnestra harder to adopt in corporate environments where AGPL trips legal review. I may regret this if someone ships a hosted version of the whole stack before I do, but I think the adoption gain is worth the risk for a v0.3 launch by a solo developer with zero prior audience.

## Q5. "Why Supabase? I don't want to depend on a cloud service for my terminal."

Fair. Tier 1 (the core terminal multiplexer + metadata + session logs) has **no Supabase dependency** — it runs fully local with SQLite. The only thing you give up by skipping Tier 2 is Flashback itself, which requires a vector store. Local Flashback via SQLite-vec + a local-embedding model (Nomic, sentence-transformers) is on the v0.4 roadmap. For v0.3 I chose Supabase because pgvector is mature, hybrid search (BM25 + vector) is one RPC call, and the free tier covers a solo developer indefinitely. If you want Tier 2 right now without Supabase: Mnestra's schema is a single SQL file, and the webhook bridge is a 30-line Express handler. Point either at your own Postgres. Nothing is locked in.

## Q6. "How much does it cost to run?"

Tier 1: free. Tier 2 (Mnestra + Flashback) on a solo developer's scale: Supabase free tier + ~$0.50/month of OpenAI embeddings for `text-embedding-3-large` at typical memory-write volume. Tier 3 (Rumen async learning): adds ~$0.30–$1.00/month of Claude Haiku for the Synthesize phase if you keep the default 15-minute cron. Cost-guarded by hard per-job budget caps in `config/rumen.yaml`. I've been running all three against 3,451 memories for about two weeks; my actual monthly bill is under $2.

## Q7. "Security model — this has full shell access, right?"

Yes. TermDeck spawns real PTYs with your user's privileges — same security model as any terminal emulator. The server binds to `127.0.0.1` by default with no auth required on loopback; v0.4.5 added optional token auth (Bearer / cookie / query) and a guardrail that refuses to bind `0.0.0.0` unless `auth.token` is configured. For a multi-user or remote-exposed machine, set a token or front TermDeck with nginx basic auth / WireGuard / tailscale. Mnestra's memory store is your Supabase project with your RLS policies — TermDeck never sees anyone else's memories. Session transcripts (if you enable them) are written to `~/.termdeck/termdeck.db` locally and optionally replicated to Supabase with your configured RLS. `docs/SECURITY.md` has the threat model and `docs/DEPLOYMENT.md` walks through non-loopback exposure — read both before opening TermDeck to any network beyond localhost.

## Q8. "Does it work on Windows?"

Partially. `node-pty` supports Windows via `conpty`, and the client (browser dashboard) is fine everywhere. But I've only personally tested the full Flashback loop on macOS and Debian. If you hit a Windows-specific issue, open a GitHub issue and I'll either fix it or mark it as a known gap. Contributions from Windows users are specifically welcome — the test matrix is a real gap right now.

## Q9. "What happens when Anthropic deprecates Haiku?"

Rumen calls the LLM through a thin adapter (`packages/synthesize/adapter.ts`) — swapping Haiku for Sonnet, a GPT-4o-mini, a Gemini Flash, or a local model is a config change. The async learning layer is specifically designed so the model is a replaceable component, because the cost/quality tradeoff there is going to keep moving. The Synthesize prompt is plain English and generalizes across providers. If Haiku goes away tomorrow, Rumen works on the next day with a config flip.

## Q10. "Can I use Ollama instead of OpenAI for embeddings?"

Not in v0.4.5. Mnestra's embedding pipeline is hardcoded to `text-embedding-3-large` (1536 dims) right now because mixing embedding providers corrupts the vector space — you can't meaningfully compare a sentence-transformers vector to an OpenAI vector in the same index. Swapping to Ollama-hosted `nomic-embed-text-v1.5` (768 dims) is a supported path in v0.4: it requires a schema migration to add a second `embedding_768` column and a rebuild of the existing memories against the new model. If you want to try it now, the SQL migration is trivial and I'd be happy to review a PR.

---

## Bonus: likely edge-case questions (not in the top 10 but worth having ready)

### Q11. "How is this different from [some specific memory product I hadn't heard of]?"

Useful script: *"Haven't used [product] personally — from the README/demo it looks like [quick technical read of their architecture]. The closest functional overlap with TermDeck is probably [specific piece], the biggest difference is [Flashback being proactive / the visual multiplexer surface / the three-tier split]. If you've used both, I'd actually value hearing where they feel the same and where they diverge."* — turn it into a research request, not a defense.

### Q12. "Is this just tmux + a wrapper?"

No. tmux is a PTY multiplexer with a TUI. TermDeck is a PTY multiplexer with a browser dashboard, per-panel metadata overlays, a memory layer, proactive recall, an async learning loop, and an onboarding tour. The shared piece (multiple PTYs under one roof) is one component of seven. That said, tmux is wonderful and I'm not trying to replace it — TermDeck is for the specific workflow where you want the metadata + memory + visual surface, not for every terminal session you start.

### Q13. "Can I see the code for Flashback specifically?"

Yes. The server-side trigger is in `packages/server/src/session.js` (see `PATTERNS.error` and `analyzeOutput`) and `packages/server/src/mnestra-bridge/` (the query bridge). The client-side toast is in `packages/client/public/index.html` — search for `proactive_memory` and `Flashback toast`. It's about 200 lines total across both sides and is deliberately simple. The full stack from error detection to toast render is: pattern match → rate-limit check → Mnestra query → WebSocket push → toast component. No ML in the surfacing decision, just cosine similarity + recency decay.

### Q14. "Why 'Mnestra' — is that a name you made up?"

Greek mythology. Mnestra is the daughter of Erysichthon, transformed by Poseidon so she could change shapes. It's an obscure name compared to Mnemosyne (the muse of memory, from the same root) — and that obscurity is deliberate. The npm namespace for memory-themed devtools is pretty saturated in 2026, so we picked a less-mined word from the same etymological family. Pronounced /nes-tra/ with a silent initial M.

### Q15. "Did you really build all three packages yourself?"

Yes, over about five weeks of nights and weekends. I'm a solo developer with a background in quantitative finance and piano performance, not a memory-systems PhD — the architecture is practical, not novel. pgvector + hybrid search is a well-understood recipe; the interesting parts are the product-shape decisions (proactive vs. query, browser vs. TUI, three-tier vs. monolith) more than the algorithms. Happy to talk through any specific design choice.

### Q16. "I tried to install and got [some node-gyp error]"

Most likely `node-pty` or `better-sqlite3` trying to compile native modules. Quick diagnostic: run `npx @jhizzard/termdeck` with `npm_config_build_from_source=false` — the package ships prebuilt binaries for macOS/Linux/Debian/Alpine. If that doesn't resolve it, paste the exact error in a GitHub issue and I'll look at it today. A working install on a clean machine takes under 60 seconds — any install that doesn't is a bug I want to hear about.

---

## Meta-note on tone

The launch audience is skeptical about memory-for-AI-agents because the category has flooded the npm registry in 2026 (see the 138 Engram packages). The best tone for replies is:

- **Concrete**, not evasive. Specific file paths, specific commands, specific numbers.
- **Honest** about gaps, roadmap, and what hasn't been tested yet.
- **Not defensive**. If someone points out a real flaw, say "yeah, that's real — it's on the roadmap for v0.4" instead of arguing.
- **Curious**, not broadcasting. Turn questions into research requests whenever honest — commenters respond better to "what would you want here?" than to "we already have a plan for that."
- **Fast**. 30-min response time in the first 4 hours is worth more than perfectly polished replies in hour 5.

---

**End of comment-playbook.md.**
