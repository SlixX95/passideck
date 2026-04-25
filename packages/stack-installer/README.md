# @jhizzard/termdeck-stack

One-command installer for the TermDeck developer memory stack.

```
npx @jhizzard/termdeck-stack
```

## What gets installed

| Layer | Package | What it does |
|-------|---------|--------------|
| 1 | `@jhizzard/termdeck` | Browser terminal multiplexer with metadata overlays and Flashback recall toasts |
| 2 | `@jhizzard/mnestra` | pgvector memory store + MCP server. Lights up Flashback. Provides `memory_*` tools to Claude Code, Cursor, Windsurf |
| 3 | `@jhizzard/rumen` | Async learning loop on a Supabase Edge Function cron. Synthesizes cross-project insights |
| 4 | `@supabase/mcp-server-supabase` | MCP that lets the TermDeck setup wizard provision your Supabase project automatically |

The wizard:

1. Prints the four-layer overview so you see what you're agreeing to.
2. Detects which pieces are already on your machine.
3. Asks which tier you want (default: 4 — full stack).
4. Runs `npm install -g` for the missing pieces.
5. Merges Mnestra and Supabase MCP entries into `~/.claude/mcp.json` — preserving any existing MCP servers.
6. Prints the next steps (Supabase PAT, credentials, `termdeck` to start).

## Modes

```
npx @jhizzard/termdeck-stack             # interactive
npx @jhizzard/termdeck-stack --tier 4    # unattended
npx @jhizzard/termdeck-stack --dry-run   # print plan, don't install
npx @jhizzard/termdeck-stack --yes       # accept defaults (combine with --tier)
```

## Known limitations

Tier 3 (Rumen) currently still requires one manual command after the
installer finishes:

```
termdeck init --rumen
```

That command deploys the Rumen Supabase Edge Function, applies the
migration, and installs the `pg_cron` schedule. Auto-running it from
the meta-installer is queued — until then the wizard prints it as an
explicit next step.

## Version vs. the rest of the stack

This package's version tracks the meta-installer surface, not the
underlying packages. Each layer ships on its own release cadence:

| Package | Where to look |
|---------|---------------|
| `@jhizzard/termdeck` | https://www.npmjs.com/package/@jhizzard/termdeck |
| `@jhizzard/mnestra` | https://www.npmjs.com/package/@jhizzard/mnestra |
| `@jhizzard/rumen` | https://www.npmjs.com/package/@jhizzard/rumen |

The installer always pulls each layer's `latest` dist-tag, so a fresh
`npx @jhizzard/termdeck-stack` run picks up the most recent published
version of every layer regardless of this package's own version.

## Why this exists

The TermDeck stack used to be a 15-step install: provision Supabase, run six SQL migrations, mint API keys, paste them into `secrets.env`, edit `config.yaml`, install Mnestra globally, deploy Rumen, install the Supabase MCP, wire `~/.claude/mcp.json`. Most testers bounced before step 5.

This installer collapses every step that's a `npm install -g` into one command, then drops the user at the doorstep of the in-browser setup wizard (which handles credentials).

## License

MIT
