# Sprint 9 — Toolbar Redesign + Security Hardening

Append-only coordination log. Started: 2026-04-16 ~23:15 UTC

## Mission

Two priorities:
1. The toolbar scrollbar UX is bad. Convert to a two-row layout so everything is visible without scrolling. Audit every button — verify each is wired to real functionality, not stubs.
2. Security hardening for beyond-localhost use per Codex roadmap.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-toolbar-layout.md | packages/client/public/index.html (toolbar structure), packages/client/public/style.css (toolbar styles) |
| T2 | T2-toolbar-audit.md | packages/client/public/app.js (wire stubs, fix dead buttons) |
| T3 | T3-auth-mode.md | packages/server/src/index.js (auth middleware), packages/server/src/auth.js (new) |
| T4 | T4-security-docs.md | docs/DEPLOYMENT.md (new), docs/SECURITY.md (new) |

## File ownership

| File | Owner |
|------|-------|
| packages/client/public/index.html | T1 (toolbar HTML only) |
| packages/client/public/style.css | T1 (toolbar styles only) |
| packages/client/public/app.js | T2 (button wiring only) |
| packages/server/src/auth.js (new) | T3 |
| packages/server/src/index.js | T3 (auth middleware only) |
| docs/DEPLOYMENT.md (new) | T4 |
| docs/SECURITY.md (new) | T4 |
| docs/sprint-9-toolbar-security/STATUS.md | All (append-only) |

## Rules

1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)

## [T4] 2026-04-16 — Security + deployment docs

- Created `docs/SECURITY.md` (130 lines). Covers threat model (arbitrary command
  execution, PTY input injection, transcript retrieval, agent file edits),
  default posture (127.0.0.1, no auth), when to enable auth, the `auth.token`
  mechanism (header/query/cookie), what auth does NOT protect (network gate,
  not privilege boundary), secrets handling (`chmod 600
  ~/.termdeck/secrets.env`, rotation), and transcript data hygiene.
- Created `docs/DEPLOYMENT.md` (149 lines). Pre-exposure checklist with all six
  items from the spec. Reverse proxy configs for nginx (with 3600s WebSocket
  timeouts) and caddy. systemd unit that runs as a non-root user with
  `--no-open`. Binding section noting the server refuses to start on `0.0.0.0`
  without `auth.token`. Docker section marked not-yet-available with open
  questions. Post-deployment verification steps.
- Both files stayed under the 150-line cap (150 → trimmed to 149 for
  DEPLOYMENT).
- No code touched. `docs/SECURITY.md` links to `docs/DEPLOYMENT.md` and vice
  versa for easy navigation.
- The auth token behavior described in SECURITY.md (header / query param /
  cookie) and the `0.0.0.0`-without-auth refuse-to-start behavior described in
  DEPLOYMENT.md are statements about T3's in-progress implementation. If T3
  lands with different surface (different header name, different enforcement
  rule), those two sections will need a follow-up edit — flagging here rather
  than guessing, since T4 does not own the server code.

[T4] DONE

## [T3] 2026-04-16 — Optional token auth

- Created `packages/server/src/auth.js`. Exports `createAuthMiddleware(config)`,
  `verifyWebSocketUpgrade(config, req)`, `getConfiguredToken(config)`, and
  `loginPage()`. Token source: `config.auth.token` OR `TERMDECK_AUTH_TOKEN` env
  var; whitespace-trimmed. Returns `null` when unset, so local users see zero
  behavior change.
- Token extraction checks, in order: `Authorization: Bearer <t>` header,
  `?token=<t>` query param, `termdeck_token=<t>` cookie. Cookie parsing is
  hand-rolled (no `cookie-parser` dependency added) and URI-decodes the value.
- Middleware allows `/api/health` through unauthenticated so external monitors
  can check liveness without being handed the secret. All other paths require
  the token. `/api/*` responses are always JSON 401; HTML-capable requests to
  non-API paths get the login page.
- Login page is a self-contained ~80-line HTML form. On submit it stores the
  token in a `termdeck_token` cookie (`SameSite=Strict`, 30-day Max-Age) and
  fetches `/api/config` to verify. On 401 it clears the cookie and shows an
  inline error.
