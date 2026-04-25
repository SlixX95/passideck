# T4 — Launch collateral: Show HN, Twitter, LinkedIn, dev.to

## Why this matters

While T1/T2/T3 close the audit delta, the launch post itself still needs to be written. Josh plans to launch tomorrow (2026-04-16 or later the same day). Marketing copy cannot be generated at the last minute — it needs to be drafted now, reviewed while the code work finishes, then tightened into final form.

Your job is to produce four different launch copy drafts, each targeting a different channel's voice and reader expectations. They will be reviewed together, edited, and posted over the first 24 hours after the v0.3 tag + docs-site deploy lands.

## Scope (T4 exclusive ownership)

Create four new files, all in `docs/launch/`:

- `docs/launch/show-hn-post.md` — Hacker News Show HN submission
- `docs/launch/twitter-thread.md` — Twitter/X thread, 6-10 tweets
- `docs/launch/linkedin-post.md` — LinkedIn standalone post (no thread)
- `docs/launch/devto-draft.md` — dev.to article, 1,200–2,000 words

**Do not touch any other files.** You read plenty of other files as inputs, but you write only these four. If you want to reference a number or a quote, cite the source path inline in the draft (e.g. "see `docs/launch/LAUNCH-STATUS-2026-04-15.md` section 2").

## Input reading list

Read these files before writing a single word:

**Authoritative status (start here):**
- `docs/launch/LAUNCH-STATUS-2026-04-15.md` — the 7-section synthesis. This is your ground truth for what to say and what NOT to say.
- `docs/launch/NAMING-DECISIONS.md` — for the "honest limits" paragraph quoted verbatim in the README. Reuse this tone.

**Project description:**
- `README.md` (TermDeck root) — for product framing
- `~/Documents/Graciella/rumen/README.md` and `~/Documents/Graciella/rumen/install.md` — for Rumen details
- `~/Documents/Graciella/engram/README.md` (the Mnestra repo) — for Mnestra details

**Audits (use quotes as social proof):**
- `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck_post_sprint_audit.md` — Claude Opus 4.6 audit, 9.25/10
- `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck_sprint4_audit.md` — Gemini 3.1 Pro audit, 9.5/9.0/8.5
- `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck_analysis_claude.md` — earlier audit for historical context

**Technical milestones:**
- `docs/RUMEN-PLAN.md` — the original cognitive loop design
- `docs/RUMEN-UNBLOCK.md` — the unblock procedure (cite the 19:47 UTC kickstart milestone)
- `docs/sprint-4-rumen-integration/STATUS.md` — the 4+1 orchestration artifacts

## Deliverable: four drafts

### 1. `show-hn-post.md` — Hacker News Show HN

**Format constraints:**
- **Title:** 80 characters max. Must start with "Show HN: ". Should name the product and hint at novelty. Examples of good HN titles: "Show HN: TermDeck – a terminal that remembers what you fixed last month", "Show HN: An async learning loop for your developer memory".
- **Body:** 500-1,500 characters (HN is tight). No more than 3 short paragraphs. Link to GitHub, npm, docs-site.
- **First comment (the clarifier):** HN convention is to post a clarifying first comment from the author explaining what you want feedback on. Draft this separately in the same file under a `## First comment` heading. 300-800 characters.

**Tone:** Direct, technical, honest. No marketing language. HN hates hype. Skeptics will chase every claim, so only make claims you can defend with a file path or a query result. Use the "What Flashback is NOT" honest limits from the README as your model — HN respects vulnerability.

