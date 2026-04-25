# npm Packaging Plan for TermDeck

> Status: planned, not started. This document captures the changes needed to publish TermDeck as a global npm package so users can run `npx termdeck` without cloning the repo or compiling native dependencies.

## Why this isn't done yet

Two of TermDeck's dependencies are native modules that require a C++ compiler:

- `node-pty` — needs `node-gyp`, Python, and either Xcode CLT (macOS), MSVC (Windows), or build-essential (Linux)
- `better-sqlite3` — same story

For developers cloning the repo, this is fine — they almost certainly have a compiler. For `npx termdeck` users who just want to try the tool, the install fails with a confusing error message. We need prebuilt binaries.

## The fix

Both `node-pty@1.2.0-beta.12` and `better-sqlite3@^11.0.0` ship prebuilt binaries via `prebuild-install`. The flag is on by default but can fail silently if the postinstall script is misconfigured. We need to:

1. **Verify prebuild availability** for the target platforms × Node version matrix:
   - macOS arm64 (Apple Silicon) on Node 20, 22
   - macOS x64 (Intel) on Node 20, 22
   - Linux x64 on Node 20, 22
   - Windows x64 on Node 20, 22
2. **Set the right `package.json` fields**:
   - `bin`: `{ "termdeck": "./packages/cli/src/index.js" }`
   - `files`: array listing only the files needed at runtime (excluding `docs/`, `assets/icon.iconset/`, `node_modules/`, etc.)
   - `engines`: `{ "node": ">=18.0.0" }` (already set)
   - `main`: `./packages/cli/src/index.js`
3. **Test locally** with `npm pack` followed by `npx ./termdeck-0.1.2.tgz` in a clean directory
4. **Test on a machine without a C++ compiler** (a fresh Docker container is the easiest way)

## Steps

### Step 1: Prepare package.json

Convert the workspace setup so the root `package.json` can be published. Either:

- **Option A**: Keep workspaces, publish each package separately (`@termdeck/server`, `@termdeck/client`, `@termdeck/cli`). Users install `@termdeck/cli` which has the `bin` and depends on the others. More complex but cleaner.
- **Option B**: Bundle everything into a single root package, drop the workspaces field, use a flat dependency tree. Simpler and what most users expect from `npx termdeck`. **Recommended.**

Going with Option B:

```json
{
  "name": "termdeck",
  "version": "0.1.2",
  "description": "Web-based terminal multiplexer with metadata overlays and AI agent awareness",
  "bin": {
    "termdeck": "./packages/cli/src/index.js"
  },
  "main": "./packages/cli/src/index.js",
  "files": [
    "packages/server/src",
    "packages/client/public",
    "packages/cli/src",
    "config/config.example.yaml",
    "config/supabase-migration.sql",
    "assets/TermDeck.icns",
    "assets/icon-1024.png",
    "install.sh",
    "install.bat",
    "README.md",
    "LICENSE",
    "CONTRIBUTORS.md",
    "CHANGELOG.md"
  ],
  "scripts": {
    "dev": "node packages/cli/src/index.js",
    "server": "node packages/server/src/index.js",
    "install:app": "bash install.sh",
    "start": "NODE_ENV=production node packages/server/src/index.js",
    "prepublishOnly": "node -e \"console.log('Run npm pack first to test')\""
  },
  "keywords": ["terminal", "multiplexer", "xterm", "pty", "web-terminal", "tmux-alternative", "termdeck", "ai-agents", "claude-code"],
  "author": "Joshua Izzard",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "node-pty": "1.2.0-beta.12",
    "better-sqlite3": "^11.0.0",
    "uuid": "^9.0.0",
    "yaml": "^2.3.4"
  }
}
```

Note: chalk@^5 was in the workspace deps but isn't actually used. Remove.

### Step 2: Verify prebuild-install works

```bash
# Fresh machine simulation
docker run --rm -it node:20-slim bash
mkdir test && cd test
npm init -y
npm install node-pty@1.2.0-beta.12 better-sqlite3@11
node -e "require('node-pty'); require('better-sqlite3'); console.log('OK')"
```

If this fails with "no prebuilt binary," we need to either:
- Pin to versions where prebuilds are confirmed available
- Ship our own prebuilds via GitHub releases (more work)
- Document that compiler is required (acceptable fallback)

### Step 3: Test `npm pack`

```bash
cd /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck
npm pack
ls -la termdeck-*.tgz
mkdir /tmp/termdeck-test && cd /tmp/termdeck-test
npm install /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/termdeck-*.tgz
npx termdeck --help
npx termdeck
```

### Step 4: Publish to npm

```bash
npm login
npm publish --access public
```

The first publish reserves the name. Subsequent updates: bump version in `package.json`, run `npm pack` to verify, then `npm publish`.

### Step 5: Update README

Add a "Quick install" section:

```markdown
## Quick install (no clone needed)

```bash
npx termdeck
```

Boots TermDeck and opens your browser. Requires Node 18+. No compilation needed for macOS arm64, macOS x64, Linux x64, or Windows x64 on Node 20/22.
```

## Risks

- **node-pty prebuild gaps** — If a Node version × OS combination has no prebuilt binary, users on that combo will hit a compile error. Document the supported matrix prominently.
- **better-sqlite3 size** — The prebuilt binaries are ~2-3 MB each. The published tarball will be ~10 MB total across all platforms. Acceptable for an `npx` tool.
- **Workspace migration** — If we ever want to publish `@termdeck/server` independently (e.g., for embedding), we'd need to revert to Option A. Tag this as a "future v0.2 consideration."

## Estimated effort

- Step 1 (package.json): 15 min
- Step 2 (verify prebuilds): 30 min
- Step 3 (npm pack test): 15 min
- Step 4 (publish): 10 min
- Step 5 (README): 10 min
- **Total: ~80 min** in a focused session

## When to do this

After v0.1.2 ships and the `[tag]` logging convention has been validated by the CI workflow. Before any major promotion push (Show HN, etc.) so users can install directly without cloning.
