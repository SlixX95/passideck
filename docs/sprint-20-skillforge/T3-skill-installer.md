# T3 — Skill Installer

Create `packages/server/src/skill-installer.js` — writes generated skills to disk.

```js
module.exports = {
  getSkillsDir() { /* ~/.claude/skills/ or fallback */ },
  installSkill(skill) { /* write .md file */ },
  listInstalledSkills() { /* read directory */ },
  removeSkill(name) { /* delete file */ }
};
```

Each skill is a markdown file:
```markdown
---
name: supabase-deploy-gotchas
description: Avoid the 5 known Supabase deployment gotchas
trigger: when working with Supabase deployment or Edge Functions
source: SkillForge v0.1 — generated from 12 related memories
generated: 2026-04-18T22:00:00Z
---

[Crystallized knowledge here]
```

Write to `~/.claude/skills/` (create dir if needed). Check for existing skills with same name — prompt before overwriting.

## Files you own
- packages/server/src/skill-installer.js (new)

## Acceptance criteria
- [ ] Creates ~/.claude/skills/ directory if needed
- [ ] Writes skill .md files with proper frontmatter
- [ ] Lists installed skills
- [ ] Detects name conflicts
- [ ] Write [T3] DONE to STATUS.md
