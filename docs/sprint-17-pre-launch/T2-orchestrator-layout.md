# T2 — Orchestrator Layout Preset

## Goal

Add a new "orchestrator" layout: 1 large panel on the left (60% width), 2-4 smaller panels stacked on the right (40%). This is the layout used during the 4+1 sprint pattern — one orchestrator terminal taking most of the screen, with worker terminals visible alongside.

## Implementation

### 1. CSS Grid template in `packages/client/public/style.css`

Add a new layout class:
```css
.layout-orch {
  grid-template-columns: 3fr 2fr;
  grid-template-rows: repeat(auto-fill, 1fr);
}
.layout-orch .term-panel:first-child {
  grid-row: 1 / -1; /* first panel spans all rows */
}
```

The first panel takes the full left column. Remaining panels stack in the right column.

### 2. Layout button in `packages/client/public/index.html`

Add an "orch" button in the topbar-center layout group, after "4x2" and before "control":
```html
<button class="layout-btn" data-layout="orch" title="Orchestrator: 1 large + stacked">orch</button>
```

### 3. Layout handler in `packages/client/public/app.js`

In the `setLayout` function, add the "orch" case:
- Apply `.layout-orch` to the grid
- First panel gets full left column
- Remaining panels split the right column evenly
- Add keyboard shortcut: Cmd+Shift+7 / Ctrl+Shift+7

### 4. Fit terminals after layout change

Call `fitAll()` after applying the orchestrator layout, same as other layouts.

## Files you own
- packages/client/public/style.css (layout styles)
- packages/client/public/app.js (layout handler + keyboard shortcut)
- packages/client/public/index.html (layout button)

## Acceptance criteria
- [ ] "orch" button visible in layout bar
- [ ] First panel takes 60% left, remaining stack on right
- [ ] Works with 2, 3, 4, and 5 panels
- [ ] Keyboard shortcut Cmd/Ctrl+Shift+7 works
- [ ] Terminals fit correctly after layout switch
- [ ] Write [T2] DONE to STATUS.md
