# T2 — Forge Analysis Prompt Template

Create `packages/server/src/forge-prompt.js` — the prompt template that Opus uses to analyze memories and generate skills.

```js
module.exports = {
  systemPrompt: `You are SkillForge, an autonomous knowledge crystallizer...`,
  buildUserPrompt(memories) { /* format memories for analysis */ },
  parseSkills(response) { /* extract skill definitions from Opus response */ }
};
```

The system prompt must produce genuinely useful skills, not summaries. It runs a 4-phase pipeline:

**Phase 1 — Quality audit**: Score each memory cluster on actionability (0-1). Discard below 0.3. Flag sprint-process meta-observations ("T4 follows a gated workflow pattern") as noise. Only proceed with memories that represent real developer knowledge: error→fix pairs, procedures, cross-project patterns, domain solutions.

**Phase 2 — Pattern extraction**: From surviving memories, identify:
- Same error class solved multiple times across projects
- Multi-step procedures executed 3+ times (deploy sequences, config rituals, the Supabase IPv4 toggle dance)
- Domain knowledge that's non-obvious (OR-Tools CP-SAT solver formulations, XGBoost tuning sequences, Vercel deploy gotchas)
- Cross-project connections (a fix in Project A applies to Project B)

**Phase 3 — Skill generation**: For each validated pattern:
- name (kebab-case)
- description (one line — explains WHEN this fires, not what it is)
- trigger (specific: "when deploying Supabase Edge Functions" not "when coding")
- body (exact steps, commands, error→fix mappings, gotchas — a senior dev should be able to follow this blind)
- evidence (which memory IDs/projects — provenance trail so the user can verify)
- confidence (0-1 based on how many independent sources confirm the pattern)

**Phase 4 — Self-critique**: For each skill, answer: "Would a senior developer find this genuinely useful, or is this obvious/generic?" Discard skills that fail. A skill about "always check your config file" is worthless. A skill about "the Supabase Connect modal has a hidden IPv4 toggle that defaults to IPv6-only and causes Connection Refused on most networks" is gold.

Output: valid JSON array of skill objects with quality_score and evidence fields.

## Files you own
- packages/server/src/forge-prompt.js (new)

## Acceptance criteria
- [ ] System prompt implements all 4 phases (audit, extract, generate, self-critique)
- [ ] buildUserPrompt formats memories concisely (token-efficient, groups by project)
- [ ] parseSkills extracts skill objects with confidence + evidence fields
- [ ] Includes at least 3 example skill patterns derived from known TermDeck memories (Supabase gotchas, Mnestra startup, version-drift prevention)
- [ ] Write [T2] DONE to STATUS.md
