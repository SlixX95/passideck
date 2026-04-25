# Semver Policy

How TermDeck and its sister packages version themselves, and what each kind of bump means for your install.

## Semver in TermDeck land

All four packages — `@jhizzard/termdeck`, `@jhizzard/mnestra`, `@jhizzard/rumen`, and `@jhizzard/termdeck-stack` — follow [semantic versioning](https://semver.org). In short:

- **Patch** (`0.5.0` → `0.5.1`) — bug fixes only. Drop-in safe.
- **Minor** (`0.5.x` → `0.6.0`) — new features. Always backward compatible at the config and CLI level.
- **Major** (`0.x` → `1.0`) — breaking changes. Read the changelog before upgrading.

While we're in the `0.x` range, the same discipline applies: minor bumps may add features but won't break your existing config; patch bumps fix things and never change behavior on purpose.

## Per-package version semantics

**`@jhizzard/termdeck`** (the CLI + server + dashboard)
- Patch: bug fixes in the CLI, server, dashboard, or output analyzer.
- Minor: new layout modes, new dashboard panels, new CLI subcommands, additive `~/.termdeck/config.yaml` keys (always optional, defaulted).
- Major: breaking config schema changes, removed or renamed CLI flags, dashboard endpoints that move.

**`@jhizzard/mnestra`** (memory MCP + webhook server + SQL contract)
- Patch: MCP server bug fix, webhook handler fix, doc-only update.
- Minor: new search method, new MCP tool, new SQL migration. Migrations are always self-healing via `IF NOT EXISTS` / `IF EXISTS` so re-runs are safe.
- Major: breaking SQL contract change (renamed function, changed RPC signature), MCP method rename, breaking migration that requires manual intervention.

**`@jhizzard/rumen`** (async learning loop)
- Patch: synthesizer bug fix, JSON-parse hardening, prompt nit.
- Minor: new pipeline phase, new scoring tweak, new prompt scaffold.
- Major: breaking insight schema, breaking migration that requires hand-running SQL or re-importing data.

**`@jhizzard/termdeck-stack`** (the meta-installer)
- Patch: installer bug fix, output formatting tweak.
- Minor: new tier or new layer added to the stack.
- Major: change that requires the user to re-run install or rewire something themselves.

## What an upgrade can and cannot do

| Upgrade path | Risk | Why |
|---|---|---|
| TermDeck v0.4.x → v0.5.x | Low | Auto-orchestrate is opt-out via `--no-stack`. `~/.termdeck/{config.yaml,secrets.env,termdeck.db}` are never touched on update. |
| TermDeck v0.5.0 → v0.5.1 | Zero | Pure bug fix (start.sh silent exit). No user-visible behavior change. |
| Mnestra v0.2.0 → v0.2.1 | Low | Migrations use `IF NOT EXISTS`. v0.2.1 just adds a `~/.termdeck/secrets.env` fallback. |
| Rumen v0.4.0 → v0.4.2 | Low | Additive: JSON parse hardening + new confidence module. No schema changes. |
| Rumen v0.4.2 → v0.4.3 | Behavior change | Confidence scores normalize lower for small clusters. Existing `rumen_insights` rows untouched; new ones land at the new scale. |

Read this table as: zero/low risk = run the upgrade and move on; behavior change = read the CHANGELOG entry first to decide whether the new default suits your data.

## Kill switch

`TERMDECK_NO_UPDATE_CHECK=1` suppresses the once-per-24-hour `[hint]` line that TermDeck prints on startup when an update is available. It does **not** disable `termdeck doctor` — running that command always queries the npm registry on demand. Set the env var when you need a quiet startup (CI, demos, recordings) or when you've consciously pinned versions and don't want the nudge.
