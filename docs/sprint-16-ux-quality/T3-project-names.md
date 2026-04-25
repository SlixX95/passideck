# T3 — Project Name Resolution

## Goal

Fix the "chopin-nashville" project tag problem. Currently, sessions and insights are tagged with directory path segments instead of the project names defined in `~/.termdeck/config.yaml`.

### Root cause

When a session is created, the project name comes from either:
1. The `project` field in the POST /api/sessions request (correct — uses config.yaml name)
2. The `cwd` path, which gets split and a segment is used as the project tag (incorrect — produces "chopin-nashville" from the directory structure)

The Mnestra bridge and RAG event tagging also use the raw path when no project name is explicitly provided.

### Fix

In `packages/server/src/rag.js`:
1. Add a `resolveProjectName(cwd, config)` function that:
   - Takes a working directory path and the config object
   - Checks each project in `config.projects` to see if the cwd starts with (or equals) that project's resolved path
   - Returns the config project name if found, otherwise falls back to the directory basename
2. Use this function when tagging RAG events with a project name

In `packages/server/src/mnestra-bridge/index.js`:
1. When constructing query context for Flashback, use the session's project name (from config.yaml) not the cwd path
2. If the session has no explicit project, resolve via the same `resolveProjectName` function

### Example
- cwd: `~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck`
- config.yaml has: `termdeck: { path: ~/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck }`
- Result: project tag should be `termdeck`, not `chopin-nashville`

## Files you own
- packages/server/src/rag.js (project name resolution)
- packages/server/src/mnestra-bridge/index.js (query context project name)

## Acceptance criteria
- [ ] Sessions created with a config.yaml project get the correct project name
- [ ] Sessions in subdirectories of a known project resolve to that project
- [ ] Sessions outside any known project path fall back to directory basename
- [ ] Mnestra bridge queries use resolved project names
- [ ] All catch blocks use catch (err)
- [ ] Write [T3] DONE to STATUS.md
