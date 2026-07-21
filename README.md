# PassiDeck Dev

Standalone self-hosted browser terminal wall.

## Goal

Install from a Git checkout and run without the live PassiDeck service or external CDN assets.

## Requirements

- Linux
- Node.js 20+
- npm
- tmux
- bash

## Install

```bash
git clone <repo-url> passideck
cd passideck
bash scripts/install.sh
npm start -- --host 127.0.0.1 --port 8791
```

Dev-isolated run, safe beside live PassiDeck:

```bash
cd /home/hermo/projects/passideck-dev
PASSIDECK_PORT=8792 PASSIDECK_HOME=$PWD/.dev-home PASSIDECK_TMUX_SOCKET=passideck-dev npm run dev
```

## Dynamic Hermes session titles

PassiDeck ships an optional Hermes companion plugin. It sets an immediate title
from the first prompt before the agent answers, then refines the title after
each later prompt with the user's configured Hermes
`auxiliary.title_generation` provider and model.

```bash
hermes plugins install SlixX95/passideck-dev/plugins/passideck-retitle --enable
```

The plugin is inert outside PassiDeck-launched terminals and does not modify
Hermes core or Hermes' session database. Configure the route in
`~/.passideck/config.yaml`:

```yaml
titleGenLlm: host_aux_title # default; use off to disable
```

## Runtime isolation

- Config/data root: `PASSIDECK_HOME` or `~/.passideck`
- tmux socket: `PASSIDECK_TMUX_ARGS` or `-L passideck`
- Dev default: `.dev-home` and `-L passideck-dev`
- Live PassiDeck is not touched by the dev script.

## Bundled frontend assets

`npm run prepare-assets` copies xterm assets from npm packages into `packages/client/public/vendor/`.
The browser loads local files only:

- `vendor/xterm.css`
- `vendor/xterm.js`
- `vendor/addon-fit.js`
- `vendor/addon-web-links.js`
- `vendor/addon-serialize.js`

## Commands

```bash
npm install
npm run prepare-assets
npm test
npm run dev
npm start -- --help
```

## Optional user service

```bash
bash scripts/install.sh
mkdir -p ~/.config/systemd/user
cp scripts/passideck.service ~/.config/systemd/user/passideck.service
systemctl --user daemon-reload
systemctl --user enable --now passideck.service
```

## Architecture

```text
browser -> local xterm assets -> WebSocket /ws -> Node server -> node-pty tmux attach -> tmux -L <socket> -> shell/hermes/codex
```

## Safety rule

Use `npm run dev` for experiments; it uses port `8792`, `.dev-home`, and tmux socket `passideck-dev`.
