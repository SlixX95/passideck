# Promotion Drafts for TermDeck v0.1.1

> All copy is drafted to be edited before posting. The Show HN title and the tweet thread opener are the most important things to get right — those are the hooks.

---

## 1. Show HN

**Title (80 char max):**
```
Show HN: TermDeck – a browser-based terminal multiplexer for the AI coding era
```

**Body:**
```
Hi HN,

I run 4 Claude Code agents simultaneously across different projects. tmux can't show me which one is thinking, which is idle, and which just hit an error. I built TermDeck to solve that for myself.

It's a browser dashboard with real PTY terminals (one WebSocket per terminal, node-pty under the hood). Each panel has a status dot, a project tag, type detection (Claude Code, Gemini CLI, Python servers, plain shells), per-terminal theming (8 themes), and a metadata strip showing the last command, detected port, and request count for server processes.

Layouts are 6 preset CSS Grid templates (1x1 through 4x2) plus focus and half modes. There's no build step on the client — it's vanilla JS and xterm.js loaded from CDN. The server is Node.js + Express + ws. SQLite for local persistence. There's a Supabase-backed RAG layer that records session events for cross-project memory, but that's optional.

The point is the control room: 8 terminals visible at once, each one self-describing.

It's MIT licensed, ~5000 lines, single `npm install`, no Docker, no compile step. macOS launcher (.app bundle) and Windows installer included so you don't have to open a terminal to launch a terminal multiplexer.

Repo: https://github.com/jhizzard/termdeck

Currently running on macOS and Linux. Windows installer ships but I'd love feedback from anyone who tries it. Roadmap: a control panel that aggregates Yes/No prompts from AI agents into a single dashboard, and an async learning layer (codename Rumen) that runs on Supabase Edge Functions and surfaces relevant past work proactively while you're coding.

Happy to answer anything.
```

**Where to post:** https://news.ycombinator.com/submit
**When to post:** Tuesday-Thursday, 8-10am Pacific. Avoid Mondays (low traffic) and weekends (different audience).
**After posting:** Stay near the laptop for 2 hours. The first hour determines whether it survives the new queue. Reply to every comment quickly. Be technical, not defensive.

---

## 2. Tweet thread (X)

Five tweets. Numbered for clarity, post sequentially as a thread.

**Tweet 1 (the hook):**
```
I run 4 AI coding agents simultaneously across different projects.

tmux can't tell me which one is thinking, which is idle, and which just hit an error.

So I built TermDeck — a browser-based terminal multiplexer that knows what your AI agents are doing.
```
Attach the hero screenshot.

**Tweet 2 (what it actually does):**
```
Each terminal panel has:
- live status dot (green/amber/purple/red)
- type detection (Claude Code, Gemini CLI, Python servers, shells)
- project tag
- last command + detected port + request count
- per-terminal theme (8 themes)
- one WebSocket per terminal, real PTY under the hood
```

**Tweet 3 (the layouts):**
```
6 preset CSS Grid layouts (1x1 through 4x2) plus focus and half modes.

8 terminals visible at once if you want a control room view. Vanilla JS, xterm.js from CDN, no build step on the client.
```
Attach the GIF.

**Tweet 4 (the moat):**
```
Coming next: an async learning layer (Rumen) that watches your sessions, finds patterns from your past work, and surfaces relevant memories proactively.

The LLM is stateless. Rumen isn't.

Built on top of Supabase Edge Functions + a hybrid-search RAG layer.
```

**Tweet 5 (the call to action):**
```
MIT, single npm install, no Docker, no compile step. macOS .app launcher and Windows installer included.

Repo: https://github.com/jhizzard/termdeck

Looking for feedback from anyone running multiple AI agents at once.
```

**Best time to post:** Tuesday/Wednesday morning Pacific. Pin the thread to your profile for the week.

---

## 3. dev.to article

