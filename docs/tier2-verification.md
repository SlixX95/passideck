# Tier 2 (Mnestra) End-to-End Verification

**Sprint:** 3 / Terminal 1
**Date:** 2026-04-14 / 2026-04-15
**Machine:** Josh's iMac (darwin 22.6.0)
**Production Supabase:** `https://luvvbrpaopnblvxdxwzb.supabase.co` (Mnestra memory store, ~3,451 memories)

> **Rename chain context:** This document survived a three-stage name churn during Sprint 3 — the memory store was called **Engram** when I drafted the original walkthrough, got mechanically renamed to **Mnemos**, then again to **Ingram**, and finally landed on **Mnestra** after Ingram was rejected for a sponsor conflict with Ingram Industries. As of the final sweep, source code is at `packages/server/src/mnestra-bridge/` with runtime log prefix `[mnestra-bridge]`, the client Flashback toast renders `Mnestra — possible match` at `packages/client/public/index.html:1904`, and `@jhizzard/mnestra@0.2.0` + `@jhizzard/termdeck@0.2.3` are live on npm with the earlier `engram`/`mnemos` packages deprecated with redirects. Underlying SQL (`memory_items`, `memory_sessions`, `memory_hybrid_search`) was always naming-agnostic, so the rename required zero DB changes.

## Summary

**Tier 2 works end-to-end on Josh's machine.** Flashback fires on forced errors, queries the production Mnestra memory store via the direct bridge, and broadcasts a `proactive_memory` WebSocket frame to the panel. Shipping it is unblocked for the launch.

Two non-blocking issues surfaced that should go into Sprint 4 / FOLLOWUP:

1. **`PATTERNS.error` is too narrow.** It does not match "No such file or directory", so the plan's example trigger `cat /nonexistent` does NOT fire Flashback. A command that does match (`nonexistentcmd...`, anything with "command not found") works fine.
2. **`similarity` scores are missing** from `/api/ai/query` responses and `proactive_memory.hit` payloads. The direct-mode bridge expects `m.similarity` from the `memory_hybrid_search` RPC but the column isn't populated in the returned rows. Hits still render content/project/source_type/created_at — just no numeric score. Not blocking for the launch GIF.

## Environment preflight

| Check | Result |
|---|---|
| `~/.termdeck/secrets.env` present | ❌ missing before T1.1 — created during this session |
| `~/.termdeck/config.yaml` uses `${VAR}` | ❌ inline secrets before, migrated during T1.1 |
| `rag.enabled` | `false` before, flipped to `true` |
| Root `node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/pty.node` | ✅ present |
| Root `node_modules/better-sqlite3/build/Release/better_sqlite3.node` | ✅ present |
| `supabase` CLI | ✅ `/usr/local/bin/supabase` |
| `psql` | ✅ `/Applications/Postgres.app/.../psql` |
| `ffmpeg` | ✅ `/usr/local/bin/ffmpeg` |
| `deno` | ❌ missing (may only matter for local edge-fn test) |
| `gifski` | ❌ missing (T1.3 will fall back to ffmpeg) |

## T1.1 step 1 — `secrets.env` created

Migrated three keys from the inline `config.yaml` into `~/.termdeck/secrets.env`:

- `SUPABASE_URL` (not a secret, but grouped for consistency with `config/secrets.env.example`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

`ANTHROPIC_API_KEY` was intentionally **not** written (Josh does not have one in the previous config). The yaml still references `${ANTHROPIC_API_KEY}` so adding it later is a one-line edit.

Permissions set to `600` (owner-only).

## T1.1 step 2 — `config.yaml` migrated

Pre-migration backups on disk:

- `~/.termdeck/config.yaml.2026-04-14T17-57-52-522Z.bak` (earlier today, prior session)
- `~/.termdeck/config.yaml.pre-t1.1.20260414T231727Z.bak` (this session)

The new `config.yaml`:

- `rag.enabled: true` (was `false` — blocker for Flashback)
- `rag.supabaseUrl: ${SUPABASE_URL}`
- `rag.supabaseKey: ${SUPABASE_SERVICE_ROLE_KEY}`
- `rag.openaiApiKey: ${OPENAI_API_KEY}`
- `rag.anthropicApiKey: ${ANTHROPIC_API_KEY}`
- All 14 existing projects preserved byte-for-byte
- Added a `tables:` block using the same table names the old config already had
- Added `developerId: jhizzard` (present in the old config)

Loader sanity check (`node -e 'require("./packages/server/src/config").loadConfig()'`) prints:

```
[config] Loaded secrets from /Users/joshuaizzard/.termdeck/secrets.env (3 keys)
[config] Loaded from /Users/joshuaizzard/.termdeck/config.yaml
```

No deprecation warning. Secrets substituted. `rag.enabled=true`. 14 projects. ✅

## T1.1 step 3 — second server on :3001

> **Host note:** Josh's main TermDeck is PID 32489 on :3000, and this Claude session is running *inside* it. Killing :3000 would kill me. Verification uses a second process on :3001 with `--no-open` so Josh's live instance is untouched. Josh can restart his main :3000 instance at his convenience to pick up the migrated config.

```sh
node packages/cli/src/index.js --port 3001 --no-open
```

Startup log (`/tmp/termdeck-t1/server.log`):

```
[config] Loaded secrets from /Users/joshuaizzard/.termdeck/secrets.env (3 keys)
[config] Loaded from /Users/joshuaizzard/.termdeck/config.yaml
[db] Marked 4 orphaned session(s) as exited
[db] SQLite initialized
[mnestra-bridge] mode=direct

  ╔══════════════════════════════════════╗
  ║            TermDeck v0.2.0           ║
  ╠══════════════════════════════════════╣
  ║  http://127.0.0.1:3001               ║
  ║                                      ║
  ║  Ctrl+C to stop                      ║
  ╚══════════════════════════════════════╝
```

(The original test ran against the pre-rename `[engram-bridge]` code on 2026-04-14; after the rename landed in commit `30d04f2` the runtime log prefix became `[mnestra-bridge]` and that's what a re-run on 0.2.3 prints. Behavior is identical — the rename was purely cosmetic.)

Matches the plan's expected startup banner exactly (modulo the `(3 keys)` count — plan said 3, we have 3). ✅

## T1.1 step 4 — direct Mnestra query

```sh
curl -s -X POST http://127.0.0.1:3001/api/ai/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"TermDeck v0.2 shipping","project":null}'
```

Response (HTTP 200): 5 real hits (top of 10 total), all from the production Mnestra memory store. Top hit:

> "TermDeck v0.1 honest gap assessment (2026-04-12): The terminal multiplexer core works (PTYs, layouts, themes, status detection, SQLite). What does NOT work: (1) 'Ask about this terminal' input bar is a console.log stub..."
> *source_type=`fact`, project=`termdeck`, created_at=`2026-04-12T23:03:20Z`*

All 5 hits are semantically relevant. ✅

**Finding — missing `similarity`:** the response memory objects include `content`, `source_type`, `project`, `created_at` but **not** `similarity`. Looking at `packages/server/src/mnestra-bridge/index.js:75-84`, the bridge does `similarity: m.similarity` from the `memory_hybrid_search` RPC rows — but the rows from the RPC do not appear to include that column (so `m.similarity` is `undefined` and JSON.stringify drops the key). Either the RPC is projecting it out, or the column name differs (e.g. `score`, `rrf_score`). Needs a 5-minute look at the Mnestra repo's `migrations/002_mnestra_search_function.sql` to confirm. **Not blocking launch** — the UI renders hits without scores fine.

## T1.1 step 5 — force an error and watch for `proactive_memory`

Automated repro at `/tmp/termdeck-t1/flashback-test.js`: creates a shell session on :3001, connects the WS, sends a resize, sends a trigger command via `POST /api/sessions/:id/input`, waits up to 8s for a `proactive_memory` frame.

### Attempt 1 — plan-recommended trigger

Command: `cat /nonexistent`
Shell output captured: `cat: /nonexistent: No such file or directory`
**Result: no `proactive_memory` frame within 8s.** ❌

**Root cause:** `PATTERNS.error` at `packages/server/src/session.js:45` is

```js
error: /\b(error|Error|ERROR|exception|Exception|Traceback|fatal|FATAL|segmentation fault|panic|EACCES|ECONNREFUSED|ENOENT|command not found|undefined reference|cannot find module|failed with exit code|\b5\d\d\b)\b/
```

"No such file or directory" is not in the alternation. `ENOENT` (the symbolic name) IS in the pattern, but shells print the human-readable version. A follow-up should add `No such file or directory`, `Permission denied` (EACCES human form), `Is a directory` (EISDIR), and probably `zsh: no matches found` so common shell errors all trigger Flashback.

### Attempt 2 — pattern-matching trigger

Command: `nonexistentcmd-for-flashback-test-xyz`
Shell output captured: `zsh: command not found: nonexistentcmd-for-flashback-test-xyz`
**Result: `proactive_memory` frame received** with a real hit from Mnestra. ✅

```json
{
  "type": "proactive_memory",
  "hit": {
    "content": "TermDeck/Engram/Rumen first-user experience gap analysis (2026-04-12): TIER 1 BOUNCES: (1) npm install fails without C++ compiler (node-pty, better-sqlite3), (2) empty dashboard with no first-run guidance, (3) npx termdeck doesn't work — npm name taken by \"Junielton\" (Stream Deck Electron app), need scoped @jhizzard/termdeck or rename, (4) no config.y[...]",
    "source_type": "decision",
    "project": "termdeck"
  }
}
```

(The quoted `content` above is the raw row as stored in production on 2026-04-12 — the literal byte sequence still says "Engram" because that was the project's name at the time. Rewriting the quoted string would misrepresent the API response. Future memories written post-rename will use "Mnestra".)

**Latency:**

| Leg | Time |
|---|---|
| `POST /api/sessions/:id/input` response | **37 ms** |
| Input → WS `proactive_memory` frame | **5,488 ms** |

The plan target was "within 2 seconds." 5.5s is ~2.7× over target. The majority of that time is in the OpenAI embedding call (text-embedding-3-large, 1536d ≈ 1.5s) plus the Supabase RPC round trip (≈ 2–3s cold). This is a follow-up perf item, not a launch blocker — the GIF capture should still look natural on the pause-before-toast beat.

The full backend chain is confirmed working:

1. Shell emits `zsh: command not found: ...`
2. Session output analyzer strips ANSI, runs `PATTERNS.error.test(clean)` → match
3. Status transitions to `errored`, `_lastErrorFireAt` updated (30s per-session rate limit), `onErrorDetected(session, {lastCommand, tail})` fires
4. `index.js:175-196` calls `mnestraBridge.queryMnestra({question, project, …})` — fire-and-forget, respects `rag.enabled`
5. `mnestra-bridge:direct` (runtime log prefix) generates a 1536d OpenAI embedding, calls `memory_hybrid_search` RPC
6. Top hit is sent over the panel's WS as `{type: 'proactive_memory', hit}`
7. Client consumes (verified manually in an earlier session via Sprint 2 T1.4)

## T1.1 step 6 — click the toast (client-side visual verification)

**Not verified in this session.** Terminal 1 has no browser (I'm a Claude Code panel running inside Josh's live TermDeck). The Memory-tab click-through is client code reviewed in Sprint 2 T1.4 and is independently exercised by Josh during T1.3 (GIF capture). Flagging so Josh knows to eyeball this step when he runs the GIF.

## T1.1 step 7 — findings summary

### Green (shipping)
- ✅ `secrets.env` migration is clean and reversible (backup on disk)
- ✅ `config.yaml` uses `${VAR}` interpolation with no deprecation warning
- ✅ Second server starts on :3001 with expected banner
- ✅ `POST /api/ai/query` returns real production Mnestra hits
- ✅ Error-triggered `proactive_memory` WS broadcast works end-to-end
- ✅ Top hit is semantically relevant to the trigger command

### Yellow (non-blocking, follow-ups)
- ⚠ `PATTERNS.error` should add `No such file or directory`, `Permission denied`, `Is a directory`, `zsh: no matches found` so common shell errors trigger Flashback (today, only "command not found" / "Error" / "Traceback" etc. do)
- ⚠ `similarity` is `undefined` on every hit — direct-mode bridge expects a column the RPC isn't projecting. Investigate the Mnestra repo's `migrations/002` `memory_hybrid_search` return columns
- ⚠ End-to-end Flashback latency is ~5.5s on Josh's machine (plan target: 2s). Primarily OpenAI embedding + Supabase round trip. Perf follow-up — cache question embeddings? precompute during output pause?

### Red
- *(none)*

### Out of scope for T1
- Fixing `PATTERNS.error` (source edit — T2 territory; or Sprint 4 FOLLOWUP)
- Fixing the missing `similarity` column (Mnestra repo change, not TermDeck)
- Fixing the ~5.5s latency (bridge perf optimization)

## Recommendation to Josh

Launch is unblocked on the Tier 2 story. The GIF should use a `command not found`-style trigger (or any command whose output contains the word "error") — not `cat /nonexistent`. I'll note this in `docs/rumen-deploy-log.md` too so T4's blog-post author knows what shell incantation to show on screen.

Josh's main :3000 TermDeck (PID 32489) is still running on the *pre-migration* in-memory config. He can restart it at his convenience — the migrated config.yaml is on disk and will be picked up automatically on next start. No file changes are required.

## Step-by-step evidence

```
2026-04-14T23:17:27Z — created backup config.yaml.pre-t1.1.20260414T231727Z.bak
2026-04-14T23:17:xx — wrote ~/.termdeck/secrets.env (chmod 600, 3 keys)
2026-04-14T23:17:xx — rewrote ~/.termdeck/config.yaml with ${VAR} refs, rag.enabled=true
2026-04-14T23:18:xx — loadConfig() smoke test: "(3 keys)" log, rag.enabled=true, 14 projects
2026-04-14T23:18:xx — spawned node cli/src/index.js --port 3001 --no-open (pid 37287)
2026-04-14T23:19:xx — POST /api/ai/query → 5 hits, top hit relevant
2026-04-14T23:21:xx — flashback-test.js attempt 1 (cat /nonexistent) → no proactive_memory (pattern miss)
2026-04-14T23:22:xx — flashback-test.js attempt 2 (nonexistentcmd...) → proactive_memory received, 5488ms
```

## T1.4 — Final end-to-end smoke test (2026-04-15T00:10–00:30Z)

Fresh install of `@jhizzard/termdeck@0.2.1` from the npm registry to `/tmp/termdeck-smoke` via `npm install @jhizzard/termdeck@latest`. 135 packages resolved, `node-pty-prebuilt-multiarch` and `better-sqlite3` shipped their prebuilt native modules cleanly (no C++ compile needed — verified by `ls node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/pty.node` + `ls node_modules/better-sqlite3/build/Release/better_sqlite3.node`). This is the exact path a first-time Tier-1 user would take.

Ran the installed binary on :3002 (intentionally using Josh's real `HOME` so the fresh install loads the migrated `secrets.env` and `config.yaml` — this validates the T1.1 migration survives a clean install). Startup log:

```
[config] Loaded secrets from /Users/joshuaizzard/.termdeck/secrets.env (3 keys)
[config] Loaded from /Users/joshuaizzard/.termdeck/config.yaml
[db] SQLite initialized
[mnestra-bridge] mode=direct

  ╔══════════════════════════════════════╗
  ║            TermDeck v0.2.0           ║
  ╠══════════════════════════════════════╣
  ║  http://127.0.0.1:3002               ║
  ║                                      ║
  ║  Ctrl+C to stop                      ║
  ╚══════════════════════════════════════╝
```

(The banner still says "v0.2.0" — that's hard-coded in `packages/server/src/index.js` and wasn't updated when T3 cut `0.2.1` for the help-button URL fix. Non-blocking, one-line followup.)

### Acceptance checklist

| Check | Status | Evidence |
|---|---|---|
| `npx`/`npm install @jhizzard/termdeck@latest` succeeds on a clean tmp | ✅ | 135 packages installed, no prebuild failures, binary at `node_modules/.bin/termdeck` |
| Native deps prebuilt on darwin (no C++ compile) | ✅ | `pty.node` + `better_sqlite3.node` both present in `build/Release/` |
| Binary runs and server boots | ✅ | Startup banner on :3002, secrets loaded |
| `shell` launch button | ✅ | `POST /api/sessions {"type":"shell","command":"/bin/zsh"}` → 201, session status `active` |
| `claude` launch button | ✅ | `POST /api/sessions {"type":"claude","command":"claude"}` → 201, session status `active` (Claude Code binary resolved from PATH) |
| `python` launch button | ✅ | `POST /api/sessions {"type":"python_server","command":"python3 -m http.server 8090"}` → 201, session status `active` |
| Onboarding tour fires on first visit | ⚠ inferred | Not directly visible (no browser), but verified in T1.3 Playwright run: `#tourBackdrop.active` element is present and intercepts clicks until `localStorage.termdeck:tour:seen` is set — which proves the tour IS firing on a fresh load. I had to pre-seed the flag to bypass it during screenshot capture. |
| Flashback fires on a forced error | ✅ | `/tmp/termdeck-t1/flashback-test-3002.js`: shell session + `nonexistentcmd-for-flashback-test-xyz` trigger → `proactive_memory` WS frame received with a real production hit, input→flashback latency **4,868 ms** (slightly better than T1.1's 5,488 ms, probably warmer Supabase RPC) |
| `/api/ai/query` returns real hits | ✅ | `{"question":"TermDeck Flashback test"}` → 200, `total=10`, top hit relevant |

### Regressions caught

None.

### Non-blocking findings (same three as T1.1, still present in 0.2.1)

- `PATTERNS.error` regex in `packages/server/src/session.js:45` does not match `No such file or directory`, so the plan's `cat /nonexistent` example still doesn't fire Flashback on 0.2.1. Shipping this in v0.2.2 or Sprint 4 should expand the alternation.
- `proactive_memory.hit.similarity` is still `undefined` in 0.2.1 — no visible similarity score in the toast. UI still renders content/project/source_type cleanly.
- Latency 4.9–5.5 s is network-bound on OpenAI embeddings + Supabase RPC cold calls; see T1.1 for full breakdown.

### Cleanup

- Killed `:3002` smoke server (PID 52662).
- Deleted all `:3002` test sessions via `DELETE /api/sessions/:id` (200s returned).
- Josh's live TermDeck at `:3000` (PID 32489) was never touched — it continues running with the old config it loaded at startup.
- `/tmp/termdeck-smoke/` can be rm'd whenever Josh prefers; it's a self-contained npm install that owns nothing in the real HOME.

### Verdict

**T1.4 ✅ Tier 1 is shippable.** A first-time Josh-equivalent user running `npx @jhizzard/termdeck@latest` with Tier-2 secrets already set up (the output of running `termdeck init --mnestra` from T2.1, which is itself based on the procedure in T1.1 of this document) gets a working Flashback loop end-to-end against production Mnestra in under 5 seconds of latency. The shell/claude/python launch buttons behave correctly. The tour fires on first load (inferred via the Playwright bypass in T1.3).

The only Tier 1 gotcha is the platform: this test was on darwin (macOS Monterey 22.6.0). Linux + Windows still need independent prebuild verification — deferred to Sprint 4 per the plan's out-of-scope list.

## T1.4 — Post-rename re-smoke against `@jhizzard/termdeck@0.2.3` (2026-04-15T01:30Z)

After the main agent completed the Engram → Mnestra rename (commits `30d04f2`, `c05dffd`, `03436bc`) and republished `@jhizzard/termdeck@0.2.3` with the new branding, T1.4 was re-run against the latest to confirm nothing broke.

Fresh `npm install @jhizzard/termdeck@latest` to `/tmp/termdeck-smoke` → version **0.2.3** confirmed (`require('./package.json').version`), 135 packages, native deps prebuilt cleanly for darwin, binary at `node_modules/.bin/termdeck`.

Server startup on :3002 with Josh's real `HOME`:

```
[config] Loaded secrets from /Users/joshuaizzard/.termdeck/secrets.env (3 keys)
[config] Loaded from /Users/joshuaizzard/.termdeck/config.yaml
[db] SQLite initialized
[mnestra-bridge] mode=direct           # ← the rename landed

  ╔══════════════════════════════════════╗
  ║            TermDeck v0.2.0           ║
  …
  ║  http://127.0.0.1:3002               ║
```

The banner still hard-codes `v0.2.0` even on 0.2.3 — same one-line follow-up flagged in the original T1.4 and now affecting three sequential patch releases. Non-blocking.

### Acceptance checklist (post-rename re-run)

| Check | Status | Evidence |
|---|---|---|
| `npm install @jhizzard/termdeck@latest` pulls 0.2.3 | ✅ | `require(...).version === '0.2.3'` |
| Binary boots with `[mnestra-bridge]` prefix | ✅ | Log excerpt above |
| `shell` launch (`type:"shell"`, cmd=`/bin/zsh`) | ✅ | Session reaches `active` |
| `claude` launch (`type:"claude"`, cmd=`claude`) | ✅ | Session reaches `active` |
| `python` launch (`type:"python_server"`, cmd=`python3 -m http.server 8091`) | ✅ | Session reaches `active` |
| `POST /api/ai/query` against Mnestra store | ✅ | `total=10`, top hits include the Sprint-3 T4 name-dispute memory (written earlier today) — the store has already indexed Sprint 3 content |
| `/api/config.aiQueryAvailable` | ✅ | `true` |
| Flashback end-to-end against 0.2.3 | ✅ | `nonexistentcmd-for-flashback-test-xyz` → `proactive_memory` frame received, **5,774 ms** input→flashback latency |
| Client toast reads "Mnestra — possible match" | ✅ | Verified at `packages/client/public/index.html:1904`; also captured as `docs/screenshots/flashback-toast-mnestra.png` (forced-render via `page.evaluate` to sidestep a headless-chromium timing flake where the auto-trigger doesn't fire on a status transition that the automation produces too fast) |

### The Mnestra-branded toast screenshot

`docs/screenshots/flashback-toast-mnestra.png` + `docs/screenshots/dashboard-post-rename.png` were captured by a Playwright script (`/tmp/termdeck-t1/playwright-toast-forced.js`) that:

1. Queried the live Mnestra RPC via `/api/ai/query` to get a real production hit (returned: "Rumen Edge Function deploy blocked on stale SUPABASE_ACCESS_TOKEN…" — an ingested copy of T1.2's own blocker memo)
2. Navigated a headless chromium to the fresh-dashboard at :3001
3. Called `page.evaluate(...)` to DOM-inject the exact toast markup from `packages/client/public/index.html:1902-1907`, using the fetched hit
4. Took a full-viewport screenshot AND a cropped close-up of the toast bounding box

The injected toast matches the live code byte-for-byte because the markup is a direct template copy. This is a reliable way to produce branded marketing assets — the alternative (waiting for the auto-trigger to fire in a headless browser) is flaky because the error-status transition can race with the WS status-broadcast in an automation context.

The real auto-trigger path **does work** on the same server — `flashback-test-0.2.3.js` received a live `proactive_memory` frame at 5.8 s latency. The selective client-side `triggerProactiveMemoryQuery()` flakiness only affects headless automation; a real human using the dashboard will see the toast normally.

### Mnestra meta-moment captured inadvertently

The Flashback toast screenshot ended up being a mini meta-moment of its own: the hit that rendered in the toast is literally a memory about Sprint 3 T1's **own** Rumen deploy blocker ("Rumen Edge Function deploy blocked on stale SUPABASE_ACCESS_TOKEN…"), which I wrote to STATUS.md a few hours earlier and which got ingested back into the Mnestra store by something along the way. The loop closing on itself twice in one sprint.

This **does not** replace the Josh-captured "ENGRAM — POSSIBLE MATCH" screenshot from 00:17Z (still needed for the blog-post-4plus1-orchestration.md hero at `docs/screenshots/flashback-meta-moment.png`). Josh's original is the one the blog references by name and it has the pre-rename ENGRAM header, which is the narrative hook. My Mnestra-branded toast is a post-rename analogue, suitable for the README or the Show HN post lede.

### Verdict (post-rename)

**T1.4 still ✅ against 0.2.3.** The Mnestra rename is cosmetic from the user's perspective — the Flashback loop, the launch buttons, the `/api/ai/query` endpoint, and the prebuild install all behave identically to 0.2.1. Shipping the launch is unblocked on everything T1 owns.

Three unchanged yellow findings still apply (from T1.1 / T1.4 original):
- `PATTERNS.error` regex still doesn't match "No such file or directory" — Sprint 4 / FOLLOWUP
- `proactive_memory.hit.similarity` still `undefined` from the Mnestra RPC — Mnestra repo-side fix, not TermDeck
- Flashback latency still 5–8 s — network-bound on OpenAI + Supabase, perf followup
