# First-User Experience Gap Analysis

> Written 2026-04-12. The honest audit of what will make users bounce, what will prevent the "wow", and where claims don't match reality.

## Tier 1: Users will BOUNCE

| # | Gap | Fix |
|---|---|---|
| 1 | `npm install` fails without C++ compiler (node-pty, better-sqlite3) | Document prominently, test prebuild-install |
| 2 | Empty dashboard — no first-run guidance | Welcome state with clear instructions |
| 3 | `npx termdeck` fails — npm name taken by "Junielton" | Use `@jhizzard/termdeck` scoped package |
| 4 | No config.yaml auto-created — projects dropdown empty | Auto-create with helpful comments on first run |
| 5 | AI input bar fails silently without Supabase keys | Graceful degradation with clear message |

## Tier 2: Users won't be WOWED

| # | Gap | Fix |
|---|---|---|
| 6 | No demo mode — new user has zero memories | Seed 10-20 generic dev memories |
| 7 | Rumen insights don't surface in TermDeck UI | GET /api/rumen/insights + top-bar badge |
| 8 | Three tools don't compose automatically | Unified setup.sh |
| 9 | Windows installer never tested | Need Windows tester |
| 10 | Gemini CLI detection buggy | Debug pattern matchers |

## Tier 3: Claims vs Reality

| # | Gap | Fix |
|---|---|---|
| 11 | Blog says "loop is closed" — not fully | Build morning briefing or soften copy |
| 12 | Mnestra never tested from clean install | Codespace test |
| 13 | Rumen src/ uses pg but REST API is what works | Rewrite core to REST |
| 14 | npm name `termdeck` is taken | Scoped package or rename |

## Priority: Session 1 tonight = fixes 1-5. Session 2 = fixes 6-8, 11. Session 3 = fixes 10, 12-13.