**Title:**
```
Why I built a terminal multiplexer for the AI coding era
```

**Tags:** `webdev`, `productivity`, `opensource`, `ai`

**Body (~800 words):**

```markdown
# Why I built a terminal multiplexer for the AI coding era

I spent fifteen years staring at Bloomberg terminals as a hedge fund manager. Orange on black, four screens deep, every terminal full of context I needed to know what was happening at once. When I left finance to build software, the first thing I noticed was how primitive the developer tooling was for monitoring multiple things at once. tmux is brilliant — but it was built in 2007, for one human typing into one shell at a time.

That's not how I work anymore. I run four Claude Code agents simultaneously across different projects. One is refactoring an auth middleware. One is running a Python dev server with a real test load. One is tailing production logs. One is working through a long migration. tmux doesn't know any of that. Every panel looks the same. I can't tell at a glance which agent is thinking, which is idle, and which one hit an error five minutes ago and is just sitting there waiting for me.

So I built TermDeck.

## What it is

TermDeck is a browser dashboard that hosts real PTY terminals. Each panel is a full terminal — node-pty on the server, xterm.js on the client, one WebSocket per session. You can run vim, htop, Claude Code, Gemini CLI, your Django dev server, anything that runs in a terminal.

But unlike tmux, every panel knows what it is. When you launch a session, the output analyzer watches the PTY stream and figures out:

- **Type:** Claude Code, Gemini CLI, Python server, plain shell
- **Status:** active, thinking, idle, listening, errored
- **Last command** you typed
- **Detected port** if it's a server process
- **HTTP request count** if it's serving traffic

That metadata sits in a strip above each panel and updates in real time. The status indicator is a colored dot. Green means active. Amber means idle. Purple means an AI agent is reasoning. Red means errored.

When I look at TermDeck in a 3x2 layout with six terminals open, I can see at a glance: "the dev server is serving 200s, the test suite passed, the auth refactor agent is editing files, the Vite build just finished." No tab-cycling. No mental context-switch.

## Why a browser

Two reasons. First, I wanted per-terminal theming that goes beyond colors — different fonts, different background tints, different CSS animation states for thinking vs idle. xterm.js gives me all of that for free.

Second, I wanted layout flexibility without writing a window manager. CSS Grid solves that in 30 lines. There are 6 preset layouts (1x1, 2x1, 2x2, 3x2, 2x4, 4x2) plus focus and half modes. Switching is one click or one keyboard shortcut.

## What it's not

TermDeck is not a remote terminal. It binds to localhost only. There's no auth in v0.1 because there's no network exposure. If you want remote terminals, use ttyd or Wetty.

It's not a tmux replacement. tmux works in a real TTY without a display server. TermDeck needs a browser. They solve different problems.

## What's coming

The next phase is the part I'm most excited about. I have a separate project called Mnestra — a Supabase-backed memory layer that records every session, every command, every status change across all my projects. About a thousand memories so far.

I'm building an async learning layer on top of it called Rumen. Rumen runs as a Supabase Edge Function on a 15-minute cron. It pulls recent session memories, runs hybrid search across all historical memories for prior art, and synthesizes new insights. When I open TermDeck the next morning, there's a "Rumen has 2 insights and 1 question for you" notification. The insight might be "the migration error you hit last night looks like the Stripe webhook race condition you solved in another project three months ago — here's the fix." The question might be "did the lock fix actually work, or did you just work around it?"

The LLM is stateless. Rumen isn't. That's the moat.

## Try it

```bash
git clone https://github.com/jhizzard/termdeck.git
cd termdeck
npm install
npm run install:app    # creates ~/Applications/TermDeck.app on macOS
```

MIT, vanilla JS client, no build step. macOS .app launcher and Windows installer included so you don't have to open a terminal to launch a terminal multiplexer.

Feedback wanted, especially from anyone running multiple AI agents simultaneously.
```

---

## 4. Reddit posts

