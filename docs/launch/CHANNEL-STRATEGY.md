# TermDeck Launch Channel Strategy

**Author:** Sprint 14 T3. **Date:** 2026-04-17. **Target launch window:** Tue/Wed 2026-04-21 or 2026-04-22, 08:00 PT.

## The audience reality

Josh has real distribution and none of it overlaps with the default devtool launch playbook:

- **Strong:** Facebook (personal + Nashville Chopin community), Instagram (visual-first network), direct-message reach into Unagi alumni and developer friends (David, Jonathan, Yasin already warm).
- **Zero:** Hacker News karma, X/Twitter followers, Medium followers, dev.to followers, no mailing list, no Product Hunt history.
- **Neutral:** LinkedIn (dormant but intact professional graph), GitHub (three repos, zero stars).

The launch collateral in `docs/launch/` was drafted assuming HN is the primary channel. It is not. HN is a **secondary bet** we try to win by seeding it from channels where Josh actually has reach. Everything below inverts the default order.

## Channel tiers

| Tier | Channel | Role | Expected output |
|------|---------|------|-----------------|
| 1 — Own reach | Facebook, Instagram, direct DMs, LinkedIn | Seed traffic + first stars | 20–60 stars, 5–15 real testers |
| 2 — Bootstrap | Hacker News (Show HN), dev.to, Reddit r/commandline + r/selfhosted | Cold developer audience | Unpredictable — win condition is front-page HN for >1 hour |
| 3 — Cross-post | X/Twitter thread, LinkedIn long-form | Link aggregators for people arriving from Tier 1/2 | Low organic; exists so the story is linkable |
| Skip | Medium, Product Hunt, r/programming | Poor fit or wrong time | — |

## Phase 1 — Leverage existing reach (launch day T-0 through T+2h)

