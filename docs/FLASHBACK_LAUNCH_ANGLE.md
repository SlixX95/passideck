# Flashback — Launch Angle Writeup

This is the launch positioning document for TermDeck's proactive memory feature. It is **not a marketing brief** — it is the source of truth for how to describe the feature consistently across README, Show HN post, blog, X thread, and demo GIF narration.

Everything here is derived from the feature actually working in the 2026-04-13 Sprint 1 build and verified with a live Mnestra store of 3,397 memories.

---

## What it is

**Flashback** is TermDeck's proactive memory recall. When a terminal panel enters an error state, the output analyzer automatically queries Mnestra for similar errors from the developer's history across all projects and surfaces the top hit as a non-blocking toast on the panel.

The developer doesn't ask. They don't click anything. They don't type a query. The tool notices they hit a wall and offers the memory.

If they click, they get the full context: similarity score, originating project, source type (`bug_fix` / `decision` / `architecture`), timestamp, and full content. If they ignore it, it auto-dismisses in eight seconds. A 30-second per-panel rate limit keeps flapping errors from spamming.

---

## Why it matters

Every LLM starts from zero. Every session starts from zero. Every new terminal is a clean slate. Developers spend meaningful fractions of their lives re-debugging problems they already solved — because the fix is written in a commit message, a Slack thread, a whiteboard photo, a memory in their own head, none of it reachable at the moment they need it.

The existing tools in this space all make you *ask*:

- `claude-mem`, Mem0, Letta, Zep — memory stores. You query them.
- Cursor / Copilot / Continue — in-editor assistants. You ask them.
- Obsidian / Notion AI — notes indexed. You search them.
- Even TermDeck's own `Ask about this terminal` input — you type the question.

Asking is the problem. At the moment you most need a memory, you are by definition not thinking clearly — you are stuck. You don't remember you had the fix; that's the whole issue. You need the tool to notice *for* you.

Flashback is the first terminal feature that does.

---

## The moment

The feature earns its keep in a specific, reproducible moment. Walk through it mentally:

1. You're in a 4-panel TermDeck layout. Panel 2 is a Node server. Panel 3 is a test runner. Panel 4 is `htop`. Panel 1 is your shell.
2. You run a migration in panel 1. It fails with a cryptic Postgres error: `ERROR: column "foo" referenced in foreign key constraint does not exist`.
3. You pause. You've seen this before. Maybe last month? In a different project?
4. Before you can alt-tab to grep your notes, a toast materializes in the corner of panel 1:

   > **FLASHBACK · podium**
   > Found a similar error in **podium** — click to see.
   > *"The foreign key constraint issue on migration 0042 was caused by running the ALTER in a transaction that also created the referenced table. Split into two migrations..."*

5. You click. The Memory tab expands with the full memory, timestamp, and project link.
6. You apply the fix. Ten seconds of friction instead of forty minutes.

**That is the product.** Everything else TermDeck does — PTYs, layouts, themes, metadata, session logs — exists to make that moment possible. The moment is the pitch.

---

## The naming decision

The feature needs a name that is:
- **One word**, so it works as a shareable moment ("TermDeck just had a ___")
- **Evocative of what actually happens** (a memory fragment surfacing unbidden)
- **Not a technical term** ("proactive recall" is accurate and flat)
- **Ownable** — not already claimed by another product in adjacent space

**Finalists:**

1. **Flashback** — one word, cinematic, exactly describes the user-perceived event. "TermDeck just had a flashback." Claim-able — `claude-mem`, Mem0, Letta don't use it.
2. **Déjà vu** — closer to the exact feeling but accent character is a usability hazard in code, CLI, URLs, and hashtags.
3. **Recall** — correct but noun-first and overloaded (Microsoft Recall ships a competing product).
4. **Ping** — too generic; sounds like a notification, not a memory.

**Chosen: Flashback.** Adopt everywhere — toast header, server event type (`flashback` replaces `proactive_memory`), docs, README feature list, CHANGELOG entry.

---

## One-line positioning

Three tested angles, ordered by confidence:

1. **"The terminal that remembers what you fixed last month."** — Most concrete. Good for Show HN title, README hero, blog post headline.
2. **"tmux, but it learns while you work."** — Good for X/Twitter threads, aimed at terminal power users who will recognize tmux.
3. **"Your terminal just had a flashback."** — Good as a demo GIF caption or a single tweet, not a product tagline.

Use (1) for written contexts, (2) for social, (3) as the reaction line when someone shares the GIF.

---

## The shareable moment (GIF spec)

