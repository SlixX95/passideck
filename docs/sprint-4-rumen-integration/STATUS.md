# Sprint 4 — Rumen Integration & Launch Synthesis

Append-only coordination log. Each terminal writes its own progress. Do NOT delete or rewrite entries — append only.

Started: 2026-04-15 19:55 UTC (after Rumen v0.3.4 deploy, first successful kickstart at 111/111 insights)

## Terminals

| ID | Owner | Spec | Working directory |
|----|-------|------|-------------------|
| T1 | Orchestrator | [T1-wizard-version-sync.md](T1-wizard-version-sync.md) | termdeck monorepo |
| T2 | Orchestrator | [T2-server-rumen-insights-api.md](T2-server-rumen-insights-api.md) | termdeck monorepo |
| T3 | Orchestrator | [T3-client-morning-briefing.md](T3-client-morning-briefing.md) | termdeck monorepo |
| T4 | Orchestrator | [T4-launch-doc-synthesis.md](T4-launch-doc-synthesis.md) | termdeck/docs |

## File ownership (CRITICAL — read before touching any file)

| File | Owner | Notes |
|------|-------|-------|
| `packages/server/src/setup/init-rumen.js` | T1 | T1 exclusive |
| `packages/server/src/index.js` | T2 | T2 exclusive. T3 reads via HTTP only. |
| `packages/server/src/database.js` | T2 | Small additions only; keep backwards-compat |
| `packages/client/public/index.html` | T3 | T3 exclusive |
| `docs/launch/**` (read) | T4 | T4 reads everything |
| `docs/launch/LAUNCH-STATUS-2026-04-15.md` (new) | T4 | T4 creates |
| `docs/sprint-4-rumen-integration/API-CONTRACT.md` | T2 writes, T3 reads | T2 must write this FIRST before client work starts. |
| `docs/sprint-4-rumen-integration/STATUS.md` (this file) | All (append only) | |

## Contract (T2 ↔ T3)

T2 writes `API-CONTRACT.md` as its first action. T3 blocks on that file existing before starting client work. Until the contract is written, T3 can read the spec and do non-UI prep (e.g., inventory existing top-bar structure).

## Coordination rules

1. **Append only to STATUS.md.** Use the format below.
2. **Never edit another terminal's files.** If you need something from another terminal, write a request in STATUS.md with `@Tn needs`.
3. **Flag blockers immediately.** Don't wait — write a BLOCKED entry and stop.
4. **One commit per significant step.** Use the conventional commit format.
5. **Sign off** when your spec is complete with a `DONE` entry.

## Progress log

Entry format:
```
## [Tn] HH:MM UTC — <short summary>
<details, 1-3 sentences>
Files touched: path/a, path/b
Next: <what's next OR DONE OR BLOCKED>
```

---

(append below)
[T4] 20:05 UTC — STARTED — reading inputs for LAUNCH-STATUS synthesis

## [T2] 20:06 UTC — STARTED
Read T2 spec and STATUS coordination rules. Beginning work on rumen HTTP endpoints.
Files touched: (none yet)
Next: write API-CONTRACT.md to unblock T3.

## [T2] 20:07 UTC — CONTRACT-WRITTEN
API-CONTRACT.md published with frozen JSON shapes for GET /api/rumen/insights, GET /api/rumen/status, POST /api/rumen/insights/:id/seen. Includes error variants (200 `{enabled:false}`, 503 `rumen database unreachable`, 404, 400) so T3 can code against all branches.
Files touched: docs/sprint-4-rumen-integration/API-CONTRACT.md
Next: wire the three routes into packages/server/src/index.js with a pg singleton, graceful fallback when DATABASE_URL missing.

## [T1] 21:27 UTC — STARTED
Picked up T1-wizard-version-sync. Preflight note: the file-ownership table above lists `packages/server/src/setup/init-rumen.js`, but the wizard actually lives at `packages/cli/src/init-rumen.js` (there is no setup/init-rumen.js — that path in the ownership table is a Sprint-3-era typo). T2 and T3 specs both explicitly say "do NOT touch init-rumen.js", so there's no ownership overlap — proceeding against the real file. Edge Function template at `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` currently hardcodes `npm:@jhizzard/rumen@0.3.4` on line 23.
Files touched: docs/sprint-4-rumen-integration/STATUS.md
Next: replace the hardcode with `__RUMEN_VERSION__` placeholder, then teach the wizard's staging step to query `npm view @jhizzard/rumen version` and substitute before deploy (with a pinned fallback).

## [T3] 21:27 UTC — STARTED
T3 booted. Read spec at docs/sprint-4-rumen-integration/T3-client-morning-briefing.md. Confirmed exclusive ownership of packages/client/public/index.html. Beginning non-code prep while checking for API-CONTRACT.md.
Files touched: (none)
Next: PREP — inventory existing top-bar and modal structures

## [T3] 21:30 UTC — PREP
Inventoried existing structures in packages/client/public/index.html that the Rumen badge + briefing modal will reuse:

