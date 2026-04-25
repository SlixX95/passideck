# Followup — items deferred out of the 2026-04-13 review (updated 2026-04-14)

Everything here is **not a blocker for this session's commits**. Land the commits first, then work this list.

> **Sprint 2 (2026-04-14) closed several items from the original review.** The items below are either completed (marked ✅ with evidence) or carried forward.

## Security

- [ ] **Rotate leaked API keys.** Your `~/.termdeck/config.yaml` contained a live Supabase service role key and OpenAI key which were echoed into a Claude Code context window during the 2026-04-13 Phase D review. (Josh's call 2026-04-14: keys are shared across multiple projects and not reasonable to rotate; accepted risk given single-user laptop.)
- [x] ✅ **Confirm no repo has a copy of `~/.termdeck/config.yaml`.** Sprint 2 F2.1 credential leak scan returned no hits across `~/Documents/Graciella`.
- [x] ✅ **Move secrets out of `config.yaml`.** Sprint 2 F2.2 shipped: `packages/server/src/config.js` loads `~/.termdeck/secrets.env` via dotenv, merges with `config.yaml`, supports `${VAR}` interpolation, prints deprecation warning when inline secrets are present. Backward compat verified against Josh's existing inline-secrets config. New `config/secrets.env.example` committed.

## T1 — client UI bugs surfaced in review

- [x] ✅ **macOS Alt key bug — switcher doesn't fire on Mac.** Sprint 2 F1.1 swapped `e.key` → `e.code` in the switcher handler in `packages/client/public/index.html`.
- [x] ✅ **Switcher overlay covers PTY text.** Sprint 2 F1.2 reparented the switcher out of `.panel` container into the top toolbar with fixed positioning and `z-index: 1000`.
- [x] ✅ **Reply target dropdown has no unique names.** Sprint 2 F1.3 shipped option 1 — `refreshReplyTargets` now appends `#N` insertion-order suffixes when labels collide. Option 2 (editable per-panel labels) parked for Sprint 3.
- [ ] **T1.7 screenshots (still deferred).** Capture three PNGs with a live server and Playwright, drop in `docs/screenshots/`: dashboard 4-panel, info tabs drawer open, switcher overlay with 8 panels. Easier to capture during the Flashback GIF shoot — bundle them together.
- [ ] **Top-toolbar `status` and `config` buttons are unwired placeholders** (`index.html:996-997`). Clicking does nothing. Wire both to modals:
  - `status` → modal showing `GET /api/status` output: session count by state, global metrics, mnestra bridge mode, RAG enabled, session-logs state.
  - `config` → modal showing `GET /api/config` output (read-only for v0.2): project list, theme defaults, paths. Editable in Sprint 4.
  Estimated: 30 minutes for both.

## T2 — server deferred items

- [x] ✅ **T2.6 Docker prebuild verification.** Sprint 2, 2026-04-14: verified on `node:24-bookworm-slim` (Debian glibc, no C++ toolchain). `node-pty` swapped for `@homebridge/node-pty-prebuilt-multiarch@^0.13.1` which ships prebuilds via `prebuild-install`. Install completes in 6s, zero `gyp` or `node-gyp rebuild` calls. `npx @jhizzard/termdeck` will install on a clean machine with no compiler.
  - **Known limitation:** Alpine/musl libc is not supported by the homebridge fork's current prebuild matrix. Users on Alpine need to either pull a different image or install build tools. Document in README as a known constraint.
- [x] ✅ **T2.5 session log directory didn't appear during review.** Sprint 2 F2.3 investigated and fixed. Session-logger now writes to `~/.termdeck/sessions/` on real PTY exit, verified manually. Requires `ANTHROPIC_API_KEY` in `~/.termdeck/secrets.env` for the Haiku-generated summary section; without it, the markdown skeleton still writes with frontmatter + command list.

## T3 — Mnestra deferred items

- [x] ✅ **Webhook has no CLI entry.** Sprint 2 F3.1 added the `serve` subcommand to `mcp-server/index.ts`. Usage: `mnestra serve` (or `node dist/mcp-server/index.js serve` from a checkout) binds the webhook on `$MNESTRA_WEBHOOK_PORT`. Verified end-to-end: healthz returns `version: 0.2.0`, `/observation/:id` returns real rows after the `005_v0_1_to_v0_2_upgrade.sql` migration Josh applied in Sprint 1.

- [x] ✅ **`GET /observation/:id` returns 500 against existing production Supabase.** Fixed by Sprint 1's `005_v0_1_to_v0_2_upgrade.sql` migration (applied 2026-04-13). Citation endpoint now returns full row shape. Verified against production store (3,451 rows at last check).

- [x] ✅ **`POST /mnestra` with malformed JSON returns 500 instead of 400.** Sprint 2 F3.2 wrapped `readJsonBody` JSON.parse in a try/catch that throws an error with `httpStatus: 400`. Outer handler respects the status. Verified: `curl -d 'not json'` now returns `status=400, {"ok":false,"error":"invalid JSON body"}`.

- [x] ✅ **`handleHealth` / `memoryStatus` returning bogus aggregations.** Sprint 2 F3.3 shipped `migrations/006_memory_status_rpc.sql` with a new `memory_status_aggregation()` SQL function that does GROUP BY server-side, bypassing the PostgREST 1000-row cap. Josh applied the migration to production 2026-04-14. Verified: `op: status` now returns `total_active: 3451` with `by_project` summing exactly to 3451 (was previously ~1000).

## Supabase schema drift — architectural followup

- [ ] **Decide on migration path for production RAG store.** The production Supabase (same one TermDeck, PVB, and the global MCP server all point at) predates Mnestra v0.2's schema additions (`archived`, `superseded_by`, `updated_at`). Three options:
  1. **Migrate in place** (recommended). Snapshot via T3.5 `memory_export`, diff schema with `pg_dump --schema-only`, apply additive `alter table` statements via Supabase SQL editor, re-run Phase D healthz + citation.
  2. **Provision a new clean v0.2 Supabase**, export from old via T3.5, import to new via T3.5, point TermDeck's config at new. Costs more, keeps old frozen.
  3. **Make the webhook schema-tolerant** with feature-detection queries. Fastest but accrues debt.
- [ ] **Before any migration, verify `migrations/001_mnestra_tables.sql` is idempotent.** If it uses bare `create table memory_items (...)` it will error on the existing table. Extract the additive delta into a new `004_v0_2_additions.sql` if needed.

## T4 — Rumen + docs site deferred items

- [ ] **T4.1/T4.2 Rumen CI green.** After Sprint 2 push, verify GitHub Actions runs the integration test against ephemeral Postgres 16 and it passes.
- [x] ✅ **T4 docs site — sitemap warning.** Sprint 2 F4.1 added `site:` option to `docs-site/astro.config.mjs`. Warning eliminated.
- [x] ✅ **Unexpected file `scripts/test-rest.ts` in rumen.** Sprint 2 F4.2 decision: kept as an Mnestra-webhook integration smoke test, renamed to `scripts/smoke-test-rumen-rest.ts` for clarity.

## Reply feature — product question from Josh

> "I need to understand the use case of being able to send a message from one terminal to another, and whether a Claude Code or Codex or Gemini session can be spoken to / speak to other terminals using a similar ID."

**What it does today:** `POST /api/sessions/:id/input` writes raw text into the target session's PTY. That text is indistinguishable from the user typing. If the target is an idle zsh, it runs the line. If the target is a running Claude Code REPL, it submits the line as a prompt.

**One-way, not conversational.** You can prompt another agent from a different terminal, but you cannot *receive* a structured response back — the only return channel is PTY stdout, which the output analyzer parses heuristically. If you want true agent-to-agent collaboration, use **Mnestra as the shared bus:** agent A writes a decision via `memory_remember`, agent B reads it via `memory_recall`. Both sessions get the benefit without either having to listen to the other's stream.

**Three realistic use cases:**
1. **Hand-off.** You're deep in panel A debugging a build, and panel B is running Claude Code on the same repo. Highlight an error line, hit reply → send to B → "fix this: &lt;paste&gt;". Claude Code takes it from there.
2. **Broadcast.** Send `git pull` or `source ~/.zshrc` to all panels at once. (Needs a small UI addition to multi-select targets — currently single-target only.)
3. **Watchdog.** A long-running test in panel A finishes and the output analyzer catches it; fire an automatic reply to panel B with `ls -la artifacts/` so the next step is staged.

**Naming.** See T1 bug above — the dropdown label problem is real and has a clean fix. Pick option 1 or 2 from the T1 "Reply target dropdown" item depending on how much UX investment you want.

## Flashback — product polish for Sprint 3

The proactive-memory feature (T1.4 server event → T2.4 WebSocket push → client toast) fires unprompted when a panel's status transitions to `errored`. Confirmed working 2026-04-13 against a live Mnestra store. This is the product's headline feature and needs first-class surface area before launch.

- [ ] **Name it officially. Propose: Flashback.** Update the toast header from `MNESTRA — POSSIBLE MATCH` to `FLASHBACK · <project>`, rename the WebSocket event from `proactive_memory` to `flashback`, rename internal functions / comments. Propagate through server, client, README, CHANGELOG. See `docs/FLASHBACK_LAUNCH_ANGLE.md` for rationale.
- [ ] **Top-bar session counter.** Add `🧠 N recalls this session` to the top toolbar. Increment on every Flashback fired (both dismissed and clicked). Resets on dashboard reload.
- [ ] **Manual trigger keyboard shortcut.** `Ctrl+K` (or `Cmd+K`) on the active panel runs the same synth query the auto-trigger uses, producing an on-demand Flashback. Useful when the user knows they're stuck but the output analyzer hasn't classified it as `errored` yet.
- [ ] **Flashback history drawer.** New top-level tab alongside Overview / Commands / Memory / Status log, listing every Flashback fired this session (timestamp, trigger command, top hit, dismissed or clicked). Each row has a "re-open" button that re-surfaces the toast.
- [ ] **Per-panel silence toggle.** Add a bell icon in the panel header to silence Flashback on noisy panels (e.g. a build server that intermittently errors by design). Persist via `PATCH /api/sessions/:id` into `meta.flashbackEnabled`.
- [ ] **Local telemetry.** Log every Flashback event to SQLite: trigger, query, top hit id, fired_at, dismissed_at, clicked. Enables tuning the 30s rate limit and trigger heuristics later. Local only — never phones home.
- [ ] **GIF capture for launch.** 12-second screen recording of a Flashback firing on a real error. Drop in `docs/screenshots/flashback-demo.gif`. Lead with this on the README, above the fold.

## Sprint 3 — launch polish and new features

Added 2026-04-15 after the onboarding tour and launch-strategy session.

- [ ] **Cursor position lag on window resize.** After resizing the window, the xterm cursor renders below the current input line until the first keystroke redraws it. Cosmetic xterm.js `fit()` repaint issue — debounce the resize handler and force a `terminal.refresh(0, rows-1)` after the fit call, or replay a `<ESC>[H` cursor-position query to nudge the renderer.
- [ ] **macOS zsh_sessions cosmetic error.** A `Saving: command not found` warning still prints on new shell startup because one of `~/.zsh_sessions/<UUID>.session` files has a corrupted line. The proper fix (`TERM_SESSION_ID=''` / `SHELL_SESSION_DID_INIT='1'`) broke interactive input in testing, so only `SHELL_SESSION_HISTORY='0'` is set today. Revisit by either (a) bisecting which of the two vars broke input, or (b) writing a known-empty file at `~/.zsh_sessions/<UUID>.session` before spawn so the source line finds a valid no-op file.
- [ ] **Theme dropdown visibility.** Currently lives inside each panel's drawer under the Overview tab. Users don't discover it without opening the drawer. Options: (1) surface a small theme button `🎨` in the panel header next to `□ ▯ ×`, (2) add a global theme switcher in the top toolbar that applies to all panels, (3) leave as-is and rely on the onboarding tour to teach it. Recommend (1).

- [ ] **Wire `status` and `config` top-toolbar buttons** to modal views of `GET /api/status` and `GET /api/config`. Placeholders today.
- [ ] **Deploy docs-site to Vercel.** `cd docs-site && vercel deploy --prod`. Get a `termdeck.dev` or `*.vercel.app` URL. Update the `help` button href in `index.html` and the final step of the onboarding tour to point at it. Blocker for the launch credibility signal.
- [ ] **Capture launch marketing assets.** `docs/screenshots/flashback-demo.gif` (12-14 second Flashback firing), `dashboard-4panel.png`, `drawer-open.png`, `switcher.png`. See `docs/FLASHBACK_LAUNCH_ANGLE.md` for the storyboard and `docs/LAUNCH_STRATEGY_2026-04-15.md` for the list.
- [ ] **Rewrite README top-to-bottom** with Flashback-first structure. Hero GIF, one-line pitch, three quickstart commands, "How Flashback works" in 4 sentences, "What it is not" honest-limits section, architecture diagram linking to Mnestra and Rumen, install/dev/contrib at bottom. See `FLASHBACK_LAUNCH_ANGLE.md` §README restructure.
- [ ] **Write launch assets:** `docs/launch/show-hn-post.md`, `docs/launch/x-thread.md`, `docs/launch/comment-playbook.md`. See `LAUNCH_STRATEGY_2026-04-15.md` for templates and content.
- [ ] **Publish dev.to blog post** from `FLASHBACK_LAUNCH_ANGLE.md` blog outline. 800–1200 words. Cross-post to Hashnode. Schedule 24h after Show HN.
- [ ] **Flashback rename propagation.** Update toast header from `MNESTRA — POSSIBLE MATCH` to `FLASHBACK · <project>`, rename the WebSocket event from `proactive_memory` to `flashback`, update README feature list and CHANGELOG. See `FLASHBACK_LAUNCH_ANGLE.md` §The naming decision.
- [ ] **Top-bar session recall counter** `🧠 N recalls this session`. Increments on every Flashback fired.
- [ ] **Manual Flashback keyboard shortcut** `Cmd+K` / `Ctrl+K` on the active panel runs the auto-trigger's synthesis query on demand.
- [ ] **Flashback history drawer tab.** New per-panel tab listing every Flashback fired this session with re-open buttons.
- [ ] **Per-panel Flashback silence toggle.** Bell icon in panel header. Persist via `PATCH /api/sessions/:id` into `meta.flashbackEnabled`.
- [ ] **Local Flashback telemetry.** Log fire/dismiss/click events to SQLite for future rate-limit and trigger heuristic tuning. Local only — never phones home.
- [ ] **Claude bot Q&A (nice-to-have).** Haiku-powered chat surface embedded in the docs site or in a new `?` modal in TermDeck. Pre-trained via system prompt on the full README + CHANGELOG + FAQ. Budget caps: ~100 calls/day soft, 500/day hard, using a server-side proxy (Vercel edge function) so no API key is shipped client-side. Use the Anthropic SDK with prompt caching on the static context block. Defer to Sprint 4 if Sprint 3 runs long.
- [ ] **Editable per-panel labels.** Double-click panel header to rename, persist `meta.label`, propagate to reply dropdown (replacing `#N` fallback when custom label is set). Was parked in Sprint 2 F1.3 as option 2.

## Cross-project

- [ ] **Publish decisions.** Mnestra v0.2, Rumen v0.2, TermDeck rename are staged but NOT versioned or `npm publish`-ed. Decide per-package when to tag.
- [ ] **Tag commits.** After landing, tag each repo: `git tag v0.2.0` in mnestra and rumen, `git tag v0.2.0` in termdeck.
- [ ] **Update STATUS.md epilogue** with what actually shipped vs. what ended up in FOLLOWUP.
