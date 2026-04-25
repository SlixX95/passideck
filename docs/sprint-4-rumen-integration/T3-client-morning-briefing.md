# T3 — Client top-bar badge + morning briefing modal

## Why this matters

Rumen is now generating cross-project insights in the background. TermDeck's audit report called out the "morning briefing" as the highest-value UI surface — the feature that makes users keep coming back because their tools learned something while they were away. This is that feature.

## Scope (T3 exclusive ownership)

You own this file. Do not touch anything outside this list.

- `packages/client/public/index.html` — add a badge to the top bar + a morning briefing modal

## Critical dependency on T2

You need `docs/sprint-4-rumen-integration/API-CONTRACT.md` to start UI work. T2 is writing it as their first action. While you wait for the contract:

1. Read the existing top-bar structure in `index.html` — find where the global stats are rendered (active/thinking/idle counts near the top).
2. Read the existing modal/dialog code if any exists — look for overlay or dialog patterns already in use.
3. Plan where the badge will sit and how the modal will be triggered.
4. Do NOT start writing any fetch code or render logic until API-CONTRACT.md exists.

Check for the file periodically with:
```bash
test -f docs/sprint-4-rumen-integration/API-CONTRACT.md && echo READY
```

## Deliverable

### 1. Top-bar insights badge

Add a small pill/badge next to the existing global stats that shows:
- **When unseen insights > 0:** a colored badge with the count, e.g. `💡 7 new insights` (use a distinctive color — amber or teal, whatever fits the existing palette)
- **When unseen insights == 0:** a dim muted badge, e.g. `💡 111 insights` (so the feature is still discoverable)
- **When Rumen isn't configured:** nothing at all — badge hidden

The badge is clickable. Clicking opens the morning briefing modal.

### 2. Morning briefing modal

A centered overlay modal (like existing TermDeck dialogs — match the theme). Contains:
- Header: `Rumen Insights — {total_insights} total · {unseen_count} new`
- Last run summary: `Last processed: {last_job_sessions_processed} sessions → {last_job_insights_generated} insights · {relative time ago}`
- **Filter row:** dropdown for project filter, sort by (newest/highest confidence), toggle "unseen only"
- **Insight list** — each item shows:
  - insight_text (main content)
  - confidence bar or pill (e.g., "conf 0.58")
  - projects as chips/tags
  - "Mark seen" button (calls POST /api/rumen/insights/:id/seen)
  - relative timestamp ("3 hours ago")
- Footer: close button (Escape also closes)

### 3. Polling / refresh

- On client load, call `/api/rumen/status` to check if Rumen is enabled and populate the badge.
- Every 60 seconds, re-poll `/api/rumen/status` so the badge updates when the 15-min pg_cron fires.
- When the modal opens, call `/api/rumen/insights` fresh with the current filter state.

## Acceptance criteria

- [ ] Badge appears in the top bar when `/api/rumen/status` returns `enabled: true`.
- [ ] Badge shows correct unseen count, colored when > 0, muted when 0.
- [ ] Clicking the badge opens the modal with a list of insights.
- [ ] Clicking "Mark seen" on an insight fades it out, decrements the badge count, and persists via POST.
- [ ] Project filter works — selecting a project narrows the list.
- [ ] Escape closes the modal.
- [ ] When Rumen is NOT configured (`enabled: false`), the badge is hidden entirely — no error toast, no broken UI.
- [ ] Modal is keyboard-navigable and screen-reader-tolerant (use semantic HTML where possible).
- [ ] Matches the existing TermDeck theme (don't introduce new CSS frameworks; reuse existing tokens/variables).

## Non-goals

- Do NOT add real-time push (WebSocket) for insights. v0.4 can add that if polling proves too sluggish.
- Do NOT build an inline insight feed in the terminal panels themselves — that's a separate feature for a future sprint.
- Do NOT touch the server. T2 owns all HTTP endpoints.
- Do NOT touch init-rumen.js. T1 owns that.
- Do NOT delete or refactor any existing client code. Add only.

## Testing

1. Start the server with Rumen configured: `node packages/server/src/index.js`
2. Open `http://localhost:3000` in a browser
3. Verify the badge appears with the correct count
4. Click it, verify the modal opens and shows insights
5. Mark an insight seen, verify the badge decrements
6. Apply a project filter, verify the list narrows
7. Close and reopen — verify state persists (via server)
8. Temporarily break the server's Rumen config (unset DATABASE_URL), restart, verify the badge disappears

## Coordination

- Append significant progress to `docs/sprint-4-rumen-integration/STATUS.md`.
- **WAIT FOR `docs/sprint-4-rumen-integration/API-CONTRACT.md` to exist** before writing fetch code. Until then, do non-code prep only.
- When complete, write `[T3] DONE` with a summary.
