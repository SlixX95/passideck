# TermDeck Launch Readiness — Show HN Day Checklist

**Owner:** Josh (orchestrator) · **Drafted:** Sprint 12 T4, 2026-04-17 UTC · **Target launch:** next weekday morning (09:00–11:00 PT ≈ 16:00–18:00 UTC)

This is the one-page reference for Show HN day. If a row is unchecked at T-minus-60-minutes, defer the launch.

---

## Stack versions

| Package | Version | npm | Repo |
|---|---|---|---|
| `@jhizzard/termdeck` | **0.4.5** | https://www.npmjs.com/package/@jhizzard/termdeck | https://github.com/jhizzard/termdeck |
| `@jhizzard/mnestra` | **0.2.0** | https://www.npmjs.com/package/@jhizzard/mnestra | https://github.com/jhizzard/mnestra |
| `@jhizzard/rumen` | **0.4.5** | https://www.npmjs.com/package/@jhizzard/rumen | https://github.com/jhizzard/rumen |

Feature name inside TermDeck: **Flashback** — proactive memory recall when a panel enters an error state.

---

## What's live

- [x] All three npm packages published and installable via `npx @jhizzard/termdeck`
- [x] All three GitHub repos public with READMEs
- [x] Supabase project `petvetbid` (ref `luvvbrpaopnblvxdxwzb`) backing Mnestra + Rumen
- [x] Rumen `pg_cron` firing every 15 minutes — closed loop confirmed 2026-04-15 19:47 UTC
- [x] Mnestra corpus: ~3,527 memories in the author's developer store
- [ ] Docs site `https://termdeck-docs.vercel.app` deployed and linked from the `help` button (verify before posting — owned by T2)

---

## Pre-launch checklist (do in this order)

### T-minus-24 hours
- [ ] `scripts/verify-release.sh` exits 0 on a fresh clone of `main`
- [ ] `npm view @jhizzard/termdeck version` == `0.4.5` (likewise mnestra @ 0.2.0, rumen @ 0.4.5)
- [ ] CI green on latest `main` commit
- [ ] `docs/screenshots/flashback-demo.gif` exists, renders in the README, and shows the current UI (not pre-Sprint-5)
- [ ] `docs-site/` deployed; `help` button in `packages/client/public/index.html` points at the live URL
- [ ] Tester feedback received from ≥3 of the 5 DM'd testers (per `docs/launch/tester-brief.md`); any P0 install blockers fixed and republished

### T-minus-60 minutes
- [ ] Fresh `npx @jhizzard/termdeck` on a clean machine boots in under 60s and the onboarding tour plays
- [ ] `/api/health` returns 200 and "Stack: OK" badge shows green in the top bar
- [ ] Rumen status endpoint: most recent `rumen_jobs` row completed < 20 min ago
- [ ] Launch collateral files open in order: `show-hn-post.md` → `comment-playbook.md` → `twitter-thread.md` (or `x-thread.md`) → `linkedin-post.md` → `devto-draft.md`
- [ ] Logged in to: HN, X/Bluesky, LinkedIn, dev.to (drafts saved locally, not in browsers)
- [ ] Phone on DND except HN + X push notifications

---

## Launch day sequence

All times relative to **T0 = Show HN submission time**.

| Time | Action | Source file |
|---|---|---|
| T0 | Post to Hacker News (title + body from `docs/launch/show-hn-post.md`) | `show-hn-post.md` |
| T0 + 1 min | Post first comment on your own HN submission | `show-hn-post.md` §First comment |
| T0 + 5 min | Post X/Twitter thread; pin tweet 1 to profile for 72h | `twitter-thread.md` or `x-thread.md` |
| T0 + 5 min | Cross-post X thread to Bluesky (same copy) | `x-thread.md` notes |
| T0 + 30 min | Begin replying to HN comments — target ≤30 min response time for the first 4 hours | `comment-playbook.md` |
| T0 + same day (evening) | Post LinkedIn | `linkedin-post.md` |
| T0 + 24 h | Publish dev.to draft (flip `published: false` → `true`) | `devto-draft.md` |
| T0 + 72 h | Cross-post `blog-post-termdeck.md` to Hashnode | `blog-post-termdeck.md` |
| T0 + 1 week | Publish `blog-post-rumen.md` on dev.to | `blog-post-rumen.md` |

