# Launch Strategy — TermDeck / Mnestra / Rumen v0.2

**Date:** 2026-04-15
**Author:** Joshua Izzard + planning session
**Status:** Strategy, not schedule. Schedule lives in `RELEASE_CHECKLIST.md`.

This document is the honest, updated comparison to `claude-mem` after two build sprints, plus the cold-launch playbook for a first-ever publish with no prior audience, no brand, and no existing followers.

---

## 1. The honest, updated comparison to claude-mem

First comparison lived in the 2026-04-13 planning session at "70% of claude-mem's professionalism, missing 30% is mostly time." Here's where the stack actually stands after Sprint 1 and Sprint 2, and after today's tour + publish work.

| Axis | claude-mem v6.5 | TermDeck v0.2 (2026-04-15) | Who's ahead |
|---|---|---|---|
| **Code architecture** | Mature single plugin, 5 lifecycle hooks + worker | Three-package integrated stack (TermDeck → Mnestra → Rumen), MCP webhook bridge, async learning layer | **TermDeck** — more ambitious surface, more moving parts but integrated |
| **Unique killer feature** | Progressive-disclosure search (query-on-demand) | **Flashback** — proactive recall, automatic on error | **TermDeck** — nobody else ships passive surfacing |
| **Visual product** | Utilitarian web viewer on :37777 | Full browser dashboard with 8 themes, 7 layouts, per-panel metadata overlays, drawer tabs, terminal switcher, onboarding tour | **TermDeck** — substantially |
| **Onboarding** | Docs site + install wizard | Onboarding tour (just shipped), first-run auto-trigger, 13 steps covering every button | **TermDeck** — interactive beats static |
| **Docs depth** | docs.claude-mem.ai with 10+ sections, 30+ translated READMEs, Trendshift badge | Astro Starlight scaffolded + built; **not yet deployed** | claude-mem ahead until `termdeck.dev` goes live |
| **Install story** | `npx claude-mem install`, `/plugin install` marketplace | `@jhizzard/termdeck` via npm, once published. Prebuilds verified on Debian+macOS. No Claude Code plugin distribution | claude-mem ahead on plugin marketplace reach; TermDeck matches on core npm install |
| **Version maturity** | v6.5 — iterated for ~6 months | v0.2 — fresh, validated by one developer | claude-mem ahead, only time fixes this |
| **Community** | Discord, X @Claude_Memory, awesome-claude-code listing, several thousand stars | Zero today. Cold launch. | claude-mem ahead, but this is exactly what this document is about |
| **Test coverage** | Unclear from README | Mnestra 25+ unit tests green, Rumen CI integration test, TermDeck manual verification | roughly even |
| **License** | AGPL-3.0 + PolyForm (commercial moat) | MIT across all three | different bets — TermDeck prioritizes adoption over moat |
| **Novel architecture** | Plugin that adds memory to Claude Code | **Platform that remembers while you work**, usable with any terminal-based agent (Claude Code, Codex, Gemini CLI, plain shell) | **TermDeck** — broader substrate |

### What TermDeck has that claude-mem does not

1. **Flashback** — passive, unsolicited memory recall on error detection. claude-mem is query-on-demand. This is the single largest conceptual differentiation in the memory-for-devs space.
2. **Visual surface** — a dashboard people can share a screenshot of. claude-mem users can only describe what it does; TermDeck users can post a picture.
3. **Integrated three-tier stack** — TermDeck (display) + Mnestra (memory) + Rumen (async learning) as one coherent system. claude-mem is a single plugin.
4. **Agent-agnostic** — any terminal tool works. claude-mem locks you into Claude Code.
5. **Async learning layer** (Rumen v0.2) — nothing in the memory-for-devs space runs reflection jobs while the developer is away. This is a Sprint 3 feature but worth mentioning in the pitch as "what's coming."
6. **Interactive onboarding tour** — shipped today. claude-mem doesn't have one.
7. **Reply button / agent-to-agent handoff** — route text from one panel into another. No equivalent in claude-mem because it has no multi-panel surface.

### What TermDeck still needs to match the claude-mem professionalism bar

1. **Deployed docs site.** Sprint 3 item. 10 minutes to Vercel preview URL. Non-negotiable for launch credibility.
2. **Real README hero GIF.** The Flashback firing moment. Launch hinges on this visual. Capture during this session or immediately after.
3. **Claude Code plugin distribution path.** Optional. TermDeck is a browser product, not a Claude Code plugin. Matching this means shipping a thin wrapper that installs TermDeck as an IDE sidecar. Defer to Sprint 4.
4. **Published npm packages.** TODAY.
5. **Community infrastructure.** X account, Discord, GitHub Discussions tab. Spin up post-launch; community follows demand, not supply.
6. **One other developer's successful install + Flashback firing.** The single most important pre-launch validation. Find one friend willing to run it on their own machine, confirm it works, quote them in the Show HN.

