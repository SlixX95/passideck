# T3 — Auto-Start Mnestra from start.sh

## Goal

Make `scripts/start.sh` smart enough to auto-start Mnestra based on a config flag, and detect first-run to ask the user.

## Implementation

### 1. Config flag in `~/.termdeck/config.yaml`

Support a new setting:
```yaml
mnestra:
  autoStart: true  # start mnestra serve automatically on boot
```

### 2. Update `scripts/start.sh`

Read the config flag:
```bash
MNESTRA_AUTOSTART=$(python3 -c "
import yaml
try:
    c = yaml.safe_load(open('$CONFIG_FILE'))
    print(c.get('mnestra', {}).get('autoStart', 'unset'))
except: print('unset')
" 2>/dev/null)
```

Logic:
- If `autoStart: true` → start Mnestra automatically (current behavior, but only when flag is set)
- If `autoStart: false` → skip Mnestra, print "Mnestra auto-start disabled (set mnestra.autoStart: true to enable)"
- If `autoStart: unset` (no config or first run) → print "Mnestra detected but not configured for auto-start. Run with --setup-mnestra to configure."

### 3. Update `config/config.example.yaml`

Add the mnestra section to the example config:
```yaml
mnestra:
  autoStart: true  # start mnestra serve automatically when TermDeck boots
```

### 4. Handle already-running Mnestra

Before starting, check if port 37778 is already occupied:
- If Mnestra is already running (healthz returns 200) → skip start, print "Mnestra already running"
- If port is occupied by something else → warn and skip

## Files you own
- scripts/start.sh
- config/config.example.yaml

## Acceptance criteria
- [ ] autoStart: true → Mnestra starts automatically
- [ ] autoStart: false → Mnestra skipped with message
- [ ] No config → hint message, doesn't crash
- [ ] Already-running Mnestra → detected and skipped
- [ ] config.example.yaml updated
- [ ] Write [T3] DONE to STATUS.md
