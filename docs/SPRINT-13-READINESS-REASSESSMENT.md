# Sprint 13 Readiness Reassessment

**Date:** 2026-04-16  
**Scope:** Reassess `docs/DOCS-HYGIENE-ROADMAP-TO-10.md` against the current state in `docs/LAUNCH-READINESS.md`, the TermDeck repo, and the bundled Mnestra / Rumen / MCP integration surfaces.  
**Purpose:** Convert the latest review into a concrete next-sprint input.

---

## Executive summary

The project improved meaningfully since the earlier assessment. The score moves from **~9.0/10** to **~9.3/10**.

This is real progress, but not yet the clean jump to near-10/10 because the main remaining weakness is now **release-truth drift**, not architecture or feature completeness.

The repo now contains most of the maturity work previously called for:

- docs lint exists
- a contradictions register exists
- launch-readiness docs exist
- contract tests exist
- Flashback end-to-end coverage exists
- failure-injection coverage exists
- security and deployment docs exist
- release verification tooling exists

The project is now closer to launch-ready in substance than before. The remaining drag is that the **canonical docs and release metadata have drifted out of sync again**.

---

## Score change

### Previous score

- **~9.0/10**

### Current score

- **~9.3/10**

### Why it increased

- The roadmap items were not just discussed; many were actually implemented.
- The architecture docs are closer to the real server behavior.
- The testing surface is broader and more credible.
- The launch materials are more complete and better organized.
- The project now has stronger operational scaffolding around docs, security, and release verification.

### Why it did not increase more

- Release-truth drift reappeared.
- The launch gate document is no longer fully trustworthy.
- Some operator-facing strings still broadcast stale versions.
- The contradiction register is present, but not fully maintained as a live source of truth.
- The least-proven integration path remains the Mnestra MCP mode.

---

## Timing note

One important correction to the prior planning assumptions:

- The seven-sprint sequence was completed in **135 minutes total**
- That is **less than half of the already reduced time estimate**

Implication:

- The orchestration model is outperforming even the revised velocity assumptions.
- Future sprint planning should assume implementation is cheap relative to verification.
- The bottleneck is now **truth maintenance, validation, and final consistency**, not code production.

This reinforces the earlier thesis from the roadmap: in this operating model, **quality debt accumulates faster than coding debt** unless verification and source-of-truth maintenance are treated as first-class work.

---

## What materially improved

### 1. Docs/process scaffolding is now real

The repo now includes:

- `docs/CONTRADICTIONS.md`
- `scripts/lint-docs.sh`
- `scripts/verify-release.sh`
- `docs/LAUNCH-READINESS.md`
- Sprint-status docs for hygiene, contracts, reliability, orchestration, and launch polish

That is a substantial maturity improvement over the earlier state.

### 2. Architecture claims are closer to reality

The docs-site architecture page now correctly describes the write path as:

- non-blocking on the hot path
- backed by a local SQLite outbox
- retried by a periodic sync loop

This is materially better than the earlier misleading “no queue” framing.

### 3. Reliability posture is stronger

The repo now contains:

- health contract tests
- transcript contract tests
- Rumen endpoint contract tests
- Flashback end-to-end coverage
- failure-injection tests

That is the right direction for a project approaching a public launch.

### 4. Launch surface is more complete

The launch-readiness artifact, launch collateral, screenshots, docs site, help-button docs link, and monitoring/rollback framing are all signs of a more disciplined launch process than before.

---

## What is still holding the score down

### 1. Release-truth drift is back

This is now the highest-signal problem.

Observed state:

- root `package.json` is `0.3.6`
- `CHANGELOG.md` stops at `0.3.5`
- `docs/LAUNCH-READINESS.md` still anchors on `0.3.5`
- `README.md` still anchors some current-state language on `0.3.5`
- `CLAUDE.md` still says current version is `v0.3.5`

This is not cosmetic. It directly weakens trust in the release/readiness story.

### 2. The launch-readiness doc is not currently a reliable gate

It declares itself the single source of truth, but it still contains stale version assumptions and rollback language that no longer matches the current package version.

