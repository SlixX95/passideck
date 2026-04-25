# T2 — Client file split

## Why this matters

Both post-Sprint-4 audits independently flagged the monolithic client file as the highest-severity technical debt in the stack:

> "At 3,957 lines, `index.html` contains 1,255 lines of CSS, ~500 lines of HTML structure, ~2,200 lines of JavaScript. ... You chose zero-build deliberately and it was right for v0.1. But at ~4K lines, the file is harder to navigate than any of your actual backend modules." — Claude audit

> "With the addition of the Morning Briefing UI, `packages/client/public/index.html` has ballooned to over 141 KB and nearly 4,000 lines of entangled CSS, HTML layout, and JavaScript logic. You are one sprint away from developer paralysis. The file MUST be split." — Gemini audit

Both explicitly note the fix preserves the zero-build-step property: `<link rel="stylesheet" href="style.css">` + `<script src="app.js" defer>` keeps everything served statically by Express, no bundler, no build step.

This is a **mechanical extraction**, not a rewrite. No semantic changes. Every byte of CSS and JS moves verbatim to its new home. The acceptance bar is "zero behavior change, all existing features still work."

## Scope (T2 exclusive ownership)

- `packages/client/public/index.html` — everything you need to remove
- `packages/client/public/style.css` (new) — receives every `<style>` block
- `packages/client/public/app.js` (new) — receives every non-CDN `<script>` block

**Do not touch anything outside this list.** If the server's static-file serving needs a tweak (e.g. to set correct `Content-Type` for `.js` and `.css`), write a `[T2] BLOCKED` note in STATUS.md — do NOT edit `packages/server/src/index.js`, that's outside your ownership.

## Deliverable

After your work:

1. **`packages/client/public/style.css` exists** and contains every byte of CSS that was inside `<style>...</style>` blocks in the old `index.html`. Preserve order. Preserve whitespace. Preserve comments.

2. **`packages/client/public/app.js` exists** and contains every byte of JavaScript that was inside `<script>...</script>` blocks (EXCEPT for CDN imports that must stay inline because they define globals the rest of the code depends on — see below). Preserve order. Preserve comments. Preserve `// @ts-nocheck` or any similar pragmas.

3. **`packages/client/public/index.html`** is now pure HTML structure plus:
   - `<link rel="stylesheet" href="style.css">` in `<head>` (replace the `<style>` block location)
   - CDN `<script src="...">` tags for xterm.js and addons — these MUST come BEFORE the local `app.js` script and MUST NOT have `defer` (they need to load synchronously so their globals are available when `app.js` runs)
   - `<script src="app.js" defer></script>` at the very end of `<body>` or after the CDN scripts — MUST have `defer` so it runs after the DOM is parsed
   - No inline `<style>`, no inline `<script>` (except the CDN imports)

