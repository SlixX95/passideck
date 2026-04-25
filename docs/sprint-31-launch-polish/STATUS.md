# Sprint 31 — Launch Polish

Append-only coordination log.

## Mission

After Sprint 30 closes the code-quality gap Codex flagged, Sprint 31 is the "external proof" pass that lifts the Usefulness score from 8 → 8.5+. Three deliverables: refresh the demo gif/screenshots for v0.6.0, fold `termdeck init --rumen` into the meta-installer so Tier 3 is one-click, and prepare the Show HN copy + image bundle. None of this is hard; it's the package-the-product work that's been deferred while we built the product.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-demo-refresh.md | `docs/screenshots/` — capture new flashback-demo.gif + dashboard stills against v0.6.0 with the new wizard, doctor command, and four-step Stack Launcher banner |
| T2 | T2-rumen-meta-install.md | `packages/stack-installer/src/index.js` — when the user picks Tier 3, automatically run `termdeck init --rumen` after the npm installs land. Pass through `--dry-run` from the meta-installer flag |
| T3 | T3-show-hn-bundle.md | `docs/launch/show-hn-2026-04-XX.md` (new) — Show HN post text, image inventory, comment Q&A drafts. No code. |
| T4 | T4-website-blog.md | One blog post on joshuaizzard.com explaining the "stateless LLM, persistent everything else" thesis. Source content lives at `~/Documents/Graciella/joshuaizzard-dev/content/blog/` (or wherever the blog content type is). |

## File ownership table

| File | Owner |
|------|-------|
| `docs/screenshots/flashback-demo.gif` | T1 |
| `docs/screenshots/*.png` (new stills) | T1 |
| `packages/stack-installer/src/index.js` | T2 |
| `docs/launch/show-hn-2026-04-XX.md` (new) | T3 |
| `~/Documents/Graciella/joshuaizzard-dev/content/blog/...` | T4 (separate repo) |

T1's gif capture is the only manual step — Josh records it (or Playwright captures it). The rest is deterministic.

## Acceptance criteria

- [ ] New `docs/screenshots/flashback-demo.gif` shows a v0.6.0 dashboard with the orchestrator layout, Flashback toast, and meta-installer banner. Old gif moved to `flashback-demo-pre-v0.6.gif` for archive.
- [ ] `npx @jhizzard/termdeck-stack --tier 3 --yes` (or `--tier 4`) runs `termdeck init --rumen` automatically after the npm installs complete. User doesn't have to chain a second command.
- [ ] Show HN bundle covers: title (under 80 chars), 2-paragraph body, the 5 most likely critical questions with prepared answers, link list (GitHub, npm, docs site, joshuaizzard.com).
- [ ] Blog post at joshuaizzard.com is the single canonical "what is this stack and why" piece.
- [ ] Append `[Tn] DONE` to STATUS.md.

## Rules

1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED <reason>`. 4. Sign off with `[Tn] DONE`.
5. Workers never `git commit` / `git push` / `npm publish` — orchestrator only.

---
(append below)

## 2026-04-25 — meta-installer 0.2.0 published ahead of T2

Codex audit on 2026-04-25 flagged that `@jhizzard/termdeck-stack` was
still at `0.1.0` while the rest of the stack had moved to termdeck
0.6.1 / mnestra 0.2.1 / rumen 0.4.3 — the "polished one-command
install" looked like the least-mature published surface even though
the installer code already wires Tiers 1–4 against the current stack.

Decision: bump the meta-installer to `0.2.0` now to close the optics
gap, and ship the **`termdeck init --rumen` auto-run (T2) when Sprint
31 actually runs**. Until then, Tier 3 users still chain that command
manually. The README's new "Known limitations" section calls this out
explicitly so the gap is documented, not hidden.

Sprint 31 T1, T2, T3, T4 remain queued and unchanged.
