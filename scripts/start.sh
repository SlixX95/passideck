#!/bin/bash
# TermDeck Full Stack Launcher — boots TermDeck + Mnestra + Rumen
# Usage: ./scripts/start.sh [--port PORT]
#
# Sprint 22 T2 rewrite:
#   - Numbered step-by-step output (Step N/4)
#   - Smart Mnestra handling: kill+restart if running with 0 memories
#   - First-run bootstrap: create minimal ~/.termdeck/config.yaml
#   - Non-TermDeck port conflict: warn and suggest a different port
set -e

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
DIM='\033[2m'; BOLD='\033[1m'; RESET='\033[0m'

SECRETS_FILE="${HOME}/.termdeck/secrets.env"
CONFIG_FILE="${HOME}/.termdeck/config.yaml"
CONFIG_DIR="${HOME}/.termdeck"
MNESTRA_PORT="${MNESTRA_PORT:-37778}"
EXTRA_ARGS=()

# ── Parse flags ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done
PORT="${PORT:-${TERMDECK_PORT:-3000}}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TERMDECK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Pretty-print helpers ──────────────────────────────────────────────
# step_line prints: "Step N/4: Label .................... STATUS   detail"
# Dots are padded so the STATUS column aligns across lines.
LINE_WIDTH=52

step_line() {
  # $1=step (e.g. "1/4"), $2=label, $3=status (OK/WARN/SKIP/FAIL/BOOT), $4=detail
  local step="$1" label="$2" status="$3" detail="$4"
  local prefix="Step ${step}: ${label} "
  local pad=$((LINE_WIDTH - ${#prefix}))
  [ $pad -lt 3 ] && pad=3
  local dots
  dots=$(printf '%*s' "$pad" '' | tr ' ' '.')
  local tag
  case "$status" in
    OK)    tag="${GREEN}OK${RESET}  " ;;
    WARN)  tag="${YELLOW}WARN${RESET}" ;;
    SKIP)  tag="${DIM}SKIP${RESET}" ;;
    FAIL)  tag="${RED}FAIL${RESET}" ;;
    BOOT)  tag="${GREEN}BOOT${RESET}" ;;
    *)     tag="$status" ;;
  esac
  if [ -n "$detail" ]; then
    printf "%s${DIM}%s${RESET} %s  ${DIM}%s${RESET}\n" "$prefix" "$dots" "$tag" "$detail"
  else
    printf "%s${DIM}%s${RESET} %s\n" "$prefix" "$dots" "$tag"
  fi
}

sub_note() { printf "  ${DIM}└ %s${RESET}\n" "$1"; }

echo ""
echo -e "${BOLD}TermDeck Stack Launcher${RESET}"
echo -e "${DIM}─────────────────────────────────────────────────${RESET}"
echo ""

# ── Preflight: Node 18+ ──────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✗ Node.js is not installed. TermDeck requires Node 18+.${RESET}"; exit 1
fi
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo -e "  ${RED}✗ Node $NODE_MAJOR detected — TermDeck requires Node 18+. Current: $(node -v)${RESET}"
  exit 1
fi

# ── First-run bootstrap: create minimal config.yaml if missing ──────
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "  ${BLUE}ⓘ${RESET} First run detected — creating ${CONFIG_FILE}"
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" <<'EOF'
# TermDeck config (auto-generated on first run by scripts/start.sh)
# Full reference: config/config.example.yaml in the TermDeck repo.

port: 3000
host: 127.0.0.1
shell: /bin/zsh

defaultTheme: tokyo-night

# Mnestra (pgvector memory store) — auto-start on stack launch
mnestra:
  autoStart: true

# Add your projects here to enable `cc <project>` shorthand + auto-cd.
projects:
  # my-project:
  #   path: ~/code/my-project
  #   defaultTheme: catppuccin-mocha
  #   defaultCommand: claude

rag:
  enabled: false
  syncIntervalMs: 10000

sessionLogs:
  enabled: false
EOF
  sub_note "Edit $CONFIG_FILE to add projects or tweak defaults."
  sub_note "Open http://localhost:$PORT and click 'config' to complete setup"
  echo ""
fi

# ── Step 1/4: Load secrets ───────────────────────────────────────────
if [ -f "$SECRETS_FILE" ]; then
  set -a; source "$SECRETS_FILE"; set +a
  KEY_COUNT=$(grep -cE '^[A-Z_]+=' "$SECRETS_FILE" 2>/dev/null || echo 0)
  step_line "1/4" "Loading secrets" "OK" "($KEY_COUNT keys from $SECRETS_FILE)"
else
  step_line "1/4" "Loading secrets" "SKIP" "(no $SECRETS_FILE — Tier 1 only)"
fi

