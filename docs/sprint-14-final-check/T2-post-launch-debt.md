# T2 — Post-Launch Roadmap

## Goal

Create `docs/POST-LAUNCH-ROADMAP.md` — a consolidated, prioritized list of all remaining technical debt from the 360 audits, organized into v0.4 and v0.5 milestones.

## Steps

1. Read all 5 audit files:
   - `termdeck_sprint12_audit_claude.md`
   - `termdeck_sprint12_audit_gemini.md`
   - `termdeck_sprint12_audit_grok.md`
   - `termdeck_sprint12_audit_chatgpt.md`
   - `docs/SPRINT-13-READINESS-REASSESSMENT.md` (Codex)

2. Read `docs/CONTRADICTIONS.md` for known drift items.

3. Consolidate all remaining items into a roadmap with:

### v0.4.0 (within 30 days of launch)
- Items flagged by 3+ auditors
- Security hardening for beyond-localhost
- Test coverage gaps

### v0.5.0 (within 90 days)
- Local-only SQLite+embeddings path for Mnestra
- Multi-user validation
- Control panel dashboard

### Backlog
- Nice-to-haves and polish items

Each item should cite which auditor(s) flagged it.

## Files you own
- docs/POST-LAUNCH-ROADMAP.md (create)

## Acceptance criteria
- [ ] Every open item from all 5 audits is captured
- [ ] Items are prioritized by auditor consensus (3+ = v0.4, 1-2 = v0.5/backlog)
- [ ] Each item cites the auditor(s)
- [ ] Under 150 lines
- [ ] Write [T2] DONE to STATUS.md
