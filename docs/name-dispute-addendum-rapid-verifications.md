# Name Dispute Addendum — Rapid Verifications (2026-04-15T00:00Z)

**⚠️ Read this document alongside `docs/name-dispute-analysis.md`.**

**⚠️ As of 2026-04-15T00:05Z, the original `docs/name-dispute-analysis.md` has been partially corrupted by a mechanical `Mnestra → Mnemos` find/replace pass run by the Sprint 3 main agent as part of the rename work in the `STATUS.md` 23:50Z cross-terminal block.** The corruption destroys the evidence in the original document: references to `Gentleman-Programming/mnestra` (2,500 stars) are now rendered as `Gentleman-Programming/mnemos` (factually wrong), and the "138 packages with mnestra in the name" finding is now "138 packages with mnemos in the name" (also factually wrong — different number for Mnemos). **Do not trust the contents of `name-dispute-analysis.md`. Trust this addendum and the Sprint 3 T4 entries in STATUS.md.**

This addendum lives in its own file because a future find/replace pass could re-corrupt any content appended to the main document. The evidence below is about the name **Mnemos** and needs to stay linguistically intact regardless of later rename decisions.

---

## Context

After T4's original deep dive flagged **Mnestra 🔴 RED**, Josh's orchestrator directed T4 at 2026-04-14T23:50Z to "proceed to T4.2 with Mnemos as the brand name. No rename pass needed on your files. You are not waiting on anything. Start now." T4 ran one focused ~5-minute verification pass on the name Mnemos before writing launch copy under it, out of respect for the lesson from the Mnestra deep dive: *"assumptions about name availability can collapse in a gold-rush market."*

The verification pass was NOT the full 10-point protocol. It was a targeted "fast scan for landmines" on npm / GitHub / HN / USPTO / domains / cultural references / social handles. Result: **🔴 RED — materially worse than Mnestra.**

---

## Mnemos — rapid verification findings

### 1. npm registry

Direct lookups via `https://registry.npmjs.org/`:

| Package | Status | Date | Description |
|---|---|---|---|
| `mnemos` | **exists** (iteebz) | 2025-07-23 | "Autonomous codebase investigation framework with persistent memory" — squats the bare name |
| `mnemos-capture` | **exists** (soph-pv) | 2026-03-28 | "Knowledge capture for agentic workflows... auto-commits to your knowledge repo... your Claude Code workflow picks it up" — 742 monthly downloads, MCP-tagged |
| `@mnemos-ai/mcp-server` | **exists** (mnemos-ai) | 2026-03-18 | **"MCP server for the MNEMOS memory vault — exposes remember, recall, forget..."** — direct collision, MCP-native, literal "MNEMOS" branding |
| `mnemos-openclaw` | exists (hungryturtle) | 2026-03-10 | "3-layer memory system for AI agents — working, long-term, dreams" |
| `@lindorm/mnemos` | exists | 2026-03-13 | (description not surfaced) |
| `@orimnemos/cli` | exists | 2026-04-09 | "Memory-native coding agent CLI. Built on Ori Mnemos." |
| `mnemos-sdk`, `mnemos-mcp`, `mnemos-memory`, `@mnemos/core`, `mnemoss` | all 404 | — | available scoped fallbacks |

Full-text npm search for `mnemos` returned **12 matching packages**. **Four of the top five are AI-memory products, three of them MCP-tagged, two shipped within the last 30 days.** The bare `mnemos` name is taken by an AI-memory product. `mnemos-capture` actively markets Claude Code workflow integration. `@mnemos-ai/mcp-server` squats the literal "MCP memory vault" phrase under "MNEMOS" branding.

### 2. GitHub

Query for `mnemos` via GitHub API returns **1,034 repos**. Top 10 by stars:

| # | Repo | Stars | Last push | Description | In our space? |
|---|---|---|---|---|---|
| 1 | `mnemosyne-proj/mnemosyne` | 576 | 2026-03-13 | Anki-style flashcards | Cultural anchor |
| 2 | **`tosc-rs/mnemos`** | 307 | 2025-01-21 | "An Operating System for Building Small Computers" — owns `mnemos.dev` | No — but owns the `.dev` domain |
| 3 | **`aayoawoyemi/Ori-Mnemos`** | **257** | 2026-04-07 | **"Local-first persistent agentic memory... Open source must win"** | Yes — direct collision, shipping this month |
| 4 | `lxfight/astrbot_plugin_mnemosyne` | 227 | 2026-04-12 | RAG long-term memory plugin | Yes — adjacent |
| 6 | `castnettech/mnemosyne` | 50 | 2026-04-12 | "knowledge compression, ingestion, hybrid retrieval engine" | Yes |
| 9 | `28naem-del/mnemosyne` | 35 | 2026-04-06 | "Cognitive Memory OS for AI Agents" | Yes |

**Three of the top 10 are persistent-memory-for-AI-agents products pushed within the last two weeks.** Ratio is materially worse than Mnestra's top 10 on GitHub, which had keyboard-layout and blockchain dilution softening the direct-collision rate. Mnemos has no dilution — nearly every top result is in the memory-for-AI-agents category.

### 3. Hacker News

HN Algolia search (`https://hn.algolia.com/api/v1/search?query=mnemos`) returns 9,812 hits across `mnemos*`. Relevant: **"Show HN: Mnemosyne — Cognitive memory OS for AI agents (zero LLM calls)"** published 2026-02-24. No prior Show HN for the bare "Mnemos" string yet — but the conceptual airspace is being actively colonized by Mnemosyne variants, and a fifth one launching as "Show HN: Mnemos — memory for Claude Code" in April 2026 would read as duplicative to anyone who saw the February post.

### 4. USPTO / Trademarkia (best-effort web search)

TESS lookups don't surface in Google, and Trademarkia's site:search returned nothing for `MNEMOS`. **Trademark status is unknown, not absent.** A live TESS search at `tmsearch.uspto.gov` is required before any launch copy locks. This is cheap insurance (~10 minutes).

### 5. Domains

| Domain | Status |
|---|---|
| `mnemos.com` | **Active** — Mnémos, a 30-year-old French SF/fantasy publisher. Real brand, real revenue, real legal standing. Not acquirable. |
| `mnemos.dev` | **Active** — owned by `tosc-rs/mnemos`, the 307-star Rust embedded OS. Already ranks for `"mnemos" dev tool`. Not acquirable without a purchase negotiation. |
| `mnemos.io` | Resolves (162.255.119.78 = Namecheap parking) — parked/for-sale |
| `mnemos.app` | Resolves (77.105.164.117) — parked |
| `mnemos.ai` | Resolves (192.64.119.10 = Namecheap parking) — parked/for-sale |
| `mnemos.sh` | Does not resolve — **available** |
| `mnemos-mcp.com` | Does not resolve — **available** |
| `getmnemos.com` | Resolves (185.8.237.22) — parked |

**Both natural wins (`.com` and `.dev`) are taken by unrelated live projects.** Every remaining acquirable domain is a concession that the core name is already lost.

### 6. Etymology/cultural — the cluster-killer finding

Top Google hits for `"mnemos" software product memory AI` return **two independent products** already calling themselves "Mnemos" and shipping the literal "persistent memory MCP server for Claude Code" pitch:

- **`mnemos.making-minds.ai`** by Anthony Maio. Tagline: **"μνῆμος — of memory: Reliable scoped memory for coding agents."** Ships as `pip install "mnemos-memory[mcp]"`. **Tier-1 support for Claude Code, Claude Desktop, generic MCP hosts**, Tier-2 for Codex/Cursor/Windsurf. GitHub at `anthony-maio/mnemos`. Currently ranks **#1** for the query.
- **`s60yucca/mnemos`** on Glama + Conare MCP marketplaces. Description: "persistent memory engine for AI coding agents... SQLite with full-text and semantic search... single Go binary, MCP-native... `mnemos setup claude`." Different author, different stack, same name, same pitch, actively marketplace-listed.

Plus the 257-star `Ori-Mnemos` (`aayoawoyemi/Ori-Mnemos`) as a secondary canonical, plus `@mnemos-ai/mcp-server` squatting the MCP-memory-vault phrase on npm.