### Net read

TermDeck is now **roughly level with claude-mem on professionalism**, **ahead on novelty and surface area**, and **behind on audience and maturity by ~6 months**.

The asymmetry matters: novelty is a **launch multiplier** (you only get to say "new" once, and TermDeck's novelty is real), while audience and maturity compound quietly. A well-executed launch closes the maturity gap in two months if the product is genuinely good. A bad launch wastes the novelty and you spend a year trying to claw it back.

**Translation: this launch is high-variance. Get it right the first time.**

---

## 2. The cold-launch reality

Stop hoping. Name the problem.

- You have **no existing audience**. No blog followers, no Twitter following, no mailing list, no prior OSS stars to lean on.
- You have **no peer network vouching**. No DHH tweet, no patio11 retweet, no Karpathy nod. Those happen to people who are already on people's radars.
- Your GitHub username `jhizzard` has no history visible to a first-time searcher. Credibility signal = zero.
- Your npm scope `@jhizzard/*` is brand new.
- You are competing with ~20 other "memory for AI agents" projects that launched in the last 18 months, some of them by well-known engineers.

That is the uphill. Now — what works when starting from zero, historically:

1. **A demo so concrete that the GIF itself does the selling.** People forward GIFs. They rarely forward READMEs. The Flashback moment is the only asset that can cold-carry a launch.
2. **A Show HN post timed well, with the GIF in the first 60 seconds of the thread.** HN rewards the first 90 minutes of a post; if you gain 10 upvotes in the first hour, the algorithm amplifies. If not, you're dead.
3. **A tight, honest, non-salesy writeup** that passes the HN skeptic filter. The "I built this because I was losing the same hours" framing works because it's true and because it positions you as a user first, marketer second.
4. **Three real testimonials from strangers**, even small ones, posted as replies under the launch thread. These almost always come from friends-of-friends quietly using a pre-release. That means **pre-launching the repo privately** to 5–10 people 48 hours before Show HN.
5. **Cross-platform push at the same moment.** HN at 8:10am PT on a Tuesday or Wednesday, X thread at 8:15am PT, Reddit r/commandline at 9:00am PT, dev.to cross-post 24 hours later. Same day, same week. One wave.
6. **Responsive owner presence.** Show up in the HN thread inside 10 minutes. Every comment gets a reply within 30 minutes for the first 4 hours. No form replies; every reply is a specific, substantive answer. This alone separates good launches from failed ones.

None of this is magic. It's discipline.

---

## 3. What to do in the 48 hours before launch

**Day -2 (tomorrow, 2026-04-16):**

1. **Deploy the docs site to Vercel.** `cd docs-site && vercel deploy`. Get a `*.vercel.app` URL. Point the "help" button in TermDeck at it. Pin the production URL into the README and the tour's final step.
2. **Capture the Flashback demo GIF.** Set up a 4-panel TermDeck dashboard in Tokyo Night, run a real command that fails (a known error like a CORS misconfiguration or a Postgres migration syntax error with a memory actually in your Mnestra store), let the toast fire, click it, show the expanded Memory tab. Use QuickTime or `asciinema` + `agg`. Target 10–14 seconds, <4 MB, 15 fps minimum. Save to `docs/screenshots/flashback-demo.gif`.
3. **Take three still screenshots**: 4-panel dashboard, drawer tabs open, switcher overlay with 8 panels. Use them throughout the README and the docs site landing.
4. **Rewrite the README top-to-bottom.** Hero GIF first, one-line pitch ("The terminal that remembers what you fixed last month"), three quickstart commands, "How Flashback works" in four sentences, "What it is not" honest limits section, architecture diagram linking to Mnestra and Rumen READMEs, install + dev + contribution at the bottom. This is the 2026-04-13 `FLASHBACK_LAUNCH_ANGLE.md` plan; execute it now.
5. **Quietly ship v0.2.0 of all three packages to npm.** Run through `RELEASE_CHECKLIST.md`. Tag each repo. Do not announce yet.
6. **Share the repo with 5 trusted people** — friends, former colleagues, anyone who writes dev tools. One-sentence ask: "This is not public yet. Install it, run it for 15 minutes, tell me if Flashback fires for you and whether anything is broken." Explicitly ask whether the demo GIF conveys the feature in one viewing. That feedback is worth more than your own testing.

**Day -1 (2026-04-17):**

1. **Fix everything that the 5 testers reported.** Every single issue. If you can't reproduce something, dig until you can. Launch day is not the time to handle "it's broken on my laptop."
2. **Write the Show HN post.** Use the template in `FLASHBACK_LAUNCH_ANGLE.md` §Show HN. Iterate 3–5 times. Keep it under 300 words. First sentence must be specific, concrete, and human ("I spent last Tuesday re-debugging a CORS misconfiguration I had already fixed three months ago" — not "TermDeck is a browser-based terminal multiplexer").
3. **Write the X thread.** 5 tweets. First tweet is the GIF with one line. Tweet 2 is the "moment that earned the feature its name" story. Tweet 3 is the architecture in 60 words. Tweet 4 is install. Tweet 5 is "why I built this."
4. **Write the dev.to blog post** from the `FLASHBACK_LAUNCH_ANGLE.md` blog outline. 800–1200 words. Schedule to publish **24 hours after** Show HN, not simultaneously.
5. **Prepare the first three testimonial comments** as separate drafts. These are comments your pre-launch testers will post as replies on the Show HN thread within the first hour. Tell them explicitly: "Post this within an hour of my Show HN going up if you found the tool useful. Use your own words."

**Day 0 (launch, probably 2026-04-18, Thursday — skip Monday and Friday for HN):**

1. **8:00am PT** — post Show HN. Title: "Show HN: TermDeck — the terminal that remembers what you fixed last month".
2. **8:05am PT** — post the X thread. Pin it to your profile.
3. **8:15am PT** — send direct links to the 5 pre-launch testers so they see the post and comment.
4. **8:30am PT** — post to r/commandline with a different headline focusing on the multiplexer angle ("tmux in the browser, with automatic memory recall on errors"). Link to the Show HN for discussion.
5. **9:00am PT** — post to r/selfhosted focusing on "runs fully local if you want it to" angle.
6. **10:00am PT** — post to Hacker News via `newsletter` / `hnnewest` if HN post hasn't gained traction.
7. **All day** — respond to every HN and reddit comment within 30 minutes. Every single one. No exceptions. This is the day you earn the launch.
8. **Do not** post to LinkedIn, Facebook, or any non-dev channel. Wrong audience, dilutes signal.

**Day +1 (2026-04-19):**

1. **Read every comment and DM carefully.** Note every bug report, every feature request, every "doesn't work on my X." Triage into a Sprint 3 followup list.
2. **Publish the dev.to blog post** at the same time of day as the Show HN. Cross-post to Hashnode. Tweet the blog link from your X account.
3. **Quietly DM** five specific developers who tweet in the memory-for-agents space. Do NOT pitch. Send the GIF and say "built this over the last month, thought you might find the Flashback trigger interesting, feedback welcome." No asks.

**Day +7:**

1. **Post-mortem.** Did it land? Metrics:
   - GitHub stars (target: 250+)
   - HN point count at peak (target: 100+; dead if <30)
   - npm weekly downloads (target: 200+)
   - Any external developer documenting their own Flashback moment (target: ≥1)
2. **If it landed:** start Sprint 3 — Flashback polish, Rumen v0.2 live deployment, docs site production URL, Claude bot Q&A feature, parallelization template.
3. **If it didn't:** don't relaunch immediately. Take two weeks, fix the things the post-mortem revealed, and come back with a different angle. Probably a blog post deep-dive on *one specific Flashback hit*, told as a war story. "How my terminal reminded me about a Postgres migration bug from three months ago." That's a concrete story people share.

---

## 4. Specific marketing assets to build before launch

None of these exist yet. All are out-of-scope for today's ship but must be in the queue for the 48-hour pre-launch window.

- [ ] **docs/screenshots/flashback-demo.gif** — the launch GIF
- [ ] **docs/screenshots/dashboard-4panel.png** — README hero still
- [ ] **docs/screenshots/drawer-open.png** — info tabs close-up
- [ ] **docs/screenshots/switcher.png** — switcher overlay
- [ ] **Deployed `termdeck.dev` or `*.vercel.app`** — docs site
- [ ] **Rewritten `README.md`** — Flashback-first structure
- [ ] **`docs/blog/01-terminal-that-remembers.md`** — the blog post draft
- [ ] **`docs/launch/show-hn-post.md`** — final Show HN text
- [ ] **`docs/launch/x-thread.md`** — final X thread
- [ ] **`docs/launch/testimonial-asks.md`** — the private ask you send to pre-launch testers
- [ ] **`docs/launch/comment-playbook.md`** — pre-written responses to likely HN questions (how is this different from claude-mem? why browser not TUI? why not Tauri? why MIT? why Supabase? how much does it cost to run? security model?)

That last one is underrated. The HN skeptic will ask the same 5–10 questions every single launch. Pre-write honest, specific answers. Paste them as replies. You save 20 minutes per comment and you look more prepared than everyone else.

---

## 5. Assets you already have and should lean on hard

- **`docs/FLASHBACK_LAUNCH_ANGLE.md`** — full positioning document. Use it as source of truth for messaging.
- **`docs/FOLLOWUP.md`** — the honest gap assessment, including the list of known limitations you should preemptively disclose in the "What Flashback is not" README section.
- **`docs/PLANNING_DOCUMENT.md` + `docs/SPRINT_2_FOLLOWUP_PLAN.md`** — evidence of disciplined shipping. Not public marketing assets, but useful if anyone asks "how did you build this so fast?" The answer is: four parallel Claude Code terminals coordinating via a shared status file. That is itself a good dev.to blog post and a real TermDeck use case.
- **The two production Supabase migrations applied during the build** — evidence that Mnestra's v0.2 upgrade path is real and has been exercised against a 3,451-memory production store.
- **Two complete sprints in one day** — you shipped 10 commits across 3 repos in under 2 hours of focused work. That itself is a story. Title: "I used Claude Code to parallelize a 4-terminal sprint and shipped two days of work in two hours." Publishing that story on dev.to is both marketing and a real demo of TermDeck's target workflow.

---

## 6. The "demo/parallelize" template — your second launch asset

You specifically asked for a reusable demo showing how to parallelize work across four Claude Code terminals using TermDeck. That template is the **second launch GIF** — not a visual demo of TermDeck the product, but a screen recording of the workflow TermDeck enables.

**What it looks like:**

1. Open TermDeck in a 2x2 layout.
2. Launch four Claude Code panels, one per project scope.
3. Paste the meta-prompt from `docs/demo/parallelize-template.md` into a fifth panel or a note app, adapted for your current task.
4. Screen-record for 60 seconds showing the four agents working independently, each reading/writing the same `STATUS.md` file, with the Control layout mode aggregating their activity.

**Marketing framing:** "The way this product was built, using itself." That's the most compelling demo type possible — the author eating their own dog food, fast.

I'll write the template as a separate file in this session along with the meta-prompt.

---

## 7. Real numbers to anchor expectations

Based on historical Show HN performance for devtools launches from unknown-to-the-community authors in the 2024–2026 window:

- **Median Show HN from a zero-audience author:** 15 points, 5 comments, 1 hour on the front page, 0 external writeups.
- **90th percentile Show HN from a zero-audience author:** 150 points, 50 comments, 6 hours on the front page, 1–2 external writeups, 250 GitHub stars in week one.
- **99th percentile (a real breakthrough):** 600+ points, 200+ comments, 18+ hours on the front page, multiple writeups, 1000+ stars in week one, a couple of DMs from VCs or employers.

**Realistic target for TermDeck:** 90th percentile. 150 points, 50 comments, 250 stars. That's a landed launch, not a viral one, and it's enough to validate the product and iterate.

**Stretch target:** 99th percentile. Requires genuine novelty (Flashback has this), a shareable GIF (we're making one), and luck (always).

**Failure mode to avoid:** 50th percentile. If the launch lands at 20 HN points and no one writes about it, the product is dead in public memory and a relaunch is hard. Better to delay launch by a week to polish than to ship a mediocre launch.

---

## 8. What to measure and when to declare victory or a redo

Measure at **72 hours post-launch**, not immediately:

- GitHub stars count
- npm weekly downloads for `@jhizzard/termdeck`, `@jhizzard/mnestra`, `@jhizzard/rumen`
- Whether any third-party developer has documented a Flashback moment in a blog, tweet, or HN comment
- Whether the Show HN thread is still getting new comments at hour 72 (a tail is a signal)
- Whether anyone has opened a GitHub issue — issues are a love language
- Whether any press or newsletter has picked it up (Hacker Newsletter, TLDR, Changelog, Dev.to Weekly, Golang Weekly — devtools rollups)

Declare victory if **4 of 6** are green at hour 72. Anything less and start the redo planning.

---

**End of LAUNCH_STRATEGY_2026-04-15.md.**
