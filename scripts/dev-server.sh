#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${PASSIDECK_HOME:-$ROOT/.dev-home}"
PORT="${PASSIDECK_PORT:-8792}"
HOST="${PASSIDECK_HOST:-127.0.0.1}"
SOCKET="${PASSIDECK_TMUX_SOCKET:-passideck-dev}"
export PASSIDECK_HOME="$HOME_DIR"
export PASSIDECK_TMUX_SOCKET="$SOCKET"
cd "$ROOT"
mkdir -p "$HOME_DIR"
npm start -- --host "$HOST" --port "$PORT" --no-open
