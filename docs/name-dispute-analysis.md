# Name Dispute Analysis — TermDeck · Mnemos · Rumen

**Date:** 2026-04-14
**Author:** Sprint 3 Terminal 4 (T4.1 deep dive)
**Status:** 🛑 **BLOCKER posted to STATUS.md** — Mnemos rated 🔴 red. Josh decision required before Sprint 3 T4.2–T4.9 proceed.
**Previous document:** `docs/name-dispute-quick-assessment.md` (2026-04-15) — the preliminary that called Mnemos 🟡 yellow. This deep dive supersedes it.

This is reconnaissance, not legal advice. Any "stand vs rename" decision worth ~40 hours of rework should be validated by an IP attorney before final commitment, especially the USPTO sections where the live search UI blocked WebFetch.

---

## 0. Executive summary

| Product | npm name | Risk level | Short version | Recommendation |
|---|---|---|---|---|
| **TermDeck** | `@jhizzard/termdeck` (published) | 🟡 Yellow | No legal risk. Market risk — one nearly-identical positioning collision (`me0w2en/TermDeck`, created 2026-03-04) + a one-letter-off Product Hunt launch (`Termdock`). SEO launch requires distinguishing subtitle. | **Stand, with specific mitigations.** Claim `termdeck.dev`, `github.com/termdeck` org, `x.com/termdeck` within 24h. Run a manual USPTO check. Lead HN title with a distinguisher. |
| **Mnemos** | `@jhizzard/mnemos` (published) | 🔴 **RED** | The space is saturated. **138 npm packages** with "mnemos" in the name, **≥10 GitHub projects** shipping the same product category, one at **2,500+ stars** (`Gentleman-Programming/mnemos`) already canonized as *the* Mnemos in an OSS Insight roundup. Three Show HN "Mnemos" launches in the 60 days before ours. Every natural domain (`mnemos.fyi`, `mnemos.so`, `mnemos.tools`, `mnemos.am`, `mnemos-ai.dev`) is owned by a competitor. | **Rename before launch.** |
| **Rumen** | `@jhizzard/rumen` (published) | 🟢 Green | Zero software namesakes. All prior art is biological (ruminant microbiome research) or agricultural (Rumensin cattle feed). One optical collision ("RumenAI" cattle bolus, German ag-tech) — non-overlapping audience. The cud-chewing metaphor is unclaimed. | **Stand with confidence.** One remaining chore: claim `rumen.dev` (appears unregistered) and `github.com/orgs/rumen` (available). |

**Bottom line:** Two of three names are launchable. The third blocks launch until renamed or explicitly overruled. The rest of this document is the evidence for each rating.

---

## TermDeck

### 1. npm Registry

Direct npm registry API checks (the `/search` UI returns 403 to WebFetch, so queries went to the JSON endpoints):

- **`termdeck`** — exists. Author: **Junielton** (maintainer `nielqs`, junyellton@gmail.com). Latest version **0.1.5**, last published **2025-11-11**. Description: "Stream Deck-like command launcher for terminal contexts (Electron + Vue)." Repo: `github.com/junielton/termdeck`. Source repo has 2 GitHub stars. Weekly downloads surface nowhere on developer-tool indexes — likely low single digits. Known blocker, already owned, unrelated positioning.
- **`term-deck`** — 404 (available).
- **`termdek`**, **`termdock`** — both 404 on npm (both available there).
- **`@jhizzard/termdeck`** — exists, v0.2.0, description "Browser-based terminal multiplexer with metadata overlays, panel flashback memory recall, and AI-aware session management." (Ours.)

No typo-squats, no other conflicts, no ecosystem noise on npm.

### 2. GitHub collision

GitHub repo search for `termdeck` returned 6 repos total:

| Repo | Stars | Created | Updated | Language | Description |
|---|---|---|---|---|---|
| **me0w2en/TermDeck** | 1 | **2026-03-04** | 2026-04-12 | TypeScript | Multi-agent terminal dashboard for managing Claude Code sessions across projects. Korean author. |
| **junielton/termdeck** | 2 | 2025-09-06 | 2025-09-12 | Vue | Stream Deck-like Electron app for terminal command buttons. |
| **XaviFortes/TermDeck-Releases** | 0 | 2025-10-07 | 2025-10-08 | — | Release artifact repo, v0.1.5, no README. |
| **EriOldMan/TermDeck** | 0 | 2025-12-20 | 2026-04-14 | JavaScript | Language-learning vocabulary organizer. |
| **jvalkeal/termdeck** | 0 | 2024-01-13 | 2024-08-10 | Java | Spring-shell sample app by a Spring committer. |
| **jhizzard/termdeck** | 0 | 2026-04-11 | 2026-04-14 | HTML | Ours. |

Broader GitHub search also surfaces `agent-deck` (asheshgoplani — terminal session manager for AI coding agents, directly competitive positioning), `WebDeck`, `T-Deck`, `writerDeck`, `TelemetryDeck`, and `hagronnestad/code-deck` (12 stars, Stream Deck alternative). **No one on GitHub has meaningful stars (>10) under the exact `termdeck` name.**

**⚠️ `me0w2en/TermDeck` is nearly identical positioning to ours** (multi-agent terminal dashboard, Claude Code monitoring, token/cost tracking, Electron/React, cross-platform) and was created 5 weeks before our repo. It's the single most concerning collision in the TermDeck investigation. Currently at 1 star with no traction — not a credible competitor, but a live naming clash on GitHub's repo-search page.

### 3. USPTO trademark search

USPTO's `tmsearch.uspto.gov` is a JavaScript SPA; WebFetch returns only the "Trademark search" heading with no form or results. Google/DuckDuckGo `site:tsdr.uspto.gov TERMDECK` and keyword searches for `"TERMDECK" trademark` and `"TERM DECK" trademark` returned **zero hits** — no news articles, no law-firm blog posts, no filing trackers.

**Preliminary finding:** no active or pending USPTO registration for TERMDECK or TERM DECK is indexed on the public web. Could not verify directly via WebFetch; recommend a manual check on `tmsearch.uspto.gov` before launch (~10 minutes for Josh to run "TERMDECK" and "TERM DECK" in the USPTO basic-search UI and confirm zero hits in Class 9 / 42).

### 4. Elgato "Stream Deck" trademark & enforcement

Stream Deck is an Elgato product; Elgato is a brand of **Corsair Memory, Inc.**, which owns the Stream Deck trademarks (registered in the US and other countries since ~2017). Exact USPTO serial was not retrievable via public web search, but the trademark is well-documented.

