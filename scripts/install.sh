#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${PASSIDECK_HOME:-$HOME/.passideck}"
PORT="${PASSIDECK_PORT:-8791}"
HOST="${PASSIDECK_HOST:-127.0.0.1}"
SOCKET="${PASSIDECK_TMUX_SOCKET:-passideck}"
cd "$ROOT"
command -v node >/dev/null
command -v npm >/dev/null
command -v tmux >/dev/null
npm install
npm run prepare-assets
mkdir -p "$HOME_DIR"
if [ ! -f "$HOME_DIR/config.yaml" ]; then
  cat > "$HOME_DIR/config.yaml" <<YAML
host: $HOST
port: $PORT
shell: /bin/bash
defaultTheme: tokyo-night
projects: {}
YAML
fi
quote_env() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}
cat > "$HOME_DIR/passideck.env" <<ENV
PASSIDECK_HOME=$(quote_env "$HOME_DIR")
PASSIDECK_TMUX_SOCKET=$(quote_env "$SOCKET")
PASSIDECK_ROOT=$(quote_env "$ROOT")
NODE_ENV=production
ENV
printf 'PassiDeck installed\nrepo=%s\nhome=%s\nstart=%s\n' "$ROOT" "$HOME_DIR" "PASSIDECK_HOME=$HOME_DIR PASSIDECK_TMUX_SOCKET=$SOCKET npm start -- --host $HOST --port $PORT"