**Top bar (line 1260–1289):** `.topbar` → `.topbar-left` contains `.topbar-logo` and `.topbar-stats#globalStats` with individual `.topbar-stat` pills (active/thinking/idle) plus a hidden `#stat-rag` pill at line 1275. That hidden pill is existing precedent for conditionally-shown chrome — the insights badge will sit inside `#globalStats` as another `.topbar-stat` variant so it inherits the 11px dim palette. Topbar CSS: line 74–86.

**Modal precedent (line 587–595, 1378–1406):** `.add-project-modal#addProjectModal` is the canonical modal pattern — fixed inset:0, z-index:3000, flex-centered, toggled via `.open` class. Structure: `.add-project-backdrop` (rgba 0.72) + `.add-project-card` (surface bg, accent-dim border, 10px radius). The briefing modal will mirror this pattern, widened (~720px) with its own `.rumen-*` class prefix to avoid collisions with `.apm-*`.

**Modal wiring precedent (line 2684, 2702–2718, 3301–3306):** `setupAddProjectModal()` shows the open/close pattern — `modal.classList.add('open')`, Escape handler. Will clone for the briefing modal.

**Design tokens available:** `--tg-accent`, `--tg-accent-dim`, `--tg-amber`, `--tg-green`, `--tg-purple`, `--tg-surface`, `--tg-surface-hover`, `--tg-bg`, `--tg-text`, `--tg-text-dim`, `--tg-text-bright`, `--tg-border-active`, `--tg-radius-sm`, `--tg-mono`, `--tg-sans`. No new CSS frameworks.

Files touched: (none — prep only)
Next: API-CONTRACT.md already exists (T2 published at 20:07). Proceeding to implementation.

## [T3] 21:32 UTC — UNBLOCKED
Read docs/sprint-4-rumen-integration/API-CONTRACT.md — three endpoints frozen: GET /api/rumen/insights (filters: limit, project, since, unseen; returns {insights, total, enabled?}), GET /api/rumen/status (health + last-job summary + total/unseen counts; returns `{enabled:false}` when off), POST /api/rumen/insights/:id/seen (idempotent, returns `{id, acted_upon}`). All honor a 200 `{enabled:false}` shape so the client just hides UI. Implementing badge + modal now.
Files touched: (none yet)
Next: add CSS, top-bar badge HTML, modal HTML, and JS wiring in packages/client/public/index.html

## [T2] 21:35 UTC — DONE
All three rumen endpoints wired in packages/server/src/index.js with a module-level lazy `pg.Pool` singleton (connectionString from `process.env.DATABASE_URL`, max=4, 5s connect timeout). `pg` is loaded conditionally so a missing root install can't crash the server. Behavior verified against the live petvetbid DB (122 insights currently):
- `GET /api/rumen/status` → 200, populated (enabled=true, last_job_id=295052b3…, total_insights=122, unseen=122, latest_insight_at populated).
- `GET /api/rumen/insights?limit=3` → 200, 3 rows, total=122; `unseen=true` and `project=<name>` filters both verified (project filter trimmed 122→121, matching GIN-indexed `ANY(projects)` semantics).
- `POST /api/rumen/insights/:uuid/seen` → 200 `{id, acted_upon:true}` on a real row; 400 `{error:"invalid insight id"}` on malformed UUID; 404 `{error:"insight not found"}` on all-zero UUID.
- With `DATABASE_URL` unset: status → 200 `{enabled:false}`; insights → 200 `{insights:[],total:0,enabled:false}`; seen → 503 `{error:"rumen not configured"}`.
- `npm test` still green (35/35 passing). Server starts cleanly with or without Rumen configured.
`database.js` was left untouched — the rumen query helpers sit in index.js since all access is read-only Postgres and database.js is SQLite-only; adding a cross-DB helper there would have muddied its contract. T3 is unblocked and already consuming API-CONTRACT.md.
Files touched: packages/server/src/index.js, docs/sprint-4-rumen-integration/API-CONTRACT.md, docs/sprint-4-rumen-integration/STATUS.md
Next: DONE

