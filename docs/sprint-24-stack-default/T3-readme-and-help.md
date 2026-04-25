# T3 — Documentation: README, CLI Help, Install Guides

## Goal

Once `termdeck` orchestrates by default, every doc that says "run `termdeck stack`" should drop back to "run `termdeck`." Missing this step is how doc rot starts.

## Files to update

### `README.md`
- Tier 1 quickstart: `npx @jhizzard/termdeck` is fine. No change.
- Tier 2 section ends with "Restart TermDeck (`Ctrl+C`, then `npx @jhizzard/termdeck` again)." — add a one-liner: "From v0.5.0, `termdeck` (or `npx @jhizzard/termdeck`) automatically boots Mnestra when `mnestra.autoStart: true` is set in your config."
- "Alternative install paths" section — change the v0.4.6 entry that mentioned `termdeck stack` as the stack-launcher path. Update to: "From v0.5.0, plain `termdeck` does this automatically when a configured stack is detected. The `termdeck stack` subcommand is preserved as an alias and still works."

### `docs/INSTALL.md`
Search-and-replace any `termdeck stack` → `termdeck` in user-facing copy, but keep `stack` mentioned once at the end as an alias for users following older guides.

### `docs/GETTING-STARTED.md`
Same treatment as INSTALL.md.

### CLI help (`packages/cli/src/index.js`)
The Sprint 23 help text added a `termdeck stack` line. Either:
- (a) Keep both lines and clarify: `termdeck` (auto-orchestrate when configured) + `termdeck stack` (force orchestrate).
- (b) Drop the `stack` line entirely from the primary listing and document it under an "Aliases / advanced" section.

Recommend (a) — explicit beats clever, and the dual-line layout lets users see what each does.

## Files you own

- `README.md`
- `docs/INSTALL.md`
- `docs/GETTING-STARTED.md`
- The help text block inside `packages/cli/src/index.js` (NOT the dispatch logic — that's T1)

## Acceptance criteria

- [ ] No user-facing doc tells a v0.5+ user to run `termdeck stack` as the primary path.
- [ ] Every doc that previously mentioned `termdeck stack` either drops it or moves it to an "alias" callout.
- [ ] CLI help reflects the v0.5 default behavior.
- [ ] Write `[T3] DONE` to STATUS.md when verified.
