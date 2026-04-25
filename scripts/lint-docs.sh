#!/usr/bin/env bash
# lint-docs.sh — guardrails for TermDeck documentation hygiene.
#
# Checks:
#   1. No bare "Engram" or "Mnemos" in live user-facing Markdown.
#      Historical narratives, sprint logs, the name-dispute records, and the
#      NAMING-DECISIONS.md explainer are excluded. Lines that say "formerly",
#      "renamed from", or otherwise flag the reference as historical are
#      allowed.
#   2. The version in package.json must appear verbatim in CHANGELOG.md.

set -u
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

fail=0

# ----------------------------------------------------------------------------
# 1. Stale-naming check
# ----------------------------------------------------------------------------
#
# Path exclusions cover:
#   - docs/launch/NAMING-DECISIONS.md   (the canonical rename explainer)
#   - docs/launch/                      (launch narrative drafts; all discuss
#                                        the rename as part of their story)
#   - docs/sprint-*/                    (sprint specs + append-only logs)
#   - docs/name-dispute*                (name-dispute research record)
#   - docs/DOCS-HYGIENE-ROADMAP-TO-10.md (the audit that flagged this drift)
#   - docs/rumen-deploy-log.md          (historical deploy log)
#   - docs/SESSION-STATUS-*.md          (historical session logs)
#   - docs/tier2-verification.md        (historical verification log)
#   - docs/STATUS.md                    (repo-level append-only status log)
#   - docs/CONTRADICTIONS.md            (meta-doc; lists the names by design)
#   - docs/screenshots/                 (asset captions that cite the rename)
#   - docs-site/src/content/docs/engram/** (Sprint 8 migration scope; see
#                                        CONTRADICTIONS.md entry #6)
#   - docs-site/src/content/docs/termdeck/docs/** (mirrors historical docs/*)
#   - SESSION-HISTORY.md, PLAN-rename-and-architecture.md (historical)
#   - node_modules/, dist/, .git/
#
# Line-level exclusions: lines whose context marks them as historical.

excluded_paths_regex='(^\./node_modules/|/node_modules/|^\./dist/|^\./\.git/|^\./docs/launch/|^\./docs/sprint-|^\./docs/name-dispute|^\./docs/DOCS-HYGIENE-ROADMAP-TO-10\.md$|^\./docs/rumen-deploy-log\.md$|^\./docs/SESSION-STATUS-|^\./docs/tier2-verification\.md$|^\./docs/STATUS\.md$|^\./docs/CONTRADICTIONS\.md$|^\./docs/screenshots/|^\./docs-site/src/content/docs/engram/|^\./docs-site/src/content/docs/rumen/|^\./docs-site/src/content/docs/termdeck/docs/|^\./SESSION-HISTORY\.md$|^\./PLAN-rename-and-architecture\.md$)'

md_files=$(find . -type f \( -name '*.md' -o -name '*.mdx' \) 2>/dev/null \
  | grep -Ev "$excluded_paths_regex" || true)

stale_hits=""
if [ -n "$md_files" ]; then
  # grep returns non-zero when no match, which is the happy path; allow it.
  stale_hits=$(printf '%s\n' "$md_files" | xargs grep -nE '\b(Engram|Mnemos)\b' 2>/dev/null \
    | grep -Eiv '(formerly|renamed|rename|→|->|deprecated|historical|pivot|dispute|red|🔴|was (the )?name|old name|previous name|prior name|earlier name|before .*(mnestra|rename)|the first name|fourth attempt|four-candidate)' \
    || true)
fi

if [ -n "$stale_hits" ]; then
  echo "FAIL: stale 'Engram' or 'Mnemos' references found in live docs:"
  echo "$stale_hits"
  echo ""
  echo "Fix by replacing with 'Mnestra', or — if the reference is historical —"
  echo "add 'formerly', 'renamed from', or equivalent context on the same line."
  echo "If the file is an intentional historical record, add its path to the"
  echo "exclusion list in scripts/lint-docs.sh."
  fail=1
else
  echo "OK: no stale Engram/Mnemos references in live docs."
fi

# ----------------------------------------------------------------------------
# 2. CHANGELOG / package.json version alignment
# ----------------------------------------------------------------------------

if [ ! -f package.json ]; then
  echo "FAIL: package.json not found at repo root."
  fail=1
else
  pkg_version=$(grep -E '^[[:space:]]*"version"[[:space:]]*:' package.json \
    | head -n1 \
    | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')

  if [ -z "$pkg_version" ]; then
    echo "FAIL: could not parse version from package.json."
    fail=1
  elif [ ! -f CHANGELOG.md ]; then
    echo "FAIL: CHANGELOG.md missing (package.json version is $pkg_version)."
    fail=1
  elif ! grep -qF "$pkg_version" CHANGELOG.md; then
    echo "FAIL: package.json version $pkg_version does not appear in CHANGELOG.md."
    echo "Add a release entry for $pkg_version before publishing."
    fail=1
  else
    echo "OK: CHANGELOG.md contains package.json version $pkg_version."
  fi
fi

exit $fail
