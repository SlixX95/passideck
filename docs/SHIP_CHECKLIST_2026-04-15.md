# Ship Checklist — v0.2 Launch (2026-04-15)

> **How to use this document**
>
> - Every item has a **Status** line and a **Comment** line.
> - Mark `Status:` with one of these symbols as you go:
>   - `✅` — passed / done
>   - `❌` — failed — fix before shipping
>   - `⚠️` — passed with a caveat (describe in Comment)
>   - `⏭️` — skipped intentionally (explain why in Comment)
>   - `⏳` — in progress
>   - *(blank)* — not yet attempted
> - If something fails or needs a note, fill in `Comment:` with the specific behavior, error message, or decision. Leave it blank if everything worked cleanly.
> - Do the phases in order. Do not start a later phase until all earlier items are `✅` or explicitly `⏭️`.

---

# Phase 1 — Final test pass

12 checks covering every code path touched this session. Target: ~15 minutes.

## 1.1 Shell launch button

Click the `shell` button in the top toolbar. A live zsh prompt should appear and typing `echo hello && ls` should echo and execute. A cosmetic `zsh_sessions: command not found: Saving` warning is acceptable.

- Status:
- Comment:

## 1.2 Claude launch button

Click the `claude` button in the top toolbar. Claude Code should start; you should be able to type a prompt and see a streamed response.

- Status:
- Comment:

## 1.3 Python launch button

Click the `python` button in the top toolbar. Expected output includes `Serving HTTP on 0.0.0.0 port 8080` or similar. Hit `Ctrl+C` inside the panel to stop the server after verification.

- Status:
- Comment:

## 1.4 Project dropdown with `defaultCommand: claude`

Select `termdeck` in the project dropdown. Leave the prompt input empty. Click `launch`. Expected: Claude Code opens in the `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck` cwd.

- Status:
- Comment:

## 1.5 Project dropdown with no default command