**Enforcement pattern — the important part:** no documented cease-and-desist, takedown, or lawsuit against any Stream Deck alternative or derivative surfaced in the search. Specifically:

- **`hagronnestad/code-deck`** — a "cross platform and open source alternative to the official Stream Deck application," live since ~2019, currently 12 stars, last commit August 2025, uses the word "Stream Deck" repeatedly in its README, ships with only a boilerplate disclaimer. **No legal action.**
- **`Lenochxd/WebDeck`** — "The free stream deck alternative," active, still published on SourceForge and GitHub. **No legal action.**
- **Deckboard** — commercial Stream Deck alternative, been around for years. **No legal action.**
- **stream-kit, SharpDeck, Codedeck, DeckDeckGo, TelemetryDeck, deck.gl** — all still live using "Stream Deck" references or "Deck" suffixes without incident.

**Elgato/Corsair's observed enforcement posture is "not bothering" with open-source alternatives.** That is a meaningful data point — but it is not a guarantee, and it does not cover cases where a company raises a paid commercial launch with a name closer than "Deck." TermDeck's distance from "Stream Deck" (shared suffix only, different product category — dev tool vs. streamer hardware) is *larger* than Code Deck's.

### 5. General web presence

Google for `"termdeck" developer tool` and `"termdeck" terminal` surfaced:

1. **producthunt.com/products/termdock** — Termdock (**not** termdeck, but the top hit for the query) — terminal-centric AI dev environment by Danny Huang, launched 2025, v1.4.1 Jan 2026. **⚠️ This is the highest-confusability result** — name is one letter off, positioning is nearly identical.
2. **medium.com/@shouke.wei/termdock** — Termdock positive review post.
3. **productcool.com/product/termdock** — ProductHunt mirror.
4. **github.com/taotao7/termdev** — Chrome devtools-connected terminal, unrelated.
5. **Anki / core deck / vocabulary deck** pages — unrelated but show "term deck" phrase collision.
6. **LilyGo T-Deck / writerDeck / cyberdeck** pages — hardware "deck" products.

Google `"termdeck" site:github.com` returned ZERO exact matches (the search engine redirects to `termdock`, `T-Deck`, `writerDeck`, `WebDeck`, `agent-deck`, `TelemetryDeck`). None of the top 10 web results are ours; none are Junielton's; all are spelled differently.

**Conclusion:** the `termdeck` string has no SEO footprint yet — launching and defending "TermDeck" as a search term is fully available if we do the distinguishing subtitle work.

### 6. Social handles

- **`github.com/termdeck`** — 404 (available as both user and org).
- **`x.com/termdeck`, `x.com/termdeckdev`** — WebFetch returned 402/empty; Nitter mirror returned empty; `site:x.com termdeck` found no exact match. Cannot definitively confirm via tools, but no indexed account exists. Likely available. **Recommend claiming immediately from a browser before launch.**
- **`bsky.app/profile/termdeck.bsky.social`** — could not verify (Bluesky profile page needs JS). Likely available; claim from browser.

### 7. Domain availability

Combined DNS + whois (2026-04-14):

| Domain | Status | Evidence |
|---|---|---|
| **termdeck.com** | **Registered**, created **2025-08-29** via Porkbun, privacy-locked | Resolves to Cloudflare; whois shows creation date ~8 months ago |
| **termdeck.dev** | **Available** | NXDOMAIN, not in registry |
| **termdeck.io** | **Available** | NXDOMAIN, not in registry |
| **termdeck.app** | **Registered**, privacy-locked | Resolves to Cloudflare; whois referral to Google registry is blocked but the DNS record exists |
| **termdeck.sh** | **Available** | NXDOMAIN |

**`termdeck.com` and `termdeck.app` are both already owned** — plausibly by the Junielton project or a speculator following the first npm package in late 2025. **Recommend `termdeck.dev` as the primary launch domain** with `termdeck.io` or `termdeck.sh` as fallbacks.

### 8. Meaning conflicts

- **Anki / language learning**: "term deck" is natural-language shorthand for a vocabulary flashcard deck (`EriOldMan/TermDeck` exists for exactly this purpose). Low semantic collision for our dev-tool audience; non-zero risk of an Anki user landing on our HN post by mistake.
- **Deck-building card games**: "term deck" is not an established phrase in board-game vocabulary; no card game conflict.
- **TermoDeck** (termodeck.com): thermal energy storage building system. Completely unrelated industry, different spelling. Non-conflict.
- **Insurance/finance "term deck"**: no hits — "term sheet" dominates that space.
- **Hardware "decks"**: T-Deck, DevTerm, cyberdeck — adjacent tinkerer culture, different product category.

**Overall semantic risk is low.** The word "deck" is well-trafficked in dev-adjacent spaces (Stream Deck, Deckboard, TelemetryDeck, Deckset, Getdeck, DeckDeckGo, deck.gl) so audiences won't find "TermDeck" jarring, but the name will need SEO work to rise above "termdock" and the Junielton package in search.

### Preliminary risk rating: 🟡 **YELLOW — proceed with a specific fix.**

Trademark picture is cleaner than expected: no USPTO registration surfaces publicly for TERMDECK, Elgato/Corsair has a documented non-enforcement pattern against "Deck"-suffixed open-source tools, and `.dev`/`.io`/`.sh` domains plus the `github.com/termdeck` org are all available for immediate claim. The real concern is **positioning collision, not legal**: `me0w2en/TermDeck` on GitHub (created 2026-03-04, nearly identical Claude-Code-multi-agent-dashboard pitch) and `Termdock` on ProductHunt (one letter off, already on HN/Medium/Product Hunt) together mean the product launches into a space where two adjacent names already exist with nearly identical taglines. HN commenters will conflate them, and the Junielton npm squat on unscoped `termdeck` forces the scoped `@jhizzard/termdeck` install story.

**Recommendation:** Keep the name only if Josh is willing to:

1. **Manually verify USPTO** on `tmsearch.uspto.gov` before launch (~10 min).
2. **Claim** `termdeck.dev` + `github.com/termdeck` org + `x.com/termdeck` within 24 hours.
3. **Lead the HN title** with a distinguishing subtitle like "TermDeck — browser terminal multiplexer with Flashback memory" (the word "Flashback" is the genuine differentiator, and leading with it anchors the pitch away from Stream Deck and Termdock).

