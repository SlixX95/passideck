# Review Checklist — 2026-04-13 session

Short, linear, no prose. Tick as you go. Full detail lives in `PLANNING_DOCUMENT.md`.

## Phase A — verify everything is on disk

- [X] `cat docs/STATUS.md` — read each terminal's end-of-session summary
- [X] `cd termdeck && git status --short` — expect T1 client + T2 server/cli/config + T4 docs-site/ changes
- [X] `cd mnestra && git status --short` — expect T3 changes
- [X] `cd rumen && git status --short` — expect T4 rumen changes

## Phase B — typecheck + unit tests (non-interactive, safe)

- [X] `cd mnestra && npm run build && npm test` — expect 21/21 green, typecheck clean
- [X] `cd rumen && npx tsc --noEmit` — expect clean
- [X] `cd termdeck/docs-site && npm install && npm run build` — expect 25 static pages
  **16:47:48 [WARN] [@astrojs/sitemap] The Sitemap integration requires the `site` astro.config option. Skipping.**

## Phase C — TermDeck live test

- [X] `cd termdeck && npm run dev`
- [X] Open browser at http://localhost:3000
- [X] **T1 info tabs:** open 2 panels, click each of Overview / Commands / Memory / Status log — no clipping
- [X] **T1 first-run empty state:** close all panels, confirm hero block shows
- [X] **T1 switcher overlay:** open 4 panels, switcher appears top-right
  - [X] KNOWN BUG: switcher may cover PTY text — log in FOLLOWUP.md, not a blocker
  - [X] KNOWN BUG: `Alt+1..9` may not fire on macOS (uses `e.key` instead of `e.code`) — log in FOLLOWUP.md
- [X] **T1 reply button + T2.2 endpoint joint test:**
  - [X] `curl -s http://localhost:3000/api/sessions | python3 -m json.tool` — copy a real session `id`
  - [X] `SID=<paste> ; curl -X POST http://localhost:3000/api/sessions/$SID/input -H 'Content-Type: application/json' -d '{"text":"echo reply-test\r","source":"reply"}'`
  - [X] Confirm `echo reply-test` appears in the target panel's PTY
  - [ ] If "Session not found" despite valid ID → real T2.2 bug, stop and investigate
- [ ] **T2.4 proactive toast:** in a panel, run `cat /nonexistent` → toast should appear within ~2s
  - [ ] If RAG is disabled in your config, skip this (toast stays silent by design)
- [ ] **T2.5 session logs:** kill the server, restart with `--session-logs`, open + close a panel, check `ls ~/.termdeck/sessions/` for new markdown file **Couldn't find this directory**

## Phase D — Mnestra webhook live test (requires Supabase creds)

**Important — path correction:** T3 built the webhook at `dist/src/webhook-server.js`, not `dist/webhook-server.js`. Also, the webhook module exports `startWebhookServer()` but has no top-level CLI entry — start it with a one-liner.

**Credentials:** Mnestra reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` from the environment. TermDeck stores these in `~/.termdeck/config.yaml` under `rag.*`. Export them from there into the shell without echoing the values:

```
cd /Users/joshuaizzard/Documents/Graciella/mnestra