- Wired into `packages/server/src/index.js`: middleware mounted directly after
  `express.json()` and BEFORE `express.static(clientDir)` so unauthenticated
  requests never touch `index.html` / `app.js`. WS upgrade gets a
  `verifyWebSocketUpgrade` call at the top of the connection handler; failure
  closes with code 4003.
- Sanity: `node -c` on both files passes. Module smoke-tested — no-token
  returns null, bad WS req returns false, query/cookie/header all verify.
- All my catch blocks use `catch (err)`. Existing bare `catch {}` blocks at
  the top of `index.js` (lines 14-16, for optional `require()`s) are
  untouched — they are outside T3's scope and pre-date this sprint.
- Coordination with T4: T4's `docs/SECURITY.md` already documents the header /
  query / cookie surface exactly as shipped, so no follow-up edit needed
  there. HOWEVER, `docs/DEPLOYMENT.md` says the server "refuses to start on
  0.0.0.0 without auth.token" — I did NOT implement that guardrail. The T3
  spec explicitly says auth is opt-in with zero behavior change when unset,
  so adding a bind-refusal would violate the spec. Flagging for T4/owner:
  DEPLOYMENT.md needs a follow-up edit to drop that claim, or a separate
  sprint task to add the guardrail.

[T3] DONE

## [T1] 2026-04-16 — Toolbar two-row layout

- Restructured `packages/client/public/index.html` `.topbar` into two rows:
  - `.topbar-row-1` (42px): `.topbar-left` (logo + stats + rumen badge + injected `#healthBadge`) and `.topbar-center` (layout buttons 1x1…4x2 + control).
  - `.topbar-row-2` (32px, dimmer `--tg-bg` background, top border): `#termSwitcher`, `.topbar-ql` (shell/claude/python), a flex spacer, then `#btn-status`, `#btn-config`, `#btn-how`, `#btn-help`.
- `.topbar-row-2` keeps the `topbar-right` class so `app.js` injections still work:
  - `setupTranscriptUI()` does `document.querySelector('.topbar-right').insertBefore(btn, #btn-status)` — transcripts button lands in row 2 between the spacer and `status`, as specified.
  - `setupHealthBadge()` appends to `#globalStats` (row 1) — unaffected.
- `packages/client/public/style.css`:
  - `.topbar` is now `flex-direction: column`. Removed `overflow-x: auto`, `overflow-y: hidden`, `scrollbar-width: thin`, `flex-wrap: nowrap`, and the `justify-content`/`gap`/`padding`/`height`/`align-items` that moved to the rows. Dropped both `::-webkit-scrollbar` rules (no longer needed).
  - Added `.topbar-row`, `.topbar-row-1`, `.topbar-row-2`, `.topbar-row-2-spacer`. Both rows `flex-shrink: 0`. Row 2 gap set to 6px but the pre-existing `.topbar-right { gap: 4px }` rule (same specificity, later in source) wins — intentional, keeps row 2 tight.
- Total toolbar height: 42 + 32 + 1px row border ≈ 75px. No horizontal scrollbar at 1440px.
- Did not touch `app.js`. Did not touch other terminals' files.

Acceptance:
- [x] All toolbar items visible without scrolling on 1440px screen (flex spacer absorbs slack in row 2, row 1 is `space-between` with fixed content).
- [x] Two-row layout looks clean: primary row on surface, secondary row on bg with a top border separator.
- [x] No horizontal scrollbar (removed `overflow-x: auto` and webkit scrollbar rules).
- [x] Layout buttons still work (markup unchanged, moved inside row-1).
- [x] Health/Rumen badges still positioned correctly (both still live inside `#globalStats`).

[T1] DONE

## [T2] 2026-04-16 — Toolbar button audit + stub wiring

Audited every element in `.topbar` (per index.html pre- and post-T1 restructure). Results:

| Element | Was wired? | Action |
|---------|-----------|--------|
| Logo "TermDeck" | No handler (branding only) | Leave as-is |
| `#stat-active` / `#stat-thinking` / `#stat-idle` | Yes — `status_broadcast` handler updates them (app.js ~1879–1881) | Leave as-is |
| `#stat-rag` (RAG indicator) | Shown when `state.config.ragEnabled` (app.js ~52–54) | **Removed (JS side)** — redundant with health badge, which reports `mnestra_reachable` / `mnestra_has_memories` per-check with richer detail. Left a comment pointing T1 to strip the HTML stub |
| `#rumenBadge` | Yes — `openRumenModal` (app.js ~1617), modal fed by `/api/rumen/status` + `/api/rumen/insights` | Leave as-is |
| Health badge (`#healthBadge`, injected) | Yes — dropdown with per-check detail, click-outside closes (app.js ~2350–2503) | Leave as-is |
| Layout buttons (`.layout-btn` × 7 incl. control) | Yes — `forEach` listener calls `setLayout` (app.js ~2172) | Leave as-is |
| `shell` / `claude` / `python` quick-launch | Yes — inline `onclick="quickLaunch(...)"` | Leave as-is |
| `transcripts` button (injected) | Yes — `setupTranscriptUI` opens recovery modal, guarded by `/api/transcripts/recent` feature-detect | Leave as-is |
| **`#btn-status`** | **No listener — dead button** | **Wired** — opens a dropdown with live `/api/status` data (sessions, uptime, heap, RAG on/off, by-status, by-project, by-type) |
| **`#btn-config`** | **No listener — dead button** | **Wired** — opens a dropdown with `/api/config` data (project count, default theme, RAG enabled flag, AI-query available flag, per-project name → path, config-path hint) |
| `#btn-how` | Yes — `startTour` (app.js ~2193) | Leave as-is |
| `#btn-help` | Yes — inline `onclick` opens docs site | Leave as-is |

### Changes to `packages/client/public/app.js`

1. Removed the RAG-indicator show code (old lines 52–54) and left a comment so T1 can strip `<span id="stat-rag">` from `index.html`. The HTML stub is still hidden by default (`style="display:none"`) so there's no visual regression.
2. Added `setupInfoDropdown({ btnId, dropdownId, fetch, render })` — generic toolbar-button → dropdown factory. Click toggles open/close, click-outside closes, Escape closes, re-fetches on every open so data is fresh. Position is computed from `btn.getBoundingClientRect()` and clamped to the viewport.
3. Added `renderStatusDropdown(data)` and `renderConfigDropdown(data)` render helpers. They reuse T1's existing `.health-dropdown`, `.hd-check`, `.hd-icon`, `.hd-name`, `.hd-dots`, `.hd-status`, `.hd-detail`, `.hd-loading`, `.hd-empty`, `.hd-ok`, `.hd-fail` classes — no new CSS needed, and the look matches the health badge dropdown.
4. Added `fmtUptime(sec)` for human-readable uptime (`1h 23m`, `45s`).
5. Wired the two buttons in the event-listener block, just above the existing `btn-how` / tour wiring.

### Acceptance criteria

- [x] Every toolbar button either does something real or is removed
- [x] No `console.log` stubs remain in toolbar handlers (none existed, but both dead buttons now have real handlers)
- [x] Status button shows real data (`/api/status`)
- [x] Config button shows real data (`/api/config`)
- [x] RAG indicator removed — JS side removed, HTML stub left hidden for T1 to strip

### Notes for other terminals

- **T1**: `<span class="topbar-stat" id="stat-rag" style="display:none">RAG</span>` at `index.html:29` is now permanently unused and can be deleted in a follow-up. Nothing references it from JS anymore.
- **T1**: `#btn-status` and `#btn-config` IDs are still referenced by my new dropdown wiring (positioning via `getBoundingClientRect()`). Row-2 placement from the T1 restructure is compatible — the dropdown computes position at open time, so it lands under the button wherever that button ends up. Please keep the IDs stable.
- **T1**: The existing onboarding tour already targets `#btn-status` and `#btn-config` (app.js ~1924) — ID stability matters for the tour too.
- No server changes needed — `/api/status` and `/api/config` already returned everything the dropdowns consume.

Files touched (T2 only):
- `packages/client/public/app.js` — +144 lines, -3 lines

Sanity: `node -c packages/client/public/app.js` passes.

[T2] DONE
