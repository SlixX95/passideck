# Sprint 20 — SkillForge Foundation

Append-only coordination log.

## Mission

Build the foundation for Tier 5: autonomous skill generation from Mnestra memories. This sprint creates the CLI command skeleton and the Opus prompt template. Behind --experimental flag.

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | T1-forge-cli.md | packages/cli/src/forge.js (new) |
| T2 | T2-forge-prompt.md | packages/server/src/forge-prompt.js (new) |
| T3 | T3-skill-installer.md | packages/server/src/skill-installer.js (new) |
| T4 | T4-forge-docs.md | docs/SKILLFORGE.md (new) |

## Rules
1. Append only to STATUS.md. 2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`. 4. Sign off with `[Tn] DONE`.

---
(append below)

## [T3] progress — 2026-04-18

- Created `packages/server/src/skill-installer.js` with `getSkillsDir`, `installSkill`, `listInstalledSkills`, `removeSkill`, plus `skillExists` helper.
- Target dir resolves to `~/.claude/skills/`, with `TERMDECK_SKILLS_DIR` env override (used for tests / sandbox installs). Directory is `mkdir -p`'d on install.
- Skill files are markdown with YAML-ish frontmatter (`name`, `description`, `trigger`, `source`, `generated`) followed by the crystallized body. Values with `:` / `#` / quotes are JSON-escaped so they parse cleanly.
- Name conflicts throw `SKILL_EXISTS` by default; callers opt in with `installSkill(skill, { overwrite: true })`. Missing skills on remove throw `SKILL_NOT_FOUND`. Names are validated against `^[a-z0-9][a-z0-9_-]*$`.
- `listInstalledSkills()` reads the dir, parses frontmatter, falls back to file mtime for `generated`, and returns entries sorted by name. Unreadable files are skipped rather than crashing.
- Smoke-tested end-to-end against a throwaway `TERMDECK_SKILLS_DIR`: install → conflict → overwrite → list → exists → remove → missing-remove → bad-name rejection all behaved as expected.
- No CLI / client files touched.

[T3] DONE

## [T4] progress — 2026-04-18

- Wrote `docs/SKILLFORGE.md` (81 lines, under the 100-line cap).
- Sections: one-paragraph overview, `termdeck forge` usage, transparent cost formula (input+output Opus pricing), example generated skill with frontmatter, how Claude Code auto-loads `~/.claude/skills/` by trigger matching, the 4-phase pipeline (quality audit → pattern extraction → skill generation → self-critique), current v0.1 limitations, and the vision.
- Honest framing: v0.1 today does cost projection + confirm only; Opus generation and installer land in v0.4. Scheduled runs, diffing, and team-shared bundles flagged as future work.
- Did not touch any code files or any other terminal's owned files.

[T4] DONE

## [T2] progress — 2026-04-18

- Created `packages/server/src/forge-prompt.js` exporting `systemPrompt`, `buildUserPrompt(memories)`, `parseSkills(response)`.
- `systemPrompt` implements the full 4-phase pipeline: Phase 1 quality audit with explicit scoring rubric (0.0–1.0) and aggressive discard of sprint-process meta / version snapshots / generic advice; Phase 2 pattern extraction with 2-source-or-battle-tested bar; Phase 3 skill generation with name/description/trigger/body/evidence/confidence/quality_score fields; Phase 4 self-critique with concrete keep/discard tests. Output contract: single fenced JSON block containing `skills[]`, `discarded[]`, `notes`.
- Embedded 3 calibration example skills derived from TermDeck lore so Opus has an explicit density target: `supabase-ipv4-connect-toggle` (IPv4 Connect modal gotcha), `mnestra-startup-sequence` (preflight-red recovery ordering), `termdeck-trio-version-bump` (cross-package version drift across @jhizzard/termdeck + mnestra + rumen).
- `buildUserPrompt` groups by `project`, one line per memory with `[id] (type, category, recency) — content`, content flattened to single line and capped at 600 chars. Handles both `age_days` number and `created_at` ISO by computing days-ago fallback.
- `parseSkills` extracts a fenced `\`\`\`json` block (falls back to any fence or outermost `{...}` slice), JSON-parses, validates each skill (required fields, kebab-case name), clamps `confidence` and `quality_score` to [0,1], coerces `evidence` to string array, and routes rejects into `discarded[]` with reason instead of throwing.
- Smoke-tested: module loads cleanly (no require-time side effects), `buildUserPrompt` formats single-memory input correctly, `parseSkills` round-trips a fenced JSON response preserving evidence and numeric fields.
- No CLI or client files touched. All 4 acceptance criteria met.

[T2] DONE

## [T1] progress — 2026-04-18

- Created `packages/cli/src/forge.js` — lazy-loaded CLI module wired into `packages/cli/src/index.js` via a new `if (args[0] === 'forge')` dispatch branch mirroring the existing `init --mnestra|--rumen` pattern. `termdeck --help` now lists `termdeck forge` under the main usage block.
- Flags parsed: `--help / -h`, `--dry-run`, `--yes / -y`, `--max-cost <usd>`, `--min-confidence <0..1>`. Invalid numeric values for the last two throw a clean `[forge] …` error and exit 1 without hitting Mnestra.
- Memory count: `fetchMemoryCount(config)` GETs `<baseUrl>/healthz` (derived from `config.rag.mnestraWebhookUrl`, default `http://localhost:37778`) and extracts `store.rows ?? total ?? memories ?? count`. Logic mirrors preflight.js so both stay in sync. 0-memory case errors with a `mnestra ingest` hint and exits 1.
- Cost projection: `memories × 200 input tokens`, output = `0.2 × input`, priced at Opus `$15/M in`, `$75/M out`. Constants declared at the top of the file with a link-back comment for anyone who needs to bump them when pricing changes. Live run against my local Mnestra (4,089 memories) projects $24.53 total, matching a hand-calculation.
- Confirmation: defaults to `[y/N]` via the shared `prompts.confirm()` helper, skipped with `--yes` or `--dry-run`. `--max-cost` check happens before the prompt and exits 2 (distinct code for scripted callers) when the cap is exceeded.
- Steps 4–7 print the Sprint 21 handoff message — `Opus call → T2 forge-prompt.js`, `installer → T3 skill-installer.js` — so anyone running the preview sees exactly where the rest lives.
- Tested: `--help`, `--dry-run`, `--dry-run --max-cost 10` (abort + exit 2), `--min-confidence 1.5` (validation error), `printf 'n\n' | forge` (abort), `printf 'y\n' | forge` (prints stub). No server or client files touched.

[T1] DONE
