# Sprint Template

Reusable starting point for a 4+1 TermDeck sprint (master terminal + 4 worker Claude Code panels with strict file ownership).

## How to start a new sprint

1. Copy this directory to a new sprint folder:

   ```sh
   cp -r docs/templates/sprint-template docs/sprint-<N>-<slug>
   ```

2. Rename `T-spec-template.md` once per terminal:

   ```sh
   cd docs/sprint-<N>-<slug>
   cp T-spec-template.md T1-<name>.md
   cp T-spec-template.md T2-<name>.md
   cp T-spec-template.md T3-<name>.md
   cp T-spec-template.md T4-<name>.md
   rm T-spec-template.md
   ```

3. Fill in `STATUS.md` placeholders: `<N>`, `<Title>`, `<YYYY-MM-DD>`, mission, the terminal table, and the file ownership table.

4. Fill in each `T<n>-<name>.md`: goal, implementation steps, owned files, acceptance criteria.

5. Launch the 4+1 from a master TermDeck terminal, injecting each worker with its spec path:

   ```sh
   termdeck inject --panel T1 "You are T1 in Sprint <N>. Read docs/sprint-<N>-<slug>/T1-<name>.md and STATUS.md. Begin now."
   ```

   Repeat for T2–T4. The master terminal watches STATUS.md and unblocks workers as needed.
