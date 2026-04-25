#!/usr/bin/env bash
# trigger-flashback.sh
#
# Sets up a 4-panel TermDeck dashboard and fires a Flashback in one panel for
# hero-GIF capture. Creates three decorative panels (visual filler so the GIF
# shows TermDeck as a real multiplexer) plus one trigger panel that produces a
# known-error command matching the output analyzer's error regex.
#
# Usage:
#   bash scripts/trigger-flashback.sh                    # default trigger: cat nonexistent file (ENOENT)
#   bash scripts/trigger-flashback.sh python_import      # Python ImportError trigger
#   bash scripts/trigger-flashback.sh module_not_found   # Node MODULE_NOT_FOUND trigger
#   bash scripts/trigger-flashback.sh connection_refused # ECONNREFUSED trigger
#
# Flags:
#   --no-filler   skip the three decorative panels (single-panel capture)
#   --cleanup     delete all four panels after capture (run with other flag)
#
# Prereqs:
#   - TermDeck server running on http://localhost:3000
#   - Browser open to http://localhost:3000 BEFORE running this script
#   - Mnestra configured (DATABASE_URL set + Sprint 4 T2 endpoints live)
#   - GIF recorder (Kap/CleanShot) installed and ready
#
# After running, you have ~25 seconds before the 30-second Flashback rate limit
# expires on the trigger panel, so record the GIF immediately.

set -euo pipefail

# Parse flags
TRIGGER="generic"
NO_FILLER=0
CLEANUP=0
for arg in "$@"; do
  case "$arg" in
    --no-filler) NO_FILLER=1 ;;
    --cleanup)   CLEANUP=1 ;;
    generic|python_import|module_not_found|connection_refused)
      TRIGGER="$arg"
      ;;
    *)
      echo "Unknown arg: $arg"
      echo "Usage: bash scripts/trigger-flashback.sh [generic|python_import|module_not_found|connection_refused] [--no-filler] [--cleanup]"
      exit 1
      ;;
  esac
done

BASE_URL="${TERMDECK_URL:-http://127.0.0.1:3000}"
CREATED_IDS=()

# Pick the trigger command based on the selected trigger type.
case "$TRIGGER" in
  generic)
    CMD='cat /Users/joshuaizzard/does-not-exist-flashback-trigger.txt'
    DESCRIPTION='cat nonexistent file (ENOENT)'
    ;;
  python_import)
    CMD='python3 -c "import this_module_definitely_does_not_exist"'
    DESCRIPTION='Python ImportError (Traceback)'
    ;;
  module_not_found)
    CMD='node -e "require(\"./definitely-not-a-real-module\")"'
    DESCRIPTION='Node MODULE_NOT_FOUND'
    ;;
  connection_refused)
    CMD='curl -fsS http://localhost:65432/health'
    DESCRIPTION='ECONNREFUSED on port 65432'
    ;;
esac

create_panel() {
  local label="$1"
  local command="$2"
  local reason="$3"
  local json
  json=$(curl -fsS -X POST "$BASE_URL/api/sessions" \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"shell\",\"project\":\"termdeck\",\"label\":\"$label\",\"command\":\"$command\",\"reason\":\"$reason\"}")
  local sid
  sid=$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  if [ -z "$sid" ]; then
    echo "[trigger-flashback] failed to create '$label' panel"
    echo "$json"
    exit 1
  fi
  CREATED_IDS+=("$sid")
  echo "[trigger-flashback] created '$label' panel → $sid"
}

inject() {
  local sid="$1"
  local cmd="$2"
  # JSON-encode the command string via python so embedded quotes, backticks,
  # and $(...) don't break the request body. Append \r to simulate Enter.
  local payload
  payload=$(CMD="$cmd" python3 -c 'import json, os; print(json.dumps({"text": os.environ["CMD"] + "\r"}))')
  curl -fsS -X POST "$BASE_URL/api/sessions/$sid/input" \
    -H 'Content-Type: application/json' \
    -d "$payload" > /dev/null
}

delete_panels() {
  for sid in "${CREATED_IDS[@]}"; do
    curl -fsS -X DELETE "$BASE_URL/api/sessions/$sid" > /dev/null || true
    echo "[trigger-flashback] deleted $sid"
  done
}

echo ""
echo "============================================="
echo "  HERO GIF SETUP — TermDeck Flashback"
echo "============================================="
echo ""