### r/commandline

**Title:** `[Show] TermDeck — browser-based tmux alternative with AI agent awareness`

**Body:**
```
I built a browser-based terminal multiplexer that knows what your terminals are doing. Real PTYs (node-pty + xterm.js + WebSocket), 6 grid layouts, per-terminal theming, output analyzer that detects Claude Code, Gemini CLI, Python servers, and plain shells. Status dots show active/thinking/idle/errored at a glance.

Not a tmux replacement — it needs a browser. But for those of us running 4+ AI coding agents at once, the control room view is worth the tradeoff.

MIT, vanilla JS client, no build step.

https://github.com/jhizzard/termdeck
```

### r/webdev

**Title:** `Show: A browser-based terminal multiplexer with AI agent metadata overlays`

**Body:**
```
Web stack: vanilla JS + xterm.js (CDN) + WebSocket. No build step on the client. Server is Node.js + Express + ws + node-pty + better-sqlite3.

The interesting part is the output analyzer — it watches each PTY's stdout and detects what's running (Claude Code, Gemini, Python servers) plus extracts state (status, last command, ports, request counts). All of that flows into a metadata strip on each panel that updates every 2 seconds via a status_broadcast WebSocket message.

Running 8 terminals at once costs ~50MB RSS on my iMac. I think the architecture would scale further but I haven't tested past 8.

https://github.com/jhizzard/termdeck

(Made for myself first — I run 4 AI coding agents simultaneously and tmux's "every panel looks the same" was driving me crazy.)
```

### r/selfhosted

**Title:** `TermDeck: self-hosted browser terminal multiplexer (warning: localhost only by design)`

**Body:**
```
Heads up before you ask: TermDeck binds to 127.0.0.1 only and has no auth. It's designed for solo use on a single machine. Do NOT expose it to the network.

That said, it's a real PTY-backed terminal multiplexer in your browser, with:
- 6 grid layouts + focus/half modes
- per-terminal theming (8 themes)
- live status detection (active/idle/thinking/errored)
- AI tool awareness (Claude Code, Gemini CLI, Python servers)
- SQLite session persistence
- Supabase-backed RAG memory layer (optional)

macOS .app launcher and Windows installer included. MIT.

https://github.com/jhizzard/termdeck

If you actually need remote terminal access, use ttyd or Wetty.
```

---

## Post-Launch Checklist

After Show HN goes up:
- [ ] Reply to every comment within 5 minutes
- [ ] Don't argue. Acknowledge criticism, link to relevant code
- [ ] If someone asks for a specific feature, add it to GitHub issues immediately
- [ ] Check Vercel/GitHub bandwidth — repo will get cloned a lot if it hits the front page
- [ ] Pin a "Looking for feedback on X" comment if discussion stalls

After tweet thread:
- [ ] Pin to profile for 1 week
- [ ] Reply to every QT and reply within 1 hour
- [ ] If a notable account interacts, send a friendly DM thanking them — sometimes leads to deeper conversation

After Reddit:
- [ ] Don't reply to ALL comments (looks like astroturfing). Pick the substantive ones.
- [ ] Don't post the same link to 10 subreddits in one day. Spread over a week.

## Sequencing

**Day 1 (best day Tuesday or Wednesday):**
- 8:00 am Pacific — Show HN
- 8:15 am Pacific — Tweet thread
- 9:00 am Pacific — r/commandline Reddit
- 11:00 am Pacific — dev.to article

**Day 2:**
- 9:00 am — r/webdev Reddit
- Reply to overnight HN/Twitter activity

**Day 3:**
- 9:00 am — r/selfhosted Reddit
- Aggregate feedback into GitHub issues

**Day 4-7:**
- Ship a v0.1.2 with whatever feedback came in
- Re-share with "based on your feedback" angle

---

**Last updated:** 2026-04-11. Edit before posting. The titles and Tweet 1 are the most important things to get right.
