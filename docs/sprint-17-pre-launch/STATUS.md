# Sprint 17 — Pre-Launch Polish

Append-only coordination log. Ready to execute.

## Mission

Final pre-launch sprint: merge safe dependency PRs, add orchestrator layout, auto-start Mnestra, fix docs-site stale content.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-dependencies.md | package.json, .github/workflows/ |
| T2 | T2-orchestrator-layout.md | packages/client/public/style.css, packages/client/public/app.js, packages/client/public/index.html |
| T3 | T3-autostart-mnestra.md | scripts/start.sh, config/config.example.yaml |
| T4 | T4-docs-site-fixes.md | docs-site/src/content/docs/ |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

[T1] actions/checkout bumped v4→v6 in all 4 jobs of .github/workflows/ci.yml (setup-node left at v4 per spec scope).
[T1] uuid bumped 9→13 in package.json; `const { v4: uuidv4 } = require('uuid')` verified working (generated valid v4 UUID).
[T1] node --check passes on index.js, session.js, database.js, rag.js, themes.js, and cli/src/index.js.
[T1] npm test → 35/35 pass, 0 fail.
[T1] Mnestra repo steps (#1, #2, #4) deferred — this terminal owns only the TermDeck repo.
[T1] DONE

---

[T2] CSS: added `.grid-container.layout-orch { grid-template-columns: 3fr 2fr; grid-auto-rows: 1fr }` with `.layout-orch .term-panel:first-child { grid-row: 1 / -1; grid-column: 1 }`. First panel spans the full left column; remaining panels stack evenly in the right column. Works for 2, 3, 4, 5+ panels via `grid-auto-rows`.
[T2] HTML: added `<button class="layout-btn" data-layout="orch" title="Orchestrator: 1 large left + stacked right">orch</button>` between `4x2` and `control` in the topbar-center layout group.
[T2] JS: extended layout shortcut range from 1–6 to 1–7; `Cmd/Ctrl+Shift+7` → `orch`. `setLayout()` needed no new branch — the generic `grid.className = grid-container layout-${layout}` path applies the class and the trailing `requestAnimationFrame(() => fitAll())` refits all terminals after the switch.
[T2] Session ID in panel headers: added `<span class="panel-sid" title="Session ID: ${id}">${id.slice(0,8)}</span>` between `.panel-index` and `.panel-status` in `createTerminalPanel`. Orchestrator can now see each terminal's short ID at a glance; full UUID on hover. Styled with a new `.panel-sid` rule — monospace, dim, subtle background pill.
[T2] Onboarding tour copy updated: "Layout modes" step now says "Eight preset grid layouts … plus **orch** (1 large + stacked, for 4+1 sprints) …" and references the `Cmd/Ctrl+Shift+1`–`7` shortcut range.
[T2] Files touched (T2-owned only): packages/client/public/style.css, packages/client/public/app.js, packages/client/public/index.html. No other terminal's files modified.
[T2] DONE

---

[T3] config/config.example.yaml: added top-level `mnestra:` section with `autoStart: true` plus inline comments documenting the three states (`true` / `false` / unset).
[T3] scripts/start.sh: added `CONFIG_FILE="${HOME}/.termdeck/config.yaml"` and a yaml-parser block (Python + PyYAML, all exceptions swallowed → `unset`) that resolves `mnestra.autoStart` to `true` / `false` / `unset`.
[T3] Split the old `for CHECK_PORT in $PORT $MNESTRA_PORT` stale-kill loop so only the TermDeck port gets killed. The Mnestra port is now probed via lsof + `/healthz` and never blindly killed, so an already-running Mnestra survives a `start.sh` rerun.
[T3] Rewrote the Mnestra start block as a priority chain: (1) `/healthz` 200 → "Mnestra already running" + row count, skip spawn; (2) port busy but not Mnestra → warn + skip; (3) binary not installed → existing Tier-2 hint; (4) `autoStart: false` → "auto-start disabled" hint; (5) `autoStart: unset` → "detected but not configured for auto-start" hint; (6) Supabase env missing → existing skip; (7) else (`autoStart: true` + binary + env) → spawn `mnestra serve` + health probe + MCP hint. Behavior in case (7) is unchanged from v0.3.8.
[T3] Verification: `bash -n scripts/start.sh` passes. Parser harness against 4 fixtures (true / false / missing-key / missing-file) returns `true` / `false` / `unset` / `unset` as expected.
[T3] Acceptance: autoStart=true → starts; autoStart=false → skipped with message; no config → `unset` hint, no crash; already-running Mnestra → detected via `/healthz` and skipped; config.example.yaml updated. ✓ all 5.
[T3] Files touched (T3-owned only): scripts/start.sh, config/config.example.yaml. No other terminal's files modified.
[T3] DONE

## T4 — Docs-Site Fixes (2026-04-18)

- **Rumen changelog**: edited source at `~/Documents/Graciella/rumen/CHANGELOG.md`. Moved the v0.2 content out of `[Unreleased]` into dated entries for `[0.2.0]` — 2026-04-14, `[0.2.1]` — 2026-04-14 (Mnemos branding), `[0.2.2]` — 2026-04-14 (Mnemos → Mnestra final rename), `[0.4.0]` — 2026-04-16 (hybrid embeddings, self-healing migration), `[0.4.1]` — 2026-04-16 (test suite, install guide, README refresh). Note: no `0.3.0` ever shipped — tags go v0.1.0 → v0.2.x → v0.4.x; the spec's request for a `0.3.0` entry is factually N/A.
- **Mnestra migrations**: edited `~/Documents/Graciella/engram/README.md` (the upstream source the sync pulls from). Install section now lists all six migrations (001–006) instead of only three; the schema-overview paragraph at the bottom was also updated to reference the full six-file set.
- **Contradictions #6**: edited repo-root `docs/contradictions.md`. Row 6 marked with strikethrough + `**Resolved in Sprint 17 T4:**` note confirming `engram/` dir is gone and content lives under `mnestra/`. Last-reviewed date bumped to 2026-04-18.
- **Security cookie name**: repo-root `docs/SECURITY.md` line 75 already reads `termdeck_token` (landed earlier in commit 912a9de). The stale docs-site copy (`security.md` line 80 had `termdeck_auth`) is regenerated from the fixed source on every sync, so re-running sync was sufficient.
- **Sync**: `MNESTRA_REPO=/Users/joshuaizzard/Documents/Graciella/engram RUMEN_REPO=/Users/joshuaizzard/Documents/Graciella/rumen node scripts/sync-content.mjs` → termdeck: 39 files, mnestra: 6, rumen: 3. Verified all four fixes landed in `docs-site/src/content/docs/` post-sync.
- **Build**: `npm run build` → 55 pages built in 31.53s, pagefind index + sitemap generated, no errors.
- **Deploy**: `vercel deploy --prod` → READY.
  - Production URL: https://termdeck-docs-70kxaf546-joshua-izzards-projects-1da4003a.vercel.app
  - Alias: https://termdeck-docs.vercel.app
  - Deployment ID: dpl_DATCMxtyiJoT1KeMJmtjsGzw4tUA

Acceptance criteria — all met:
- [x] Rumen changelog has dated version entries
- [x] Mnestra install lists all 6 migrations
- [x] Contradictions #6 marked resolved
- [x] Security doc cookie name correct (via sync from already-fixed source)
- [x] Docs site rebuilt and deployed

[T4] DONE
