# Contributing to TermDeck

Thanks for your interest in TermDeck. This is a small solo project right now, but contributions are welcome.

## Before opening a PR

1. **Open an issue first** for any non-trivial change. A 5-minute discussion can save a 5-hour PR rewrite.
2. **Check the existing issues** to make sure you're not duplicating work.
3. **Match the code style** — vanilla JS on the client (no React, no build step), CommonJS on the server, plain CSS, minimal dependencies. If you find yourself wanting to add a build tool, please open an issue first.

## What I'm looking for

- **Bug fixes** — especially anything platform-specific (Windows installer, Linux paths, shell detection)
- **Output analyzer patterns** — TermDeck detects Claude Code, Gemini CLI, Python servers. New patterns for other tools (Ruby, Go, Rust toolchains) are welcome.
- **Theme contributions** — new xterm.js themes that fit TermDeck's existing 8
- **Documentation improvements**
- **Accessibility fixes**

## What I'd rather you discuss first

- Major architectural changes (e.g., introducing a build step, switching the client to React, etc.)
- New external dependencies
- Anything that changes the WebSocket protocol
- Anything that touches the RAG/Mnestra integration (it's unstable and being rewritten)

## Local setup

```bash
git clone https://github.com/jhizzard/termdeck.git
cd termdeck
npm install
npm run dev  # opens http://127.0.0.1:3000
```

## Code conventions

- **Logging:** every `console.error` must use a `[tag]` prefix: `[pty]`, `[ws]`, `[db]`, `[rag]`, `[config]`, `[cli]`, `[client]`. See `docs/LESSONS_FROM_PODIUM.md` for the rationale.
- **No silent `catch {}` blocks** unless they are intentional feature-detection (like the `try { require('node-pty') } catch { pty = null }` fallback at server startup).
- **Commit messages** should be imperative ("Add X" not "Added X") and describe the why, not just the what.
- **No AI co-author trailers** in commit messages. If you used an AI assistant, you can disclose it however you like in your PR description, just not in the commit metadata.

## License

By contributing, you agree your contributions are licensed under the same MIT license as the project.
