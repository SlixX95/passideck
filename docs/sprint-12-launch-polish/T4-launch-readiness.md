# T4 — Launch Readiness Document

## Goal

Create `docs/LAUNCH-READINESS.md` — a final pre-launch checklist that captures everything needed for Show HN day. Also do a final pass on the launch collateral in docs/launch/.

## Deliverables

### 1. docs/LAUNCH-READINESS.md (new)

A one-page document that says exactly what's ready, what's not, and what to do on launch day.

Structure:
- **Stack versions**: termdeck@0.3.5, mnestra@0.2.0, rumen@0.4.1
- **What's live**: npm packages, GitHub repos, docs site URL, Supabase project
- **Pre-launch checklist**: npm published, CI green, GIF in README, docs-site deployed, tester feedback received
- **Launch day sequence**: post Show HN → first comment → Twitter thread 5 min later → dev.to 24h later → LinkedIn same day
- **Post-launch monitoring**: watch HN comments, respond to questions, check npm download stats
- **Known limitations**: honest-limits paragraph (copy from launch collateral)
- **Rollback plan**: if something breaks, what to do

### 2. Final pass on docs/launch/

Read each file in docs/launch/. Check:
- Version refs are 0.3.5
- No stale claims (Sprint 5 "landing tonight", etc.)
- The Show HN first comment is still accurate
- The GIF anchor in the Twitter thread points to the right file
- dev.to frontmatter has `published: false`

Fix anything stale. Be conservative — don't rewrite, just correct.

## Files you own
- docs/LAUNCH-READINESS.md (create)
- docs/launch/*.md (fix stale refs only)

## Acceptance criteria
- [ ] LAUNCH-READINESS.md exists with complete checklist
- [ ] All launch collateral version refs are 0.3.5
- [ ] No stale forward-looking claims in any launch doc
- [ ] Write [T4] DONE to STATUS.md
