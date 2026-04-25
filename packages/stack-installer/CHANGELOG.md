# Changelog — `@jhizzard/termdeck-stack`

All notable changes to the meta-installer are tracked here. The
underlying packages (`@jhizzard/termdeck`, `@jhizzard/mnestra`,
`@jhizzard/rumen`) ship on their own cadences and have their own
changelogs — see the root `CHANGELOG.md` for `@jhizzard/termdeck`.

## [0.2.1] — 2026-04-25

### Documentation
- Audit-trail update: validated against `@jhizzard/termdeck@0.6.2`,
  which shipped ~8 minutes after stack-installer 0.2.0 went live.
  v0.6.2 removed the `Proceed with setup for project X?` confirm gate
  in `termdeck init --mnestra` after a third report from a tester
  whose terminal kept resolving the confirm as a soft-cancel even
  after v0.6.1's askSecret hardening. See the root `CHANGELOG.md`
  for the full v0.6.2 entry.

### Notes
- No installer behavior change: stack-installer 0.2.0 already pulled
  `@jhizzard/termdeck@latest`, so a fresh `npx @jhizzard/termdeck-stack`
  on 0.2.0 picked up the v0.6.2 wizard fix automatically. This bump
  is purely to keep the per-package audit trail tight — the CHANGELOG
  for 0.2.0 was written when `latest` was still 0.6.1 and had no way
  to mention the hotfix that landed minutes later.

## [0.2.0] — 2026-04-25

### Documentation
- New **Known limitations** section: Tier 3 (Rumen) still requires a
  manual `termdeck init --rumen` after the meta-installer finishes.
  Auto-running this step is queued as Sprint 31 T2.
- New **Version vs. the rest of the stack** section: explains that
  this package's version tracks the meta-installer surface, not the
  underlying packages, and that the installer always pulls each
  layer's `latest` dist-tag at install time.

### Why this is a minor bump (not patch)
Codex's 2026-04-25 audit flagged that `0.1.0` looked like the least-
mature published surface next to `termdeck 0.6.1 / mnestra 0.2.1 /
rumen 0.4.3`. The README was also silent on (a) why this package's
version is decoupled from the underlying layers and (b) the manual
`termdeck init --rumen` step that Tier 3 users still need. The bump
signals "actively maintained, validated against the v0.6.x stack."

The strict reading of `docs/SEMVER-POLICY.md` would treat a docs-only
refresh as patch-level. We're stretching to minor here on purpose —
this is the "we know it's been sitting at 0.1.0 too long, here's the
intentional refresh" release. Future docs-only updates will revert
to patch.

### Notes
- Installer code in `src/index.js` is byte-for-byte identical to
  v0.1.0. The published 0.1.0 already wires Tiers 1–4 against the
  current stack — no behavior change in this release.

## [0.1.0] — 2026-04-25

### Initial release
- One-command meta-installer: `npx @jhizzard/termdeck-stack`.
- Four-layer overview, detection of already-installed packages,
  tier prompt (default 4), `npm install -g` for missing layers,
  merges Mnestra and Supabase MCP entries into `~/.claude/mcp.json`
  without clobbering existing servers.
- Modes: interactive (default), `--tier N`, `--dry-run`, `--yes`.
- Zero runtime deps beyond Node built-ins.