4. **Zero behavior change.** Every feature that worked before still works. The test bar is:
   - TermDeck boots and the dashboard renders
   - Terminals can be created from the prompt bar
   - Layout modes switch (Cmd+Shift+1..6)
   - Theme switcher works per-panel
   - The onboarding tour fires on first visit
   - The Rumen insights badge appears in the top bar (T3's Sprint 4 work)
   - The morning briefing modal opens on click and closes on Escape
   - WebSocket connections stay alive
   - The reply button works
   - The "Ask about this terminal" input works

## Extraction procedure

Recommended mechanical approach:

1. **Read the whole file** to understand the boundary lines.
2. **Find every `<style>` block.** There's almost certainly only one at the top of `<head>`. Copy the contents verbatim into `style.css`. Delete the `<style>...</style>` tags from `index.html`. Insert `<link rel="stylesheet" href="style.css">` where the `<style>` tag used to be.
3. **Find every `<script>` block.** Audit each one:
   - **CDN scripts (`<script src="https://cdn.jsdelivr.net/...">`):** leave inline. These define globals (`Terminal`, `FitAddon`, etc.) that `app.js` depends on. They must load first.
   - **Inline scripts (`<script>` with content):** copy contents verbatim into `app.js`. Preserve source order between multiple inline blocks — concatenate them as they appear in the HTML file.
   - **Inline scripts with `type="module"` or other non-default types:** flag in STATUS.md if you find any; they may need special handling.
4. **Replace all the inline `<script>` tags** with a single `<script src="app.js" defer></script>` at the end of `<body>` (after the CDN scripts).
5. **Verify the server already serves `.js` and `.css` with correct Content-Type.** Express's `express.static` middleware handles this correctly out of the box — you shouldn't need to change anything, but verify by starting the server and opening devtools Network tab to confirm `style.css` arrives as `text/css` and `app.js` arrives as `application/javascript`.

## Script load order — critical

Browsers execute scripts in document order. `app.js` uses globals defined by the CDN xterm.js scripts. So the HTML must have:

```html
<!-- CDN scripts first, no defer, load synchronously -->
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>

<!-- Then app.js, with defer so it runs after DOM is parsed -->
<script src="app.js" defer></script>
```

If the `defer` attribute creates a race with the CDN scripts (it shouldn't — `defer` scripts run AFTER sync scripts), you can drop `defer` and put `app.js` at the very end of `<body>` instead.

## Acceptance criteria

- [ ] `packages/client/public/style.css` exists and passes a syntactic CSS validator (parseable).
- [ ] `packages/client/public/app.js` exists and passes `node --check app.js` without syntax errors.
- [ ] `packages/client/public/index.html` has zero `<style>` blocks and zero inline `<script>` blocks (except CDN `<script src>`).
- [ ] File size comparison: `style.css` + `app.js` + `index.html` (post-split) ≈ `index.html` (pre-split) ±5% for whitespace/attribute overhead.
- [ ] Server starts cleanly: `node packages/server/src/index.js`
- [ ] Dashboard loads at `http://127.0.0.1:3000` with no console errors in browser devtools.
- [ ] Smoke test: open two terminals, switch layouts, change theme on one, run a command in each. All features work as before.
- [ ] Rumen badge appears in top bar if configured (T3-Sprint-4 work).
- [ ] `npm test` still passes (35/35 from prior sprints).
- [ ] A short note appended to the top of each new file: `/* Extracted from index.html 2026-04-15 — see git blame on index.html prior to commit <hash> for history */`
  - (Replace `<hash>` with the commit SHA of the split commit once you know it; or put `UNCOMMITTED` and fix in the commit message.)

## Non-goals

- Do NOT refactor the JS into modules/classes. This is a verbatim extraction.
- Do NOT minify or transform anything.
- Do NOT touch the server, the CLI, or any Rumen/Mnestra file.
- Do NOT add a build step, bundler, or preprocessor.
- Do NOT rename existing functions or variables.
- Do NOT delete any code, even if it looks dead. Dead code is out of scope for this sprint.
- Do NOT add `"use strict"` or eslint pragmas — preserve the existing language mode.

## Testing

1. `node --check packages/client/public/app.js` → no syntax errors
2. Manual: start server, open browser, open devtools, load dashboard. **Zero console errors.**
3. Manual: click through every control from the Sprint 4 acceptance criteria (badge, modal, layouts, themes, prompt bar, help button, project dropdown).
4. `curl -I http://localhost:3000/style.css` → `Content-Type: text/css`
5. `curl -I http://localhost:3000/app.js` → `Content-Type: application/javascript`
6. `wc -l packages/client/public/index.html packages/client/public/style.css packages/client/public/app.js` → sum ≈ original
7. `git diff --stat` → three files changed, roughly balanced

## Coordination

- Append significant progress to `docs/sprint-5-audit-delta/STATUS.md`.
- This is a purely mechanical task. It should take 30-60 min focused. If you hit 90 min and still aren't done, flag a blocker — something is wrong.
- Write `[T2] DONE` with file sizes (bytes and line counts for all three files) when complete.