export SUPABASE_URL="$(python3 -c "import yaml; print(yaml.safe_load(open(\"$HOME/.termdeck/config.yaml\"))['rag']['supabaseUrl'])")"
export SUPABASE_SERVICE_ROLE_KEY="$(python3 -c "import yaml; print(yaml.safe_load(open(\"$HOME/.termdeck/config.yaml\"))['rag']['supabaseKey'])")"
export OPENAI_API_KEY="$(python3 -c "import yaml; print(yaml.safe_load(open(\"$HOME/.termdeck/config.yaml\"))['rag']['openaiApiKey'])")"
```

(If `python3` complains about `yaml`, run `pip3 install pyyaml` once, then retry.)

**Then run the tests:**

```
# 1. Start webhook in background
MNESTRA_WEBHOOK_PORT=37778 node -e "require('./dist/src/webhook-server.js').startWebhookServer()" &
WEBHOOK_PID=$!
sleep 1   # one-time startup wait, not a poll loop

# 2. Health check — should return ok:true plus store stats
curl -s http://localhost:37778/healthz | python3 -m json.tool

# 3. Recall op — should return a hits array
curl -s -X POST http://localhost:37778/mnestra \
  -H 'Content-Type: application/json' \
  -d '{"op":"recall","question":"TermDeck architecture","min_results":3}' | python3 -m json.tool

# 4. Index op (T3.2 three-layer API — progressive disclosure)
curl -s -X POST http://localhost:37778/mnestra \
  -H 'Content-Type: application/json' \
  -d '{"op":"index","query":"TermDeck","limit":5}' | python3 -m json.tool

# 5. Citation endpoint — pick any UUID from the index response above
OBS_ID=<paste-a-real-uuid-from-step-4>
curl -s http://localhost:37778/observation/$OBS_ID | python3 -m json.tool

# 6. Stop the server
kill $WEBHOOK_PID
wait $WEBHOOK_PID 2>/dev/null
```

- [ ] `/healthz` returns `{ok:true, version:"0.2.0", store:{rows:<n>, last_write:"..."}}`
- [ ] `op: recall` returns a `hits` array
- [ ] `op: index` returns compact hits with `id` fields (T3.2)
- [ ] `/observation/<uuid>` returns the full row matching that ID (T3.4)

## Phase E — commit (in this order, scoped, no -A inside termdeck)

```
cd /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck

# 1. T1 client
git add packages/client/public/
git commit -m "T1: panel info tabs, switcher, reply, proactive toast, empty state"

# 2. T2 server/cli/config
git add packages/server packages/cli config/ README.md package.json packages/server/package.json packages/cli/package.json
git commit -m "T2: mnestra bridge, POST /api/sessions/:id/input, session logs, @jhizzard/termdeck rename"

# 3. T4 docs-site portion
git add docs-site/
git commit -m "docs-site: Astro Starlight scaffold with cross-repo sync"

# 4. Session docs
git add docs/STATUS.md docs/PLANNING_DOCUMENT.md docs/REVIEW-CHECKLIST.md docs/FOLLOWUP.md
git commit -m "docs: session status + review checklist + followup"

# 5. Mnestra v0.2
cd /Users/joshuaizzard/Documents/Graciella/mnestra
git add -A
git commit -m "v0.2: webhook server, 3-layer tools, privacy tags, export/import, match_count cap"

# 6. Rumen v0.2
cd /Users/joshuaizzard/Documents/Graciella/rumen
git add -A
git commit -m "v0.2: synthesize phase with Haiku, CI integration test, citation IDs"
```

## Phase F — deferred items → FOLLOWUP.md

Create `docs/FOLLOWUP.md` with these items:

- [ ] **T1.7 screenshots** — capture 3 PNGs with a live server + Playwright, drop in `docs/screenshots/`
- [ ] **T1 macOS Alt key bug** — swap `e.key` for `e.code` in switcher handler (`grep -n altKey packages/client/public/index.html`)
- [ ] **T1 switcher z-index / position** — move switcher mount out of `.panel` container into top toolbar
- [ ] **T2.6 Docker prebuild verify** — run `docker run --rm -v $(pwd):/app -w /app node:24-alpine sh -lc "rm -rf node_modules && npm install --no-save"` and confirm no C++ compile
- [ ] **T4.1/T4.2 Rumen CI green** — push rumen branch, verify GitHub Actions integration test passes
- [ ] **Publish decisions** — Mnestra v0.2, Rumen v0.2, TermDeck rename are staged but NOT versioned or published; decide per-package when to tag + `npm publish`

## Phase G — after commits

- [ ] Save memories via `memory_remember`:
  - Four-terminal parallel playbook (file-ownership + STATUS.md protocol worked)
  - Pinned versions: `node-pty@1.1.0-beta11`, `better-sqlite3@12.9.0`, Starlight 0.38 + Astro 6
  - Mnestra webhook contract: `POST :37778/mnestra {op,...}`
  - macOS Alt key → use `e.code` not `e.key` in browser keybind handlers
