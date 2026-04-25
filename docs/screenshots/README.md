# TermDeck launch screenshots

Catalog of visual assets used in launch collateral (README hero, blog posts,
Show HN, X thread). Last audited 2026-04-16 (Sprint 12 T2).

## Current catalog

| File | Size | Captured | What it shows | Where it's used |
|---|---:|---|---|---|
| `flashback-demo.gif` | 2.0 MB | 2026-04-16 | ~11 s walkthrough of the Flashback flow — trigger command fires, toast fades in, click, Memory drawer expands. Post-rename (Mnestra-branded toast). | `README.md` hero; `docs/launch/devto-draft.md` cover; `docs/launch/blog-post-termdeck.md` inline; `docs/launch/x-thread.md` tweet 1 |
| `dashboard-4panel.png` | 175 KB | 2026-04-14 (Sprint 3 T1, Playwright on :3001) | 2x2 layout, four populated panels (termdeck / engram / rumen / portfolio — panel tags are **pre-rename**, see "Rename context"), commands visible in each | `docs/launch/blog-post-termdeck.md` hero; README hero fallback; Show HN post body |
| `dashboard-post-rename.png` | 173 KB | 2026-04-15 (Sprint 3 T1.4 re-smoke, Playwright :3001 + DOM injection) | Same 2x2 layout, **post-rename** — Mnestra toast visible in bottom-center | Scaffolding / reviewer-facing proof. Not currently embedded in launch collateral. |
| `drawer-open.png` | 372 KB | 2026-04-14 (Sprint 3 T1, Playwright :3001) | Same 2x2 layout, first panel's Commands drawer expanded showing `ls` + `git status` + `git log` with click-to-copy chips | `docs/launch/blog-post-termdeck.md` inline; X thread tweet 3 |
| `switcher.png` | 107 KB | 2026-04-14 (Sprint 3 T1, Playwright :3001) | Topbar slice — TermDeck brand + status counts + layout buttons + in-bar terminal switcher tiles (Alt+1..9) + launch buttons + help button | `docs/launch/blog-post-termdeck.md` inline; X thread tweet 4 |
| `flashback-toast-mnestra.png` | 48 KB | 2026-04-15 (Sprint 3 T1.4, Playwright :3001 + DOM injection) | Close-up of the `MNESTRA — POSSIBLE MATCH` toast with a real production hit ("Rumen Edge Function deploy blocked on stale SUPABASE_ACCESS_TOKEN…" — meta-moment, the toast surfaced T1.2's own blocker memo) | Verification artifact in `docs/tier2-verification.md`. Available as a Show HN post lede alternative. |
| `flashback-demo-pre-sprint5.gif` | 2.8 MB | 2026-04-15 | Archival: the original Sprint 3 T1.4 Playwright-recorded GIF before Sprint 5's UI polish landed. **Untracked** in git. Kept on disk as a rollback reference. | None (archival only) |

## Status summary

- All three Sprint 3 stills (`dashboard-4panel.png`, `drawer-open.png`, `switcher.png`) render correctly but are **pre-rename** — panel tags read `engram` instead of `mnestra`. Acceptable for launch copy that focuses on layout / drawer / switcher features (none visually depend on the old name). See "Rename context" below.
- `flashback-demo.gif` is the post-rename Playwright-recorded functional walkthrough (800×450 @ 8 fps, 11 s). It is **functional-quality, not hero-quality** — no visible mouse cursor, xterm content sparsely rendered inside headless chromium. Replace with a manual QuickTime capture for launch polish (procedure preserved below).
- No broken image refs inside the repo's live launch collateral resolve cleanly — **except** `flashback-meta-moment.png`, which is referenced but does not exist on disk (see "Known broken references" below).
- `docs-site/` has no image references that point at `docs/screenshots/` assets. The site's blog post (`docs-site/src/content/docs/blog/termdeck-launch.mdx`) mentions screenshots will be pulled at publish time but does not yet embed any.

## Known broken references

| Reference | Referenced in | Status |
|---|---|---|
| `docs/screenshots/flashback-meta-moment.png` | `docs/launch/blog-post-4plus1-orchestration.md:3`, `docs/launch/x-thread-orchestration.md:7` | **Missing.** Josh's 2026-04-15T00:17Z CleanShot capture of the ENGRAM-branded Flashback toast during the Sprint 3 rename crisis. Needed for the "Engram → Mnestra" narrative hook (toast header reads `ENGRAM — POSSIBLE MATCH` pre-rename). If Josh has the file on another device, drop it at this exact path. |

No other broken image links in the repo as of 2026-04-16.

## Historical / aspirational references (not broken, just never captured)

These appear in planning docs (never made it to live launch collateral):

- `docs/screenshots/info-tabs.png` — referenced in `docs/SPRINT_2_FOLLOWUP_PLAN.md`, `docs/SHIP_CHECKLIST_2026-04-15.md`, `docs/PLANNING_DOCUMENT.md`. Never captured. `drawer-open.png` covers the same feature and is what launch copy actually uses.

## Rename context (Engram → Mnestra)

The three reference stills were captured 2026-04-14 against the pre-rename code. Panel tags in those screenshots still read `engram` because that's what was in `~/.termdeck/config.yaml` at capture time. After commit `30d04f2` landed the full rename (`engram-bridge/` → `mnestra-bridge/`, client toast `Mnestra — possible match`, `@jhizzard/mnestra@0.2.0` on npm), `dashboard-post-rename.png` and `flashback-toast-mnestra.png` were added as post-rename counterparts.

For launch copy that doesn't visually depend on the project-tag text, the pre-rename stills are fine. For any surface where the tag text is readable and on-topic (e.g., the blog post lede, the Show HN hero), prefer `dashboard-post-rename.png` or re-capture with an updated config.

## Hero GIF — manual re-capture procedure

The current `flashback-demo.gif` is the Playwright-recorded functional proof. Launch-polish quality requires a manual QuickTime capture. This section is the procedure; every acceptance item in the storyboard still applies.

### Setup (5 min)

1. **Close every other app** that might show a notification, badge, or sound during the recording (Slack, Mail, calendars, iMessage, etc.). Turn on Do Not Disturb.
2. **Dark desktop background.** Tokyo Night looks best against the default panel theme.
3. **Restart TermDeck clean** so there are no stale panels:
   ```sh
   pkill -f 'node packages/cli'
   cd /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck
   npm run dev
   ```
   **⚠ WARNING to whoever runs this** — the `pkill` kills TermDeck PID 32489 which is Josh's live instance. It will kill any Claude Code session running inside a TermDeck panel. Do this from an external terminal (iTerm2, Terminal.app), NOT from inside TermDeck.
4. **Hard-reload the browser** (Cmd+Shift+R) on http://localhost:3000 so the dashboard starts clean with no cached tour state.
5. **Layout: click the 2x2 layout button** in the topbar (or press `Ctrl+Shift+4`).
6. **Launch 4 panels using the prompt bar at the bottom:**
   - Panel 1: type `shell` → Enter → a `/bin/zsh` panel opens. Project: no project (or "termdeck" if you pick one from the dropdown)
   - Panel 2: type `claude` → Enter → launches real Claude Code. Project: "termdeck". (Alternatively: `bash -c 'sleep 999999 & htop'` if Claude Code isn't installed.)
   - Panel 3: type `python3 -m http.server 8080` → Enter. Project: "termdeck". The panel should pick up `python_server` type + port 8080.
   - Panel 4: type `htop` → Enter. Fallback if `htop` isn't installed: `top`.
7. Let everything settle for 30 seconds. The metadata strips should show real-looking counts and statuses.

### The shot (10–14 seconds)

1. **Start screen recording with QuickTime.**
   - Open QuickTime Player → File → New Screen Recording.
   - Or press `Cmd+Shift+5`, click "Record Selected Portion".
   - Draw the capture region around the browser window only — **not** the full desktop. Target 1920 × 1080. Dock and menu bar should not be in frame.
   - Press Record.
2. **Focus Panel 1 (the shell panel).** Click inside its xterm area. Wait ~1 second with the cursor settled.
3. **Type the trigger command.** Use one of these — **DO NOT use `cat /nonexistent`**, it does not fire Flashback because `PATTERNS.error` at `packages/server/src/session.js:45` does not include "No such file or directory". Good triggers (all match `PATTERNS.error` as of 2026-04-14):
   - **Recommended (psql migration error, matches the plan's suggestion):**
     ```
     psql "$SUPABASE_URL" -c "ALTER TABLE foo ADD CONSTRAINT fk FOREIGN KEY (bar) REFERENCES nonexistent(id);"
     ```
     (Note: with the current stale creds in Rumen's `.env`, this will actually fail at the *connection* step rather than the constraint step. Both produce "ERROR" in the output, which matches the regex.)
   - **Alternative 1:** `python3 -c 'raise ValueError("cannot find users table")'` → produces a real `Traceback` matching `PATTERNS.error`
   - **Alternative 2:** `gitx status` (typo, deliberately) → produces `zsh: command not found: gitx` which matches
   - **Alternative 3:** `node -e 'throw new Error("redis connection refused")'` → matches `Error` AND `ECONNREFUSED` cleanly
4. **Pause for ~0.8 seconds** after the error prints. This is the critical "about to reach for docs" beat — the pause carries the narrative tension.
5. **The Flashback toast fades in from the right edge of Panel 1.** Real-world latency measured during T1.1 was 5.5 s end-to-end (OpenAI embedding + Supabase RPC). If the GIF's pace is too slow waiting for the toast, re-run with a shorter wait — the post-processing step will trim to the right rhythm.
6. **Move the mouse cursor slowly** toward the toast (don't snap — the drift sells it). Single click on the toast body.
7. **The Memory tab drawer opens on Panel 1.** The full hit renders with content + project tag + source_type + (if/when the Mnestra repo fix lands) similarity score.
8. **Pause for 2 seconds** on the expanded memory so the viewer can read it.
9. **Stop recording.**

### Post-processing (5 min)

1. Open the .mov in QuickTime (or any trimmer).
2. Trim hard — only keep the 10–14 seconds spanning typed-error → toast fade-in → click → memory opens → pause.
3. Export / convert to GIF. Two tools work:

   **Option A — `ffmpeg` (already installed on Josh's machine):**
   ```sh
   # Two-pass for a high-quality GIF with a palette
   ffmpeg -i input.mov -vf "fps=15,scale=1280:-1:flags=lanczos,palettegen" palette.png
   ffmpeg -i input.mov -i palette.png -filter_complex "fps=15,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse" \
       -loop 0 docs/screenshots/flashback-demo.gif
   ```
   Expected output: ~3–4 MB for a 12-second clip at 1280 × (720-ish) and 15 fps.

   **Option B — `gifski` (nicer gradients, not currently installed):**
   ```sh
   brew install gifski
   ffmpeg -i input.mov -vf "fps=15,scale=1280:-1:flags=lanczos" -c:v png /tmp/frame%04d.png
   gifski -o docs/screenshots/flashback-demo.gif --fps 15 --quality 90 /tmp/frame*.png
   ```

4. **Check the size:** `ls -lh docs/screenshots/flashback-demo.gif`. Target < 4 MB so GitHub's README will embed it. If over 4 MB:
   - Reduce fps from 15 → 12 or 10
   - Reduce width from 1280 → 1000
   - Shorten the trim

### Acceptance (launch-polish version)

- [ ] `docs/screenshots/flashback-demo.gif` exists (already satisfied — current file is the functional version)
- [ ] File is under 4 MB
- [ ] GIF plays the 10–14 s storyboard without gaps or visible frame drops
- [ ] Toast text is readable at the target width
- [ ] Memory drawer content is readable at the target width
- [ ] Mouse cursor is visible and drifts toward the toast
- [ ] xterm panel content is fully rendered (not sparse)
- [ ] No notifications, badges, or other apps are visible in frame

## Known non-blocking issues flagged by T1.1

These will affect the GIF's look-and-feel but are not launch blockers:

- **End-to-end Flashback latency ~5.5 s** — slower than the 2 s target in the plan. The pause-before-toast will feel longer than ideal. Future perf follow-up: cache question embeddings, pre-emit during the output-buffer-flush pause.
- **Similarity score is undefined** on `proactive_memory.hit` payloads — the mnestra-bridge's `memory_hybrid_search` RPC is not projecting a similarity column. Score will not appear in the drawer. UI still renders content/project/source_type/created_at fine. Fix belongs in the Mnestra repo, `migrations/002_mnestra_search_function.sql`.
- **`PATTERNS.error` miss on "No such file or directory"** — flagged above; use a different trigger command.