---

## Post-launch monitoring (first 24 hours)

- [ ] Reply window: 30-min max response time on HN and X for the first 4 hours (comment-playbook has the 10 most likely skeptic questions pre-drafted)
- [ ] Watch `npm view @jhizzard/termdeck` download count every 2–3 hours
- [ ] Watch Supabase dashboard for Mnestra signups; anomalies (auth spikes, error rates) get escalated to the orchestrator (you)
- [ ] Watch `rumen_jobs` table — if pg_cron stalls during the launch window, the "loop is closed" claim on the thread is at risk; have the `SECURITY.md` fallback ready
- [ ] Every non-trivial comment gets logged in a scratch file so you can cite repeated feedback themes in the v0.4 plan

---

## Known limitations (say these before someone else does)

Quoted from `docs/launch/NAMING-DECISIONS.md` §"Honest limits paragraph". Reproduce verbatim in the Show HN body and the README:

> Flashback fires on pattern-matched error strings from the PTY output analyzer. If the analyzer misses your error class, no flashback. It's a shortest-path to a memory *you already wrote* — if the memory isn't there, the feature does nothing. Mnestra reaches out to Supabase for storage and OpenAI for embeddings; a fully-local path (SQLite + local embeddings) is on the roadmap but not shipped in v0.4.5. Validated against one developer's store (~3,527 memories). No multi-user data yet.

Additional limits worth pre-empting:
- **Windows** support is partial (node-pty works via conpty; Flashback loop tested on macOS + Debian only).
- **Ollama embeddings** not supported in v0.4.5 (single fixed embedding model per index; migration path exists).
- **Single-user scale**: ~3,527 memories is one developer over roughly 6 months. No multi-user or high-concurrency data yet.

---

## Rollback plan

**If an npm install reliably fails on a tier-1 platform (macOS 14+ or Ubuntu 22.04):**
1. Don't delete the HN post. Edit the first comment with a link to the tracking issue.
2. Publish a patch release (`0.4.5`) with the fix. Target time-to-fix: < 2 hours.
3. Reply to affected HN commenters with the new version and an apology; keep the tone concrete and non-defensive.

**If Mnestra or Rumen hits a Supabase quota limit during the launch rush:**
1. Tier 1 (`npx @jhizzard/termdeck`) is unaffected — reassure commenters that the multiplexer runs fully local.
2. Temporarily raise Supabase plan if download volume demands it; note the change on X.
3. Escalate to `docs/SECURITY.md` threat model if auth or data-isolation is implicated.

**If the Show HN post falls off the front page within 2 hours with < 10 points:**
1. Do **not** repost — HN will penalize.
2. Pivot attention to the X thread and LinkedIn post. Treat HN as a secondary channel for the day.
3. Schedule a second, differently-framed HN submission in 60–90 days (per HN community norms).

**If Flashback doesn't fire for commenters who install and try the demo:**
1. Most likely cause: no Mnestra-side memory matches their local error. Explain in the comment playbook Q3/Q5 framing.
2. Offer to DM a seeded memory set for reviewers who want to see the loop fire on a controlled error.
3. Note in the launch postmortem; feed into the Sprint 13 "demo seed pack" work item.

**If a critical security issue is reported publicly:**
1. Acknowledge within 15 minutes. Link to `docs/SECURITY.md` threat model.
2. Patch on a private branch; publish a hotfix release.
3. Write a short postmortem in `docs/launch/` and link it from the HN thread.

---

## Sign-off

The launch is go when every box in the T-minus-60-minutes list is checked. If any one is not, push the launch by 24 hours rather than launching degraded — HN punishes early retractions harder than it rewards speed.

**Single source of truth:** this file. All other launch docs are input material; this file is the gate.

---

*Built in Sprint 12. Stack drafted across Sprints 1–11. Loop closed 2026-04-15 19:47 UTC.*