That means the gate exists structurally but is not being maintained with sufficient rigor.

### 3. Operator-facing version strings still leak stale state

The CLI banner still prints `TermDeck v0.2.0`.

That is exactly the type of trust-breaking inconsistency the docs-hygiene sprint was intended to eliminate.

### 4. Contradiction tracking exists, but the register is stale

The contradiction register is a good system addition, but it is not yet functioning as a live discipline.

It still contains items that appear resolved and does not capture the current 0.3.6 version drift. That means the mechanism exists, but the maintenance habit is not yet locked in.

### 5. Mnestra MCP mode remains the least-proven surface

The bridge code clearly supports:

- `direct`
- `webhook`
- `mcp`

But the MCP path still looks less verified than the other two. It appears to jump directly into `tools/call` against a stdio child process and is not clearly covered by repo-local tests in this tree.

That does not mean it is broken. It means it remains the least-proven integration mode in the current evidence set.

---

## Current standing by area

### TermDeck

Strongest part of the stack. The product surface, launch narrative, tests, reliability work, and docs breadth all improved materially.

Main remaining issue:

- release/readiness truth is lagging the code

### Mnestra integration

Credible and structurally well-integrated. The bridge supports multiple modes and the docs explain the role clearly.

Main remaining issue:

- MCP mode is still less verified than direct/webhook paths

### Rumen integration

Much stronger than before. The project now presents a believable async-learning layer with docs, readiness framing, endpoints, and associated tests in the TermDeck repo.

Main remaining issue:

- some historical/version references in current docs still lag published reality

### Overall launch posture

Better than before by a clear margin. The project now looks like a real launch candidate rather than an ambitious prototype.

Main remaining issue:

- the trust surface is not yet fully crisp

---

## Assessment of where the project stands now

TermDeck is now much closer to a real public-launch state.

The core problem is no longer “is there enough here?” The answer to that is yes.

The core problem is now:

- can every user-facing and operator-facing artifact be trusted as current, exact, and consistent?

Right now, the answer is:

- **mostly**
- but not enough for a true near-10/10 score

If the version-truth drift is cleaned up and the release-verification loop is rerun against the actual current version, the project moves into the **~9.5 to 9.6/10** range.

That is the shortest path to the next visible score jump.

---

## Recommended Sprint 13 objective

**Objective:** Close the trust-surface gap.

This sprint should not primarily add features. It should make the current launch/release surface unambiguous and mechanically trustworthy.

### Sprint 13 priorities

- Add a `0.3.6` release entry to `CHANGELOG.md`
- Reconcile all current-state docs that still anchor on `0.3.5`
- Update `docs/LAUNCH-READINESS.md` so it is genuinely the current gate
- Fix the CLI banner version string
- Refresh `CLAUDE.md` to current reality
- Refresh `docs/CONTRADICTIONS.md` so it reflects current unresolved drift, not historical leftovers
- Re-run docs lint and release verification after the cleanup
- Optionally add a small guardrail to catch stale hard-coded version strings in runtime-facing surfaces

### Expected score impact

- **+0.2 to +0.3**

This is the most leverage-efficient next sprint.

---

## Definition of done for Sprint 13

- `package.json`, `CHANGELOG.md`, launch-readiness docs, README, and CLAUDE agree on the current release truth
- CLI/runtime-facing version strings match the actual published version
- `docs/CONTRADICTIONS.md` reflects only active unresolved issues
- `scripts/lint-docs.sh` passes
- `scripts/verify-release.sh` passes
- No “single source of truth” document contradicts the codebase

---

## Bottom line

The project is stronger than it was two hours earlier, and the improvement is real.

The score increased from **~9.0/10** to **~9.3/10**.

The code and process work landed. The reason the score did not rise further is that the launch/readiness truth layer has fallen slightly behind the implementation again.

That is good news strategically: the remaining gap is now mostly a **discipline and verification problem**, not a product problem.

That is also exactly the kind of gap your orchestration model is well-suited to close quickly.
