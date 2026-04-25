# Lessons Ported From Podium

> Cross-project learnings absorbed into TermDeck on 2026-04-11. Sister project Podium (https://podium.nashvillechopin.org) shipped to production after a long debugging cycle. This document records which of its hard-won patterns apply to TermDeck and which were deferred.

## Stack Difference Disclaimer

Podium and TermDeck share almost no stack. Most Podium "lessons learned" do not transfer 1:1.

| Layer | Podium | TermDeck |
|---|---|---|
| Framework | Next.js 16 App Router | Vanilla JS, no build step |
| Server | Vercel serverless | Node.js process (Express + ws) |
| ORM | Prisma 6 | Raw better-sqlite3 |
| Hosting | Vercel + Supabase Pro | Local desktop app |
| Styling | Tailwind v4 + shadcn/ui | Plain CSS + xterm.js themes |
| Auth | JWT in localStorage | None (localhost only) |

The patterns that DID transfer are the meta-level ones: error visibility, defensive coding, and cross-project architectural foresight.

## What Was Ported (2026-04-11)

### 1. Silent `catch {}` anti-pattern eliminated

Audit found 14 bare `catch {}` blocks across 4 TermDeck source files:
- 2 are intentional feature detection at module load (`try { pty = require('node-pty'); } catch { pty = null; }`) — these stay
- 12 were accidentally hiding errors — these were fixed with `console.error('[tag] context:', err)` calls

### 2. `[tag]` logging convention adopted

All `console.error` calls in TermDeck must now use a tag prefix:
- `[pty]` — node-pty operations
- `[ws]` — WebSocket lifecycle
- `[db]` — SQLite operations
- `[rag]` — RAG / Mnestra / Rumen operations
- `[config]` — config loading
- `[cli]` — CLI launcher
- `[client]` — browser-side errors

This makes logs trivially greppable. The same convention will extend to Rumen Edge Functions with phase-specific tags (`[rumen-extract]`, `[rumen-relate]`, etc.).

### 3. Rate-limited logging in tight loops

Two TermDeck client catches sit inside tight loops (`fitAll()` runs on every layout change; the session-poll runs every 3 seconds). The Podium pattern of "log everything" would spam the console. Fix: one-shot per-entity warning flags (`entry._fitWarned`) for the layout loop, and unrate-limited logging for the 3-second poll (low enough frequency to be acceptable).

## What Was Deferred

Patterns relevant to TermDeck but not implemented in this pass.

### Visible error banners on the client

The Podium pattern (red banner at top of page when `loadError` is set, with Retry button) is good. TermDeck's existing reconnect-with-backoff already shows status changes in the panel metadata strip. Revisit if users actually report confusion.

### Sentry / observability

Overkill for a localhost desktop app. Reconsider if TermDeck ever runs in a hosted multi-user mode.

### Zod input validation

TermDeck has no public-facing API and binds to 127.0.0.1. There is no untrusted input to validate.

### Rate limiting on API endpoints

Same — localhost-only, no abuse vector. Becomes relevant if Rumen exposes public webhooks.

### Playwright E2E tests

Real risk, lower priority than shipping. Should be a Tier 1 follow-up after v0.2 ships.

## What Was Irrelevant

Patterns that don't apply to TermDeck's stack at all.

- **Prisma engineType=client + driver adapter** — TermDeck uses raw better-sqlite3, no Prisma. (BUT: relevant when Rumen lands. See `RUMEN-DEPLOY-CHECKLIST.md`.)
- **Supabase Shared Pooler IPv4** — TermDeck has no Supabase yet. (Same caveat as above.)
- **Tailwind v4 `@layer base`** — TermDeck has no Tailwind. (Relevant for the upcoming portfolio site.)
- **shadcn/ui dual-variable bridging** — Same.
- **Next.js App Router `icon.png` convention** — Same.
- **iOS Safari `svh` vs `dvh` sticky header pattern** — TermDeck is desktop-first. Irrelevant unless TermDeck Mobile becomes a thing.
- **React-PDF Helvetica-Bold + italic** — No React-PDF in TermDeck.

## Cross-Project Pattern

The methodology used to do this analysis is itself a reusable pattern, captured in RAG memory under "Cross-project analysis pattern (2026-04-11)". The short version:

1. Classify learnings by stack overlap (directly applicable / preventive / irrelevant)
2. Grep target codebase for the exact anti-patterns from the source
3. Distinguish intentional vs accidental instances
4. Prioritize by risk-reduction-per-minute
5. Defer everything that requires significant architecture changes

This is exactly the kind of synthesis that Rumen v0.3 should automate — finding patterns from one project's session memory that apply to another project's current work.

## Reference

- Source documents: `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/2026/ChopinInBohemia/podium/docs/LESSONS_LEARNED.md`, `SESSION_2026-04-10_AND_11.md`, `HONEST_GAPS_FIX_PLAN.md`
- Full analysis: `docs/CROSS-PROJECT-ANALYSIS-2026-04-11.md`
- RAG memories: search for "Cross-project analysis pattern" or "TermDeck silent catch audit"
