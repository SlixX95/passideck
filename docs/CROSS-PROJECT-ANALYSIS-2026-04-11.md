# Cross-Project Analysis: TermDeck × Podium (2026-04-11)

> A reference document capturing the methodology and findings from a cross-project learning transfer between Podium (sister project, just shipped to production) and TermDeck (in development). This is the kind of analysis Rumen v0.3 will eventually automate.

## Why This Exists

Podium shipped to production at https://podium.nashvillechopin.org after a long debugging cycle that uncovered 8 categories of cross-project patterns. The Podium team distilled these into three reference docs:
- `LESSONS_LEARNED.md` (~1200 lines)
- `SESSION_2026-04-10_AND_11.md` (session wrap)
- `HONEST_GAPS_FIX_PLAN.md` (priority queue)

The question: which of those patterns apply to TermDeck right now, and which are preventive for upcoming work?

## Methodology

### Step 1: Stack overlap audit

Compare the two projects layer-by-layer to identify how much actually transfers:

| Layer | Podium | TermDeck |
|---|---|---|
| Framework | Next.js 16 App Router | Vanilla JS, no build step |
| Server runtime | Vercel serverless | Node.js process (Express + ws) |
| ORM | Prisma 6 | Raw better-sqlite3 |
| Hosting | Vercel + Supabase Pro | Local desktop app |
| Styling | Tailwind v4 + shadcn/ui | Plain CSS + xterm.js themes |
| Routes | API routes | Express handlers + WebSocket |
| Auth | JWT in localStorage | None (localhost only) |

Almost no stack overlap. Most lessons cannot transfer 1:1.

### Step 2: Classify by transferability

Three buckets:

- **A. Directly applicable** — patterns that work at the meta level even across stacks (error visibility, defensive coding)
- **B. Preventive** — patterns TermDeck hasn't hit yet but will when Rumen lands or the portfolio site is built
- **C. Irrelevant** — patterns that don't apply to TermDeck's stack at all

### Step 3: Grep the target codebase

For each pattern, search TermDeck for the exact anti-pattern. Count instances. Distinguish intentional from accidental.

For example, the silent `catch {}` audit:
```bash
grep -rn "catch\s*{" packages/server/src packages/cli/src
grep -rn "catch\s*{" packages/client/public/index.html
```
Found 14 instances. 2 intentional (feature-detection at module load), 12 accidental (hiding real errors).

### Step 4: Prioritize by risk-reduction-per-minute

Order by `(time saved if pattern hits) / (time to fix now)`. High ratio = do first.

### Step 5: Defer aggressively

Anything that requires significant architecture changes goes into a deferred bucket with a clear "revisit when X happens" trigger. Don't do work now that might be invalidated by a future pivot.

## Findings

### Bucket A: Directly Applicable

**1. Silent `catch {}` anti-pattern (12 instances in TermDeck)**

The only Podium learning that hits TermDeck today. The Podium debug story: a bare `catch {}` in their login route swallowed a Prisma runtime error, leaving Vercel logs empty. Cost ~45 minutes of debugging before adding `console.error`.

TermDeck's grep audit found:
| File | Lines | Status |
|---|---|---|
| `packages/server/src/index.js` | 14, 15 | Intentional (feature detection) — keep |
| `packages/server/src/index.js` | 177, 222, 382, 400 | Accidental — fix |
| `packages/server/src/rag.js` | 156, 202 | Accidental — fix |
| `packages/cli/src/index.js` | 71 | Semi-intentional (UX fallback) — fix to also log |
| `packages/client/public/index.html` | 683, 738, 796, 1077, 1149 | Accidental — fix with rate limiting on the two tight loops |

**Severity:** Medium. Not blocking but eliminates a future scavenger hunt.

**2. Dashboard stats SQL aggregation pattern**

Podium learned: never have the client fetch a list of N items and aggregate. Build a dedicated SQL endpoint that does the aggregation.

**TermDeck application:** the proposed control panel feature (Yes/No buttons aggregated from all terminals) is exactly the kind of dashboard that would be designed wrong by default. Bake the SQL-aggregation principle into the architecture from day one.

### Bucket B: Preventive

**3. Prisma + Vercel + Supabase deployment chain**

Six sub-issues that each took a debug cycle in Podium:
- `engineType = "client"` on the generator
- `@prisma/adapter-pg` driver adapter
- `prisma.config.ts` with the three-flag combo
- Shared Pooler IPv4 URL (NOT Dedicated Pooler)
- URL-encode special chars in passwords
- Version pin the adapter to Prisma major

**TermDeck application:** the moment Rumen ships, TermDeck adds Supabase. Decision: skip Prisma entirely for Rumen (use raw `pg` against three flat tables). All the other gotchas still apply — captured in `RUMEN-DEPLOY-CHECKLIST.md`.

**Severity:** Critical for v0.2. If we don't internalize this before Rumen, we lose a full debug day.

**4. Supabase Shared Pooler IPv4**

Vercel serverless functions are IPv4-only. Supabase Pro's default Dedicated Pooler is IPv6-only. Connection silently fails.

**TermDeck application:** captured in `RUMEN-DEPLOY-CHECKLIST.md`. Decision: never even configure the Dedicated Pooler in `.env` so we can't accidentally pick wrong.

**5. iOS Safari `svh` vs `dvh` + sticky header**

