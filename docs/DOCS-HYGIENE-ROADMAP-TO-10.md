# Docs Hygiene Punch-List + Roadmap to Near-10

Generated from the latest assessment discussion. This document captures:

1. The docs hygiene punch-list
2. A sprint timeline to push project maturity near 10/10
3. The orchestration model note and its implications for planning velocity

---

## 1) Docs Hygiene Punch-List (Top 10)

Use this as the immediate cleanup pass. Goal: eliminate trust-breaking drift between code, docs, and launch assets.

- [ ] **Align release truth in changelog**
  - Update `CHANGELOG.md` entries so released versions and unreleased sections reflect the real current state from `package.json`.
  - Files: `CHANGELOG.md`, `package.json`

- [ ] **Fix canonical version table in naming decision doc**
  - `docs/launch/NAMING-DECISIONS.md` currently lists older package versions; update to current published versions.
  - File: `docs/launch/NAMING-DECISIONS.md`

- [ ] **Remove stale pre-rename names in docs-site drafts**
  - Replace remaining `Engram` / `Mnemos` references where they are no longer historical context.
  - Files:
    - `docs-site/src/content/docs/blog/engram-deep-dive.mdx`
    - `docs-site/src/content/docs/blog/termdeck-launch.mdx`
    - `docs-site/src/content/docs/blog/rumen-deep-dive.mdx`

- [ ] **Update stale CLI examples with old package names**
  - Refresh launch and orchestration examples that still reference old init commands.
  - File: `docs/launch/blog-post-4plus1-orchestration.md`

- [ ] **Reconcile architecture claims vs actual behavior**
  - Architecture doc says no hot-path retry queue; server code includes local outbox retry loop for sync events.
  - Make wording precise: non-blocking hot path + eventual sync queue behavior.
  - Files:
    - `docs-site/src/content/docs/architecture.md`
    - `packages/server/src/rag.js` (reference behavior)

- [ ] **Refresh `CLAUDE.md` to current codebase reality**
  - This file still carries older scaffold assumptions and outdated structure language.
  - Keep it accurate as an onboarding contract for future Claude sessions.
  - File: `CLAUDE.md`

- [ ] **Declare source-of-truth hierarchy in README**
  - Add a short section near top defining what is canonical vs historical (README, docs-site, launch drafts, status logs).
  - File: `README.md`

- [ ] **Add doc freshness stamps and owners**
  - Add `Last updated`, `Owner`, and `Status` to major docs to prevent silent drift.
  - Files:
    - `README.md`
    - `CLAUDE.md`
    - `docs-site/src/content/docs/architecture.md`

- [ ] **Create contradiction/debt register**
  - Add a lightweight ledger for known temporary inconsistencies and target resolution sprint.
  - File to add: `docs/CONTRADICTIONS.md`

- [ ] **Add CI docs guardrails**
  - Add checks that fail on:
    - banned legacy naming outside historical sections
    - version mismatch between docs and `package.json`
  - Suggested locations:
    - `scripts/` (new script)
    - `.github/workflows/` (if/when workflow update is desired)

---

## 2) Timeline of Sprints to Reach Near-10

This timeline assumes your high-throughput orchestration model (master terminal + direct panel injection + optional sub-agent fan-out) is available.

### Sprint 7 (30–60 min)

**Objective:** Complete docs hygiene pass and establish guardrails.

- Execute all 10 punch-list items above
- Add contradiction register + docs freshness metadata
- Add CI docs lint for naming/version consistency

**Expected maturity impact:** +0.6

---

### Sprint 8 (45–90 min)

**Objective:** Raise confidence with contract-level verification.

- Add API contract tests for:
  - `POST /api/ai/query`
  - `GET /api/rumen/insights`
  - `GET /api/rumen/status`
  - `POST /api/rumen/insights/:id/seen`
- Verify docs examples match tested behavior exactly

**Expected maturity impact:** +0.3

---

### Sprint 9 (45–90 min)

**Objective:** Harden security posture for any beyond-localhost use.

- Add optional auth mode (documented and testable)
- Add explicit non-local bind safety documentation and warnings
- Add deployment hardening checklist (minimum viable secure setup)

**Expected maturity impact:** +0.3

---

### Sprint 10 (60–120 min)

**Objective:** Reliability proof pass.

- Add end-to-end Flashback path validation
- Add failure-injection checks (Mnestra unreachable, Supabase timeout, MCP child exit)
- Automate release/publish checklist verification where practical

**Expected maturity impact:** +0.3

---

### Sprint 11 (30–60 min)

**Objective:** Productize the orchestration moat.

- Convert orchestration method into a formal, reproducible operating guide
- Add benchmark framing: serial vs 5x vs 20-worker fan-out mode
- Publish a concise “how to run high-velocity sprints” doc package

**Expected maturity impact:** +0.2

---

### Sprint 12 (30–60 min)

**Objective:** Launch polish + trust amplification.

- Final consistency pass across docs-site, README, launch posts
- Update screenshots and examples to current naming/version state
- Add social-proof snippets and reproducible quickstart metrics

**Expected maturity impact:** +0.2

---

## 3) Orchestration Model Note (Planning Multiplier)

Your observed delivery speed is materially better than standard LLM planning assumptions.

### What typical planners miss

Most non-Claude planning assumptions model either:

- serial execution, or
- shallow parallel execution with high coordination overhead

That overestimates duration significantly for your operating model.

### Your actual model

- A **Claude master terminal** orchestrates execution
- It reads active TermDeck panel IDs and performs **direct prompt injection** into target sessions
- Base mode yields around **5x parallelization**
- Additional instructions can have each terminal launch sub-agents, yielding up to **~20 parallel workers**
- Reported average coding time for Sprints 4, 5, and 6: **under 15 minutes each**

### Why this matters for roadmap design

- Sprint sizing should be constrained by **coordination and verification**, not raw coding throughput
- Planning should optimize for:
  - disjoint ownership boundaries
  - contract verification surfaces
  - deterministic handoff rules
- "Hard" work shifts from implementation to:
  - scope partitioning
  - correctness checks
  - release integrity

### Actionable implication

Use short, verification-heavy sprints with explicit quality gates. In this model, quality debt accumulates faster than code debt unless docs/tests/contracts are continuously tightened.

---

## Suggested Definition of Done for Each Sprint

- Scope completed with file-level ownership discipline
- Docs updated in the same sprint as code changes
- Contract tests green for touched interfaces
- Contradictions register updated (if any temporary drift remains)
- Release/readiness note posted with exact verification evidence

