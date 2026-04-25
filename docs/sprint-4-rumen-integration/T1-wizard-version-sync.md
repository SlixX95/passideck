# T1 — Wizard reads rumen version from package.json

## Why this matters

Right now `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` has a hardcoded `npm:@jhizzard/rumen@X.Y.Z` import. Every time the rumen package is republished, a human has to remember to bump the version string here and redeploy the Edge Function. Today's debugging session hit this twice — once when we went from 0.2.2 to 0.2.4, and again at 0.3.0. It's a reliability liability.

The fix: have the wizard read the installed rumen package version at deploy time and substitute it into the Edge Function source dynamically. Hardcoded version becomes a placeholder.

## Scope (T1 exclusive ownership)

You own these files. Do not touch anything outside this list.

- `packages/server/src/setup/init-rumen.js` — the wizard entry point
- `packages/server/src/setup/rumen/functions/rumen-tick/index.ts` — template file (you may edit the one line with the hardcoded version)

## Deliverable

After your work, the init-rumen wizard should:

1. Read `@jhizzard/rumen`'s current published version from npm (via `npm view @jhizzard/rumen version` or equivalent). This is the source of truth because the Edge Function runtime pulls from npm, not from local node_modules.
2. Substitute that version into a staged copy of the rumen-tick Edge Function source before deploying.
3. Log the version it chose so the user can see what got deployed: `→ Using rumen version: 0.3.4 (from npm registry)`.
4. Fall back gracefully if npm is unreachable — either error clearly ("Cannot reach npm registry — are you offline?") or use a pinned fallback version that's documented in init-rumen.js itself.

## Acceptance criteria

- [ ] `init-rumen.js` no longer depends on the version string literal in the Edge Function template. The template can keep a placeholder like `@jhizzard/rumen@__RUMEN_VERSION__` that gets substituted at deploy time, OR the template can import a version that gets overwritten before deploy.
- [ ] Running `termdeck init --rumen` prints a "Using rumen version: X.Y.Z" line before the deploy step.
- [ ] The wizard still deploys successfully end-to-end on a project where rumen is already deployed (idempotent re-run).
- [ ] If `npm view` fails (simulate with no network), the wizard either errors clearly or uses a documented fallback — whichever you choose, make the behavior explicit in the code comments.
- [ ] No hardcoded version strings remain in `rumen-tick/index.ts` for the import. The word "0.3.4" should not appear in the Edge Function source after your work.

## Non-goals

- Do NOT change the Edge Function's runtime behavior. This is purely a deployment-time version sync.
- Do NOT touch `packages/server/src/index.js`, `packages/client/public/index.html`, or anything else owned by T2/T3.
- Do NOT publish a new rumen package version. This is a termdeck-side change only.

## Testing

1. Run `node packages/cli/src/index.js init --rumen` against the existing petvetbid project. It should re-deploy the Edge Function using the latest npm-published rumen version (currently 0.3.4).
2. Hit the function with a manual POST:
   ```bash
   curl -X POST https://luvvbrpaopnblvxdxwzb.supabase.co/functions/v1/rumen-tick \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```
   Should return `{"ok":true, ...}`.
3. Verify no hardcoded version remains: `grep -rn "rumen@0" packages/server/src/setup/rumen/` should return zero results (or only match a placeholder, not a real version).

## Coordination

- Append all significant progress to `docs/sprint-4-rumen-integration/STATUS.md` using the entry format documented at the bottom of STATUS.md.
- When complete, write a `[T1] DONE` entry with a 1-line summary of what changed.
- If you hit anything ambiguous, write a BLOCKED entry and stop — don't guess.