1. **Instagram Reel / Story first.** The Flashback demo GIF (`docs/screenshots/flashback-demo-pre-sprint5.gif`) is the single most shareable asset we have. Post as a Reel with a 10-second voiceover: "I'm launching this thing tomorrow — it's tmux in your browser that remembers every bug you've fixed. Link in bio." This warms the audience before the developer channels see it.
2. **Facebook post, same GIF.** Longer caption — one paragraph on why (losing hours re-debugging), one on what (browser terminal + memory), link to the GitHub repo. Josh's FB network includes ~8 working developers who will click through; that's our Show HN comment seed.
3. **Direct DMs, personalized.** David, Jonathan, Yasin get a message the night before: "Launching TermDeck tomorrow morning 8am PT. If you have 10 minutes around then, the best thing you can do is read the Show HN post and leave a real comment — anything substantive, even criticism." Do NOT ask for upvotes. Ask for comments, because HN ranks on early comment quality, not vote count.
4. **LinkedIn post** at T+1h using the `linkedin-post.md` draft. Cross-link to the GitHub repo, not the HN post (LinkedIn audience won't engage on HN anyway).

Goal at T+2h: 15–30 GitHub stars from Josh's own network, the repo no longer looks dead, and 3–5 friends are primed to comment on HN.

## Phase 2 — Bootstrap new channels (launch day T+2h through T+24h)

### Hacker News (the one that matters)

- **Account prep this week (before launch):** If Josh doesn't already have an active HN account, create one **today** and spend 15 minutes over the next 3 days leaving genuine comments on 3–4 devtool / terminal / memory-system posts. Never mention TermDeck. Goal: ~5–10 karma, account age >3 days, so the Show HN post isn't shadow-filtered as a throwaway.
- **Timing:** Tuesday or Wednesday, **08:00 PT** (11 ET / 16 UTC). Avoid Monday (catch-up day) and Thursday/Friday (weekend decay).
- **Post:** Use `show-hn-post.md` verbatim. Title starts with `Show HN:`. Link goes to the GitHub repo, not the docs site (HN distrusts marketing pages).
- **First 60 minutes are everything.** Josh stays at the keyboard. When the pre-seeded friends comment, Josh replies substantively within 2–3 minutes — not thank-yous, actual engineering answers. The comment playbook in `docs/launch/comment-playbook.md` covers the predictable objections (why not tmux, why browser, why another memory system).
- **Do not cross-post the HN link elsewhere in the first hour.** HN detects voting rings. Let ranking come from on-site behavior.

### dev.to

- Cross-post `devto-draft.md` (the 4+1 orchestration story) **the day after HN**, not simultaneously. dev.to's algorithm favors long-form "I built this" narratives regardless of follower count, and the 4+1 pattern is the most novel thing we have to talk about. Tag it `#devtools #terminal #ai #opensource`.
- Link back to the HN discussion in the footer — dev.to readers love seeing the receipts.

### Reddit

- **r/commandline:** Post 24–48h after HN using the angle "Show r/commandline: I built a browser-based tmux with persistent memory." Reference the HN thread. Mods there are fine with self-promo when it's genuine and on-topic.
- **r/selfhosted:** Same angle, reframed — emphasize that the whole stack runs on your own Supabase project, no hosted TermDeck service. This subreddit rewards "you own the data" framing.
- **Do NOT post r/programming.** Auto-removed for self-promo, and the audience is hostile to "I built a thing" posts without a technical deep-dive.

### X/Twitter

- Post `twitter-thread.md` at T+3h (after HN has stabilized on the front page or not). Zero followers means zero organic reach — the thread exists so that people arriving from FB / LinkedIn / HN who prefer reading on X have a link, and so future blog posts can quote-tweet it. Cross-link from Instagram bio. Treat engagement as a bonus, not a plan.

## Launch day hour-by-hour (Tuesday 2026-04-21, all times PT)

| Time | Action | Channel |
|------|--------|---------|
| T-24h (Mon evening) | Send "launching tomorrow" DMs to David, Jonathan, Yasin, and 2 more devs | Direct |
| T-12h (Mon 8pm) | Post Instagram Reel + Story with Flashback GIF | IG |
| T-1h (07:00) | Final check: `npx @jhizzard/termdeck` works from a clean dir; GitHub repo README renders; Mnestra + Rumen health endpoints green | Internal |
| **T+0 (08:00)** | **Submit Show HN post** | HN |
| T+5min | Facebook post with GIF + GitHub link | FB |
| T+15min | DM friends: "It's live, here's the HN link — leave a real comment if you can" | Direct |
| T+30min | First wave of HN comments should appear; Josh replies within 2 min to each | HN |
| T+1h | LinkedIn post | LinkedIn |
| T+3h | X/Twitter thread | X |
| T+6h | Check HN ranking. If front page: do nothing. If not: post in r/commandline with new angle. | HN/Reddit |
| T+24h (Wed 08:00) | Publish dev.to post linking back to HN thread | dev.to |
| T+48h (Thu) | r/selfhosted post, reference both HN and dev.to | Reddit |
| T+7d | Write retrospective in `docs/launch/LAUNCH-RETRO.md`, decide on Product Hunt submission | Internal |

## What success looks like (realistic)

- **Floor (70% confidence):** 50–100 GitHub stars, 10–20 genuine users trying `npx @jhizzard/termdeck`, HN post gets 5–15 upvotes and slides off new/ within 2h. This is still a win — it gives us a dev.to post, a Reddit thread, and a baseline to iterate.
- **Mid (20%):** HN front page for 2–6 hours. 300–800 stars, real feedback flood, 2–3 bug reports on install issues, one or two "competitor" posts surface that we need to respond to.
- **Ceiling (10%):** HN top 10, 1500+ stars, a Fly.io / Vercel / Warp person reaches out, we get invited to write a longer post somewhere. Plan for this in a stretch sense only — do not optimize for it.

## What NOT to do

- **Don't post r/programming.** Anti-self-promo mod rules will remove it and may shadow-ban the account.
- **Don't buy upvotes or coordinate votes.** HN detects voting rings and will flag the post. Coordinating *comments* from friends is fine; coordinating *votes* is not.
- **Don't submit to Product Hunt on launch day.** PH needs a landing page with a demo video, not a GitHub repo. Revisit after v0.4 ships a landing page.
- **Don't spread across more than the channels listed above.** Every extra channel (Indie Hackers, Lobste.rs, Tildes, HN Who's Hiring, Mastodon, BlueSky, etc.) costs attention that should go to replying to HN comments in the first 2 hours. Focus > coverage.
- **Don't use Medium.** Paywall + external-link penalty make it strictly worse than dev.to for devtools. If we want long-form later, cross-post the dev.to piece to the docs site instead.
- **Don't promise features in comments.** If HN asks "does it do X" and the answer is "not yet," say so. Over-promising in launch threads is a reputation sink that outlasts the launch.

## Handoff

T4 owns the execution pipeline (`docs/launch/PUBLISH-PIPELINE.md` + `scripts/publish-launch.sh`) that turns this strategy into runnable steps. This doc is the **why and when**; T4's doc is the **how**.
