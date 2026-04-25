# T2 — Flashback Modal

## Goal

Replace the current Flashback toast click behavior (opens panel drawer Memory tab, hard to read) with a proper modal that shows the matched memory clearly.

### Current behavior
When a Flashback toast fires, clicking it opens the panel's drawer and switches to the Memory tab. The content is buried and hard to read.

### Target behavior
Clicking a Flashback toast opens a centered modal with:
- **Header:** "Flashback — similar issue found" with the project tag and similarity score
- **Body:** The matched memory content, rendered as readable text (not raw JSON)
- **Source info:** When the memory was created, which project, source type
- **Actions:** "Dismiss" button, "This helped" / "Not relevant" feedback buttons (fire-and-forget to the server — just log it for now, don't need a feedback endpoint yet)
- **Close:** Click outside, Escape, or X button

### Implementation

In `packages/client/public/app.js`:
1. Find the Flashback toast click handler (search for `proactive_memory` or `flashback`)
2. Instead of opening the drawer, call a new `showFlashbackModal(data)` function
3. The modal should reuse the styling patterns from the existing Rumen insights modal and health dropdown

In `packages/client/public/style.css`:
1. Add `.flashback-modal` styles — dark overlay, centered card, max-width 600px
2. Match the existing dark theme aesthetic

### Data shape
The `proactive_memory` WebSocket message contains:
```json
{
  "type": "proactive_memory",
  "match": {
    "content": "...",
    "project": "...",
    "source_type": "...",
    "similarity": 0.85,
    "created_at": "..."
  }
}
```

## Files you own
- packages/client/public/app.js (Flashback modal function + toast click handler)
- packages/client/public/style.css (modal styles)

## Acceptance criteria
- [ ] Clicking a Flashback toast opens a readable modal
- [ ] Modal shows content, project tag, similarity score, timestamp
- [ ] Modal closes on Escape, click-outside, or X button
- [ ] Dismiss / feedback buttons present (feedback can be console.log for now)
- [ ] Existing toast appearance unchanged — only the click behavior changes
- [ ] Write [T2] DONE to STATUS.md
