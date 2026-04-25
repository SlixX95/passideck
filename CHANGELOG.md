# Changelog

All notable changes to TermDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Meta-installer
- `@jhizzard/termdeck-stack` bumped 0.1.0 → 0.2.0 (2026-04-25). Docs-only refresh — README now documents the deferred `termdeck init --rumen` step for Tier 3 and the meta-installer's version-decoupling from the underlying packages. Per-package changelog at `packages/stack-installer/CHANGELOG.md`. No behavior change in `@jhizzard/termdeck` itself.

### Planned
- Fully-local path: SQLite + local embeddings for Mnestra (currently requires Supabase + OpenAI)
- Multi-user data validation (today's testing is single-developer)
- Control panel dashboard with Yes/No buttons for AI agent permission prompts
- Sprint 25: Supabase MCP in the setup wizard — collapse the 4-credential paste step to a one-click project picker. Plan at `docs/sprint-25-supabase-mcp/`.
- Sprint 25 T5: Flashback regression audit — verify Flashback fires end-to-end again after Sprint-21 fix (Josh reports silence on 2026-04-25).

## [0.6.2] - 2026-04-25

### Fixed
- **`termdeck init --mnestra` cancelling after the Anthropic API key prompt — third report from Brad after v0.6.1.** v0.6.1 hardened `askSecret` against CRLF leaks, ANSI escape pollution, and hard-SIGINT-on-Ctrl-C, but the wizard still aborted on Brad's terminal because the `confirm("Proceed with setup for project X?")` gate that ran immediately after the key prompt was the consistent failure surface — leftover bytes (CRLF tail, terminal cursor reports, paste-bracketing markers) carried into the readline that powered the confirm and resolved it as a cancel before the user could answer. Removed the confirm. The user already opted in by typing `termdeck init --mnestra` and supplying every secret; Mnestra's migrations are `IF NOT EXISTS` so re-runs are idempotent; Ctrl-C still aborts cleanly. The `--yes` flag is preserved as a no-op for forward compatibility (scripts that already pass it keep working). `termdeck init --rumen`'s confirm is intentionally retained — it gates a heavier deploy step and runs before any secret prompt, so the byte-contamination surface is different there.

### Notes
- Reported by Brad on 2026-04-25 (third occurrence). Upgrade with `npm install -g @jhizzard/termdeck@latest` and the Anthropic key prompt is the last interactive step before the wizard runs.
- `@jhizzard/termdeck-stack` does **not** need a republish — it always installs `@jhizzard/termdeck@latest`, so a fresh `npx @jhizzard/termdeck-stack` picks this up. `termdeck doctor` will surface the available update on existing installs.

## [0.6.1] - 2026-04-25

### Fixed
- **`termdeck init --mnestra` aborting after the Anthropic key prompt on MobaXterm SSH and other terminals that send CRLF for Enter.** Three separate bugs in the secret-prompt raw-mode loop in `packages/server/src/setup/prompts.js`:
  1. **CRLF leak.** When the terminal delivered `\r\n` as a single chunk (Windows / MobaXterm Enter), the loop matched the `\r`, resolved, and dropped the rest. The trailing `\n` then surfaced through the next prompt's stream and slipped through to the confirm() that follows the Anthropic prompt. With unfortunate timing the chunk also contained `` from a stray keystroke and the original SIGINT branch fired, killing the wizard mid-flow. Now: CRLF is drained inside the same chunk; non-newline trailing bytes are pushed back via `stdin.unshift` so the next consumer reads cleanly.
  2. **ANSI escape pollution.** Some terminals emit `[…]` sequences for non-character events (focus changes, cursor reports, paste-bracketing). The original loop fed those bytes into the password buffer and echoed `*` for each one. Now consumed silently.
  3. **Hard SIGINT during a secret prompt** is now a soft cancel — return empty string, let the caller's shape validator re-prompt — instead of `process.kill`-ing the process. The hard-kill was masking the CRLF bug above and aborting the wizard from stray bytes.
- New `tests/setup-prompts.test.js` — 7 fixtures covering Unix LF, Windows CRLF, type-ahead carry-over, ANSI cursor-position-report mid-buffer, bracketed-paste markers, soft-cancel on Ctrl-C, and DEL/backspace. All pass.

### Notes
- Reported by Brad on 2026-04-25 (twice). No workaround required — upgrade with `npm install -g @jhizzard/termdeck@latest` (or rerun `npx @jhizzard/termdeck-stack`) and the wizard works on every terminal we've tested.

## [0.6.0] - 2026-04-25

### Added — Sprint 25 (Supabase MCP wizard)
- **One-click Supabase auto-fill** in the Tier 2 setup wizard. User pastes a Supabase Personal Access Token, the wizard lists their projects via `@supabase/mcp-server-supabase`, the user picks one, and the existing Sprint 23 configure+migrate flow takes it from there. Manual paste path is preserved. Three new endpoints: `POST /api/setup/supabase/{connect,projects,select}`. PAT held in a closure for the wizard's lifetime only — never persisted, never logged.
- **Yellow `[hint]` line** on startup when RAG is enabled and the Supabase MCP isn't installed: `Supabase MCP not installed — wizard auto-fill unavailable. Install with: npx @jhizzard/termdeck-stack --tier 4`. Suppressed when `~/.claude/mcp.json` already declares a `supabase` server. Tier 1 users see no output.
- **`packages/server/src/setup/supabase-mcp.js`** — bridge module that spawns `@supabase/mcp-server-supabase` as a child, JSON-RPC over stdio, timeout-protected, kills child on resolve/reject. Zero new npm deps.

### Added — Sprint 28 (update-signal mechanisms)
- **`termdeck doctor`** subcommand prints a four-package version-check table (TermDeck + Mnestra + Rumen + termdeck-stack), comparing installed vs npm latest. Exit codes 0 (all current) / 1 (updates available) / 2 (network failure). `--json` and `--no-color` flags.
- **Rate-limited startup update-check banner.** When a TermDeck update is available, exactly one yellow `[hint]` line prints on startup. Cache at `~/.termdeck/update-check.json` enforces a 24h TTL so the check never hits the registry more than once per day. Suppressed by `TERMDECK_NO_UPDATE_CHECK=1`, by non-TTY stdout, and by a fresh cache. All failures (network, cache write, parse) are swallowed — never blocks startup.
- **README "Staying current" section** + new `docs/SEMVER-POLICY.md` documenting per-package version semantics and the upgrade-risk table.

### Notes
- v0.5.1 was queued (start.sh silent-exit fix) but folded into v0.6.0 — the fix is included.
- This is a minor bump because two new feature surfaces ship together: the Supabase MCP wizard auto-fill (Sprint 25) and the doctor + update-check signals (Sprint 28). No breaking changes for users on v0.5.x.

## [0.5.1] - 2026-04-25

### Fixed
- **`scripts/start.sh` silent exit** — running the repo-clone launcher under v0.5.0 dropped users back to the shell after printing two "Stack Launcher" banners. Root cause: the v0.5.0 CLI auto-orchestrate detection routed back into `stack.js`, whose `execTermDeck` then `require()`-d the already-cached `index.js` and the server never started. Fix is two-part: (1) `stack.js` now spawns a fresh node process for the CLI (avoids the require-cache trap) and passes `--no-stack` so the inner CLI definitively skips re-detection; (2) `scripts/start.sh` itself now passes `--no-stack` to the CLI to eliminate the duplicate Stack Launcher banner. Auto-orchestrate behavior on plain `termdeck` (no script) is unchanged.

## [0.5.0] - 2026-04-25

### Changed
- **`termdeck` (no subcommand) auto-orchestrates the stack** when a configured stack is detected (`~/.termdeck/secrets.env` present AND (`mnestra.autoStart: true` OR `rag.enabled: true`)). Otherwise behavior is unchanged from v0.4.6 — Tier-1-only boot. This eliminates the discovery friction of `termdeck stack` for returning users while keeping a friction-free path for first-run testers.
- Added `--no-stack` flag to force a Tier-1-only boot regardless of detection.
- `termdeck stack` retained as an explicit-force alias — v0.4.6 docs and muscle memory keep working.

### Added
- 13 new tests under `tests/cli-stack-detection.test.js` (8 detection cases) and `tests/cli-default-routing.test.js` (5 dispatch cases) — covers the v0.4.5 → v0.5.0 upgrade-path silence guarantee for unconfigured users.
- README + `docs/GETTING-STARTED.md` reflect the new default behavior.

### Notes
- No new fields required in `config.yaml`. Detection reads existing `mnestra.autoStart` / `rag.enabled` keys.
- Users who upgrade from v0.4.5 with no `secrets.env` see no behavioral change.

## [0.4.6] - 2026-04-25

### Added
- **`termdeck stack` subcommand**: Node port of `scripts/start.sh` that ships in the npm tarball. Boots Mnestra (when installed and `mnestra.autoStart: true`), checks Rumen via `DATABASE_URL`, and starts TermDeck — same numbered four-step output as the bash launcher. Cross-platform (no bash dependency). Closes the gap surfaced when a tester `npm install`-ed TermDeck and discovered `scripts/start.sh` wasn't in the published package.
- `--no-mnestra` flag on `termdeck stack` for Tier-1-only stack runs.
- README "Alternative install paths" entry pointing at the new subcommand.

### Notes
- `scripts/start.sh` continues to work for repo clones — unchanged. The new subcommand is a parallel path, not a replacement.

## [0.4.5] - 2026-04-19

### Added
- **Responsive layouts**: media queries for 13" laptops through 27" iMacs, min panel dimensions, toolbar compaction on small screens, resize debounce on fitAll
- **Setup wizard writes config**: user pastes Supabase credentials in the browser wizard, wizard validates + saves secrets.env + config.yaml + runs all 7 migrations automatically
- **Welcome-back flow**: returning users see a brief status toast, not the full wizard
- **Orchestrator layout v2**: 2x2 workers TOP + full-width orchestrator BOTTOM (equal thirds). JS-driven column count handles 1-5 panels.
- **Bulletproof start.sh**: numbered step-by-step output, smart Mnestra handling (kill/restart if 0 memories), first-run config creation
- **Rumen re-kickstart**: 166 insights generated with hybrid embeddings, 44 PVB-specific (up from 13). Cross-project pattern discovery confirmed working.

### Fixed
- **CI lint failures**: docs-lint job now handles clean checkouts without synced docs-site content
- **Flashback resurrection**: root cause found — `queryDirect` sent `recency_weight`/`decay_days` to an 8-argument SQL function. Removed the extra args. Flashback now fires end-to-end (verified: error → analyzer → Mnestra query → toast). Silent for 15 sprints due to this bug.
- **Data quality cleanup**: 145 sub-0.10 confidence noise insights deleted, all "chopin-nashville" project tags fixed to real config.yaml names (termdeck, scheduling, claimguard)

### Added
- **SkillForge foundation** (Tier 5): `termdeck forge` CLI command reads memory count from Mnestra and projects Opus cost. 4-phase prompt template (quality audit → pattern extraction → skill generation → self-critique). Skill installer writes .md files to `~/.claude/skills/`. Actual Opus call stubbed for v0.5.
- **Orchestrator layout fix**: explicit 4-row grid (fixes `grid-row: 1/-1` failure with auto rows)
- **Setup wizard**: click "config" to see 4-tier status (green/amber/gray), next-step commands, and a re-check button. Auto-opens on first run.
- **GET /api/setup**: tier detection endpoint returning config state and firstRun flag
- **First-run detection**: CLI prints setup hint when no config.yaml exists
- **Orchestrator layout**: new "orch" preset — 1 large panel (60% left) + stacked workers (40% right). Keyboard shortcut: Cmd/Ctrl+Shift+7
- **Session ID in panel headers**: first 8 chars visible at a glance for orchestration workflows
- **Mnestra auto-start**: `mnestra.autoStart: true` in config.yaml makes start.sh boot Mnestra automatically. Detects already-running instances.
- **Protocol-aware WebSocket**: auto-detects `ws://` vs `wss://` based on page protocol (enables HTTPS deployment)
- **TranscriptWriter pool TTL retry**: 30s cooldown matching getRumenPool pattern (was permanent failure)
- **RAG circuit breaker half-open**: retries after 5 minutes instead of staying permanently open

### Changed
- `actions/checkout` v4→v6 in CI workflow
- `uuid` 9→13 (named export `{ v4 }` verified)
- Contradictions #6 marked resolved (engram/ directory no longer exists)
- RAG telemetry push disabled by default (Mnestra + Rumen handle memory independently; engram_* tables were never created)

## [0.3.8] - 2026-04-17

### Added
- **Flashback modal**: clicking a Flashback toast now opens a proper centered modal with content, project tag, similarity score, and feedback buttons (previously opened buried drawer tab)
- **Project name resolution**: sessions and insights use config.yaml project names instead of directory path segments (fixes "chopin-nashville" appearing everywhere)
- **Insight confidence filter**: `GET /api/rumen/insights` accepts `?minConfidence=0.15` (default) to filter low-quality noise
- **Insight quality guide**: `docs/INSIGHT-QUALITY.md` with confidence score interpretation and tuning recommendations
- **`scripts/bump-version.sh`**: one-command version bump across package.json + all active docs

### Fixed
- **CLI banner right border**: dynamic version string now centers correctly in the ASCII box
- **Error detection false positive**: clean PTY exits (code 0) no longer persist "Error detected in output" status. Claude Code sessions use stricter line-start error matching to avoid flagging grep results and tool output
- **CLI bind guardrail bypass**: guard now enforced in the CLI entrypoint, not just the direct server path
- **Health badge false-green**: shows all checks when DATABASE_URL is configured, regardless of pass/fail

## [0.3.6] - 2026-04-16

### Added
- **`0.0.0.0` bind guardrail**: server refuses to start on a non-loopback host unless `auth.token` (or `TERMDECK_AUTH_TOKEN`) is configured; exits with `[security]` lines pointing to both configuration paths
- **Flashback end-to-end test** (`tests/flashback-e2e.test.js`): exercises `input → PTY error → analyzer → rag_events → mnestra-bridge` against a live server, observes via `rag_events` (write-once, race-free) rather than transient `meta.status`, skips gracefully when server or Mnestra are unavailable
- **Failure-injection test suite** (`tests/failure-injection.test.js`): 5 scenarios — Mnestra unreachable, component-failure isolation, PTY crash recovery, rapid create/destroy leak check, `/api/health` latency budget
- **`scripts/verify-release.sh`**: seven pre-publish checks (version alignment, working tree clean, `node -c` parse, `lint-docs.sh`, test suite, bin shebang, `files[]` coverage) with aggregated exit status
- `RELEASE_CHECKLIST.md`: rewritten as a TermDeck-only playbook that delegates mechanical checks to `verify-release.sh`

### Fixed
- `DEPLOYMENT.md` Binding section: previous wording was directionally correct but under-specified; now documents the exact `[security]` exit behavior, both config paths, and the three allowed loopback hosts (`127.0.0.1`, `localhost`, `::1`)

## [0.3.4] - 2026-04-16

### Added
- **Two-row toolbar layout**: replaces the horizontal-scroll toolbar; every button visible without scrolling
- **Optional token auth** (`packages/server/src/auth.js`): `Authorization: Bearer`, `?token=` query, and `termdeck_token=` cookie. Token source is `config.auth.token` OR `TERMDECK_AUTH_TOKEN`; unset = zero behavior change for local users
- **`docs/SECURITY.md`**: threat model, default posture, auth mechanics, secrets handling, transcript data hygiene
- **`docs/DEPLOYMENT.md`**: pre-exposure checklist, nginx/caddy reverse-proxy configs with 3600s WebSocket timeouts, systemd unit skeleton

### Changed
- **Status and Config buttons wired**: previously stubs; now open the status drawer and config viewer
- Removed the dead RAG indicator from the toolbar (never surfaced real state)
- `start.sh`: Node 18+ check, transcript-migration check, MCP hint, `--port` flag, stack summary on boot

## [0.3.3] - 2026-04-16

### Added
- **Contract tests** for `/api/health`, `/api/rumen/*`, and the transcript API (recent/search/replay shapes)

### Fixed
- Preflight Mnestra probe hits `/healthz` (not `/health`); resolves false-red health badge when Mnestra ≥0.2.0 is running correctly
- Toolbar overflow: tighter spacing, `overflow-x: auto`, `flex-shrink` on right section (stopgap before the 0.3.4 two-row redesign)
- `getRumenPool`: 30-second TTL retry after a transient failure, replacing the permanent per-process failure flag

### Changed
- `docs/GETTING-STARTED.md`: split `npx` vs. `clone` install paths

## [0.3.2] - 2026-04-16

### Fixed
- **RAG outbox data-loss bug**: rows were deleted before Supabase ack; writes now flushed durably
- **Transcript API contract**: request/response shape aligned with client expectations
- **Health badge**: tier-aware rendering; no longer reports false-green when Mnestra is offline
- Preflight Mnestra check: hits `/healthz` (not `/health`) and parses `store.rows`

### Changed
- Removed personal names from docs; bumped internal version refs to 0.3.2

## [0.3.1] - 2026-04-16

### Added
- **Preflight health check**: 6 parallel checks at startup (Node, ports, config, Mnestra, Rumen, Supabase)
- **Session transcripts**: schema + writer module; transcripts wired into server and surfaced via recovery UI
- **Health badge** in top bar with tier-aware display
- GETTING-STARTED.md: tier-aware guide (Tiers 1-4) with CLAUDE.md specifics and stop markers
- Tester brief: DM template + 5-step checklist for pre-launch feedback

### Fixed
- Transcript buffer cap
- RAG telemetry re-enabled with per-table 404 circuit breaker
- CI lint: bare catch blocks

## [0.3.0] - 2026-04-15

### Added
- **Rumen insights API**: async learning layer integration (Extract → Relate → Synthesize → Surface)
- **Vector embeddings** for hybrid recall across memory store
- **Client split**: `public/index.html` split into `index.html` + `style.css` + `app.js`
- **Launch collateral**: Show HN, Twitter, LinkedIn, dev.to drafts
- **Hero GIF** re-shot post-Rumen integration
- Supabase Edge Function + trigger script for Rumen
- RUMEN-UNBLOCK runbook
- `init-rumen` forwards `OPENAI_API_KEY`; migration self-heals

### Changed
- Flashback decoupled from `rag.enabled` — works standalone against Mnestra
- README rewritten with Flashback-first pitch and three-tier stack diagram

## [0.2.5] - 2026-04-15

### Added
- External audit remediation: test suite, PATCH field whitelist, hardened port regex

## [0.2.4] - 2026-04-14

### Added
- Hero GIF wired into README
- Flashback demo GIF and post-rename stills
- Tier 2 verification log

### Changed
- Sprint 3 launch materials + T1 docs sweep

## [0.2.3] - 2026-04-14

### Fixed
- Broken `termdeck init --mnestra` dispatch in 0.2.2

### Changed
- `init-engram.js` → `init-mnestra.js`
- `setup/engram-migrations/` → `setup/mnestra-migrations/`
- Stripped lingering Ingram refs (mid-session pivot residue)

## [0.2.2] - 2026-04-14

### Changed
- **Rename: Engram → Mnestra** (Ingram rejected via Ingram Industries sponsor conflict)
- Flashback toast header renders "Mnestra — possible match"
- Docs, setup wizard default package name updated
- `engram-bridge/` → `mnestra-bridge/`

### Added
- 4+1 orchestration blog post + X thread documenting the meta-moment where Flashback surfaced its own rename research mid-crisis

## [0.2.1] - 2026-04-14

### Added
- Help button links to live docs at `termdeck-docs.vercel.app`
- docs-site Vercel deploy config

## [0.2.0] - 2026-04-14

### Added
- **npm publishing**: flatten to root `@jhizzard/termdeck` with bundled server+client+config
- **Onboarding tour**: 13-step spotlight walkthrough, first-run auto-trigger, keyboard nav
- **Add-project modal** for adding projects from the UI
- **Engram bridge** (direct/webhook/mcp) — memory MCP integration (later renamed Mnestra in 0.2.2)
- **Proactive error events** surfaced as Flashback toasts
- **Session logger** and `POST /api/sessions/:id/input` for agent replies
- **INSTALL guide** and ship checklist
- Panel info tabs, switcher overlay, reply form, first-run empty state
- Alt-key handling via `e.code`, persistent launch buttons, panel indices
- dotenv secrets refactor; `@homebridge/node-pty` prebuilds
- Codespaces devcontainer; port 3000 silent auto-forward
- AI query scoped to project with `all:` prefix for cross-project search

### Changed
- Hoist runtime deps; mark CLI workspace pkg private
- Shell spawn fix (respect `SHELL` env var)
- zsh is the default shell
- Banner padding; session-logs fix

### Fixed
- Duplicate WebSocket on session create (claim `state.sessions` slot at entry)
- Disabled racy `status_broadcast` + 3s-poller auto-`createTerminalPanel` paths
- Respect `rag.enabled=false` — stop 404 push spam
- Codespaces: detect `CODESPACES` env var, skip auto-open

## [0.1.1] - 2026-04-11

### Added
- Hero screenshot and 30-second demo GIF in README
- `CONTRIBUTORS.md` documenting Joshua Izzard as sole author
- 4 reference docs in `docs/`: Rumen architecture plan, Rumen deploy checklist, Podium-derived lessons, cross-project analysis methodology
- Promotion drafts for v0.1 launch (Show HN, tweet thread, dev.to article, Reddit posts)

### Changed
- All 12 silent `catch {}` blocks replaced with `[tag]`-prefixed `console.error` calls. The 2 intentional require() fallbacks at module load are preserved.
- Established `[tag]` logging convention: `[pty]`, `[ws]`, `[db]`, `[rag]`, `[config]`, `[cli]`, `[client]`
- Tight loops (fitAll, 3-second session poll) use rate-limited one-shot warnings to avoid console spam

## [0.1.0] - 2026-03-19

### Added
- **Core PTY + WebSocket loop**: real PTY terminals via node-pty, one WebSocket per session, xterm.js client
- **6 grid layouts** (1x1, 2x1, 2x2, 3x2, 2x4, 4x2) plus focus and half modes
- **Output analyzer**: detects Claude Code, Gemini CLI, Python servers, plain shells; extracts status, ports, request counts, last commands
- **8 curated terminal themes**: Tokyo Night, Rosé Pine Dawn, Catppuccin Mocha, GitHub Light, Dracula, Solarized Dark, Nord, Gruvbox Dark
- **SQLite persistence** for sessions, commands, and RAG events
- **Project-aware launcher**: `~/.termdeck/config.yaml` defines projects with auto-cd and default themes
- **macOS .app launcher** (no terminal needed to start)
- **Windows installer** with Start Menu and Desktop shortcuts
- **WebSocket auto-reconnect** with exponential backoff
- **Status broadcast** every 2 seconds for live metadata updates
- **Keyboard shortcuts**: Ctrl+Shift+N for prompt bar, Ctrl+Shift+1-6 for layouts, Ctrl+Shift+]/[ to cycle terminals, Escape to exit focus

[Unreleased]: https://github.com/jhizzard/termdeck/compare/v0.4.5...HEAD
[0.4.5]: https://github.com/jhizzard/termdeck/compare/v0.3.4...v0.4.5
[0.3.4]: https://github.com/jhizzard/termdeck/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/jhizzard/termdeck/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/jhizzard/termdeck/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/jhizzard/termdeck/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jhizzard/termdeck/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/jhizzard/termdeck/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/jhizzard/termdeck/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/jhizzard/termdeck/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/jhizzard/termdeck/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/jhizzard/termdeck/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jhizzard/termdeck/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jhizzard/termdeck/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jhizzard/termdeck/releases/tag/v0.1.0
