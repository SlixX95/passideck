# T2 — Toolbar Button Audit + Wire Stubs

## Goal

Audit every single button and interactive element in the toolbar. Verify each one does something real. Wire any stubs or dead buttons to real functionality, or remove them if the feature doesn't exist yet.

## Audit checklist

Read `packages/client/public/app.js` and trace each toolbar element:

| Element | Expected behavior | Check |
|---------|------------------|-------|
| **Logo "TermDeck"** | None (branding) | Confirm no broken click handler |
| **Stats (active/thinking/idle)** | Live counts from status_broadcast | Verify updates on WS message |
| **RAG indicator** | Shows when rag.enabled | Verify it appears/hides correctly. Is it redundant with health badge? If so, hide it. |
| **Rumen insights badge** | Click opens morning briefing modal | Verify modal opens, data loads |
| **Health badge** | Click opens dropdown with per-check detail | Verify dropdown renders, click-outside closes |
| **Layout buttons (1x1-4x2)** | Switch grid layout | Verify each layout works |
| **shell/claude/python quick-launch** | Create terminal with that command | Verify PTY spawns |
| **transcripts** | Open transcript recovery panel | Verify panel opens, recent/search/replay work |
| **status** | Open status modal | Is this wired? If stub, wire it or remove it |
| **config** | Open config modal | Is this wired? If stub, wire it or remove it |
| **how this works** | Start onboarding tour | Verify tour starts |
| **help** | Open docs site | Verify link works |

For any button that is a stub (console.log only, alert, or no-op):
- If the feature is simple (show config, show status), wire it to show real data
- If the feature is complex and not built, remove the button and note it in STATUS.md

## Files you own
- packages/client/public/app.js (button handlers only)

## Acceptance criteria
- [ ] Every toolbar button either does something real or is removed
- [ ] No console.log stubs remain in toolbar handlers
- [ ] Status button shows real data or is removed
- [ ] Config button shows real data or is removed
- [ ] RAG indicator removed if redundant with health badge
- [ ] Write [T2] DONE to STATUS.md with full audit results