# ── Port sanity check: claim target port if stale TermDeck is on it ─
port_pids() {
  local port="$1"
  if command -v lsof &>/dev/null; then
    lsof -ti TCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v fuser &>/dev/null; then
    fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

STALE_PIDS=$(port_pids "$PORT")
if [ -n "$STALE_PIDS" ]; then
  IS_TERMDECK=false
  for pid in $STALE_PIDS; do
    if ps -o command= -p "$pid" 2>/dev/null | grep -qE 'packages/cli/src/index\.js|termdeck'; then
      IS_TERMDECK=true
    fi
  done
  if [ "$IS_TERMDECK" = "true" ]; then
    for pid in $STALE_PIDS; do kill "$pid" 2>/dev/null || true; done
    sleep 1
    for pid in $STALE_PIDS; do kill -9 "$pid" 2>/dev/null || true; done
    sub_note "Killed stale TermDeck on port $PORT (PIDs: $(echo $STALE_PIDS | tr '\n' ' '))"
  else
    echo -e "  ${RED}✗${RESET} Port $PORT is in use by a non-TermDeck process (PIDs: $(echo $STALE_PIDS | tr '\n' ' '))"
    sub_note "Try a different port: ./scripts/start.sh --port $((PORT + 1))"
    exit 1
  fi
fi

# ── Step 2/4: Start Mnestra ──────────────────────────────────────────
MNESTRA_CMD=""
if command -v mnestra &>/dev/null; then
  MNESTRA_CMD="mnestra"
elif [ -f "$HOME/Documents/Graciella/engram/dist/mcp-server/index.js" ]; then
  MNESTRA_CMD="node $HOME/Documents/Graciella/engram/dist/mcp-server/index.js"
fi

# Read mnestra.autoStart: true | false | unset
MNESTRA_AUTOSTART="unset"
if [ -f "$CONFIG_FILE" ]; then
  MNESTRA_AUTOSTART=$(CONFIG_FILE="$CONFIG_FILE" python3 -c "
import os
try:
    import yaml
    c = yaml.safe_load(open(os.environ['CONFIG_FILE'])) or {}
    v = (c.get('mnestra') or {}).get('autoStart', None)
    if v is True: print('true')
    elif v is False: print('false')
    else: print('unset')
except Exception:
    print('unset')
" 2>/dev/null || echo "unset")
fi

mnestra_rows() {
  local health
  health=$(curl -s --max-time 3 "http://localhost:$MNESTRA_PORT/healthz" 2>/dev/null || echo '{}')
  echo "$health" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('store', {}).get('rows', 0))
except Exception:
    print(0)
" 2>/dev/null || echo "0"
}

start_mnestra_detached() {
  nohup $MNESTRA_CMD serve >/tmp/termdeck-mnestra.log 2>&1 </dev/null &
  disown 2>/dev/null || true
  # Wait up to 10s for healthz
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf --max-time 1 "http://localhost:$MNESTRA_PORT/healthz" &>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

MNESTRA_ACTIVE=false
MNESTRA_ROWS=0
MNESTRA_STATUS=""
MNESTRA_DETAIL=""

EXISTING_MNESTRA_PIDS=$(port_pids "$MNESTRA_PORT")

if [ -n "$EXISTING_MNESTRA_PIDS" ]; then
  if curl -sf --max-time 2 "http://localhost:$MNESTRA_PORT/healthz" &>/dev/null; then
    MNESTRA_ROWS=$(mnestra_rows)
    if [ "$MNESTRA_ROWS" != "0" ]; then
      MNESTRA_ACTIVE=true
      MNESTRA_STATUS="OK"
      MNESTRA_DETAIL="(already running, $(printf "%'d" "$MNESTRA_ROWS") memories)"
    else
      # Running but empty — kill and restart with secrets loaded
      for pid in $EXISTING_MNESTRA_PIDS; do kill "$pid" 2>/dev/null || true; done
      sleep 1
      for pid in $EXISTING_MNESTRA_PIDS; do kill -9 "$pid" 2>/dev/null || true; done
      if [ -z "$MNESTRA_CMD" ]; then
        MNESTRA_STATUS="FAIL"; MNESTRA_DETAIL="(0 memories, killed; mnestra binary not found to restart)"
      elif [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        MNESTRA_STATUS="WARN"; MNESTRA_DETAIL="(killed; SUPABASE_URL/SERVICE_ROLE_KEY missing in secrets.env)"
      elif start_mnestra_detached; then
        MNESTRA_ROWS=$(mnestra_rows)
        if [ "$MNESTRA_ROWS" != "0" ]; then
          MNESTRA_ACTIVE=true
          MNESTRA_STATUS="OK"
          MNESTRA_DETAIL="(restarted with secrets, $(printf "%'d" "$MNESTRA_ROWS") memories)"
        else
          MNESTRA_STATUS="WARN"; MNESTRA_DETAIL="(restarted but store empty — check Supabase connection)"
        fi
      else
        MNESTRA_STATUS="FAIL"; MNESTRA_DETAIL="(restart failed — see /tmp/termdeck-mnestra.log)"
      fi
    fi
  else
    MNESTRA_STATUS="WARN"
    MNESTRA_DETAIL="(port $MNESTRA_PORT held by non-Mnestra process)"
  fi
elif [ -z "$MNESTRA_CMD" ]; then
  MNESTRA_STATUS="SKIP"
  MNESTRA_DETAIL="(not installed — npm install -g @jhizzard/mnestra)"
elif [ "$MNESTRA_AUTOSTART" = "false" ]; then
  MNESTRA_STATUS="SKIP"
  MNESTRA_DETAIL="(autoStart: false in config.yaml)"
elif [ "$MNESTRA_AUTOSTART" = "unset" ]; then
  MNESTRA_STATUS="SKIP"
  MNESTRA_DETAIL="(set mnestra.autoStart: true in $CONFIG_FILE)"
elif [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  MNESTRA_STATUS="WARN"
  MNESTRA_DETAIL="(SUPABASE_URL/SERVICE_ROLE_KEY missing in $SECRETS_FILE)"
else
  if start_mnestra_detached; then
    MNESTRA_ROWS=$(mnestra_rows)
    if [ "$MNESTRA_ROWS" != "0" ]; then
      MNESTRA_ACTIVE=true
      MNESTRA_STATUS="OK"
      MNESTRA_DETAIL="($(printf "%'d" "$MNESTRA_ROWS") memories on :$MNESTRA_PORT)"
    else
      MNESTRA_STATUS="WARN"
      MNESTRA_DETAIL="(started on :$MNESTRA_PORT but store is empty)"
    fi
  else
    MNESTRA_STATUS="FAIL"
    MNESTRA_DETAIL="(did not come up within 10s — /tmp/termdeck-mnestra.log)"
  fi
fi

step_line "2/4" "Starting Mnestra" "$MNESTRA_STATUS" "$MNESTRA_DETAIL"

# MCP config hint (only once, only if Mnestra is active)
if $MNESTRA_ACTIVE; then
  MCP_CFG="${HOME}/.claude/mcp.json"
  if [ ! -f "$MCP_CFG" ] || ! python3 -c "import json,sys; d=json.load(open('$MCP_CFG')); sys.exit(0 if 'mnestra' in str(d) else 1)" 2>/dev/null; then
    sub_note "Hint: add a 'mnestra' entry to ~/.claude/mcp.json for Claude Code"
  fi
fi

# ── Step 3/4: Check Rumen ────────────────────────────────────────────
RUMEN_DIR="$TERMDECK_ROOT/packages/server/src/setup/rumen"
RUMEN_AGO=""
RUMEN_STATUS=""
RUMEN_DETAIL=""

if [ ! -d "$RUMEN_DIR" ]; then
  RUMEN_STATUS="SKIP"; RUMEN_DETAIL="(rumen setup not installed)"
elif [ -z "$DATABASE_URL" ]; then
  RUMEN_STATUS="SKIP"; RUMEN_DETAIL="(DATABASE_URL not set in secrets.env)"
elif ! command -v psql &>/dev/null; then
  RUMEN_STATUS="SKIP"; RUMEN_DETAIL="(psql not installed)"
else
  RUMEN_AGO=$(psql "$DATABASE_URL" -tAc "SELECT NOW() - MAX(created_at) FROM rumen_jobs" 2>/dev/null | sed 's/\.[0-9]*//' | awk '{$1=$1;print}' || true)
  if [ -n "$RUMEN_AGO" ]; then
    RUMEN_STATUS="OK"; RUMEN_DETAIL="(last job $RUMEN_AGO ago)"
  else
    RUMEN_STATUS="WARN"; RUMEN_DETAIL="(no jobs yet — try termdeck init --rumen)"
  fi
fi

step_line "3/4" "Checking Rumen" "$RUMEN_STATUS" "$RUMEN_DETAIL"

# Transcript migration hint (non-blocking)
if [ -n "$DATABASE_URL" ] && command -v psql &>/dev/null; then
  if ! psql "$DATABASE_URL" -c "SELECT 1 FROM termdeck_transcripts LIMIT 0" &>/dev/null; then
    sub_note "Transcript table missing. Run: psql \$DATABASE_URL -f config/transcript-migration.sql"
  fi
fi

# ── Build summary line ───────────────────────────────────────────────
SUMMARY="TermDeck :$PORT"
if $MNESTRA_ACTIVE; then
  SUMMARY="$SUMMARY | Mnestra :$MNESTRA_PORT ($(printf "%'d" "$MNESTRA_ROWS"))"
fi
if [ -n "$RUMEN_AGO" ]; then
  SUMMARY="$SUMMARY | Rumen ($RUMEN_AGO ago)"
fi

# ── Step 4/4: Start TermDeck ─────────────────────────────────────────
step_line "4/4" "Starting TermDeck" "BOOT" "(port $PORT)"
echo ""
echo -e "  ${BOLD}Stack:${RESET} ${GREEN}${SUMMARY}${RESET}"
echo ""

cd "$TERMDECK_ROOT"
# --no-stack tells the v0.5.0+ CLI to skip its auto-orchestrate detection,
# since this script already did the orchestration above. Without the flag
# the CLI would route back through stack.js and print the banner twice.
exec node packages/cli/src/index.js --port "$PORT" --no-stack "${EXTRA_ARGS[@]}"
