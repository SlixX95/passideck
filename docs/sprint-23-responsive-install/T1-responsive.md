# T1 — Responsive Layouts

## Goal

Every layout (1x1, 2x1, 2x2, 3x2, 2x4, 4x2, orch, control) must work on screens from 13" MacBook Air (1440x900 or 1280x800) to 27" iMac (5120x2880 / 2560x1440 effective).

## Problems to solve

1. **Small screens**: panels get too small to be usable in 3x2 or 4x2 layouts on a 13" laptop. Terminal text becomes unreadable.
2. **Large screens**: panels have too much empty space on 27" monitors. Terminals don't fill their allocated grid area.
3. **The toolbar**: two rows (74px total) eat a large percentage on small screens.
4. **xterm.js fit**: `fitAll()` must recalculate correctly at every breakpoint.

## Implementation

### CSS media queries in `packages/client/public/style.css`

```css
/* Small screens: 13" laptop */
@media (max-height: 800px) {
  .topbar-row-1 { height: 36px; }
  .topbar-row-2 { height: 28px; }
  .layout-btn { padding: 3px 7px; font-size: 10px; }
  .topbar-right button { padding: 3px 6px; font-size: 10px; }
}

@media (max-width: 1280px) {
  /* Disable 3x2 and 4x2 — too many columns for narrow screens */
  .grid-container.layout-3x2 { grid-template-columns: repeat(2, 1fr); }
  .grid-container.layout-4x2 { grid-template-columns: repeat(2, 1fr); }
}
```

### Minimum panel dimensions

Add `min-height` and `min-width` to `.term-panel` so terminals never shrink below readable size:
```css
.term-panel {
  min-height: 150px;
  min-width: 200px;
}
```

### fitAll improvements in `packages/client/public/app.js`

After any layout change or window resize, call `fitAll()` with a small debounce (100ms) to avoid rapid recalculation during resize drag.

Add `window.addEventListener('resize', debounce(fitAll, 100))` if not already present.

## Files you own
- packages/client/public/style.css (media queries + min dimensions)
- packages/client/public/app.js (fitAll debounce + resize handler only)

## Acceptance criteria
- [ ] All layouts visible on 1280x800 (13" MacBook Air)
- [ ] 3x2 and 4x2 gracefully degrade on narrow screens
- [ ] Toolbar compact on small screens
- [ ] Terminals fill available space on large screens
- [ ] fitAll fires on window resize with debounce
- [ ] Write [T1] DONE to STATUS.md
