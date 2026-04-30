# PassiDeck

PassiDeck is a compact self-hosted browser terminal wall for server-side shells.

## Purpose

Run multiple long-lived terminal sessions in one browser window without losing them on browser reload.

## Runtime

- Local URL: `http://127.0.0.1:8791`
- Public URL: `http://42.69.42.40:8791`
- User service: `passideck.service`
- Config: `/home/hermo/.passideck/config.yaml`
- UI state: `/home/hermo/.passideck/ui-state.json`
- Session DB: `/home/hermo/.passideck/passideck.db`
- Uploads: `/home/hermo/.passideck/uploads/YYYY-MM-DD/`

## Features

- Shell, Hermes, and Codex quick launch.
- xterm.js panes with WebSocket input/output.
- Server-side tmux-backed sessions.
- Browser reload reconnect.
- Client-side xterm snapshots for reload visuals.
- Server-side layout state.
- Auto-growing layouts: `auto`, `1x1`, `2x1`, `3x1`, `4x1`, `1x2`, `1x3`, `1x4`.
- Editable pane titles.
- Pane minimize/restore with bottom tab bar.
- Pane swap drag/drop.
- Per-pane connection status dot.
- Ctrl+V and right-click terminal paste bridge.
- Clipboard image/file upload bridge.
- Optional bottom system monitor.
- Chrome hide/show mode with `Alt+0`.
- Theme selector.

## Architecture

```text
browser
  static UI: packages/client/public/
  xterm.js panes
  WebSocket /ws
    |
node server: packages/server/src/index.js
  Express API
  ws server
  SessionManager
  SQLite session metadata
  tmux attach clients
    |
tmux socket: tmux -L passideck
  passideck_<session-id> sessions
  shell / hermes / codex processes
```

PassiDeck uses its own tmux socket: `tmux -L passideck`.
Do not share tmux's default socket with Hermes WebTerm or other services.

## Commands

```bash
cd /home/hermo/projects/passideck
npm install
npm test
npm run server
```

Production service:

```bash
systemctl --user status passideck.service
systemctl --user restart passideck.service
journalctl --user -u passideck.service -n 120 --no-pager
```

Restarting `passideck.service` detaches Node clients and can affect live panes; check `/api/health` first.

## API

```text
GET    /api/health
GET    /api/config
GET    /api/ui-state
PUT    /api/ui-state
GET    /api/system-metrics
GET    /api/sessions
POST   /api/sessions
POST   /api/sessions/:id/input
POST   /api/sessions/:id/resize
DELETE /api/sessions/:id
POST   /api/uploads
POST   /api/uploads/cleanup
GET    /uploads/...
WS     /ws?session=<id>
```

## Session lifecycle

1. Browser calls `POST /api/sessions`.
2. Server creates a named tmux session `passideck_<uuid>`.
3. Server attaches a PTY client to tmux.
4. Browser connects to `/ws?session=<id>`.
5. Browser input is forwarded to the PTY.
6. PTY output streams back to xterm.js.
7. Browser reload reconnects to the existing server session.
8. Explicit close kills the tmux session and marks the DB row exited.

## Layout and resize safety

Terminal resize is fragile because xterm can corrupt visual state when dimensions change before CSS reflow settles.

Current resize rules:

- All resize-sensitive UI paths route through `scheduleTerminalFit()`.
- Fit runs immediate, after 50ms, and after 250ms.
- Hidden/minimized panes are not fitted.
- xterm is resized only when rows or columns changed.
- Prompt stays visible via `scrollToBottom` when the pane was already at bottom.

Covered paths:

- layout changes
- window resize
- ResizeObserver
- pane create
- pane select
- minimize/restore
- smart restore/swap
- system monitor toggle
- chrome hide/show
- font-size changes
- websocket reconnect

## Testing

```bash
cd /home/hermo/projects/passideck
npm test
curl -fsS http://127.0.0.1:8791/api/health
curl -fsS http://127.0.0.1:8791/api/sessions
```

Manual resize smoke:

1. Create four shell sessions.
2. Switch layouts: `1x4`, `4x1`, `auto`, `1x2`, `3x1`.
3. Verify `.xterm-screen` and `.xterm-viewport` height do not exceed `.terminal` height.
4. Type `echo resize_safe_ok` in the active pane.
5. Delete smoke sessions.

## Development rules

- Static UI changes in `packages/client/public/` need browser reload only.
- Backend changes need service restart.
- Cache-bust `index.html` after changing `app.js` or `style.css`.
- Keep PassiDeck compact; shell space wins over decoration.
- Do not reintroduce auth, RAG, docs site, setup wizard, focus/half modes, or old two-row topbar.
- Do not print server replay markers into xterm.
- Do not resize hidden xterms.

## Known limits

- Cross-device UI state syncs through `/api/ui-state`.
- Cross-device terminal rendering depends on browser-side snapshots and live WebSocket state.
- Service restart can still interrupt PTY attach clients, though tmux sessions can survive.
- Browser snapshots cannot recover scrollback lost before the snapshot feature loaded.
