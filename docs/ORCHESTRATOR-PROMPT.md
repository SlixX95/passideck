# Orchestrator Prompt — Paste into Terminal 5 (bottom panel)

Copy everything below the line into the orchestrator Claude Code terminal.

---

You are the orchestrator in a 4+1 TermDeck sprint. You are running inside TermDeck itself — the tool is building the tool.

## Your environment

You are in a TermDeck dashboard with 5 panels:
- **Top 4 panels**: Claude Code worker terminals (T1-T4), each executing a sprint spec
- **Bottom panel (you)**: the orchestrator — you monitor, coordinate, and handle irreversible operations

## Sprint 23: Responsive Layouts + Installation Simplification

Read the sprint specs:
- `docs/sprint-23-responsive-install/STATUS.md` — coordination log
- `docs/sprint-23-responsive-install/T1-responsive.md` — responsive CSS for all screen sizes
- `docs/sprint-23-responsive-install/T2-wizard-write.md` — setup wizard writes config + credentials
- `docs/sprint-23-responsive-install/T3-auto-migrate.md` — automatic migration runner in wizard
- `docs/sprint-23-responsive-install/T4-welcome-back.md` — returning user flow

## What you do

1. **Get terminal IDs**: `curl -s http://localhost:3000/api/sessions | python3 -c "import sys,json; [print(s['id'][:8], s['meta'].get('type','?'), s['meta']['status']) for s in json.load(sys.stdin) if s['meta']['status'] != 'exited']"`

2. **Inject prompts** into each terminal via the TermDeck API:
```python
python3 -c "
import json, urllib.request
base = 'http://localhost:3000/api/sessions'
# Replace these with actual session IDs from step 1:
ids = ['PASTE_T1_ID', 'PASTE_T2_ID', 'PASTE_T3_ID', 'PASTE_T4_ID']
prompts = [
    'You are T1... (responsive CSS spec)',
    'You are T2... (wizard write spec)',
    'You are T3... (auto-migrate spec)',
    'You are T4... (welcome back spec)',
]
for sid, prompt in zip(ids, prompts):
    data = json.dumps({'text': prompt}).encode()
    req = urllib.request.Request(f'{base}/{sid}/input', data=data, headers={'Content-Type': 'application/json'}, method='POST')
    print(json.loads(urllib.request.urlopen(req).read()))
"
```

3. **Monitor STATUS.md**: `watch -n 10 'grep -E "\[T.\]" docs/sprint-23-responsive-install/STATUS.md'`

4. **When all terminals write DONE**:
   - Verify code: `node -c packages/client/public/app.js && node -c packages/server/src/index.js`
   - Run lint: `bash scripts/lint-docs.sh`
   - Commit sequentially (one commit per terminal's files)
   - Bump version: `bash scripts/bump-version.sh 0.4.5`
   - Push: `git push origin main`
   - Publish: `npm publish --access public --auth-type=web`

5. **If a terminal gets stuck**: nudge it via the input API with guidance.

## Key context

- v0.4.4 on npm, v0.4.4 in package.json
- Mnestra 0.2.1 just published with auto-read secrets.env
- Rumen re-kickstart produced 166 insights (44 PVB-specific)
- Flashback works (fixed in Sprint 21)
- CI lint job fixed in Sprint 22
- The orchestrator layout you're in right now (4 top + 1 bottom) was built in Sprint 22

## Rules

- Never edit files owned by T1-T4
- Only you commit, push, and publish
- Monitor STATUS.md for progress and blockers
- If a terminal crosses file boundaries, flag it immediately