Launch traction in 2024–25 tooling has been single-GIF-driven. Copilot was tab-to-accept. Cursor was Composer. v0 was generate-from-prompt. TermDeck's shareable moment is **the Flashback firing**. One GIF, 10–14 seconds, no narration, no cursor chatter:

**Storyboard:**

| Beat | Duration | Content |
|---|---|---|
| 1 | 0.0–2.0s | 4-panel 2x2 TermDeck dashboard in Tokyo Night theme. Calm. Real work visible in each panel. |
| 2 | 2.0–3.5s | Panel 2 (top-right, shell) runs a command. Command fails with a red error. |
| 3 | 3.5–4.2s | Half-second of silence. Cursor doesn't move. **This pause is critical.** It is the moment the user could ask but hasn't yet. |
| 4 | 4.2–5.5s | Flashback toast fades in from the right edge of panel 2, accent-lit, one-line headline. |
| 5 | 5.5–7.5s | Memory snippet renders underneath the headline. 2–3 lines of real memory text. Accent border pulses once. |
| 6 | 7.5–9.5s | Cursor drifts to toast. Single click. Memory tab drawer opens with full expanded memory, similarity badge, project tag. |
| 7 | 9.5–11.0s | Developer's hand (cut) reaches for keyboard. Fix is obvious. |
| 8 | 11.0–12.0s | Fade out to TermDeck wordmark. |

**Capture how:**
- 1920×1080 viewport, browser chrome cropped out.
- `puppeteer-screen-recorder` or QuickTime screen record.
- Real Mnestra store with real memories — do not fake the content.
- Shoot multiple takes; pick the one where the pause in beat 3 is exactly 700ms.

**File:** `docs/screenshots/flashback-demo.gif`. Maximum 4MB for GitHub README embedding. If it exceeds, drop to 900px wide and 15fps.

**Placement:**
- Top of `termdeck` README, above the install instructions.
- First comment on the Show HN post.
- First post of the X thread.
- Landing page of `docs-site/` at `/`.

---

## README restructure

The current README puts install first, features second. After Flashback, flip it:

1. **Hero:** Flashback GIF, no title text. The GIF is the title.
2. **One-line positioning:** "The terminal that remembers what you fixed last month."
3. **Three quickstart commands:** `npm i -g @jhizzard/termdeck`, `termdeck`, open browser. Nothing more in the hero block.
4. **"How Flashback works"** — 4 sentences. The output-analyzer → Mnestra → WebSocket loop. This paragraph is the proof that the GIF wasn't staged.
5. **Architecture** — the three-tier stack: TermDeck (display) → Mnestra (memory) → Rumen (async learning). Keep this concise; link out to per-repo READMEs for detail.
6. **Features list** — after Flashback sells the pitch, the rest (layouts, themes, metadata, PTY, session logs) are supporting evidence.
7. **Install / dev setup / contribution** — at the bottom.
8. **License / contact / badges.**

Current README order is for people who already decided to try it. New order is for people who haven't.

---

## Show HN post template

```
Title: Show HN: TermDeck — the terminal that remembers what you fixed last month

Body:

I spent last Tuesday re-debugging a CORS misconfiguration I had
already fixed three months ago on a different project. The fix was
in a git commit message somewhere. I didn't remember I had the fix.
That is the whole problem.

TermDeck is a browser-based terminal multiplexer with a persistent
memory layer called Mnestra (pgvector + hybrid search) and a
proactive recall feature called Flashback. When a panel's status
transitions to `errored`, Flashback automatically queries your
memory for similar errors across all your projects and surfaces the
top hit as a toast on the panel. You don't ask. It notices.

[Flashback GIF inline]

Architecture is three packages, all MIT:

  - TermDeck — browser PTY multiplexer with metadata overlays
    https://github.com/jhizzard/termdeck
  - Mnestra — persistent dev-memory MCP server for Claude Code,
    Cursor, Windsurf, Cline, Continue. Supabase pgvector, 1536d
    embeddings, hybrid search, recency decay by source_type.
    https://github.com/jhizzard/mnestra
  - Rumen — async learning layer that runs on a cron and
    cross-references new memories against your history.
    https://github.com/jhizzard/rumen

Install:
  npm install -g @jhizzard/termdeck
  termdeck

I built this because I needed it. I am a single developer running
three active projects and a dormant codebase with ~200k lines of
context, and I was losing the same hours to the same errors over
and over again. Flashback has caught six real ones for me in the
last week alone.

Happy to answer questions.
```

**Do not post until:**
- F1.4 screenshots and the Flashback GIF are committed.
- `@jhizzard/termdeck` is actually `npm publish`-ed.
- Mnestra v0.2 is published so a fresh install actually works.
- At least one other developer has installed it from scratch and Flashback has fired for them.