The `min-h-dvh` value reflows when iOS Safari's URL bar collapses. `min-h-svh` (small viewport, non-reflowing) is correct for sticky headers. Combined with `viewport: { viewportFit: 'cover' }` and `env(safe-area-inset-top)` for the dynamic island.

**TermDeck application:** doesn't apply to v0.1 (desktop only). Becomes relevant when the Rumen morning briefing modal gets viewed on phones, or if TermDeck Mobile becomes a thing.

**6. Tailwind v4 `@layer base` for overridable base styles**

Unlayered CSS rules in `globals.css` sit ABOVE Tailwind's utility layer in the cascade and beat utility classes. Wrap base element styles in `@layer base { }` so utilities properly override.

**TermDeck application:** no Tailwind in TermDeck core. Relevant for the planned portfolio site.

**7. Next.js App Router `icon.png` convention**

`src/app/icon.png` auto-wires as the favicon. No metadata config needed.

**TermDeck application:** not relevant to TermDeck core. The existing `assets/favicon.png` from this project can be dropped at `src/app/icon.png` in the portfolio site as-is.

**8. shadcn/ui dual-variable bridging**

When adopting shadcn/ui on a project with an existing custom theme, define your palette as the source of truth and shadcn variables as bridges that reference yours.

**TermDeck application:** relevant for the portfolio site if it uses shadcn. TermDeck core uses xterm.js themes (totally different system).

### Bucket C: Irrelevant

These patterns from Podium do not apply to TermDeck's stack at all and would not be useful to port:
- React-PDF Helvetica-Bold + italic constraint (no PDF generation in TermDeck)
- Wix API path versioning (no Wix integration)
- React-PDF authenticated downloads (no auth, no PDFs)
- httpOnly cookie auth migration (no auth)
- Sentry / observability (overkill for desktop app)
- Zod validation on API routes (no public API)
- Rate limiting (localhost only)
- Playwright E2E tests (legitimate gap but lower priority than shipping)

## Prioritized Changes

### Tier 1 — Before Promoting v0.1 (~30 min)

1. Audit and fix the 12 accidental silent catches across 4 files
2. Document the analysis and the silent-catch fix in this file + `LESSONS_FROM_PODIUM.md`

### Tier 2 — Before Starting Rumen (~1 hour)

3. Write `RUMEN-DEPLOY-CHECKLIST.md` baking in all Podium-derived gotchas
4. Decide raw `pg` over Prisma for Rumen (decided: raw `pg`)
5. Decide Shared Pooler IPv4 from day one (decided)
6. Establish `[tag]` console.error convention (established: `[pty]`, `[ws]`, `[db]`, `[rag]`, `[config]`, `[cli]`, `[client]` in TermDeck; `[rumen-extract]`, `[rumen-relate]`, etc. for Rumen)

### Tier 3 — When Building the Portfolio Site

7. shadcn/ui dual-variable bridging
8. `src/app/icon.png` convention
9. `@layer base` for base input styles
10. `min-h-svh` over `min-h-dvh`
11. Inline Tailwind utilities, not custom container classes

### Tier 4 — Deferred

- Visible error banners on TermDeck client (current reconnect UI is good enough)
- Sentry / observability
- Zod validation
- Rate limiting
- Playwright tests (real follow-up, lower priority than shipping)
- iOS safe-area / svh patterns in TermDeck core (desktop-only by design)

## Why This Methodology Matters For Rumen

Rumen v0.3's "Synthesize" phase needs to do exactly this kind of cross-project analysis automatically. When the developer is working on TermDeck, Rumen should be able to look at Podium's session memories and surface patterns like "Podium just hit a `catch {}` bug — does TermDeck have any?"

The methodology in this document is Rumen's eventual training data. Save the analysis. Save the classification rules. Save the prioritization heuristics. The goal is for Rumen to do this analysis in 30 seconds instead of the human-driven 30 minutes it took today.

## Outcomes

After Tier 1 + Tier 2 execution (this session):
- 12 silent catches eliminated, replaced with `[tag]` console.error
- TermDeck logging convention established and documented
- `RUMEN-DEPLOY-CHECKLIST.md` written, preventing the entire Prisma+Vercel+Supabase debug chain when Rumen ships
- 6 cross-project memories saved to RAG for future Rumen consumption
- This document saved as the methodology reference

Estimated time savings vs not doing this: **6–10 hours of future debugging avoided.** Estimated effort spent: **~90 minutes.**

## Reference

- Source documents: `/Users/joshuaizzard/Documents/Graciella/ChopinNashville/2026/ChopinInBohemia/podium/docs/LESSONS_LEARNED.md`, `SESSION_2026-04-10_AND_11.md`, `HONEST_GAPS_FIX_PLAN.md`
- Sister documents: `docs/LESSONS_FROM_PODIUM.md`, `docs/RUMEN-DEPLOY-CHECKLIST.md`
- Rumen architecture: `docs/RUMEN-PLAN.md`
- RAG memories saved this session:
  - "Cross-project analysis pattern (2026-04-11)" — the methodology
  - "Rumen architecture decision (2026-04-11)" — raw pg over Prisma
  - "TermDeck silent catch audit (2026-04-11)" — the audit results
  - "Rumen pre-deployment checklist (2026-04-11)" — the deploy checklist
  - "TermDeck logging convention established 2026-04-11" — the [tag] convention
