# TermDeck Docs Site

Public documentation site for the **TermDeck / Mnestra / Rumen** stack.

Built with [Astro Starlight](https://starlight.astro.build/).

## What this is

A single docs site that renders the `README.md`, `CHANGELOG.md`, and `docs/` tree of
three sibling repos:

- **TermDeck** — browser-based terminal multiplexer (this repo)
- **Mnestra** — long-term memory store (`~/Documents/Graciella/mnestra`)
- **Rumen** — async learning layer (`~/Documents/Graciella/rumen`)

Content is **not** hand-duplicated. A sync script copies the source files into
`src/content/docs/<repo>/` at build time so the docs never go stale.

## Running locally

```bash
pnpm install
pnpm run sync-content
pnpm run dev
```

Then open http://localhost:4321.

## Build

```bash
pnpm run sync-content
pnpm run build
```

Output goes to `dist/`. Deploy target is Vercel (see `vercel.json`).

## Where content comes from

The `scripts/sync-content.mjs` script reads from three sibling repos. Paths are
resolved in this order:

1. Env override: `TERMDECK_REPO`, `MNESTRA_REPO`, `RUMEN_REPO`
2. Default relative paths:
   - TermDeck: `../` (parent of `docs-site/`)
   - Mnestra: `~/Documents/Graciella/mnestra`
   - Rumen: `~/Documents/Graciella/rumen`

Missing repos or missing files are skipped with a warning — the build does not fail
if Mnestra or Rumen are at a different commit or temporarily unavailable.

## Layout

```
docs-site/
├── astro.config.mjs        # Starlight config + sidebar
├── package.json
├── scripts/
│   └── sync-content.mjs    # Copies README/CHANGELOG/docs from sibling repos
├── src/
│   ├── content.config.ts   # Starlight collection definition
│   └── content/docs/
│       ├── index.mdx       # Landing page
│       ├── architecture.md # Three-tier diagram
│       ├── roadmap.md      # Points at each changelog
│       ├── termdeck/       # (generated)
│       ├── mnestra/         # (generated)
│       └── rumen/          # (generated)
├── tsconfig.json
└── vercel.json
```
