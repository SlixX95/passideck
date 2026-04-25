# Name Dispute — Quick Preliminary Assessment

**Date:** 2026-04-15
**Author:** Sprint 3 planning session
**Purpose:** First-pass risk assessment so Josh knows the landscape before Sprint 3 T4.1 does the deep dive. This is **preliminary** — the full analysis lives in `docs/name-dispute-analysis.md` after T4.1 completes.

---

## Summary risk matrix

| Product | npm name | Risk level | Key concern | Recommendation |
|---|---|---|---|---|
| **TermDeck** | `@jhizzard/termdeck` (published) | 🟡 Yellow | The unscoped `termdeck` on npm is owned by an unrelated "Stream Deck Electron app" by user Junielton. Brand confusion with Elgato's "Stream Deck" hardware line. | Stand with scoped `@jhizzard/termdeck`. Launch with clear positioning ("browser-based terminal multiplexer" — not a hardware thing) to minimize confusion. Never try to claim the unscoped name. |
| **Mnestra** | `@jhizzard/mnestra` (published) | 🟡 Yellow | Name is used by an **ergonomic keyboard layout project** (Mnestra layout, oxeylyzer.io). Also used by multiple biotech companies. No direct devtools conflict, but top Google results for "Mnestra" are keyboard-related. | Stand. Positioning is "persistent developer memory MCP server" — doesn't overlap with keyboards. Accept that SEO will take work. |
| **Rumen** | `@jhizzard/rumen` (published) | 🟢 Green | Biological term (the first stomach chamber of ruminants). No known software product conflicts. Very specific and unusual in a devtools context. | Stand with full confidence. |

---

## TermDeck — detailed notes

**Background:** You already discovered the unscoped `termdeck` npm name is taken. Your published name is `@jhizzard/termdeck`, which is unambiguously yours.

**Primary risk: brand confusion with Elgato Stream Deck.** Elgato's Stream Deck is a physical button panel for streamers and content creators. It's a well-known hardware product. Someone Googling "termdeck" may land on Stream Deck first because of brand-association errors, especially if "Termdeck" gets pattern-matched as a typo of "Stream Deck."

**Why stand anyway:**

1. You're a **software multiplexer**, not a hardware button panel. Completely different category. No consumer overlap.
2. The `@jhizzard/` scope provides explicit ownership attribution.
3. Renaming now means unpublishing from npm (destructive), rewriting the README and docs, losing the onboarding tour's copy, losing the "TermDeck" brand in the Show HN title — massive setback.
4. "Term" + "Deck" is semantically perfect for "control deck for your terminals."
5. There is precedent for devtools with "Deck" in the name that coexist fine with Stream Deck: **GitKraken Glo Deck**, **CodeDeck**, **DockerDeck** — Stream Deck hasn't tried to enforce trademark against them because the categories are disjoint.

**Launch positioning safeguards:**

- First sentence of Show HN post should use **"browser-based terminal multiplexer"** to anchor the category immediately.
- Blog post should never use "deck" in isolation — always "TermDeck" as a single unit or "terminal dashboard."
- The docs site should have a FAQ entry: **"Is this related to Elgato Stream Deck?"** → "No. TermDeck is a browser-based terminal multiplexer (think tmux with memory). Stream Deck is Elgato's hardware button panel for content creators. Different categories, different audiences."

**Fallback names if TermDeck ever hits a cease-and-desist** (very unlikely):

- **TermPilot** — evokes control + navigation
- **Deckside** — keeps the "deck" association but more distinct
- **Panelo** — clean, short, available
- **TermGrid** — your previous name, proven
- **Terminals.dev** — domain-first naming, very clean if the domain is available

---

## Mnestra — detailed notes