Select `scheduling` (or any project with no `defaultCommand` after today's cleanup). Leave the prompt input empty. Click `launch`. Expected: a plain zsh panel in the scheduling cwd.

- Status:
- Comment:

## 1.6 Onboarding tour — replay

Click `how this works` in the top toolbar. Expected: tour starts, step 1 shows the centered welcome card, steps 2–4 spotlight top-toolbar elements, step 4 auto-spawns a second shell if needed, steps 7–10 open the drawer and spotlight specific drawer elements, `done` clears the overlay cleanly.

- Status:
- Comment:

## 1.7 Help button

Click `help` in the top toolbar. Expected: GitHub README opens in a new browser tab.

- Status:
- Comment:

## 1.8 First-run auto-fire

In the browser DevTools console run `localStorage.removeItem('termdeck:tour:seen'); location.reload();`. Expected: tour auto-fires on empty dashboard after ~1.2 seconds.

- Status:
- Comment:

## 1.9 Add-project modal

Click the `+` button next to the project dropdown. Create a throwaway project — name `tmp-test`, path `/tmp`, no command, no theme. Expected: modal shows success, closes automatically, new project appears in dropdown and is selected. After verification, delete the entry from `~/.termdeck/config.yaml` manually or leave for me to clean up.

- Status:
- Comment:

## 1.10 Panel numbering and reply button

Open two panels with the same project (`termdeck` twice). Expected: panel headers show `#1` and `#2` suffixes. Then on panel 1 click `reply ▸` in the Overview drawer, pick panel 2 from the target dropdown, send `echo reply-works`. Expected: text appears and runs in panel 2.

- Status:
- Comment:

## 1.11 Keyboard shortcuts

Test all three shortcut families: `Cmd+Shift+3` switches to 2x2 layout, `Option+1` jumps focus to panel 1, `Ctrl+Shift+N` focuses the prompt bar. All three should work without side effects.

- Status:
- Comment:

## 1.12 WebSocket reconnect

Open a panel. In the server terminal press `Ctrl+C` to kill the server. Wait 2 seconds. Restart with `npm run dev`. Expected: the browser shows a reconnecting state then restores the dashboard view. Previously-running sessions show as exited in the list (orphan cleanup). No crash in the browser console.

- Status:
- Comment:

---

# Phase 2 — Ship it (tonight)

## 2.1 Freeze the tested state (I execute)

After Phase 1 is all-green, I stage and commit everything touched this session across all three repos and push. Specific commits:

### TermDeck
- Onboarding tour fixes (spotlight default hidden, onEnter hook, multi-target rects, auto-launch helpers)
- Shell spawn fix (plain-shell detection, `spawnShell` variable)
- Env var fix (`SHELL_SESSION_HISTORY=0`)
- Add-project endpoint + modal + `rebuildProjectDropdown()` + `submitAddProject()`
- launchTerminal default-command resolution fix
- `help` button in top toolbar
- `how this works` button in top toolbar
- INSTALL.md
- LAUNCH_STRATEGY_2026-04-15.md
- parallelize-template.md
- SHIP_CHECKLIST_2026-04-15.md (this file)
- FOLLOWUP.md updates
- `~/.termdeck/config.yaml` is NOT committed — personal config, lives outside the repo

### Mnestra
- No further changes this session beyond what's already committed and pushed

### Rumen
- No further changes this session beyond what's already committed and pushed

- Status:
- Comment:

## 2.2 Capture launch assets (you execute)

Capture the three visuals the launch needs. These require your actual desktop with real work in the panels.

- **Flashback demo GIF.** 4-panel TermDeck dashboard, run a command that fails in panel 2 (ideally one where Mnestra has a relevant past memory), wait for the toast, click it, show the expanded Memory tab. QuickTime screen recording or `licecap`, trim to 10–14 seconds, save as `docs/screenshots/flashback-demo.gif`. Max 4 MB.
- **Dashboard hero PNG.** 4-panel 2x2 layout with real work in each panel. Full browser window screenshot at 1920×1080, save as `docs/screenshots/dashboard-4panel.png`.
- **Info tabs PNG.** Close-up crop of one panel with the drawer open to the `Commands` or `Memory` tab. Save as `docs/screenshots/info-tabs.png`.

- Status:
- Comment:

## 2.3 README rewrite (I execute)

Rewrite `README.md` top-to-bottom per the `docs/FLASHBACK_LAUNCH_ANGLE.md` structure:

1. Hero GIF (the flashback-demo from 2.2)
2. One-line pitch: "The terminal that remembers what you fixed last month."
3. Quickstart with four labeled install paths (pulled from INSTALL.md): `npx`, global npm, macOS native app via `install.sh`, from source
4. How Flashback works — 4 sentences
5. What Flashback is **not** — honest limits section
6. Architecture: three-tier diagram linking to Mnestra and Rumen READMEs
7. Onboarding tour and help button mention
8. Development / contribution at the bottom
9. License, links

- Status:
- Comment:

## 2.4 npm publish all three packages (I execute)

Execute `docs/RELEASE_CHECKLIST.md`:

1. Pre-flight: `npm whoami` → confirm `jhizzard`. `npm view @jhizzard/mnestra` / `rumen` / `termdeck` → confirm names are available (Mnestra and Rumen already published at 0.1 — confirm namespace).
2. Version bumps: `package.json` in each repo → `0.2.0`.
3. Build + test each repo: Mnestra `npm run build && npm test` → 25+ green; Rumen `npx tsc --noEmit` → clean; TermDeck nothing to build.
4. Publish in order:
   - `cd mnestra && npm publish --access public`
   - `cd rumen && npm publish --access public`
   - `cd termdeck && npm publish --access public`
5. Tag each repo: `git tag v0.2.0 && git push --tags`.
6. Fresh-install smoke test: `cd /tmp && npx @jhizzard/termdeck@0.2.0 --no-open` → banner appears → `Ctrl+C`.

- Status:
- Comment:

---

# Phase 3 — Launch (tomorrow morning, NOT tonight)

Four reasons not to launch tonight: HN launches are one-shot and need fresh owner presence for the first 4 hours of comments; 8–10 am PT Tue/Wed/Thu is the only good launch window; the Flashback GIF needs daylight + real failing work; 3–5 pre-launch testers should install first and post early testimonial comments.

## 3.1 Update joshuaizzard.com — TermDeck project card

Update your portfolio site to feature TermDeck front-and-center. Content for the card:

- Title: **TermDeck**
- Tagline: "The terminal that remembers what you fixed last month."
- Description: "Browser-based terminal multiplexer with proactive memory recall. Built with Mnestra (pgvector memory store) and Rumen (async learning layer). v0.2 shipped April 2026."
- Links: GitHub repo (jhizzard/termdeck), npm package (@jhizzard/termdeck), docs site (once deployed in 3.3)
- Screenshot: the dashboard hero PNG from 2.2
- Link below the card to the new blog post from 3.2

- Status:
- Comment:

## 3.2 joshuaizzard.com blog post

Write the "I built a terminal that remembers" post using the outline in `docs/FLASHBACK_LAUNCH_ANGLE.md` §Blog post outline. 800–1200 words. Structure:

1. Tuesday CORS-bug cold-open (concrete, specific, 3 paragraphs)
2. Problem framing — "every session starts from zero" (200 words)
3. What Flashback actually does (200 words)
4. Three real flashbacks from your own use with screenshots (500 words)
5. Architecture in 150 words
6. Install in two lines + one-sentence "I built this because I needed it"

Publish on your own site first. Crosspost to dev.to and Hashnode 24 hours later.

- Status:
- Comment:

## 3.3 Deploy docs-site to Vercel

```
cd /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site
vercel link
vercel deploy --prod
```

Get the production URL (`*.vercel.app` or a custom domain if `termdeck.dev` is yours). Update the `help` button href in `packages/client/public/index.html` from the GitHub README link to the deployed URL. Commit + republish TermDeck as `v0.2.1` with that one change.

- Status:
- Comment:

## 3.4 Pre-launch tester outreach

DM 5 developer friends with a one-sentence ask: "TermDeck v0.2, not public yet. `npx @jhizzard/termdeck`. Tell me if Flashback fires for you within 15 minutes and whether anything is broken. Honest broken feedback is better than polite praise." Wait for responses. Fix everything they flag.

- Status:
- Comment:

## 3.5 Show HN launch

Tuesday or Wednesday 8:00am PT. Title: **Show HN: TermDeck — the terminal that remembers what you fixed last month**. Use the Show HN template in `docs/FLASHBACK_LAUNCH_ANGLE.md` §Show HN post template. Respond to every comment within 30 minutes for the first 4 hours.

- Status:
- Comment:

## 3.6 X thread launch

Same timing as Show HN, +5 minutes. Use the thread template in `docs/FLASHBACK_LAUNCH_ANGLE.md` §X thread template. 5 tweets, hero GIF on tweet 1. Pin to profile.

- Status:
- Comment:

## 3.7 Reddit launches (staggered)

- `r/commandline` at +30 min — multiplexer-angle headline
- `r/selfhosted` at +60 min — local-first angle
- `r/webdev` at +90 min — only if the above two are gaining traction; otherwise skip
- Do NOT post to `r/programming` — anti-self-promo rules

- Status:
- Comment:

## 3.8 dev.to + Hashnode blog crossposts

Publish the blog post from 3.2 on dev.to and Hashnode **24 hours after** Show HN. Separate event, separate traffic wave, gives the post room to stand alone instead of competing with the HN thread.

- Status:
- Comment:

## 3.9 72-hour metrics check

At hour 72 after launch, measure:

- GitHub stars (target: 250+)
- HN point count at peak (target: 100+, dead if under 30)
- npm weekly downloads (target: 200+ across the three packages)
- Any third-party developer documenting their own Flashback moment (target: at least 1)
- Whether the Show HN thread still has new comments at hour 72

Declare victory if 4 of 5 are green. Anything less, open a post-mortem and plan a relaunch in 4 weeks with lessons learned.

- Status:
- Comment:

---

# Blocker log

Use this section for anything that stops a phase from progressing. Include the item ID (e.g. `1.4`), what happened, and what was done to resolve it. If a blocker remains unresolved at end of session, it goes into `docs/FOLLOWUP.md` as a Sprint 3 item.

- *(empty)*

---

# Session signoff

When every item above is `✅`, `⏭️`, or `⚠️` (with acceptable caveats), fill in the signoff below.

- **Phase 1 complete at:**
- **Phase 2 complete at:**
- **Phase 3 complete at:**
- **v0.2 publicly shipped:** yes / no
- **Outstanding blockers moved to FOLLOWUP.md:** yes / no