---

## Blog post outline

**Title:** I built a terminal that remembers

**Length target:** 800–1200 words. Long enough to be substantive, short enough to read in one session.

**Structure:**

1. **Cold open — the Tuesday story.** The real CORS fix you re-debugged. Concrete, specific, 3 paragraphs.
2. **The problem framing.** "Every session starts from zero." Contrast with how humans remember things — in flashes, triggered by context, not by queries. Modern tooling doesn't work that way. (200 words.)
3. **What Flashback actually does.** The 4-step loop from this doc, plain language. (200 words.)
4. **Three real flashbacks.** Screenshots of real toasts against real bugs from your own use. Each one is ~150 words of story. (500 words total.)
5. **The architecture, briefly.** TermDeck → Mnestra → Rumen. Why three packages and not one. (150 words.)
6. **Install + invite.** Two lines of install, a link to GitHub, one sentence of "I built it because I needed it."

**Where to publish:**
1. First on your personal site (`joshuaizzard.com/blog` — already live).
2. Cross-post to dev.to a day later.
3. Cross-post to Hashnode same day as dev.to.
4. Share on X with the GIF in the quote tweet.

Do NOT post the blog until 48 hours after the Show HN — let the HN traffic land first so the blog feels like the explainer rather than the pitch.

---

## X thread template

```
1/ I built a terminal that remembers what you fixed last month.

[GIF]

TermDeck is a browser-based terminal multiplexer with an async
learning layer. When a command fails, it automatically surfaces
similar errors from your memory across all projects. You don't
ask. It notices.

2/ The moment that earned the feature its name:

Running a migration in panel 1, unfamiliar Postgres error, I'm
about to reach for docs, and a memory I wrote 3 weeks ago in a
different project surfaces unprompted. Ten seconds of friction
instead of forty minutes.

I called it Flashback.

3/ The stack:
- TermDeck — browser multiplexer (Node + WebSocket + xterm.js)
- Mnestra — pgvector + hybrid search, 6 MCP tools, consumes MCP
  from Claude Code / Cursor / Windsurf / Cline / Continue
- Rumen — async learning layer, runs on a cron, cross-references

All three are MIT and live on GitHub.

4/ Install:
  npm i -g @jhizzard/termdeck
  termdeck

Three commands. Works in Chrome, Safari, Firefox. Requires Node
18+. Supabase optional (zero-config local mode works standalone).

GitHub: https://github.com/jhizzard/termdeck

5/ I built this because I was losing real hours to the same
errors on different projects. Flashback caught six real ones for
me in the last week. I am one developer, so this is the honest
scale of the validation — but it is meaningful to me.

Happy to talk shop if anyone's interested.
```

Thread lives on X and Bluesky. Run both simultaneously. X gets the HN crowd, Bluesky gets the indie devtools crowd.

---

## What this is not

To keep the pitch honest, here is what Flashback is **not**, in the voice of a skeptical HN commenter:

- **Not magic.** It fires on pattern-matched error strings from the PTY analyzer. If the analyzer misses your error class, no Flashback.
- **Not a replacement for reading docs.** It's shortest-path to a memory *you* already wrote. If the memory isn't there, the feature does nothing.
- **Not local-only by default.** Mnestra reaches out to Supabase for storage and OpenAI for embeddings. There is a fully local path (SQLite + local embeddings) planned but not shipped in v0.2.
- **Not free forever.** Embeddings cost fractions of a cent per memory, but you pay OpenAI. Self-hosted embeddings are on the roadmap.
- **Not proven at scale.** v0.2, validated against 3,397 real memories in one developer's store. No multi-user data yet.

Publish this section in the README as **"What Flashback is not"**, between "How it works" and "Install". Readers who are pre-filtering for hype will forgive a lot if the pitch admits its own limits upfront.

---

## Success metrics (post-launch)

Track in this order of priority:

1. **GitHub stars after 72 hours.** Target: 250+. Compare against claude-mem's launch trajectory.
2. **Number of unique `npx @jhizzard/termdeck` installs in week one.** Requires telemetry you don't have yet — parked for Sprint 3.
3. **HN front-page time.** Target: 4 hours above the fold.
4. **X thread impressions.** Target: 50k.
5. **One external developer documenting a real Flashback in the wild.** This is the validation that matters — someone who didn't build it saw it fire and wrote about it.

Stop measuring at two weeks. If metrics 1–5 look bad, do a post-mortem, rework positioning, relaunch in 4 weeks under a refined angle. Do not keep pumping a launch that didn't land.

---

**End of FLASHBACK_LAUNCH_ANGLE.md.**
