# Pre-Launch Tester Brief

For Josh to DM to ~5 developer friends before the Show HN post. Two tester archetypes:

- **Quick mode** — wants the 2-minute version, will stop at Tier 1 unless hooked. Send the short DM.
- **Full stack mode** — wants to install the full stack, has Supabase accounts, enjoys DIY. Send the full DM.

---

## DM Template: Short (Quick mode)

> Hey -- I'm launching an open-source devtool on Hacker News this week. Would you be willing to install it and give me 5 minutes of honest feedback before I post? It's a browser-based terminal multiplexer -- think tmux in the browser, with per-panel metadata, themes, and a memory layer that remembers what you fixed across projects. One command:
>
> `npx @jhizzard/termdeck`
>
> Node 18+ is the only prereq, prebuilt binaries so no C++ toolchain needed. Opens your browser automatically. I'd really appreciate a quick sanity check from someone who isn't me -- especially anything that felt broken or confusing in the first 2 minutes.

## DM Template: Full stack (Full stack mode)

> Hey -- I'm launching an open-source devtool on Hacker News this week and I think this is up your alley. It's a browser terminal multiplexer with a three-tier memory stack underneath: Mnestra (pgvector memory store + MCP server for Claude Code/Cursor) and Rumen (async learning loop via Supabase Edge Function + pg_cron that synthesizes insights from your sessions while you sleep).
>
> Quick version: `npx @jhizzard/termdeck` (2 min, no deps beyond Node 18+)
>
> Full stack version: there's a Getting Started guide at `docs/GETTING-STARTED.md` in the repo that walks through all four tiers -- terminal, Mnestra memory, Rumen learning, and CLAUDE.md integration. You'll need a Supabase project (free tier), OpenAI key, and Anthropic key. Full setup is ~30 min. The guide has explicit "stop here" markers at each tier so you can bail whenever.
>
> I'd love feedback on the full install experience -- especially the Rumen setup (it has five known gotchas I've documented). Honest feedback on where you got stuck would be incredibly valuable.
>
> Repo: https://github.com/jhizzard/termdeck

---

## What testers should do (5-step checklist)

1. Run `npx @jhizzard/termdeck` in your normal terminal
2. Browser opens to `http://127.0.0.1:3000` -- let the onboarding tour play (13 steps, ~60 seconds)
3. Launch 2-3 terminals from the prompt bar (`bash`, `python3`, whatever you normally run)
4. Try switching layouts (the grid buttons in the top bar, or `Cmd+Shift+1..4` on macOS)
5. Report back: did it install cleanly? Did terminals work? What confused you? What broke?

---

## What testers should NOT need to do

- Set up Supabase or any database
- Configure Mnestra (the memory layer) or Rumen (the learning layer)
- Create any config files or API keys
- Read any docs beyond what the onboarding tour shows you

Tier 1 works fully out of the box with zero configuration. The memory features (Flashback toasts) are silent at this tier -- that's expected, not a bug.

---

## What Josh wants from testers

- **Install confirmation** -- did `npx @jhizzard/termdeck` work on your machine? (macOS, Linux)
- **Install friction** -- any errors during install? node-pty compile issues? Missing deps? How long did it take?
- **First impression** -- what did you think when the dashboard opened? Was the tour helpful or annoying?
- **Bugs** -- anything that broke, hung, or behaved unexpectedly
- **Confusion points** -- anything where you didn't know what to click or what a feature did
- **Optional:** permission to quote you ("X found it useful for Y") in Show HN replies or launch threads -- totally fine to say no

---

## Ideal tester profile

- Uses a terminal daily
- Runs macOS or Linux (Windows not yet supported -- documented limitation)
- Has Node 18+ installed
- Bonus: uses Claude Code, Cursor, or similar AI dev tools (the metadata overlay detects these)

---

## Timeline

- DMs sent: today
- Feedback window: 24-48 hours
- Show HN post: day after feedback closes
- Total ask: 5 minutes of your time, one command, honest reaction

---

## If a tester asks "what is this, exactly?"

One-liner: "A browser dashboard that runs real terminal sessions with rich metadata overlays -- project tags, status dots, detected ports, command history -- and a memory layer that fires proactive recall when you hit an error you've seen before."

GitHub: https://github.com/jhizzard/termdeck
npm: https://www.npmjs.com/package/@jhizzard/termdeck
