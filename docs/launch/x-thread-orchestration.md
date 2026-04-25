# X thread — 4+1 orchestration / Flashback meta moment

---

**1/** At 2am last night my memory system surfaced a memory about the rename crisis I was currently executing. From production Supabase. In the session we were building the feature in. The toast header still said the old name because the client hadn't caught up.

[attach: docs/screenshots/flashback-meta-moment.png]

---

**2/** Context. I was mid-sprint on TermDeck, running 4 Claude Code panels inside the multiplexer plus 1 orchestrator Claude Code outside it. Four workers, one orchestrator. I call it the 4+1 pattern.

Each of the four owns a disjoint set of file paths. They coordinate through a single append-only `docs/STATUS.md`.

---

**3/** The orchestrator handles the things you cannot parallelize: git tags, npm publishes, GitHub renames, cross-terminal tie-breaks. The workers handle everything scoped to their owned paths. No merges, no locks, no waiting.

~2 hours wall-clock, 4 workers shipping in parallel the entire time.

---

**4/** The orchestrator side of this sprint got weird. The memory package name kept collapsing under me:

- Engram — 138 packages on npm, 2.5k-star collision → deprecated
- Mnemos — two MCP-memory-server collisions → deprecated
- Ingram — existing package → deprecated
- Mnestra — clean, final

Three failed pivots in 30 minutes. Three npm publishes. Three deprecations. One Python one-shot that mechanically renamed 71+ files across four repos in a single pass.

---

**5/** During the Mnemos → Mnestra pivot, one of the worker panels errored. TermDeck's output analyzer flagged it. Flashback queried Supabase for similar memories. Supabase returned T4's own research note from earlier in the same session, documenting that both Engram and Mnemos were red.

The tool used itself to document its own naming crisis in real time.

---

**6/** The toast header said `ENGRAM — POSSIBLE MATCH` because the client-side rename constant hadn't propagated. The body was correct. A pattern-matched error hook, a cosine-similarity query, and a recency-decay rank — that is all Flashback is. But the loop closed on its own naming crisis. I took the screenshot and went to bed.

---

**7/** 4+1 is not clever. It is the obvious shape of parallel agent work once you accept that disjoint file scopes are the only coordination surface that doesn't need a merge strategy. I think it or something close will be the default for Claude Code sprints in 2026.

Template: `docs/demo/parallelize-template.md` in the repo.

---

**8/**
```
npx @jhizzard/termdeck
```

https://github.com/jhizzard/termdeck
