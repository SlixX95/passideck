# TermDeck Launch-Day Publishing Pipeline

Mechanical, step-by-step pipeline for publishing TermDeck v0.3.8 across every channel. The goal is to remove all decision-making from launch day — every step has a source file, a URL, and a copy-paste string.

Companion script: `scripts/publish-launch.sh` runs the pre-flight checks and opens the composer URLs for each channel.

---

## Channel map

| Channel | Audience | Post source | Strength for Josh |
|---------|----------|-------------|-------------------|
| Hacker News (Show HN) | Dev-tool-curious engineers | `docs/launch/show-hn-post.md` | Cold — no karma yet |
| Twitter / X | LLM + tooling Twitter | `docs/launch/twitter-thread.md` | Cold — small follower count |
| LinkedIn | Professional network | `docs/launch/linkedin-post.md` | Medium — real connections |
| Facebook | Friends + local network | Adapt LinkedIn post (personal tone) | **Strong — Josh's biggest reach** |
| Instagram | Personal + creative network | Story with GIF + link in bio | **Strong — Josh's biggest reach** |
| dev.to | Dev-blog reader base | `docs/launch/devto-draft.md` | Cold — first post |
| r/commandline | Terminal enthusiasts | Adapt Show HN | Cold — post after HN hits |
| r/selfhosted | Self-hosters | Adapt Show HN | Cold — post after HN hits |

Josh's strongest channels are **Facebook and Instagram**. Lead the day on cold channels (HN, Twitter, dev.to) to build karma, then lean on FB/IG to push whichever cold post is getting traction.

---

## Pre-launch (T-24h)

Run the script: `./scripts/publish-launch.sh --check`

Manual checklist:

- [ ] **npm version matches** — `npm view @jhizzard/termdeck version` returns `0.3.8`
- [ ] **Docs site is live** — `curl -sI https://termdeck-docs.vercel.app` returns `200 OK`
- [ ] **Flashback GIF loads** — `curl -sI https://raw.githubusercontent.com/jhizzard/termdeck/main/docs/screenshots/flashback-demo.gif` returns `200 OK`
- [ ] **GitHub repo is public and README renders** — open `https://github.com/jhizzard/termdeck`
- [ ] **Release tag exists** — `git tag -l v0.3.8`
- [ ] **Tester feedback collected** — David, Jonathan, Yasin responses reviewed; blockers resolved
- [ ] **HN account ready** — built minimal karma (at least a few comments on other threads), account older than a week
- [ ] **Twitter thread drafted** — tweets 1-7 in Twitter compose drafts, GIF attached to tweet 5
- [ ] **Facebook post drafted** — saved as a draft in FB composer (personal tone, see below)
- [ ] **Instagram story assets** — `flashback-demo.gif` exported to phone; link-in-bio updated to `https://github.com/jhizzard/termdeck`
- [ ] **Calendar blocked** — 4-hour focus block for T=0 through T+4h

---

## Launch sequence (T=0)

Time target: **Tuesday 09:00 America/Chicago** (14:00 UTC) — best overlap for HN US + EU audiences.

Run: `./scripts/publish-launch.sh --launch` — opens all composer URLs in order.

### Step 1 — Hacker News Show HN (T+0 min)

1. Open `docs/launch/show-hn-post.md`
2. Copy the title, paste into the HN submit form
3. Copy the body (if the file includes a body section) into the text area; otherwise leave URL-only with no body
4. Submit
5. **Immediately** post the first comment from `show-hn-post.md` (the "author context" comment) — this is non-optional, it's the standard Show HN pattern and anchors the conversation

URL: `https://news.ycombinator.com/submit`

### Step 2 — Twitter / X thread (T+5 min)

1. Open `docs/launch/twitter-thread.md`
2. Compose tweet 1 of the thread
3. Reply-chain each subsequent tweet — keep the chain intact
4. **Attach `flashback-demo.gif` to tweet 5** (the Flashback reveal tweet)
5. Pin tweet 1 to profile for 48 hours

URL: `https://twitter.com/compose/tweet`

### Step 3 — LinkedIn (T+10 min)

1. Open `docs/launch/linkedin-post.md`
2. Paste the full post as a single LinkedIn post (no thread on LinkedIn)
3. Attach the repo URL as a link preview
4. Submit

URL: `https://www.linkedin.com/feed/`

### Step 4 — Facebook (T+15 min) — **primary reach channel**

Facebook audience is friends, family, and Nashville network — not developers. Lead with the human story, not the stack. See **Facebook post template** below for the adapted copy.

1. Open FB composer
2. Paste the adapted post (shorter, more personal, no acronyms)
3. Attach the `flashback-demo.gif` as the main media (FB auto-loops GIFs in feed)
4. Post publicly (not friends-only) so the link is shareable
5. In the comments, pin a single comment with the repo link + `npx @jhizzard/termdeck`

URL: `https://www.facebook.com/`

### Step 5 — Instagram story (T+20 min) — **primary reach channel**

Instagram doesn't do clickable feed links. Use stories + link-in-bio.

1. Update link-in-bio to `https://github.com/jhizzard/termdeck`
2. Post an Instagram **story** (not a feed post) with `flashback-demo.gif`
3. Overlay text: *"4 months of work shipped. Link in bio."*
4. Add a "Link" sticker pointing at the GitHub repo
5. Optional: post a feed carousel 2-3 hours later with 3 screenshots (dashboard, flashback toast, drawer) — one-line captions per slide

URL (mobile): Instagram app → Story camera

### Step 6 — dev.to article (T+25 min)