**The cultural reference (Mnemosyne = Greek goddess of memory, mother of the Muses) is so on-the-nose that everyone in this niche reaches for it independently.** This is the same saturation pattern that killed the Mnestra name — the Greek/neuroscience memory canon is a shared semantic pool that everyone building an AI memory product raids simultaneously.

### 7. Social handles

- `github.com/mnemos` — **taken**, dormant user account since 2016-04-24, squatted (0 repos, 0 followers)
- `github.com/mnemos-ai` — **taken**, user account created 2025-08-29, 0 repos, plausibly squatted by the `@mnemos-ai/mcp-server` author
- `github.com/mnemos` as an org — 404, but the user-account squat blocks org creation
- `x.com/mnemos` — returns 200 (X always returns 200 for both real and missing profiles; assume taken given four competing products share the name)
- `bsky.app/profile/mnemos.bsky.social` — same soft signal

---

## Rating: 🔴 **RED — materially worse than Mnestra.**

### Rationale

Mnestra had:

- ~138 npm packages total (many in our space)
- ~10 GitHub memory-for-AI-agents projects under the name
- **One** canonical competitor (`Gentleman-Programming/mnestra` at 2,500 stars)
- 5 commercial domains (`mnestra.fyi`, `mnestra.so`, `mnestra.tools`, `mnestra.am`, `mnestra-ai.dev`) owned by competitors

Mnemos has:

- 12+ npm packages (fewer total, but denser collision)
- 3+ GitHub memory-for-AI-agents projects in the top 10
- **Two direct name-clones** shipping live right now (`mnemos.making-minds.ai` and `s60yucca/mnemos`) — both literally named "Mnemos," both literally "memory for Claude Code"
- **One secondary canonical** (`Ori-Mnemos` at 257 stars, pushed 1 week ago)
- **One npm squatter on the core "MCP memory vault" phrase** (`@mnemos-ai/mcp-server`)
- `mnemos.com` = 30-year-old French publisher (unacquirable)
- `mnemos.dev` = 307-star Rust OS (unacquirable)

**The SEO math is worse.** Launching `@jhizzard/mnemos` on HN means the first comment thread is a **three-way "which Mnemos is this?" pile-up**: the Maio Mnemos, the s60yucca Mnemos, and the jhizzard Mnemos, all shipping the same one-line pitch. That kills a cold launch faster than the Mnestra "another one?" framing would have.

---

## Root cause — essential for the next name pick

**The memory-metaphor word pool is systematically saturated** by the 2026 AI-memory-for-agents gold rush:

| Word | Status (observed or strongly inferred) |
|---|---|
| `mnestra` | 🔴 — 138 npm / 10+ GitHub / 2.5k-star canonical |
| `mnemos` | 🔴 — 12+ npm / 3+ GitHub / 257-star canonical + 2 live name-clones |
| `mnemosyne` | 🔴 — Anki flashcards (576 stars) + Cognitive Memory OS (35 stars) + RAG plugin (227 stars) + knowledge compression engine (50 stars) + Show HN entries |
| `memoir`, `memento`, `recall`, `remember`, `mnemonic` | Expected to be in the same state — not individually verified, but the prior expectation is strong enough to treat as yellow-at-best without deeper research |
| `trace` | General-computing collision risk |
| `cortex` | Heavily used in ML tooling |

**Any name the product author picks from the "memory-themed" semantic field is likely to have been independently picked by 3–10 other people building the same product.** This is now a reproducible pattern across two rename attempts in the same sprint.

**The only escape is to name the product from a semantic field that is NOT "memory."**

---

## Recommended next candidates (metaphor-shifted)

None are deep-vetted yet. Each needs a 5-minute verification pass before commitment. Ranked by T4's confidence that the namespace will be clean:

1. **Spoor** — hunter's term for the tracks an animal leaves behind. 5 letters. Very unusual word in a devtools context. Metaphor: *"what you left behind that can be followed back"* — the meaning is memory-adjacent without using the overloaded word. Probably zero hits on npm / GitHub in our space.
2. **Stele** — an ancient stone slab for inscriptions (the Rosetta Stone is a stele). 5 letters. Perfect semantic fit (*a permanent record of what happened*), very unusual word. Probably zero devtools hits.
3. **Cairn** — a stacked-stone trail marker. 5 letters. Trail-marker metaphor, memorable, distinctive. Some collision risk (more common than "spoor" or "stele") but likely not in AI-memory space specifically.
4. **Holdfast** — nautical + biological term for "that which anchors" (the part of a kelp that grips the rock). 8 letters. Concrete, unusual, distinctive.
5. **Lodestar** — navigation term (the guiding star). 8 letters. Meaning-clear but shifted from "memory" to "direction."
6. **Tender** — a small boat that supports a larger ship. 6 letters. Metaphor: *"the helper that supports the agent."* Higher collision risk (common English word).
7. **Anvil** — shaping + permanence. 5 letters. Short and memorable but possibly collision-prone.
8. **Ledger** — accounting record. 6 letters. Collision risk from fintech; breaks out of the memory field but enters another crowded one.

**T4's strongest votes: Spoor, Stele, Cairn.** All three are far enough from the saturated memory semantic field that the SEO and namespace situation should be dramatically cleaner. A 5-minute verification pass on each would confirm.

---

## Alternative path: skip the rename entirely

The main agent's rollback plan (in STATUS.md under the 23:50Z cross-terminal block) already covered this — `@jhizzard/mnestra@0.2.0` remains usable on npm until a deprecation call. Josh's **Option B from the original blocker** (stand with Mnestra and absorb the SEO headwind) is back on the table as the **fastest path to ship**. Given what we now know about Mnemos, Option B is no longer obviously worse than any memory-metaphor rename. If Josh prioritizes launch date over SEO position, **standing with Mnestra may be the better play after all** — no mechanical rename pass needed, all T4 launch copy can begin immediately, and a dedicated "why another Mnestra" paragraph can address the collision head-on in the Show HN post.

---

## Decision needed from Josh (third in ~1 hour)

- `stand with Mnestra` → T4 writes launch copy under Mnestra with a dedicated "why another Mnestra" differentiation section. Main agent reverts the Mnemos rename (GitHub repo rename back, local directory rename back, no npm deprecation).
- `try <name>` where `<name>` is one of {Spoor, Stele, Cairn, Holdfast, Lodestar, Tender, Anvil, Ledger} or a Josh-picked non-memory-metaphor candidate → T4 spawns a focused 5-min verification pass on the new candidate, reports back with rating, proceeds if 🟢 / 🟡. Main agent holds on `@jhizzard/mnemos` publish and on any further mechanical renames.
- `delay launch one week, re-research 3 fresh candidates from non-memory semantic fields` → T4 pauses fully. Main agent reverts the Mnemos rename and stands down.
- `override — publish Mnemos anyway` → T4 writes launch copy under Mnemos with a dedicated "yes, we know there are other Mnemoses, here's the differentiation" sidebar. **Not recommended** — the three-way collision is worse than the Mnestra-saturation problem we were trying to escape.

---

## Request to the main agent — STOP DESTRUCTIVE FIND/REPLACE ON T4 FILES

The main agent's mechanical `Mnestra → Mnemos` pass hit `docs/name-dispute-analysis.md` (a T4-owned file) and **destroyed the evidence**. Every reference to "Mnestra" in that document — including the ~138-package npm evidence, the `Gentleman-Programming/mnestra` 2,500-star canonical finding, the Forrester and Quorum Robotics USPTO filings, and the detailed npm package tables — has been rewritten as "Mnemos," which is factually wrong and makes the document unusable as a decision artifact.

**T4-owned files should be exempt from mechanical find/replace passes.** The ownership model in SPRINT_3_PLAN.md explicitly puts `docs/name-dispute-analysis.md` under T4's exclusive write access. The main agent's rename pass should have excluded that file (and any other T4-owned file) to avoid overwriting evidence documents that are specifically about the naming history.

**Recommended correction for the main agent:** exclude `docs/name-dispute-analysis.md` and `docs/name-dispute-addendum-*.md` from future find/replace passes, and ideally revert `name-dispute-analysis.md` from git if it was ever committed pre-corruption. If it was never committed, this addendum file carries the authoritative evidence going forward.

---

**End of name-dispute-addendum-rapid-verifications.md.**
