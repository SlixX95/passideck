# TermDeck Post-Launch Roadmap

Consolidated debt from five independent audits of v0.3.6 (Claude Opus 4.6, Gemini 3.1 Pro, Grok 4.20 Heavy, ChatGPT GPT-5.4 Pro) plus the Codex Sprint 13 readiness reassessment. Pruned against what v0.3.8 already shipped.

**Base version:** 0.3.9 · **Updated:** 2026-04-18

## Already closed in v0.3.8 (reference)

- CLI bind guardrail bypass — `packages/cli/src/index.js` now enforces guard before `listen()` (**ChatGPT**, critical)
- Health badge false-green when DB configured-but-failing — `filterChecksByTier()` fixed (**ChatGPT**, critical)
- Version-truth drift + stale CLI banner `v0.2.0` — `bump-version.sh` + dynamic banner from `package.json` (**Codex**, **Claude**, **Gemini**)

## Closed in Sprint 18 (v0.3.10)

- **V4-2** TranscriptWriter permanent pool failure latch — 30s TTL retry pattern applied (T2)
- **V4-4** Client WebSocket hardcoded `ws://` — protocol-aware `wss://` switch on HTTPS (T1)
- **V5-8** RAG circuit-breaker half-open + telemetry — timed half-open probes + `/api/health` exposure (T3)

---

## v0.4.0 — Within 30 days of launch

Items flagged by **3+ auditors**, security hardening for beyond-localhost, and test coverage gaps.

### V4-1 · Rumen `relate` embedding path test coverage (MEDIUM)
`generateEmbedding` in `rumen/src/relate.ts` handles 4 failure modes (AbortController timeout, non-2xx, malformed vector, network error) with zero unit tests. `relate.test.ts` deletes `OPENAI_API_KEY` and only exercises keyword-only mode. Mock `fetch` at the module boundary and add the 4 tests.
Flagged by: **Claude S6 + S12, Gemini S12, Grok S12, ChatGPT S12** (4 auditors, longest-deferred)

### ~~V4-2 · `TranscriptWriter` permanent pool failure latch (MEDIUM)~~ **RESOLVED Sprint 18 T2**
~~`transcripts.js` L74 sets `_poolFailed = true` with no retry — exact same bug class `getRumenPool` had. A transient DB outage at startup permanently disables transcript writing for the life of the process. Apply the 30s TTL pattern already proven in `index.js` (`RUMEN_POOL_RETRY_MS`).~~
~~Flagged by: **Claude S12, Gemini S12, ChatGPT S12** (3 auditors)~~
**Closed:** Sprint 18 T2 ported the `RUMEN_POOL_RETRY_MS` TTL pattern into `transcripts.js`.

### V4-3 · Mnestra direct-bridge contract drift (HIGH)
`mnestra-bridge` direct mode posts `recency_weight` + `decay_days` (10 args) but the bundled `memory_hybrid_search` SQL takes 8. Bridge reads `m.similarity`; SQL returns `score`. Either bump the bundled migration or align the call site. Add a contract test that mirrors `health-contract.test.js`.
Flagged by: **ChatGPT S12**, open in **CONTRADICTIONS #1** since Sprint 8

### ~~V4-4 · Client WebSocket URL is hardcoded `ws://` (HIGH for HTTPS deploys)~~ **RESOLVED Sprint 18 T1**
~~`app.js` `WS_BASE = \`ws://${window.location.host}/ws\`` — HTTPS deploys break on mixed-content. Switch to protocol-aware `wss://` when `location.protocol === 'https:'`. Required before any beyond-localhost story can be called production-ready.~~
~~Flagged by: **ChatGPT S12**~~
**Closed:** Sprint 18 T1 made `WS_BASE` protocol-aware in `app.js`. Mixed-content failure mode removed.

### V4-5 · Auth brute-force rate limiting (security hardening)
`auth.js` does strict-equality token comparison with no delay or IP throttle on failed 401s. Add in-memory bucket delay on failures; consider switching comparison to `crypto.timingSafeEqual`.
Flagged by: **Gemini S12, Grok S12, Claude S12 note** (3 auditors)

### V4-6 · Security/deployment doc drift
- `SECURITY.md` says `termdeck_auth` cookie; code uses `termdeck_token`
- `DEPLOYMENT.md` says hit `/healthz`; server exposes `/api/health`
- Deployment config example uses `server.host`; code reads `config.host`

Flagged by: **ChatGPT S12** (plus consistent with Codex "trust surface" theme)