If Josh will not do (1)–(3), a pre-launch rename to something without a Stream Deck echo is the safer play: **Flashbench**, **Pitlane**, **Railhub**, **Panelo**, or (stronger) *leaning on the already-built Flashback feature name*: **Flashback Terminal** or just **Flashback**.

---

## Mnemos

### 1. npm registry

Search of `registry.npmjs.org` for the word `mnemos` returns **138 matching packages**, the overwhelming majority of them published between January and April 2026 and almost all of them in the "persistent memory for AI agents / MCP" niche. **This is the single most damaging finding in the report.**

Direct hits on the short names Josh would naturally want:

| Package | Publisher | Latest | Last publish | What it is |
|---|---|---|---|---|
| `mnemos` | merrihew (Tom Merrihew) | 0.0.1 | 2014-05-11 | Abandoned "persistent storage for local modules" — bare name is taken, 12 years dead, unrevivable |
| `mnemos-sdk` | tstockham96 (Thomas Stockham) | 0.6.1 | 2026-03-16 | "Universal memory layer for AI agents. Remember, recall, consolidate." — powers the mnemos.fyi Show HN |
| `mnemos-memory` | hiatamaworkshop | 1.1.0 | 2026-03-31 | "Mnemos MCP Server — cross-session semantic memory for AI coding agents" |
| `mnemos-protocol` | ecomxco | 0.1.5 | 2026-03-12 | "MCP server and CLI for the Mnemos AI memory protocol — persistent context across sessions, devices, and agents" |
| `mnemos-mcp` | mnemos-ai (org account) | 1.0.0 | 2026-01-07 | "MCP server for Mnemos: persistent memory for AI" |
| `mnemos-mcp-server` | keggan | 1.12.0 | 2026-03-06 | "Mnemos — Persistent Memory Cortex for AI coding agents" |
| `mnemos-client` | ronaldomlima | 0.3.0 | 2026-03-09 | "TypeScript client for Mnemos Cloud — AI memory infrastructure" |
| `mnemosjs` | ghostxd | 0.1.1 | 2026-03-25 | "Verifiable, autonomous, encrypted memory for AI agents — Filecoin" |
| `mnemosx` | nick7777 | 0.5.3 | 2026-04-13 | "Context spine for AI coding agents. 6 providers assembled into rich context packets" |
| `@199-bio/mnemos` | 199-biotechnologies | 1.2.0 | 2026-04-03 | **"Give Claude a perfect memory. Local-first MCP server with hybrid search."** — closest functional match to `@jhizzard/mnemos` |
| `@easylabs/mnemos` | GitHub Actions | 3.4.0 | 2026-04-01 | "Persistent memory layers, knowledge graph, curator engine, policy gates, provenance chain" |
| `@mnemostraining/sdk` | flarcos | 1.3.0 | 2026-04-08 | "Mnemos memory API — persistent, versioned memory for AI agents with built-in compliance screening" |
| `@mnemos-mem/core` (+ `/mcp`, `/sqlite`, `/supabase`, `/graph`, `/openai`, `/openclaw`) | muhammadkh4n | 0.2.1 | 2026-04-14 | "5 cognitive systems, intent-driven retrieval, consolidation cycles" — full scoped family |
| `@open-mnemos/*` (12+ packages) | fibrinlab | 1.0.1 | 2026-03-20 | Includes `@open-mnemos/adapters-storage-postgres` (**PostgreSQL + pgvector**, matching jhizzard's stack) |
| `@getmnemos/sdk`, `@getmnemos/cli` | maryjanis | 0.1.1 | 2026-04-11 | "Mnemos — persistent memory for AI agents" |
| `@kooroot/mnemos` | kooroot | 0.1.4 | 2026-04-14 | "AI-native persistent memory — knowledge graph, not files, not RAG. MCP server + CLI + REST." |
| `@cartisien/mnemos` + `-mcp` + `-server` | mrwitters | 1.0.1 | 2026-03-16 | Full SDK + MCP + hosted API trio |

Plus 20+ more scoped packages: `mnemos-ai`, `mnemos-rs-mcp`, `mnemos-harness`, `opencode-mnemos`, `n8n-nodes-mnemos`, `@iflow-mcp/bmbnexus-mnemos-memory`, `@sayyamkhan/mnemos-ai`, `@hbarefoot/mnemos`, `@sukep/mnemos`, `@clawdactual/mnemos`, `@terronex/mnemos`, `@mateoknox/mnemos`, `@spark-agents/mnemos`, `@transia/mnemos`, `@cogmem/mnemos`, `@4meta5/mnemos`, `simple-mnemos`, `@morous-dev/mnemos-cc`, `mnemos-skill`, `@tonipotatonpm/mnemosai`, `mnemos-kv-mcp`, `@mnemos-ai-memory/cli+mcp+core+vis`.

For context: `@jhizzard/mnemos@0.2.0` was published **2026-04-14**, the same day as `@kooroot/mnemos@0.1.4` and `@mnemos-mem/core@0.2.1`. **Three independent engineers published "Mnemos" memory servers on the same calendar day.**

**Bottom line on npm:** the short names `mnemos`, `mnemos-sdk`, `mnemos-memory`, `mnemos-protocol`, `mnemos-mcp`, `mnemos-mcp-server`, `mnemos-ai`, `mnemosjs`, `mnemos-client`, `mnemos-harness`, `mnemos-os` are all taken by other authors, most of them direct competitors shipping the same product category. `@jhizzard/mnemos` exists only because npm scopes insulate name collisions — the unscoped brand is lost.

### 2. GitHub collisions

Top repos with "mnemos" in the name, sorted by visible star count:

| Rank | owner/repo | Stars | Description | Last activity | In our space? |
|---|---|---|---|---|---|
| 1 | **deepseek-ai/Mnemos** | 4,300 | "Conditional Memory via Scalable Lookup: A New Axis of Sparsity for LLMs" (arxiv 2601.07372) | Jan 2026 | Yes — LLM architecture, well-known paper, will confuse anyone searching "mnemos LLM" |
| 2 | **Gentleman-Programming/mnemos** | **2,500** | "Persistent memory system for AI coding agents. Agent-agnostic Go binary with SQLite + FTS5, MCP server, HTTP API, CLI, TUI." MIT | 2 days ago, v1.12.0 | **Yes — direct competitor, listed in OSS Insight's "Agent Memory Race of 2026" as one of the five canonical repos** |
| 3 | sunaku/glove80-keymaps | 726 | Glove80 Mnemosmer keymap | Mar 2026 | Keyboard layout |
| 4 | binarybottle/mnemos-2021 | 307 | Arno Klein's original Mnemos keyboard layout | 5 days ago | Keyboard layout |
| 5 | TrySound/mnemosma | 187 | Design tokens editor | Feb 2026 | No |
| 6 | sunaku/enthium | 157 | Keyboard layout | Jan 2026 | Keyboard layout |
| 7 | sunaku/mnemosmer | 156 | Arno's Mnemos for programmers | Apr 2024 | Keyboard layout |
| 8 | mate-desktop/mnemospa | 133 | MATE file archiver | 12 days ago | No |
| 9 | ruesandora/Mnemos | 103 | (unclear) | Nov 2023 | No |
| 10 | mnemos-network/tokio-docker | 87 | "Mnemos Tokio Chain testnet" | Nov 2023 | Blockchain |
| — | ashita-ai/mnemos | 5 | "Memory system for AI — preserves ground truth, tracks confidence, prevents hallucinations" MIT | 2026 | Yes — direct competitor |
| — | lamb356/mnemos | 0 | "Memory layer for LLM agents — Rust core + MCP server and CLI" Apache-2.0 | 2026 | Yes — direct competitor |
| — | 199-biotechnologies/mnemos | unknown | "MCP server for personal memory with hybrid search (BM25 + ColBERT + Knowledge Graph)" | 2026 | Yes — **functionally isomorphic to jhizzard's pitch** |
| — | ayvazyan10/mnemos | unknown | "Human-like memory that persists across sessions" (mnemos.am, "Universal AI Brain") | 2026 | Yes — direct competitor |
| — | mnemos-memory/mnemos | unknown | "Memory that sticks. Universal memory layer for AI agents." (mnemos-ai.dev, Levent) | 2026 | Yes — direct competitor |
| — | edg-l/mnemos-mcp, tom-swift-tech/mnemos, kiwi018/mnemos, syntax-syndicate/mnemos-agent-memory, limaronaldo/mnemos, @getmnemos/, @cartisien/, rawcontext/mnemos-claude-plugin, tstockham96/mnemos | low-to-mid | All "persistent memory for AI coding agents" MCP servers | 2026 | Yes — all direct competitors |

**There are at least ten distinct GitHub repos shipping "Mnemos" as a persistent-memory-for-AI-coding-agents MCP server.** At least one (`Gentleman-Programming/mnemos` at 2,500+ stars with 80% LOCOMO benchmark) has genuine mindshare and was named in OSS Insight's April 2026 roundup "The Agent Memory Race of 2026: 5 Repos, 4 Architectures, 1 Unsolved Problem" as *the canonical Mnemos*.

### 3. USPTO trademark

tmsearch.uspto.gov is JavaScript-rendered and blocks automated requests. These findings come from Justia/Trademark Elite mirrors which lag the live database:

| Mark | Serial | Owner | Class | Filed | Status |
|---|---|---|---|---|---|
| **MNEMOS** | 78347316 | Forrester Research, Inc. (Cambridge MA) | 035 — business marketing consulting | 2004-01-02, reg 2005-05-31 | **DEAD** — cancelled 2012-10-05, Sec 8 not filed |
| **MNEMOS** | 86536506 | Quorum Robotics, Inc. (Chicago IL) | **009 — software for analyzing data and making decisions using artificial intelligence** | 2015-02-16 | **DEAD** — abandoned 2016-03-28, no Statement of Use |
| **CYBERNETIC MNEMOS** | 88258338 (reg #6185802) | saf.ai, Inc. | 009 + 042 "store, retrieve, manipulate, share, secure digital information" | 2019-01 | **LIVE** registered — compound mark, not bare "MNEMOS" |

**Reading this:** No live federal registration currently exists on the bare word mark "MNEMOS" in Class 9 or Class 42 — both historical attempts (Forrester 2005, Quorum Robotics 2015) went dead. The Quorum filing is instructive: the Class 9 description ("software for analyzing data and making decisions using artificial intelligence") would have been squarely in jhizzard's lane, and it was abandoned before registration. The saf.ai "CYBERNETIC MNEMOS" registration is live and in Class 9 but is a compound mark covering information security SaaS — it does not preclude `@jhizzard/mnemos`.

**Important uncertainty:** unable to confirm whether any of the 2026-wave competitors have filed new intent-to-use applications since mid-2025. Given the sheer volume of commercial Mnemos launches in Q1 2026 and the presence of real companies (Varol LLC, Softmax Data Inc.) behind two of them, it is **plausible but unverified** that at least one live TM application in Class 9/42 exists that the mirror sites haven't indexed yet. **This needs a live TESS/TSDR pull before any launch.**

**Biotech/pharma Class 5:** the expected pharma collision did NOT materialize. Closest is **Engrail Therapeutics** (San Diego, $157M Series B, ENX-102 in clinical trials) — different spelling. No Mnemos-named biotech company with a live Class 5 registration was found. The preliminary assessment's pharma risk concern was overstated.

### 4. The Mnemos keyboard layout (Arno Klein)

Confirmed. Canonical repo is `binarybottle/mnemos` / `mnemos-2021` by Arno Klein — mid-hundreds of stars, MIT license, academic paper at *Frontiers in Computer Science*. Multiple community forks and derivatives (`sunaku/mnemos`, `sunaku/mnemosmer`, `sunaku/enthium`, `iklarman/mnemos`, `plunkgj/mnemos`) and a `help.keyman.com/keyboard/mnemos/2.0` official page. Community is real but small — Alt-Layouts Discord + scattered Reddit r/KeyboardLayouts threads. No trademark claimed; license is MIT and the name is treated as a research term. Klein has held the name since 2021 and would have strong "prior use" equity even without a registered mark.

### 5. Biotech/pharma Mnemos companies

Did not find any. The closest is **Engrail Therapeutics** (different spelling). No "Mnemos Cancer Center," no "Mnemos Neuroscience Inc." in public funding databases. PitchBook shows two blurry entries for "Mnemos.io" and "Mnemos Lab" in 2025-2026 profile data but neither appears to be biotech. **Pharma Class 5 risk is empty.**

### 6. Mem0 / Letta / Zep / claude-mem cross-check

None of the direct memory-for-agents incumbents has ever shipped a product called "Mnemos." Mem0's marketing uses "memory," Letta (formerly MemGPT) uses "memory layer," Zep uses "temporal knowledge graph," claude-mem uses its own name. No hits on `site:mem0.ai`, `site:letta.com`, `site:zep.us`, `site:claude-mem.ai` for the word "mnemos." **There is no pre-existing incumbent claim from this camp.** The collision is from the 2026 flood of new entrants, not the incumbents.

### 7. General web presence

Top results for `"mnemos" MCP server memory developer`, in order:

1. `github.com/Gentleman-Programming/mnemos` — 2.5k stars, canonical entry
2. `mnemos.fyi` (Thomas Stockham, `mnemos-sdk`, LOCOMO leader)
3. `github.com/edg-l/mnemos-mcp`
4. `mcpservers.org` Mnemos listing
5. `mnemos.tools` (Varol LLC, $9-$99/mo commercial product)
6. `mcp.aibase.com` Mnemos reliability semantic search memory
7. `skywork.ai` "Ultimate Guide to Mnemos Memory"
8. `mnemos.am/docs/mcp-tools` (ayvazyan10)
9. `github.com/michael-denyer/memory-mcp` ("Mnemos-inspired memory MCP server")
10. `github.com/OscillateLabsLLC/mnemos` ("private local memory layer MCP server")

Then `"mnemos" memory developer`:

1. Gentleman-Programming/mnemos again
2. `mnemos-ai.dev` (Levent, mnemos-memory/mnemos)
3. Various Show HN discussion threads
4. OSS Insight "Agent Memory Race of 2026" article
5. DeepSeek Mnemos paper coverage (Tom's Hardware, Analytics Vidhya, rewire.it blog, Medium)

**jhizzard results: do not appear anywhere in the first three pages of results for either query.** `@jhizzard/mnemos` is effectively invisible at launch — it would enter a page where five or six established competitors are already holding the top slots.

### 8. Social handles

- **`github.com/mnemos`** — exists as an org, zero public repos, essentially parked.
- **`github.com/mnemoshq`** — real org, 4 small repos, last commit Oct 2023, linked to `mnemoshq.xyz`, "hub for productivity and collaboration web apps." Dormant-ish but non-empty.
- **`github.com/mnemosdev`** — real org, based in USA, website `mnemoshq.com`, team@mnemoshq.com, zero public repos.
- **`github.com/mnemos-ai`** — real org, zero public repos, appears to be the publisher of `mnemos-mcp@1.0.0` on npm.
- **`github.com/mnemos-network`** — real org, owns `tokio-docker` (87 stars), blockchain testnet project.
- **`github.com/199-biotechnologies`, `github.com/Gentleman-Programming`, `github.com/tstockham96`, `github.com/ayvazyan10`, `github.com/edg-l`, `github.com/OscillateLabsLLC`** — all real identities behind competing Mnemos projects.
- **`x.com/mnemos, x.com/mnemosdev, x.com/mnemoshq`** — X returns 403 (rate limit), not 404. Cannot confirm ownership.
- **`bsky.app/profile/mnemos.bsky.social`** — returns 404. **Available.**

**Every natural short handle on GitHub is already taken.** The only remaining clean social surface is Bluesky.

### 9. Domain availability

Live checks via HTTP HEAD (2026-04-14):

| Domain | Result | Who |
|---|---|---|
| `mnemos.com` | 403 from nginx (parked/held) | — unconfirmed |
| `mnemos.dev` | 200 OK — **"Mnemos #1 Marketing Orchestration & Personalization Platform"** | Amsterdam martech SaaS |
| `mnemos.io` | 200 OK, minimal placeholder | unclear |
| `mnemos.app` | DNS does not resolve — probably available | — |
| `mnemos.sh` | 200 OK from nginx | — |
| `mnemos.ai` | 200 OK, GitHub Pages | — |
| `mnemos.am` | 200 OK, **"Mnemos — Universal AI Brain"** (ayvazyan10, MIT, MCP memory product with 18 tools) | direct competitor |
| `mnemos.so` | 200 OK, **Softmax Data Inc. commercial product (Vancouver) — MCP + Python SDK + REST, free + enterprise tiers** | direct competitor |
| `mnemos.fyi` | 307 redirect (Thomas Stockham, `mnemos-sdk`, LOCOMO leader) | direct competitor |
| `mnemos.tools` | 307 redirect, **Varol LLC commercial product — $9/$29/$99 tiers, MIT open core, MCP** | direct competitor |
| `mnemoshq.com` | no DNS | — |
| `mnemos-mcp.com` | no DNS | — |
| `mnemosdev.com` | no DNS | — |

**Readings:**

- `mnemos.com` looks parked/held and is inaccessible to new owners.
- `mnemos.dev` is owned by a completely separate (and older) martech SaaS "Mnemos #1 Marketing Orchestration Platform" based in Amsterdam. This rules out the obvious `mnemos.dev` domain for jhizzard.
- `mnemos.so`, `mnemos.fyi`, `mnemos.tools`, `mnemos.am` are all **actively used by direct competitors** shipping the same product category.
- `mnemos.app`, `mnemos-mcp.com`, `mnemosdev.com`, `mnemoshq.com` appear free to register — but registering any of them would put jhizzard in the position of adopting a suffix to disambiguate from 4+ existing Mnemoss, which is a branding tell that the core name is already lost.

### 10. Meaning conflicts (top 5 by audience overlap)

Ranked by how likely a devtools/Claude Code user is to encounter the prior meaning first:

1. **Gentleman-Programming/mnemos + the 2026 wave of ~10+ memory-for-AI-agent projects** (direct collision; 100% audience overlap; most dangerous)
2. **Destiny 2 loot mnemoss** (massive audience — Destiny 2 has millions of players, many of whom are developers; Bungie has used the term commercially since 2014)
3. **DeepSeek's Mnemos conditional-memory LLM architecture** (arxiv 2601.07372, Jan 2026, covered by Tom's Hardware, Analytics Vidhya, rewire.it — every ML-aware developer has now read about it; fights for the same SEO slot)
4. **Arno Klein's Mnemos keyboard layout** (small but vocal mechanical-keyboard audience, heavy overlap with terminal-using developers)
5. **Mnemos — Marketing Orchestration Platform** at mnemos.dev (Amsterdam martech SaaS, owns the most natural `.dev` domain)

Plus present but lower-overlap: the neuroscience term itself (Wikipedia / PMC / Nature owning page 1 for "mnemos memory"), `Mnemos` the Steam rhythm game, Mnemos mattress (not verified), `mnemospa` the MATE file archiver, `mnemosma` design-tokens, and the Mnemos Network blockchain.

### Preliminary risk rating: 🔴 **RED — RENAME BEFORE LAUNCH.**

**Rationale:** This is not a yellow-zone naming conflict — it is a full-blown naming collision in exactly the product category jhizzard is entering. The npm registry contains **138 packages** with "mnemos" in the name, dozens shipping what jhizzard is shipping, and at least 10 independent GitHub projects calling themselves "Mnemos" are vying for the same "persistent memory MCP server for Claude Code" position right now. One of them (`Gentleman-Programming/mnemos`) is already at **2,500 stars** and is canonized in OSS Insight's April 2026 agent-memory-race writeup as *the* Mnemos. Three separate "Show HN: Mnemos" launches hit Hacker News in the 60 days preceding jhizzard's target launch, and the commercial domains (`mnemos.fyi`, `mnemos.so`, `mnemos.tools`, `mnemos.am`, `mnemos-ai.dev`) are all taken by funded or solo-commercial competitors shipping the same pitch. The short npm name `mnemos` is taken (dead 2014 package, unrevivable) and every obvious scoped alternative is already claimed.

Trademark risk is actually the *smallest* piece of the problem — the bare word has no live registration and the pharma Class 5 risk did not materialize — but that only means there is *no one to stop anyone else* from using the name, which is exactly why the space is now saturated with it.

Launching `@jhizzard/mnemos@0.2.0` on Hacker News in April 2026 would be launching into a field where the name is already an over-used commodity; jhizzard would be **at best the 11th "Mnemos" in the space** and the SEO ceiling is effectively zero. A Show HN comment will be "oh, another one — how is this different from Gentleman-Programming/mnemos?" within the first 10 minutes and that is fatal to a cold launch.

**Strong recommendation: RENAME BEFORE LAUNCH.** The one silver lining is that jhizzard's specific technical approach (pgvector + hybrid search + 6 MCP tools + webhook bridge + 3-layer progressive disclosure + privacy tags + Rumen async layer) has genuine differentiation — the problem is purely the word "Mnemos." A rename preserves 100% of the technical moat.

**Fallback name candidates** (post-research, not previously vetted — Josh should do the same deep dive on any of these before committing):

- **Recallo** — recall + verb-y suffix. Evokes active retrieval.
- **Mnemon** — Greek root for memory, unusual, short.
- **Memoir** (from the preliminary) — writerly, distinctive.
- **Graphite Memory** — two-word, distinctive, metaphor-clear.
- **Spoor** — hunter's-trail metaphor, short, unusual, memorable, likely uncontested.
- **Recollect** — action-verb, unambiguous, descriptive.
- **Holdfast** — evocative, distinctive, unambiguously yours.
- **Remember** — maximum SEO risk (common English word) but maximum clarity; probably trademarked somewhere.
- **Trace** (from the preliminary) — clean and short but high collision risk in other spaces.
- **Cortex Memory** / **Cortex.sh** — unclaimed subdomain riffs on the neuroscience theme without the 138-package Mnemos field.

**⚠️ Do the same deep-dive on any candidate before committing.** The Mnemos research shows how fast a "nobody uses that name" assumption can collapse in a gold-rush market.

---

## Rumen

### 1. npm registry

Direct checks against `registry.npmjs.org`:

- `rumen`, `rumen-js`, `rumen-ts`, `rumen-sdk`, `ruminate` — **all 404 (do not exist).** The unscoped name `rumen` is wide open.
- `ruminant` — exists. Owner Po-Ying Chen, stuck at v0.0.0, description "A library for managing stored procedures with a pool and directory-based procedure loading system." Stale, no AI/memory relevance. Non-conflict.
- `@jhizzard/rumen@0.2.0` — ours, published 2026-04-14.

Full-text npm search for "rumen" returned only: DSR test-bed spam packages (2021, all "empty"), `expo-vcard-importer` by "rumen.rusanov" (vCard importer, Bulgarian author, unrelated), a Chinese penetration-testing book package, and `@jhizzard/rumen`. **Zero memory/RAG/LLM/agent hits.**

Full-text npm search for "ruminate" returned two AI-adjacent packages worth noting but not blocking:

- `@fozikio/tools-cognition@0.1.0` (Mar 2026) — one of eleven cognitive verbs in a cortex-engine plugin. Single maintainer. Does not use "rumen."
- `@mmcook/pi-brainmaxx@0.2.1` (Mar 2026) — "repo-local memory, reflection, and session-history rumination." Exposes a `/ruminate` command. Single maintainer, barely released. Does not use "rumen."

Neither calls itself "Rumen."

**PyPI:** `pypi.org/pypi/rumen/json` returns 404 — `rumen` does not exist on PyPI either.

### 2. GitHub collision

Top repos for the query `rumen` (GitHub API, sorted by stars):

| # | Repo | Stars | Last push | Space |
|---|---|---|---|---|
| 1 | easychen/rumenqi | 98 | 2016-04 | Chinese "from beginner" book companion, dead |
| 2 | yan1365/RVD | 9 | 2024-08 | rumen virome (biology) |
| 3 | J-MimgHui/MscT_codes | 8 | 2024-05 | rumen microbiome (biology) |
| 4 | gf3/Rumen | 5 | 2011-07 | Ruby data extraction, abandoned |
| 5 | TheMEMOLab/supacow-share | 4 | 2025-07 | rumen microbiome (biology) |
| 6 | seashore001x/Rrumen | 4 | 2017-12 | R functions, rumen microbial data |
| 7 | rustmore/rumenu | 3 | 2016-02 | Rust dmenu clone |
| 8 | yan1365/rumen_virome_eco | 3 | 2024-05 | biology |
| 9 | rugeovo/RuMenu | 3 | 2025-05 | Kotlin menu app |
| 10 | yan1365/rumen_eukaryotes | 3 | 2025-01 | biology |

**No AI/LLM/RAG/memory repos in the top 15.** The space is dominated by (a) biological research on ruminant microbiomes, (b) a handful of tiny abandoned utilities, (c) Chinese "ru men" (入门 = "beginner/intro") transliterations.

**Apache Hadoop Rumen** — a legacy subproject (JobHistory log analysis for MapReduce simulation, last published 2019, still shipped in hadoop-tools but dormant). The single notable historical namesake — not a conflict in 2026 but will surface in search for "hadoop rumen."

`github.com/rumen` exists but is dormant (Rumen Stefanov, 0 repos, 0 followers, 2011). `github.com/orgs/rumen` returns 404 — **org slot available.** Multiple Bulgarian Rumens on GitHub (RumenDamyanov, rumenpetrov, rumenov, Rumen-Nikolaev, etc.) but none competing. Ruminate: top repos are tryruminate.com and unrelated dictionaries — nothing in the memory/agent space.

### 3. USPTO trademark

USPTO TSDR and tmsearch both hard-block WebFetch. These come from Trademarkia/Elanco secondary sources:

- **"RUMEN"** as a word mark is owned (at least one live filing) by **International Foodstuffs Co LLC** — goods described as "cattle feed including rumen protected fat." **Class 5 or Class 31**, not Class 9.
- **"RUMENSIN"** is a registered Elanco mark — veterinary pharmaceutical, **Class 5**. In use since 1975.
- **No evidence** surfaced of any **Class 9 (software/downloadable) "RUMEN"** registration or pending application. USPTO may scrutinize a Class 9 filing for descriptiveness but not for conflict.

**Caveat:** unable to verify the absence of a Class 9 "RUMEN" application directly. A 15-minute manual search at tmsearch.uspto.gov before brand investment is cheap insurance.

### 4. Agricultural/veterinary product conflicts

The biggest agricultural namesakes:

1. **Rumensin®** (Elanco, monensin sodium) — the 800-lb gorilla. Cattle feed additive, FDA-approved since 1975, one of Elanco's blockbuster products. Class 5 veterinary pharmaceutical.
2. **Rumen-Bac®** (TransAgra) — natural feed supplement. Class 5/31.
3. **RumenAI** (rumenai.com) — **this one is more interesting.** A German ag-tech startup with EU/NRW grant funding, making a **patented rumen bolus sensor** for methane abatement and disease prevention. They literally market themselves as "RumenAI" and claim AI algorithms. Livestock hardware, not devtools. No market overlap. But the literal string "RumenAI" will show up in search results next to ours and dilute SEO.

All sit in veterinary/agricultural/hardware space. None touch Class 9 software. But #3 is the closest optical collision and worth preemptively addressing in a launch post.

### 5. Bulgarian Rumens

"Rumen" is a common Bulgarian masculine given name. Reference cases:

- **Rumen Radev** — former Bulgarian President (2017–2026), resigned Jan 2026. High Google salience but politician, not devtools.
- **Rumen Damyanov** (@RumenDamyanov on GitHub, `rumenx.com`) — active Bulgarian senior dev, 49+ repos, builds PHP/TS AI chatbot libraries under the npm user `rumenx`. The most relevant human to watch. Does not claim the "Rumen" project-name space.
- Others (rumenpetrov, rumenov, rumengb, rumen-cholakov, rumenmitov, rumen-delov, Rumen-Nikolaev, Rumeniv, RumenNenchev) — real Bulgarian devs, none working on memory/agent tooling.

**No "famous dev named Rumen" whose personal brand would be confused with the project.** Hygiene: mention in the README that the project name refers to the cow stomach, not the Bulgarian first name.

### 6. "Ruminate" as a brand

- **ruminate.ai** — domain listed for sale on Spaceship marketplace. Not an active product.
- **ruminateapp.com** — ECONNREFUSED. Dead/never-existed.
- **tryruminate.com** — live hobby project, "AI reading tool for understanding hard things," upload PDF/EPUB and chat with an LLM about it. Show HN by `rshanreddy` on 2025-09-16 got **18 points and 3 comments**. One-person side project, zero traction, not in TermDeck adjacency (reading comprehension, not agent memory).
- Not in any 2026 "Best Second Brain Apps" or "Best AI Memory Frameworks" roundups.

**"Ruminate" is not a brand with mindshare in our space.** Confusion risk with "Rumen" is minimal.

### 7. General web presence

Searches `"rumen" developer tool`, `"rumen" async memory`, `"rumen" AI`, `"rumen" MCP memory tool 2026` all returned:

- Biology/ruminant microbiome papers
- Elanco/Rumensin product pages
- RumenAI (ag-tech bolus)
- Apache Hadoop Rumen (dormant)
- Bulgarian individuals
- **Zero results for a developer tool called "Rumen."**

`@jhizzard/rumen` does not appear yet (too new, published 2026-04-14). Space is **wide open in the devtools/AI vertical**, but crowded with biology and cattle-feed noise. SEO will take effort to rank above "what is a rumen (cow stomach)" and Rumensin product pages, but **no competing developer tool is fighting for the same query.**

### 8. Social handles

- **`x.com/rumen, x.com/rumendev`** — WebFetch blocked by X (402). Could not verify directly.
- **`bsky.app/rumen.bsky.social`** — handle exists but WebFetch hit paywall; no profile details retrievable.
- **`github.com/rumen`** — taken, **dormant** (0 repos, 0 followers, 2011).
- **`github.com/orgs/rumen`** — **available** (404).
- **PyPI user `rumen`** — not verified.

Recommendation: create the **GitHub org `rumen`** defensively, use `@jhizzard/rumen` on npm (already done), secure `rumendev` handles across X/Bluesky as a fallback brand surface.

### 9. Domain availability

| Domain | Status |
|---|---|
| rumen.com | **Taken** — Australian medical weight-loss telehealth service ("Rumen Australia," 200k patients) |
| rumen.com.au | Taken — same Australian company |
| **rumen.dev** | **ECONNREFUSED — appears unregistered or parked** |
| rumen.io | Timeout / blank — unconfirmed; likely parked or unused |
| **rumen.app** | **ECONNREFUSED — likely unregistered** |
| **rumen.sh** | **ECONNREFUSED — likely unregistered** |
| rumen.ai | Not registered as a distinct site; `rumenai.com` is the ag-tech company |
| rumenai.com | Taken — RumenAI (ag-tech livestock sensors, German/EU) |
| rumendev.com | ECONNREFUSED — likely unregistered |
| rumen-ai.com | ECONNREFUSED — likely unregistered |
| rumen.it | Taken — "RUM&N" Italian business consulting (irrelevant) |

**Best grab: `rumen.dev`.** Fallback: `rumendev.com`. `rumen.com` is not in reach.

### 10. Metaphor quality check

Searches for `"chewing the cud" AI agent memory`, `"rumination" AI memory architecture`, `"rumen" metaphor async learning` surfaced:

- **Oreate AI blog** — "Chewing Your Cud: A Metaphor for Thoughtful Reflection" — general meditation-y AI post, not a product launch.
- **OpenClaw workspace template** — uses a `reflections.md` file for "daily memory rumination" — convention in one workspace template, not a product name.
- **Generic "rumination" framing** — Letta, Mem0, LangChain all describe agent memory with words like "consolidation" / "reflection" / "distillation" / "sleep"; nobody has claimed "rumination" or "chewing the cud" as the signature metaphor.

**The rumen/cud-chewing metaphor is unclaimed.** That's a real brand asset — a launch blog post titled "Why we called it Rumen" with the biological explanation is likely to land cleanly with no "you stole our metaphor" pushback.

### Preliminary risk rating: 🟢 **GREEN**

**Rationale:** Across npm, PyPI, GitHub (top-15 + Python-specific), general web search, and all major "AI agent memory" roundups for 2026, zero developer tools occupy the name "Rumen." The closest semantic collisions — `tryruminate.com` (tiny HN hobby project, different word) and two fringe "ruminate"-flavored npm packages from single-maintainer experiments — do not rise above noise. Agricultural trademarks (RUMENSIN, RUMEN-BAC, International Foodstuffs Co LLC's RUMEN cattle-feed mark) all live in Class 5/31 and pose no Class 9 conflict. The "RumenAI" German bolus company is the only optical-collision worth flagging but is orthogonal to devtools. The cud-chewing metaphor is unclaimed brand territory.

**Remaining work before a confident launch:**

1. 15-minute manual USPTO tmsearch pass for any Class 9 "RUMEN" application I could not fetch.
2. Claim `github.com/orgs/rumen`.
3. Register `rumen.dev` (or `rumendev.com` as fallback).
4. Preempt the "it's a cow stomach" explanation in the README so Bulgarian-name confusion and Rumensin-product confusion both get handled up front.

---

## Net recommendation

**The sprint cannot proceed to launch-copy writing until the Mnemos decision is made.** Every blog post, Show HN post, and X thread in `docs/launch/` references "Mnemos" by name multiple times. Drafting them now wastes the work if a rename is chosen.

**Decision tree for Josh:**

### Option A: Rename Mnemos (recommended)

- **Cost:** significant but bounded. Republish npm under a new scope (`@jhizzard/<newname>`), rename the GitHub repo, update `TermDeck` server config references (`mnemosClient`, `mnemosBridge`, etc.), update docs-site README sync targets, update migrations (already named `mnemos_*` in Supabase — this is the largest single pain point, requires a SQL rename migration), rewrite `FLASHBACK_LAUNCH_ANGLE.md` and `LAUNCH_STRATEGY_2026-04-15.md` references.
- **Estimated effort:** 2-4 hours if done carefully. A single find/replace across 3 repos, plus a Supabase migration that renames `mnemos_*` tables to `<newname>_*` tables while keeping data intact.
- **Benefit:** removes the single largest SEO headwind from the launch and preserves 100% of the technical moat. Launch becomes "one of a kind" instead of "the 11th one this month."
- **Risk:** fallback name must be researched with the same deep-dive rigor as Mnemos was — the lesson from this investigation is that assumptions about name availability can collapse in a gold-rush market.

### Option B: Stand with Mnemos

- **Cost:** zero code changes. Launch Tuesday with `@jhizzard/mnemos` as-is.
- **Benefit:** ship speed.
- **Risk:** the launch lands into a field with 10+ competitors all using the exact same name. The first Show HN comment will be "how is this different from `Gentleman-Programming/mnemos` (2.5k stars)?" and that line of questioning dominates the thread for 4 hours. SEO ceiling is effectively zero — searching "mnemos MCP server" returns the 2.5k-star competitor first, the mnemos.fyi/mnemos.so/mnemos.tools paid products second, and `@jhizzard/mnemos` on page 3+ for months. The Flashback differentiator — which is genuinely unique — gets buried under the name collision.
- **When this might be right:** if Josh values ship-date above all else and has a reason to believe the technical differentiation will carry through the noise. The Flashback feature IS unique; it's possible the demo GIF cold-carries the launch regardless of name saturation.

### Option C: Delay launch, deep-research 2-3 fresh name candidates, ship under the chosen one

- **Cost:** ~1 week delay + ~4 hours of find/replace + ~4 hours of name research on 2–3 candidates (same protocol as this document).
- **Benefit:** strongest long-term brand position. Enter the launch with a name nobody else is using, own the SEO slot from day one, avoid "which mnemos is this?" confusion forever.
- **When this might be right:** default recommendation. A one-week launch delay is always cheaper than a bad launch.

### My recommendation: **Option C** (delay + rename + fresh research).

The Flashback feature is the single most compelling thing in the whole stack. It deserves a name it doesn't have to compete with 10 others for. The launch is worth more than the launch date.

If Josh wants to ship Tuesday regardless, **Option A** (rename to a candidate from the list above, with 30 minutes of rapid USPTO/npm/GitHub verification on the chosen name) is the second-best path.

**Option B is a low-confidence path.** Only take it if Josh has already internalized that the launch is going to be SEO-starved for the first 6 months and he's okay with that trade for shipping speed.

---

## What happens after the decision

If **Rename**:
1. Josh picks a fallback candidate.
2. T4 runs the same 8/9/10-point deep-dive on the chosen name (spawn 1 subagent, ~15 min).
3. If the chosen name is green, T4 proceeds with T4.2 → T4.9 using the new name throughout.
4. If the chosen name is yellow or red, go back to step 1.
5. Separately, T1/T2 coordinate the code-level rename (Supabase migration, repo renames, TermDeck server config), and this is **out of T4's scope** — T4 only writes launch copy.

If **Stand**:
1. Josh explicitly overrides the 🔴 rating in STATUS.md.
2. T4 proceeds with T4.2 → T4.9 using "Mnemos" as the name.
3. T4 writes a longer "differentiation" section into the Show HN post and the blog post that leads with Flashback to anchor the pitch away from the name field. Effectively, Flashback becomes the primary brand and Mnemos becomes subordinate.
4. The comment playbook gets a dedicated question: "How is this different from `Gentleman-Programming/mnemos`?" — answered with a specific technical differentiation (the Flashback trigger, pgvector + Supabase RLS, 3-layer progressive disclosure, the TermDeck visual layer).

---

**End of name-dispute-analysis.md.**