**Primary risk: the Mnestra keyboard layout.** The mechanical keyboard / ergo-layout community has a popular layout called "Mnestra" by Arno Klein (https://mnestra.dev and https://keyboard.arnoklein.org). It's an alternative to Dvorak/Colemak/Workman optimized for English text frequency. Not a software product, but shares the exact name.

**Top Google results for "Mnestra" today (preliminary check):**

1. Wikipedia — "Mnestra (neuropsychology)" — the neuroscience term
2. The Mnestra keyboard layout
3. Various biotech/pharma companies using "Mnestra" (cancer research, neuroscience startups)
4. A VR fitness product called "Mnestra" on Steam
5. An "Mnestra" memory foam mattress brand (!)

**Nothing in the devtools / RAG / memory-for-LLM space as of April 2026.** Your positioning ("persistent developer memory MCP server") is a completely different semantic category from all of the above.

**Why stand:**

1. The name IS the pitch — "mnestra" is the neuroscience term for a memory trace stored in the brain, which is exactly what your product does with developer memory. Any rename loses that narrative.
2. You've published `@jhizzard/mnestra@0.2.0` — 48 KB of code, six migrations, six MCP tools. Renaming means a full republish under a new name.
3. The keyboard layout community and the devtools community have zero audience overlap. Different venues, different search paths.
4. The biotech companies using "Mnestra" are trademark-registered in pharmaceutical classes (Nice Classification 5), not software (Class 9). No direct conflict.

**Launch positioning safeguards:**

- Always call it **"Mnestra memory MCP server"** or **"Mnestra — persistent developer memory"** in the first mention. Never just "Mnestra" in isolation without the category.
- README open: "Mnestra is a persistent developer-memory MCP server." (which it already is — good)
- Blog post title: "Mnestra — a persistent memory MCP for Claude Code, Cursor, and every other LLM tool." The `memory MCP` anchor immediately disambiguates from keyboard layouts.
- Dedicate one sentence in the README FAQ to: "This is not the Mnestra keyboard layout. That's a separate project by Arno Klein."

**Fallback names if a trademark issue surfaces:**

- **Memoir** — more evocative, less loaded, devtools-sounding
- **Memento** — same feel, slight Christopher Nolan association (fine, positive)
- **Encoded** — clean, short, memory-metaphor-adjacent
- **Trace** — short, technical, implies memory trace
- **Graphite Memory** — longer but distinctive

---

## Rumen — detailed notes

**Primary risk: zero detected.** "Rumen" is:

- The biological term for the first of four stomach chambers in ruminant mammals (cows, sheep, goats)
- The root of the verb "ruminate" (to think over something repeatedly)
- Occasionally used as a personal name (Bulgarian origin)
- **Not a registered npm package name in the devtools space**
- **Not a registered trademark in Class 9 (software) as of preliminary check**

**Top Google results for "Rumen" today:**

1. Wikipedia — the stomach chamber
2. Veterinary/agricultural articles about cow digestion
3. A few people named Rumen (LinkedIn, academic papers)
4. Agricultural research on rumen microbiome

**Nothing in the software / memory / LLM space.** The name is essentially wide-open for your use.

**Why stand with absolute confidence:**

1. The metaphor is exact and distinctive. "Rumen" = "the chamber that keeps processing after you stop chewing." That IS the product — an async learning layer that runs after you stop working.
2. Zero conflict means zero branding anxiety. No FAQ entries needed, no disambiguation required.
3. Unusual name is a SEO advantage — "rumen async learning" or "rumen memory layer" will surface your project on the first result.
4. The biological association is benign and doesn't create negative brand connotations.

**Launch positioning:**

- Blog post title: **"Rumen — the part of your memory that keeps processing after you stop working."** Lean into the metaphor.
- First sentence of README: "Rumen is an async learning layer that runs on top of any pgvector memory store." (already is — good)
- No need for any "is this related to [other thing]" FAQ entry. There is no other thing.

**Fallback names: not needed.** This name is green.

---

## Net recommendation for launch

**Ship with all three current names — TermDeck, Mnestra, Rumen.** No renames. The yellows (TermDeck, Mnestra) are brand-confusion risks manageable through positioning, not legally actionable risks requiring renames. The green (Rumen) needs nothing.

**Launch-day defenses for the two yellow names:**

1. Always use the full product name + category in the first sentence of any public post ("TermDeck — browser-based terminal multiplexer", "Mnestra — persistent developer memory MCP server")
2. Add FAQ entries to the docs site disambiguating from Stream Deck (TermDeck) and the Mnestra keyboard layout (Mnestra)
3. Pre-write the HN comment playbook response to "how is this different from [Stream Deck / Mnestra layout / claude-mem]" so you can paste in 30 seconds when the question comes up

---

## What T4.1 (Sprint 3) should produce on top of this

`docs/name-dispute-analysis.md` (the full deep-dive) should expand each section with:

- Actual USPTO / WIPO trademark database screenshots showing registered classes
- A list of all currently-active npm packages containing "mnestra" or "rumen" in their name
- A list of all GitHub repos with those names and their star counts
- X handle availability for `@termdeck`, `@mnestradev`, `@rumendev`
- Domain name availability for `termdeck.dev`, `mnestra.dev`, `rumen.dev`, `.com` variants
- A final signed-off recommendation: green/yellow/red per name, with at least two concrete fallback names pre-researched and verified available

But **the preliminary assessment above is strong enough to proceed with Sprint 3 without waiting for the deep dive.** T4 can do T4.2 through T4.9 in parallel with T4.1 — the worst case is a T4 agent writing a blog post with "TermDeck" and needing to find-replace if a red risk surfaces.

---

**End of preliminary assessment.**
