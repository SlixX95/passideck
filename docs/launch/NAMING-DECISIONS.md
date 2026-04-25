# TermDeck Launch — Naming Decisions of Record

**Status:** Final as of 2026-04-15T00:42:00Z
**Author:** Sprint 3 Terminal 4
**Scope:** canonical decision-of-record for the three-package launch. This file supersedes `docs/name-dispute-analysis.md` and `docs/name-dispute-addendum-rapid-verifications.md`, both of which were corrupted by mechanical find/replace passes during the rename chain and are no longer authoritative.

---

## Final names (do not change)

| Package | Name | npm | GitHub |
|---|---|---|---|
| Browser terminal multiplexer with proactive memory recall | **TermDeck** | `@jhizzard/termdeck@0.3.5` | `github.com/jhizzard/termdeck` |
| Persistent developer memory MCP server | **Mnestra** | `@jhizzard/mnestra@0.2.0` | `github.com/jhizzard/mnestra` |
| Async learning layer | **Rumen** | `@jhizzard/rumen@0.4.1` | `github.com/jhizzard/rumen` |

Feature name inside TermDeck: **Flashback** — the proactive memory recall that fires when a panel enters an error state.

Docs site: `https://termdeck-docs.vercel.app`

## Rename chain — how we got here

During Sprint 3 on 2026-04-14/15, T4's name-dispute research cascaded the memory-layer package through four candidates before landing on Mnestra. Summary:

1. **Engram** (original name) → 🔴 RED. npm had 138 packages matching "engram," most shipping "persistent memory MCP server for AI coding agents" (the same pitch). `Gentleman-Programming/engram` at **2,500 stars** was canonized as *the* Engram in OSS Insight's April 2026 "Agent Memory Race of 2026" roundup. Every natural domain (`engram.fyi`, `engram.so`, `engram.tools`, `engram.am`, `engram-ai.dev`) was owned by a competitor. Three Show HN "Engram" launches had hit HN in the 60 days preceding our intended launch window. **Rejected.**
2. **Mnemos** (second pick) → 🔴 RED, materially worse than Engram. Two independent products were shipping live as "Mnemos" MCP memory servers for Claude Code **right now**: `mnemos.making-minds.ai` (Anthony Maio, `pip install mnemos-memory[mcp]`, Tier-1 Claude Code support) and `s60yucca/mnemos` (Glama + Conare marketplaces, MCP-native, `mnemos setup claude`). Plus `Ori-Mnemos` at 257 stars pushed 1 week before the sprint, plus `@mnemos-ai/mcp-server` squatting the literal "MCP memory vault" description, plus bare `mnemos` npm squatted by `iteebz`. `mnemos.com` = Mnémos, a 30-year-old French SF/fantasy publisher (unacquirable). `mnemos.dev` = `tosc-rs/mnemos`, a 307-star Rust embedded OS (unacquirable). **Rejected.** (The `@jhizzard/mnemos@0.2.0` npm publish landed before T4's halt blocker reached the main agent; deprecated with a redirect to the final name.)
3. **Ingram** (third pick, named after Josh's grandmother's maiden name) → **Rejected** for a different reason: the family sponsor conflict with Ingram Industries. Not a technical red flag. T1 noted it at 2026-04-15T00:20Z.
4. **Mnestra** (fourth and final pick) → 🟢 GREEN. Direct checks:
   - **npm** unscoped `mnestra` = 404 (available). `@jhizzard/mnestra` published as v0.2.0. Full-text search for "mnestra" returned total = 2, both `@jhizzard/*` (ours). Zero competing packages.
   - **GitHub** total = 5 repos (`dipalert/Mnestra` at 0 stars / empty placeholder, `jhizzard/mnestra` ours, `MNESTRASHNO/MNESTRASHNO` a Russian personal account, `dayaejikvtumane/mnestrashno` unrelated, `mandeepkumargupta/MnesTraining` a capitalization coincidence). Zero memory-for-AI-agents products.
   - **Domains** `mnestra.{com,dev,io,app,sh,ai}` all returned no-resolve on `curl -sI`. None appear to be active live sites.
   - **Etymology** — Mnestra is the daughter of Erysichthon in Greek mythology, transformed by Poseidon so she could change shapes. Obscure myth. Not the overused Mnemosyne canon. Obscurity is the asset: people independently reaching for Greek memory metaphors pick Mnemosyne (and its obvious derivatives Mnemos, Mnemon, Mnemonic), not Mnestra. That's why the space is clear.
   - Trademark: not directly verified at USPTO (TESS blocks WebFetch). Josh should run a 10-minute manual TESS search on MNESTRA in Class 9 / Class 42 before locking the name for trademark purposes. This is cheap insurance.
   - **Rating: 🟢 GREEN.** Accepted as the final name.

## Root cause — lesson for the next product naming pass

**The memory-metaphor word pool is systematically saturated** by the 2026 AI-memory-for-agents gold rush. Observed across the first three pivots:

| Word root | Status | Evidence |
|---|---|---|
| `engram` | 🔴 saturated | 138 npm packages, 10+ direct GitHub competitors, 2,500-star canonical |
| `mnemos` | 🔴 saturated | 12+ npm packages, 2 live direct name-clones, 257-star secondary canonical |
| `mnemosyne` | 🔴 saturated | Anki flashcards (576 stars) + Cognitive Memory OS (35 stars) + RAG plugin (227 stars) + knowledge compression engine (50 stars) + multiple Show HN entries in 2026 |
| `recall`, `remember`, `memoir`, `memento`, `mnemonic` | Strong prior expectation of saturation | Not individually verified but the pattern is clear |
| `trace`, `cortex` | General-computing collision risk | Multiple existing products |

**Any name picked from the "memory-themed" semantic field is likely to have been independently picked by 3–10 other teams building the same product in 2026.** This is a reproducible pattern across three rename attempts in the same sprint.

**The only reliable escape** is to name the product from a semantic field that is NOT "memory." Mnestra happens to thread the needle because it's *from* the Greek memory canon but far enough off the obvious derivations that nobody else reached for it first. For the next product in this lineup, T4 recommends non-memory semantic fields as the default starting point: navigation (Lodestar, Sextant, Polestar), trail-marking (Cairn, Spoor, Blaze), archaeological record (Stele, Scroll, Codex — though Codex is heavily used), nautical infrastructure (Keel, Pier, Wharf, Harbor, Tender, Holdfast).

## Positioning safeguards for Mnestra launch

Mnestra is green but still an unfamiliar proper noun that carries zero category signal. The launch copy needs to compensate:

1. **Always use "Mnestra — persistent developer memory MCP server" in first mention.** Never just "Mnestra" without the category.
2. **Never abbreviate to just "memory."** Every second mention should use the full category anchor.
3. **Pronunciation note in the README:** /nest-rah/ with the silent initial M (same pattern as Mnemonic, Mnemosyne). Consider adding a small "/nes·tra/" phonetic at the top of the README.
4. **Etymology hook in the blog post:** the Greek-mythology origin story is interesting but subordinate to the feature pitch. Lead with Flashback, mention the name derivation in a throwaway paragraph near the architecture section.
5. **FAQ entry in the docs site:** "Why is it called Mnestra?" → short paragraph about Erysichthon's daughter + the obscurity-as-SEO-asset logic.

## What NOT to do

- Do not re-open the memory-metaphor word pool. If Mnestra later needs a rename (trademark issue, unforeseen collision), pick from a non-memory semantic field. The cost of a fifth rename is much higher than the cost of picking an unfamiliar-but-clean name.
- Do not treat the three corrupted evidence files (`docs/name-dispute-analysis.md`, `docs/name-dispute-addendum-rapid-verifications.md`, `docs/name-dispute-quick-assessment.md`) as authoritative. Each of them has been hit by at least one mechanical find/replace pass; their statements about package counts, competitor names, and star counts may be factually wrong. If Josh or a future sprint needs the evidence, re-run the checks live rather than trusting the cached documents.
- Do not squeeze the Mnestra origin story into the Show HN title. The HN title leads with TermDeck + Flashback (the product + the feature). Mnestra comes up in the body under the architecture section.

## Canonical copy blocks (use verbatim in launch materials)

**One-line pitch (Show HN title, README hero, X bio):**
> TermDeck — the terminal that remembers what you fixed last month

**Two-line elevator pitch:**
> TermDeck is a browser-based terminal multiplexer with proactive memory recall. When a panel enters an error state, it queries Mnestra — your persistent developer memory — and surfaces similar past fixes as a Flashback toast.

**Three-tier stack summary:**
> **TermDeck** — browser PTY multiplexer with per-panel metadata, 7 layouts, 8 themes, onboarding tour.
> **Mnestra** — persistent developer memory MCP server. pgvector + hybrid search. Works with Claude Code, Cursor, Windsurf, Cline, Continue.
> **Rumen** — async learning layer. Runs on a cron, reads the memory store, synthesizes insights, writes back.

**Install block:**
> ```
> npx @jhizzard/termdeck
> ```
> No global install needed. Node 18+. Docs: https://termdeck-docs.vercel.app

**Honest limits paragraph (required in Show HN body + README "What Flashback is not"):**
> Flashback fires on pattern-matched error strings from the PTY output analyzer. If the analyzer misses your error class, no flashback. It's a shortest-path to a memory *you already wrote* — if the memory isn't there, the feature does nothing. Mnestra reaches out to Supabase for storage and OpenAI for embeddings; a fully-local path (SQLite + local embeddings) is on the roadmap but not shipped in v0.3.5. Validated against one developer's store (~3,527 memories). No multi-user data yet.

---

**End of NAMING-DECISIONS.md.**