1. Open `docs/launch/devto-draft.md`
2. Paste into dev.to editor
3. Set `published: true` in the front-matter
4. Add tags: `terminal`, `opensource`, `ai`, `showdev`
5. Submit

URL: `https://dev.to/new`

### Step 7 — Personal announcement on existing channels (T+30 min)

- Slack / Discord communities Josh is already in: paste the one-line pitch + repo link
- Email to Jonathan, David, Yasin (testers) thanking them and linking to the HN post — ask them to upvote + comment honestly

---

## Post-launch (T+1h to T+24h)

Run: `./scripts/publish-launch.sh --monitor` — opens HN thread, Twitter analytics, and GitHub traffic page.

### T+1h

- [ ] Check HN rank. If on the front page (top 30), do nothing — don't over-engage.
- [ ] If Show HN has comments, respond to each one. Signature response style: acknowledge the question, answer specifically, admit limits, no marketing language.
- [ ] Retweet any replies on the Twitter thread; quote-tweet interesting questions with a thoughtful answer.

### T+3h

- [ ] If HN is getting traction (score ≥ 10), cross-link from Twitter: quote-tweet the HN link with "the conversation is happening here".
- [ ] Post on Josh's Facebook the same HN link — "here's the dev-side conversation if you're into that".
- [ ] Reply to LinkedIn comments.

### T+6h

- [ ] Post to **r/commandline** — adapt Show HN post. Rule: no marketing, just "I built this, here's what it does, here's the repo".
- [ ] Post to **r/selfhosted** — same adaptation.
- [ ] Post to **r/programming** only if HN score ≥ 50 (otherwise skip, r/programming is harsh to low-HN submissions).

### T+24h

- [ ] Screenshot HN thread, Twitter impressions, LinkedIn reactions — save to `docs/launch/LAUNCH-STATUS-$(date +%Y-%m-%d).md`
- [ ] Write a 3-paragraph retro: what landed, what didn't, what to do next.
- [ ] If total unique repo visitors > 500, schedule a follow-up dev.to post in 7 days.
- [ ] If total unique repo visitors < 100, schedule a second Show HN attempt in 30 days with a concrete "what changed since last time" framing.

---

## Facebook post template

Facebook audience isn't developers. Rewrite the LinkedIn post as a personal story. Do not paste the LinkedIn post directly.

```
I've been quietly working on something for the last four months. Today I'm shipping it.

It's a tool that watches what you do in your terminal and remembers it — so the next time you hit the same wall you hit last month, it tells you what worked. My laptop has finally learned to remember what my brain forgets.

It's called TermDeck. It's free, it's open source, and it runs anywhere Node does.

If you're a developer, the install is literally: npx @jhizzard/termdeck

If you're not a developer, and you just want to see what I've been up to: the GIF below is the magic moment. It's the moment the tool I built said "hey, you hit this same error on March 12. Here's what you did to fix it."

Repo + docs: https://github.com/jhizzard/termdeck

Thanks to everyone who listened to me ramble about this at dinner for four months straight. 🙏
```

Tone notes:
- First person, specific dates, specific people
- One emoji at most
- No acronyms (no "LLM", no "PTY", no "RAG")
- GIF does the technical explanation; text carries the emotional through-line
- The pinned comment carries the install command and repo link, so the main post stays human

---

## Instagram story template

Stories are 9:16 vertical. Three-frame sequence:

**Frame 1 — the hook (5s)**
- Background: solid dark (use TermDeck Tokyo Night teal)
- Text overlay: *"Shipped today."*
- Sub-text: *"4 months. One command. Link in bio."*

**Frame 2 — the magic moment (10s)**
- Full-screen `flashback-demo.gif`
- Minimal text overlay: *"my laptop remembers now"*

**Frame 3 — the call to action (5s)**
- Background: screenshot of `docs/screenshots/dashboard-4panel.png`
- Text overlay: *"npx @jhizzard/termdeck"*
- Link sticker → GitHub repo

Save the 3-frame sequence as a Highlight called **"TermDeck"** so it stays on the profile past 24h.

---

## Copy-paste source index

| What | Where |
|------|-------|
| Show HN title + body | `docs/launch/show-hn-post.md` |
| Show HN first comment | `docs/launch/show-hn-post.md` (bottom section) |
| Twitter thread (1-7) | `docs/launch/twitter-thread.md` |
| LinkedIn single post | `docs/launch/linkedin-post.md` |
| dev.to article | `docs/launch/devto-draft.md` |
| Facebook post | This file, "Facebook post template" above |
| Instagram story | This file, "Instagram story template" above |
| Comment playbook | `docs/launch/comment-playbook.md` |

---

## Failure modes + rollback

| Failure | Detection | Response |
|---------|-----------|----------|
| npm package broken on launch day | `npx @jhizzard/termdeck` fails | **Abort launch**, fix, reschedule 24h out. Do NOT post broken links. |
| Flashback GIF 404 | `curl -I` returns 404 | Fix the path in README + twitter-thread.md before posting tweet 5. |
| HN submission auto-dead | Thread has [dead] flag | Email hn@ycombinator.com with context; in the meantime push Twitter + FB + IG as the primary channels. |
| LinkedIn flags the post | Post marked as spam | Appeal via the "request review" button; repost 24h later with lighter link density. |
| Instagram link sticker rejected | Sticker not available | Fall back to "link in bio" only; don't block the launch on it. |

---

## After the launch

Move this file's retro notes to `docs/launch/LAUNCH-STATUS-$(date +%Y-%m-%d).md`. Keep this pipeline doc as the repeatable template for v0.4 and beyond.
