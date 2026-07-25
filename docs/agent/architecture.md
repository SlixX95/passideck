# Agent Guide

## Scope

This repo is the standalone PassiDeck development repo. Do not edit or restart `/home/hermo/projects/passideck` or `passideck.service` from here.

## Runtime

- Dev repo: `/home/hermo/projects/passideck-dev`
- Safe dev port: `8792`
- Safe dev home: `/home/hermo/projects/passideck-dev/.dev-home`
- Safe tmux socket: `passideck-dev`

## Commands

```bash
npm install
npm run prepare-assets
npm test
PASSIDECK_PORT=8792 PASSIDECK_HOME=$PWD/.dev-home PASSIDECK_TMUX_SOCKET=passideck-dev npm run dev
```

## Standalone requirements

PassiDeck must install from a Git checkout with only Node/npm/tmux/bash available. Browser assets must be local, not CDN-only. Config, DB, uploads, and UI state must live under `PASSIDECK_HOME`. Server ui-state validation must stay in sync with frontend layouts/themes.

## Terminal output

Do not strip alternate-screen escape sequences in the server. TUI correctness wins; browser reload safety is handled by client-side xterm snapshots and replay-marker suppression. The dev tmux socket disables tmux's own status bar globally and per session (`set-option -g status off` plus `set-option -t <session> status off`) before attach/new-session so pane height matches browser rows without tmux consuming one line.

## Desktop pane layout

PassiDeck dev now uses a desktop canvas, not fixed grid slots. Every non-minimized pane is an absolute `.term-panel.free-window` inside `#termGrid`, with pixel `left/top/width/height`, z-index stacking, and a controlled `.window-resize-handle` (native CSS resize stays disabled). Window rects persist server-side under `/api/ui-state` at `panePrefs.desktops[desktopId].windows[paneId]`; `savePanePrefs()` prunes deleted session ids so old smoke windows do not affect later placement.

New windows should first try real free-space placement: standard half/quarter desktop candidates are compared against visible, non-minimized occupied rects. If a mostly-free candidate exists, the pane opens there. If no free candidate exists, the pane still opens as a normal foreground cascade window; do not block launch and do not replace/minimize an existing pane. Minimized panes are restored by clicking their top switcher tab; restore must remove `.minimized`/`.layout-hidden`, keep the existing rect, and bring the same pane to the front. Clicking any non-minimized top switcher tab must also select that pane and call `bringWindowToFront(id)`, so overlapping same-size desktop windows behave like a normal OS taskbar. Hovering/focusing a top switcher tab reveals a compact right-side `×` (`.switcher-close`) that calls `requestClosePanel(id)` and opens the same close-confirm modal as the pane header X. Durable UI state is server-owned under `/api/ui-state`: window rects/z-order, pane order, custom titles, minimized ids, theme, font size, hidden chrome, monitor toggle, active pane, and viewport baseline live in `panePrefs`/ui-state, not browser localStorage. On viewport changes, scale stored desktop rects from the last persisted desktop size to the current `#termGrid`; under small coarse/mobile viewports, minimize overflow panes client-side so the remaining window keeps minimum usable size.

Do not reintroduce old magnetic `.empty-slot` DOM placement, fixed-grid resize gutters, `LAYOUT_SLOTS`, `setPaneSpan`, `movePaneToSlot`, or fixed layout presets as persistent visible mechanics. Dragging the dedicated header background (not the editable title text and not minimize/close controls) moves the free window; there is intentionally no separate move/grip button. During mouse drag or bottom-right window resize, use native pointer coordinates and pointer capture; do not use Pointer Lock and do not render a fake cursor. The real OS cursor must remain visible and must not jump after release. Native CSS `resize` is disabled for free windows; use `.window-resize-handle` so resize is clamped to the browser/desktop bounds while normal movement keeps the OS cursor natural. Adjacent tiled free windows expose transient `.shared-resize-handle` dividers: vertical dividers resize every touching left/right group together (including one large left window against multiple stacked right windows), and horizontal dividers resize stacked top/bottom groups. When a large/snapped/full-width window is grabbed, restore it to normal default size under the pointer like desktop OS titlebar drag, but preserve the original occupied slot as the swap target position if the drag is used to exchange windows. While dragging away from screen edges, render transient `.desktop-slot-suggestions` overlays for real free desktop gaps; `desktopGapSlotRects()` must derive gaps from current occupied window edges before falling back to coarse grid/half candidates, so a middle strip between left/right windows is a snap target. Hover is preview-only. On release over a free `.desktop-slot`, snap the dragged window into that slot. Hovering the center of an occupied window marks it `.slot-swap-target`; on release, swap the two window rects plus `state.order`, so Pascal can manually decide which window sits where. Dragging near an edge/corner still takes priority and renders contextual Windows/macOS-style snap suggestions via `.snap-suggestions`/`.snap-choice`; release snaps the active window and tiles other visible non-minimized windows into the remaining desktop area. Each window also has a third arrange button (`▦`/`.arrange`) with whole-desktop layout proposals.

Top switcher tabs are `div[role=button]` wrappers with a real `.switcher-close` button inside; do not nest a role-button span inside a `<button>`. The close modal must keep `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="closeModalTitle"`. Hover help uses one unified fixed `#appTooltip` layer driven by `data-tooltip`; do not use native `title` attributes or CSS `content: attr(data-tooltip)` pseudo-tooltips, because they can duplicate. Tooltip placement must clamp inside the viewport, flip above near the bottom edge, and keep z-index `2147483647` so text stays readable above windows/settings. The optional topbar system monitor renders CPU, RAM, and disk percentage cells only; the disk cell gets hover details from `/api/system-metrics.diskInfo` (`used/total/free` for `/`). Settings are a fixed overlay and must use a near-modal z-index so they appear in front of free windows. Visual chrome must stay compact: pane header remains about 18px, desktop padding about 2px, terminal padding about 1px, and the premium skin is implemented through CSS-only borders, overlays, shadows, and color variables rather than larger controls. `skin` is persisted in `/api/ui-state` and currently supports `neon`, `stealth`, and `prism`; keep these skins sharp/square and terminal-first.

Upload cleanup must clamp retention to a safe range (currently 1-365 days). Do not let `/api/uploads/cleanup` accept negative `maxDays`, because that can delete all upload day folders.

## Test rules

- Run `npm test` after any code or asset path change.
- Smoke on port 8792 only.
- Delete smoke sessions via API after tests.
- Do not kill tmux sessions outside `tmux -L passideck-dev`.

## Packaging rules

Keep `scripts/install.sh`, `scripts/dev-server.sh`, and `scripts/passideck.service` working. If package dependencies change, ensure `npm run prepare-assets` still creates all files under `packages/client/public/vendor/`.
