# PassiDeck

Minimal lokale Web-Terminal-Wand.

## Ziel

Viele serverseitige Terminals in einem Browserfenster.

## Enthalten

- shell / Hermes / Codex Quick-Launch
- xterm.js Panels
- serverseitige PTYs
- WebSocket Input/Output
- Browser-Reload Reconnect
- Output-Replay nach Reload
- serverseitige Layout-Persistenz
- Layouts: 1x1, 2x1, 2x2, 3x2, 2x4, 4x2
- Focus/Half Panel Mode

## Start

```bash
npm install
npm start -- --host 0.0.0.0 --port 8791 --no-open
```

Pascal-VM:

```bash
/home/hermo/bin/start-passideck
```

URL:

```text
http://42.69.42.40:8791
```

## Config

```text
/home/hermo/.passideck/config.yaml
/home/hermo/.passideck/ui-state.json
```