---

## v0.5.0 — Within 90 days

User's own launch-deferred roadmap plus architectural items flagged by 1–2 auditors.

### V5-1 · Fully-local Mnestra path (SQLite + local embeddings)
Today Mnestra requires Supabase + OpenAI. Ship an opt-in local-only mode so TermDeck works with zero external dependencies. Already listed in `CHANGELOG.md [Unreleased] Planned`.
Flagged by: **User roadmap**, reinforces **Codex** "MCP mode least-proven" concern

### V5-2 · Multi-user data validation
All current testing is single-developer. Run a multi-user session against Mnestra and confirm no cross-tenant leakage.
Flagged by: **User roadmap**

### V5-3 · Control panel dashboard (Yes/No for agent prompts)
Central permission-prompt UI so AI agents running in panels can be approved without context-switching.
Flagged by: **User roadmap**

### V5-4 · `app.js` feature-module split
2,956 lines and growing. Split into `app.js` + `health.js` + `transcripts-ui.js` before the next major UI addition.
Flagged by: **Claude S12**

### V5-5 · MCP bridge verification
`mnestra-bridge` MCP mode jumps directly into `tools/call` against a stdio child with no repo-local test coverage. Add a contract test parallel to the direct/webhook paths.
Flagged by: **Codex**

### V5-6 · Duplicate Mnestra `/healthz` probes in preflight
`checkMnestra` and `checkMnestraMemories` both HTTP-GET `/healthz` in parallel. Extract once, branch on the response. Saves ~3–5ms at startup.
Flagged by: **Claude S6 + S12, Gemini S12** (2 auditors, cross-sprint)

### V5-7 · CI skip-to-fail flag for live-server tests
`failure-injection.test.js` skips gracefully when no server is up — correct for local dev but silent in CI. Add `TERMDECK_REQUIRE_LIVE=1` that upgrades skips to failures.
Flagged by: **Claude S12, Gemini S12**

### ~~V5-8 · RAG circuit-breaker telemetry + half-open state~~ **RESOLVED Sprint 18 T3**
~~Per-table breaker works but has no observability and no explicit half-open recovery. Expose state via `/api/health` and add timed half-open probes.~~
~~Flagged by: **ChatGPT S12, Grok S12**~~
**Closed:** Sprint 18 T3 added timed half-open recovery in `rag.js` and exposed breaker state through `/api/health`.

---

## Backlog — nice-to-haves

| ID | Item | Flagged by |
|----|------|-----------|
| B-1 | Exponential backoff / retry on Rumen LLM 429/5xx (today: placeholder fallback + budget caps) | Grok S12 |
| B-2 | Token rotation + audit log for auth | Grok S12 |
| B-3 | CSP header + HTTPS enforcement docs | Grok S12 |
| B-4 | `crypto.timingSafeEqual` for token comparison (not a bug today) | Claude S12 |
| B-5 | Load test beyond N=10 concurrent sessions; document degradation at ~50-PTY fd limit | Claude S12 |
| B-6 | Flashback toast shows parent directory (`ChopinNashville`) instead of resolved project name — `mnestra-bridge` likely passes `cwd` instead of project name | CONTRADICTIONS #9 |
| B-7 | TranscriptWriter: consider spill-to-disk fallback on sustained DB failure (10K-chunk RAM cap already shipped in commit `1f1d1e6`) | Grok S12 (partial — buffer cap exists) |
| B-8 | Vendor xterm.js instead of CDN (resilience when jsdelivr unreachable) | CLAUDE.md `known issues` #3 |
| B-9 | Live-maintenance discipline for `CONTRADICTIONS.md` — register exists but is not treated as first-class source of truth | Codex |

---

## Notes

- **"Flagged by"** cites the audit(s) that surfaced the item. S6 = sprint-6 audit, S12 = sprint-12 audit.
- Grok S12 also listed "Make RAG flush synchronous on session destroy" as a new risk; **Claude S12** confirms this was closed in Sprint 10 (`index.js` L874–886, 5s budget on `transcriptWriter.close()`). Not carried forward.
- Grok S12 also flagged "no hard size cap on TranscriptWriter"; **Claude S12** notes the 10K-chunk cap shipped in commit `1f1d1e6`. Only the spill-to-disk enhancement remains (B-7).
- ChatGPT's two critical findings (CLI bypass, health false-green) are closed in v0.3.8. Keep them in CHANGELOG for audit-trail purposes only; do not carry forward.