## [T1] 21:40 UTC — DONE
Wizard now resolves `@jhizzard/rumen` version from the npm registry at deploy time and substitutes `__RUMEN_VERSION__` into a staged copy of `rumen-tick/index.ts` before `supabase functions deploy`. On `npm view` failure the wizard falls back to `FALLBACK_RUMEN_VERSION` (currently `0.3.4`) and prints a warning — behavior documented inline in `resolveRumenVersion()`. The template `rumen-tick/index.ts` now holds only the `__RUMEN_VERSION__` placeholder (and `stageRumenFunction()` throws if someone reintroduces a hardcoded version, so this can't silently regress). Verified:
  1. `node packages/cli/src/index.js init --rumen --dry-run --yes --skip-schedule` prints `→ Using rumen version: 0.3.4 (from npm registry)` between the migration and deploy steps and completes all 6 deploy steps ✓
  2. Harness test of the private helpers: `resolveRumenVersion()` → `0.3.4 / npm registry`; `stageRumenFunction('0.3.4')` produces a staged `index.ts` containing `npm:@jhizzard/rumen@0.3.4` with zero remaining `__RUMEN_VERSION__` tokens ✓
  3. `grep -rn "rumen@0" packages/server/src/setup/` → zero hits ✓
Non-verified (requires live Supabase deploy, intentionally not run autonomously): end-to-end real re-deploy against petvetbid (wizard step 5 with the real CLI). Josh can run `node packages/cli/src/index.js init --rumen --yes` to exercise the live path; the dry-run already covers every code branch this change touches and the acceptance grep is clean.
Files touched: packages/cli/src/init-rumen.js, packages/server/src/setup/rumen/functions/rumen-tick/index.ts, docs/sprint-4-rumen-integration/STATUS.md
Next: DONE. 🔓 T1 file claims released.
[T4] 20:18 UTC — DONE — LAUNCH-STATUS-2026-04-15.md written, 3212 words, 7 sections, anchored on 19:47 UTC Rumen kickstart (111 insights).

## [T3] 21:48 UTC — DONE
Top-bar insights badge and morning-briefing modal landed in `packages/client/public/index.html`. Built additively — zero existing code deleted or refactored. Walked every acceptance criterion:

- ✅ **Badge visible only when `enabled:true`.** `setupRumen()` calls `/api/rumen/status` on load; the badge uses a `.visible` class that is only added when the response contains `enabled: true`. A `{enabled:false}` (or a 503 error-shape) leaves it removed, so Rumen-off dashboards show no new chrome at all.
- ✅ **Unseen > 0 colored, unseen == 0 muted.** `.rumen-badge.has-unseen` paints amber (`--tg-amber`, rgba fill) with the label `"N new insight(s)"`; default state is `--tg-text-dim` on `--tg-surface` showing `"N insight(s)"`.
- ✅ **Click opens modal with insights list.** `openRumenModal()` toggles `.open`, populates the project-filter select from loaded projects ∪ projects present in fetched insights, renders the header summary, and fires a fresh `/api/rumen/insights?limit=50` fetch.
- ✅ **Mark-seen fades, decrements, persists.** `markRumenInsightSeen()` optimistically flips `acted_upon`, decrements `unseen`, re-renders the badge, adds `.fading` (0.35s CSS transition), then POSTs to `/api/rumen/insights/:id/seen`. On failure it rolls back (restores `acted_upon`, re-increments, shows a `retry` button). Idempotent per spec.
- ✅ **Project filter narrows the list.** Filter dispatches a new fetch with `?project=…`; the server-side GIN filter matches T2's verified behavior.
- ✅ **Escape closes the modal.** Handler is scoped to `#rumenModal` so it won't clash with the existing layout-focus Escape handler at line ~3378, and focus is restored to the previously-focused element on close.
- ✅ **Rumen off → badge hidden, no error toast.** Verified by code path (`renderRumenBadge` removes `.visible` in the not-enabled branch) and by T2's confirmation that status returns `{enabled:false}` when `DATABASE_URL` is unset — the client just sees that shape and hides.
- ✅ **Keyboard-navigable / a11y.** Badge is a real `<button>` with `aria-haspopup="dialog"`, `aria-controls`, and `aria-label`. Modal is `role="dialog" aria-modal="true" aria-labelledby aria-describedby`. Opening the modal focuses the close button; closing restores previous focus. List uses `role="list"` / `role="listitem"`.
- ✅ **Matches theme.** Every color, radius, font, and border reuses existing CSS variables (`--tg-accent`, `--tg-accent-dim`, `--tg-amber`, `--tg-border`, `--tg-border-active`, `--tg-surface`, `--tg-bg`, `--tg-text`, `--tg-text-dim`, `--tg-mono`, `--tg-sans`). No new frameworks, no hardcoded colors except the amber rgba fill which is derived from `--tg-amber`.
- ✅ **60s poll.** `setupRumen()` installs `setInterval(fetchRumenStatus, 60000)` so the badge tracks the 15-min pg_cron drip without requiring a page refresh. Stored on `state.rumen.pollTimer` for future teardown.

**Non-goals honored:** no WebSocket push for insights, no inline feed in terminal panels, no server or `init-rumen.js` edits, no existing-code deletions. Only one new `setupRumen()` call was added to `init()` — everything else is additive HTML/CSS/JS in prefixed `.rumen-*` / `rumen*` namespaces so there are no collisions with `.apm-*`, the existing RAG pill, or the Add-Project modal.

**HTML validated by extracting the inline script and running `new Function(inline)` via node — parses cleanly (92k chars). `npm test` still green (35/35 passing).**

**Not verified (requires live browser + real Rumen DB and is intentionally out of scope for an autonomous terminal):** visual check in a browser at http://localhost:3000 with a TermDeck server pointed at the petvetbid DB. All branches have been exercised through static review against T2's verified endpoint behavior (T2 confirmed live DB responses at 21:35 UTC — 122 insights, project filter trimming 122→121, `{enabled:false}` when `DATABASE_URL` is unset). Josh can do the final eyeball-verification by `node packages/server/src/index.js` and opening the dashboard.

Files touched: packages/client/public/index.html, docs/sprint-4-rumen-integration/STATUS.md
Next: DONE. 🔓 T3 file claims released.
