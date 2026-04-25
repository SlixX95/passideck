# T4 — Client Health Badge + Transcript Recovery UI

## Goal

Add visible health status to the TermDeck dashboard so users immediately see if the memory stack is operational. Add a transcript viewer for crash recovery.

## Context

The demo failure on 2026-04-16 would have been caught instantly if the dashboard showed a red "Mnestra: DOWN" badge instead of silently degrading. The user needs to see at a glance: is the three-tier stack working?

## Deliverables

### 1. Health status badge in the top toolbar (`packages/client/public/app.js`)

Poll `GET /api/health` every 30 seconds. Display a compact badge in the top bar (next to the existing Rumen insights badge):

**When all checks pass:**
```
[shield icon] Stack: OK
```
Green text, compact. Clicking opens a dropdown with each check's detail.

**When any check fails:**
```
[warning icon] Stack: 2/5
```
Red/amber text, pulsing. Clicking opens the dropdown showing which checks failed with remediation hints.

**When /api/health is unreachable:**
```
[X icon] Health: offline
```

The dropdown should show each check from the preflight result:
```
Mnestra ............ OK (3,527 memories)
Rumen .............. OK (last job 12m ago)
Database ........... OK (84ms)
Project paths ...... OK (14/14)
Shell .............. OK (zsh 0.4s)
```

Failed checks show in red with the remediation hint.

### 2. Transcript recovery panel (`packages/client/public/app.js`)

Add a "Transcripts" button to the top bar (or to the control menu). Clicking opens a modal/panel with:

**Recent activity view** (default):
- Calls `GET /api/transcripts/recent?minutes=60`
- Shows session-grouped output with timestamps
- Each session shows: session ID, type, project tag, and the last N lines of output

**Search view:**
- Text input that calls `GET /api/transcripts/search?q=...`
- Results show matching lines with session context and timestamps

**Session replay view:**
- Click a session from either view to load its full transcript
- `GET /api/transcripts/:sessionId`
- Rendered as a scrollable pre-formatted text block
- "Copy to clipboard" button for the full transcript

### 3. Styles in `packages/client/public/style.css`

- Health badge: green/amber/red states, pulse animation for failures
- Health dropdown: positioned below the badge, dark theme consistent with existing UI
- Transcript modal: full-width overlay, dark background, monospace content
- Search results: highlighted match terms

### 4. Graceful degradation

If `/api/health` returns 404 (server doesn't have the health endpoint yet), hide the badge entirely — don't show an error. Same for transcript endpoints. This ensures the client works with older server versions.

## Files you own
- `packages/client/public/app.js` (modify — add health badge + transcript UI)
- `packages/client/public/style.css` (modify — add health/transcript styles)

## Files you must NOT touch
- `packages/server/src/*` (T1/T2/T3)
- `packages/cli/src/*` (T1)
- `packages/client/public/index.html` (frozen after Sprint 5 T2 split)

## Acceptance criteria
- [ ] Health badge visible in top bar, polls every 30s
- [ ] Green/amber/red states with dropdown detail on click
- [ ] Transcript recovery panel with recent/search/replay views
- [ ] Copy-to-clipboard for full session transcript
- [ ] Graceful degradation when endpoints are unavailable (no errors, just hidden)
- [ ] Styles consistent with existing Tokyo Night / dark theme aesthetic
- [ ] No new CDN dependencies

## Dependencies
- T1 must have `/api/health` endpoint for the health badge
- T3 must have `/api/transcripts/*` endpoints for the transcript viewer
- Start with the health badge (T1 is independent), add transcript UI when T3 signals `[T3] ENDPOINTS READY`