**Hook ideas (pick one, don't use all):**
- The closed loop — "your terminal notices when you're stuck and offers a memory without asking"
- The async learning — "a pg_cron job reads what you did today and synthesizes insights while you sleep"
- The 4-tier cognitive stack — "I built a memory system that keeps thinking after I stop working"

**Must include:**
- One concrete number (e.g., "first kickstart ran against 3,527 memories → 111 insights in one pass")
- GitHub link
- `npx @jhizzard/termdeck` quickstart
- Honest limits (one or two bullets from the README's "What Flashback is NOT")
- The dual audit scores as social proof (one line: "Two independent Opus 4.6 / Gemini 3.1 Pro audits scored the stack at 9.25 / 9.5 /10 — see `docs/launch/LAUNCH-STATUS-2026-04-15.md`")

**Must NOT include:**
- "Revolutionary", "game-changing", "paradigm shift"
- Emojis in the title
- Comparisons to Cursor / Copilot in a superior tone — HN mods will flag it
- Promises about v0.4 / v0.5 (present-tense what exists today only)

### 2. `twitter-thread.md` — Twitter/X thread

**Format constraints:**
- 6-10 tweets.
- Each tweet ≤ 280 characters. Count characters.
- Tweet 1 is the hook (must work standalone — many readers only see the first tweet).
- Tweet 2-N build the story.
- Last tweet has the CTA (link to GitHub + npm).
- One tweet should reference the hero GIF (which Josh will capture — leave a `[GIF ANCHOR]` placeholder note where the GIF should be attached).

**Tone:** Conversational, slightly more playful than HN. You can use "🧠" / "⚡" sparingly but don't lead with emojis. Threading convention: `1/` at the end of tweet 1, `2/` at the end of tweet 2, etc. The last tweet ends with `/fin` or `🧵 end`.

**Hook ideas (tweet 1 must be great):**
- "I built a terminal that notices when I'm stuck and offers the memory of how I fixed it last month. No asking. No querying. 1/"
- "The LLM is stateless. My developer memory isn't anymore. 1/"
- "A terminal + a memory store + an async learning loop = a tool that keeps thinking after I stop working. 1/"

**Must include at some point:**
- The `npx @jhizzard/termdeck` one-liner
- A concrete milestone (111 insights in one kickstart, or the 3,527 memory count)
- Link to GitHub in the final CTA tweet
- An acknowledgment that this is a solo-dev v0.3 release (authenticity)

### 3. `linkedin-post.md` — LinkedIn standalone post

**Format constraints:**
- 1,300-3,000 characters (LinkedIn's sweet spot).
- No thread — single post.
- Line breaks are your friend on LinkedIn. Short paragraphs, plenty of whitespace.
- No hashtag spam — 3-5 relevant hashtags at the end MAX.

**Tone:** Professional, narrative-first. LinkedIn rewards personal stories more than HN does. You can lead with the "why" — the problem you were trying to solve, the failed prior attempts, the moment you realized the async loop was the missing piece. Build up to the reveal. Close with a CTA that invites feedback and a link.

**Structure suggestion:**
1. Hook paragraph (1-2 lines) — the frustration / the question
2. The insight (1-2 paragraphs) — what you realized about LLM statelessness and memory
3. What you built (1 paragraph) — the three-package stack, named, with concrete numbers
4. Honest limits (1 paragraph) — vulnerability = credibility on LinkedIn
5. CTA (1-2 lines) — "Would love feedback from folks who've hit the same wall. GitHub: ..."
6. Hashtags: `#DeveloperTools #LLM #OpenSource #CognitiveArchitecture #DevExperience` or similar (pick 3-5)

### 4. `devto-draft.md` — dev.to article

**Format constraints:**
- 1,200-2,000 words.
- Front matter block with title, description, tags, cover image reference.
- Section headings (H2, H3) for scannability.
- Include at least one code block with the `npx @jhizzard/termdeck` quickstart.
- Reference images: the hero GIF (path `/docs/screenshots/flashback-demo.gif`) and optionally the architecture diagram from the README.

**Tone:** Technical tutorial meets build-in-public narrative. dev.to readers are developers building similar things — they want to understand the architecture decisions, not just the pitch. Treat them like engineers who will clone the repo and read the code if you say something interesting.

**Required sections (at minimum):**
1. **Intro** — the problem (200-300 words)
2. **The cognitive stack** — the four tiers, what each one does, why they're separated (400-600 words)
3. **Rumen's cognitive loop** — Extract → Relate → Synthesize → Surface, grounded in the actual code paths (300-500 words)
4. **The 2am 4+1 orchestration story** — how you used TermDeck to build TermDeck with parallel Claude terminals coordinated via an append-only STATUS.md file (200-400 words — this is your most unique narrative)
5. **What's next** — Sprint 5 items landing tonight (test suite, client file split, vector embeddings), v0.4 roadmap (100-200 words)
6. **How to try it** — `npx @jhizzard/termdeck` + the three-tier optional adoption ladder (100-200 words)
7. **Honest limits** — verbatim quote from README's "What Flashback is NOT"
8. **Links** — GitHub repos, npm packages, docs-site (once Josh deploys)

**Front matter template:**

```yaml
---
title: "TermDeck: A terminal that remembers what you fixed last month"
published: false
description: "I built a closed-loop developer memory system: terminal + pgvector store + async Claude Haiku learning layer. Here's how it works and why."
tags: llm, opensource, devtools, postgres
cover_image: 
series: TermDeck v0.3 launch
---
```

## Style rules for all four drafts

- **Ban list:** revolutionary, game-changing, paradigm shift, cutting-edge, next-generation, unleash, harness, leverage (as verb), disrupt
- **No CLI dragons:** if you include a command, test that it would actually work as-is
- **Cite evidence:** every numeric claim needs a source (LAUNCH-STATUS section or a specific file path)
- **Present tense for what exists today, future tense for roadmap items, NEVER mix them in the same sentence**
- **Write in the first person ("I built", "I ran", "I noticed") — this is a solo project, authenticity is your differentiator**
- **Honest limits are a feature, not a disclaimer** — every audit praised the "What Flashback is NOT" section. Reuse it.
- **Date everything** — the launch is post-2026-04-15 19:47 UTC (Rumen kickstart milestone), so use that anchor for "live as of..." claims

## Acceptance criteria

- [ ] All four files exist and are non-empty.
- [ ] `show-hn-post.md` title is ≤ 80 chars and starts with "Show HN: "
- [ ] `show-hn-post.md` body is ≤ 1,500 chars
- [ ] `twitter-thread.md` has 6-10 tweets, each ≤ 280 chars (put the char count after each tweet in parens for the author's review, e.g. `(273/280)`)
- [ ] `linkedin-post.md` is 1,300-3,000 chars
- [ ] `devto-draft.md` is 1,200-2,000 words
- [ ] Every draft cites at least one concrete number (memory count, insight count, LOC count, etc.) with a source path
- [ ] Every draft includes the `npx @jhizzard/termdeck` quickstart command verbatim
- [ ] Every draft has at least one "honest limits" sentence
- [ ] Every draft has a GitHub link and an npm link
- [ ] No banned words (revolutionary, game-changing, paradigm shift, etc.)
- [ ] No draft promises v0.4+ features as available today

## Non-goals

- Do NOT write launch copy for Reddit, YouTube, podcast pitches, cold email, or other channels. Those four files are the scope.
- Do NOT design marketing images, logos, or graphics. Josh will capture the hero GIF separately.
- Do NOT modify the README, LAUNCH-STATUS, or any other existing file. Your four files only.
- Do NOT write a Medium version — same audience as dev.to, duplicated effort.

## Coordination

- Append significant progress to `docs/sprint-5-audit-delta/STATUS.md`.
- You are fully independent from T1/T2/T3. Start immediately.
- Write `[T4] DONE` with word counts for each of the four files when complete.
