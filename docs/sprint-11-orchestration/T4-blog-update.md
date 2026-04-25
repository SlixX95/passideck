# T4 — Update 4+1 Orchestration Blog Post

## Goal

Update `docs/launch/blog-post-4plus1-orchestration.md` with tonight's evidence. The post was written before Sprints 6-10 demonstrated the pattern at scale.

## Changes

Read the existing post first. Then add/update:

1. **Add a "Sprints 6-10" section** after the existing 2am rename story. This is fresh evidence: 5 sprints in 105 minutes, 31 commits, 3,500+ lines. The pattern isn't theoretical anymore — it's been stress-tested across reliability hardening, security, docs, tests, and UI work.

2. **Add the injection command** — show the exact curl/python pattern used to inject prompts into TermDeck panels via the REST API. This is the "how" that makes the pattern reproducible.

3. **Update any forward-looking claims** to past tense where the evidence now exists. If the post says "we plan to" about something that shipped tonight, fix it.

4. **Add a link to docs/ORCHESTRATION.md** (being written by T1) and docs/BENCHMARKS.md (being written by T3) as references.

5. **Keep the 2am rename story** — that's still the hook. The new evidence is the body.

Be conservative — don't rewrite the narrative. Add evidence, not fluff.

## Files you own
- docs/launch/blog-post-4plus1-orchestration.md (update)

## Acceptance criteria
- [ ] Sprint 6-10 evidence added with concrete numbers
- [ ] Injection command shown
- [ ] Links to ORCHESTRATION.md and BENCHMARKS.md
- [ ] No stale forward-looking claims
- [ ] Write [T4] DONE to STATUS.md