if [ "$NO_FILLER" -eq 0 ]; then
  echo "[trigger-flashback] creating 4 panels (3 filler + 1 trigger)..."

  # Three decorative filler panels to fill out a 2x2 grid — each runs a
  # low-impact, visually active command so the GIF shows real activity.
  create_panel "system stats" "bash" "filler panel for hero GIF"
  create_panel "dev server"   "bash" "filler panel for hero GIF"
  create_panel "log tail"     "bash" "filler panel for hero GIF"

  # The fourth panel is the trigger panel — this is where Flashback will fire.
  create_panel "Flashback demo" "bash" "flashback trigger for hero GIF"

  echo "[trigger-flashback] all 4 panels created"
  echo "[trigger-flashback] waiting 3s for shells to initialize..."
  sleep 3

  # Populate the three filler panels with visible activity commands that run
  # quickly and leave output on screen. None of these trigger Flashback.
  # Kept simple — no nested quotes or $() — so the JSON body is clean even
  # before the python-encoded injection fix.
  echo "[trigger-flashback] populating filler panels with visible activity..."
  inject "${CREATED_IDS[0]}" 'uname -sr && uptime'
  inject "${CREATED_IDS[1]}" 'ls -la packages/client/public/ | head -10'
  inject "${CREATED_IDS[2]}" 'ls -lt ~/.termdeck/'

  # The trigger panel is CREATED_IDS[3] — wait 1s for its shell to fully
  # initialize above the filler work, then inject the error command.
  TRIGGER_SID="${CREATED_IDS[3]}"
  sleep 1
else
  echo "[trigger-flashback] --no-filler: creating single trigger panel only..."
  create_panel "Flashback demo" "bash" "flashback trigger for hero GIF"
  sleep 3
  TRIGGER_SID="${CREATED_IDS[0]}"
fi

echo ""
echo "============================================="
echo "  ⚠️  SWITCH TO BROWSER AND START RECORDING"
echo "============================================="
echo ""
echo "  1. Switch to the TermDeck browser window NOW"
echo "  2. Switch to a 2x2 layout if not already (Cmd+Shift+4)"
echo "  3. Start your GIF recorder (Kap/CleanShot) on the dashboard"
echo "  4. Come back to this terminal and press ENTER to fire the trigger"
echo ""
read -p "  Press ENTER when recording is active..."

echo ""
echo "[trigger-flashback] firing trigger: $DESCRIPTION"
echo "[trigger-flashback] target panel: $TRIGGER_SID (labeled 'Flashback demo')"
inject "$TRIGGER_SID" "$CMD"

echo ""
echo "============================================="
echo "  🔴 RECORDING — follow this sequence"
echo "============================================="
echo ""
echo "  1. Watch the 'Flashback demo' panel for the error output"
echo "  2. The 'Mnestra — possible match' toast appears within 1-2s"
echo "  3. Let the toast linger for 2 seconds"
echo "  4. Click the toast — drawer opens, Memory tab renders"
echo "  5. Optionally: click the Rumen 💡 badge in the top bar"
echo "     to show the morning briefing modal for 2 seconds"
echo "  6. Stop recording at 10-14 seconds total"
echo "  7. Save the GIF to docs/screenshots/flashback-demo.gif"
echo ""
echo "  Rate limit: 30 seconds per panel for another Flashback fire"
echo ""

if [ "$CLEANUP" -eq 1 ]; then
  echo "[trigger-flashback] --cleanup: will delete all panels in 60s..."
  echo "  (plenty of time to finish recording)"
  sleep 60
  delete_panels
else
  echo "  To delete the test panels after recording:"
  for sid in "${CREATED_IDS[@]}"; do
    echo "    curl -X DELETE $BASE_URL/api/sessions/$sid"
  done
  echo ""
  echo "  Or re-run with --cleanup to auto-delete after 60s:"
  echo "    bash scripts/trigger-flashback.sh --cleanup"
fi

echo ""
echo "  If the trigger didn't produce a Flashback, re-run with a different"
echo "  trigger command (each retry creates a fresh batch of panels):"
echo "    bash scripts/trigger-flashback.sh python_import"
echo "    bash scripts/trigger-flashback.sh module_not_found"
echo "    bash scripts/trigger-flashback.sh connection_refused"
echo ""
