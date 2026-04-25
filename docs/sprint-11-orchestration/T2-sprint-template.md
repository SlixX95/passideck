# T2 — Sprint Template

## Goal

Create a reusable sprint template directory at `docs/templates/sprint-template/` that anyone can copy to start a new sprint.

## Deliverables

### `docs/templates/sprint-template/STATUS.md`

A template with placeholders:

```markdown
# Sprint N — <Title>

Append-only coordination log. Started: <date>

## Mission
<1-3 sentence description of what this sprint accomplishes>

## Terminals

| ID | Spec | Primary file ownership |
|----|------|------------------------|
| T1 | [T1-<name>.md](T1-<name>.md) | <files> |
| T2 | [T2-<name>.md](T2-<name>.md) | <files> |
| T3 | [T3-<name>.md](T3-<name>.md) | <files> |
| T4 | [T4-<name>.md](T4-<name>.md) | <files> |

## File ownership
<table>

## Rules
1. Append only to STATUS.md.
2. Never edit another terminal's files.
3. Flag blockers with `[Tn] BLOCKED`.
4. Sign off with `[Tn] DONE`.

---

(append below)
```

### `docs/templates/sprint-template/T-spec-template.md`

A spec template:

```markdown
# Tn — <Title>

## Goal
<What this terminal delivers>

## Implementation
<Specific steps>

## Files you own
- <list>

## Acceptance criteria
- [ ] <criterion>
- [ ] Write [Tn] DONE to STATUS.md
```

### `docs/templates/sprint-template/README.md`

Brief instructions (under 30 lines): how to copy the template, fill in the placeholders, and start a sprint. Include the orchestrator injection command.

## Files you own
- docs/templates/sprint-template/ (create entire directory)

## Acceptance criteria
- [ ] Template directory with STATUS.md, T-spec-template.md, README.md
- [ ] Placeholders are clearly marked
- [ ] README includes injection command example
- [ ] Write [T2] DONE to STATUS.md
