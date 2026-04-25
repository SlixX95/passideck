# T1 — README "Stay Current" Section + Semver Policy Doc

## Goal

Documentation-only. Tell users explicitly how to keep their stack current and what each kind of version bump means, so when they see a `[hint]` line from T3 or run `termdeck doctor` from T2 they know what to do.

## Files you own

- `README.md`
- `docs/SEMVER-POLICY.md` (new)

## Files you must NOT touch

- Any code file. T2, T3, T4 own those.

## Implementation

### 1. README "Stay current" section

Add a new section near the bottom of `README.md`, just above "Related packages" or wherever fits the existing structure. Title: `## Staying current`.

Body:

- One sentence on why staying current matters (Flashback, Mnestra search semantics, Rumen synth quality all evolve fast).
- Three paths:
  1. **One command for the whole stack:** `npx @jhizzard/termdeck-stack` — re-runs the meta-installer, which detects what's installed and updates anything behind. Idempotent.
  2. **On demand:** `termdeck doctor` — prints a table of installed vs. latest versions for all four packages.
  3. **Passive:** TermDeck prints a one-line `[hint]` on startup if an update is available, rate-limited to once per 24h. Suppress with `TERMDECK_NO_UPDATE_CHECK=1`.
- Link at the end pointing at `docs/SEMVER-POLICY.md` for what each bump kind means.

### 2. `docs/SEMVER-POLICY.md`

A short doc (under 100 lines). Sections:

- **Semver in TermDeck land.** State that all four packages follow semver. Patch bumps fix bugs, minor bumps add features, major bumps break compatibility.
- **Per-package version semantics.** Short paragraph each:
  - `@jhizzard/termdeck`: patch = bug fix in CLI/server; minor = new feature, possible config schema additions (always backward-compatible); major = breaking config or CLI flag changes.
  - `@jhizzard/mnestra`: patch = MCP server bug fix; minor = new search method, new SQL migration (always self-healing via `IF NOT EXISTS`); major = breaking SQL contract or MCP method rename.
  - `@jhizzard/rumen`: patch = synthesizer fix; minor = new phase or scoring tweak; major = breaking insight schema or migration that requires manual intervention.
  - `@jhizzard/termdeck-stack`: patch = installer bug fix; minor = new tier or new layer; major = changes that require a re-install.
- **What an upgrade can and cannot do.** Concrete table (this exists in chat history from the orchestrator's earlier explanation; reuse the table or a near-identical version):

  | Upgrade path | Risk | Why |
  |--------------|------|-----|
  | TermDeck v0.4.x → v0.5.x | Low | Auto-orchestrate is opt-out via `--no-stack`. `~/.termdeck/{config.yaml,secrets.env,termdeck.db}` are never touched on update. |
  | TermDeck v0.5.0 → v0.5.1 | Zero | Pure bug fix (start.sh silent exit). No user-visible behavior change. |
  | Mnestra v0.2.0 → v0.2.1 | Low | Migrations use `IF NOT EXISTS`. v0.2.1 just adds a secrets.env fallback. |
  | Rumen v0.4.0 → v0.4.2 | Low | Additive: JSON hardening + new confidence module. No schema changes. |
  | Rumen v0.4.2 → v0.4.3 | Behavior change | Confidence scores normalize lower for small clusters. Existing rumen_insights rows untouched; new ones land at the new scale. |

- **Kill switch.** Document `TERMDECK_NO_UPDATE_CHECK=1` and what it suppresses (the startup banner only — `termdeck doctor` still works on demand).

## Acceptance criteria

- [ ] `README.md` has a "Staying current" section under a `## Staying current` heading with the three paths.
- [ ] `docs/SEMVER-POLICY.md` exists, is under 100 lines, and includes the per-package semantics + the upgrade-risk table + the kill-switch documentation.
- [ ] No code files touched.
- [ ] Append `[T1] DONE` to STATUS.md with a one-line summary.
- [ ] Do not commit — orchestrator only.

## Sign-off format

```
### [T1] README + SEMVER-POLICY

- Added "Staying current" section to README.md (line N) with the three paths.
- New docs/SEMVER-POLICY.md, ~85 lines, covers per-package semantics, upgrade-risk table, and TERMDECK_NO_UPDATE_CHECK kill switch.
- No code touched.

[T1] DONE
```
