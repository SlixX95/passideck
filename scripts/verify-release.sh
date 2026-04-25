#!/usr/bin/env bash
# verify-release.sh — pre-publish sanity check for @jhizzard/termdeck.
#
# Runs a fixed battery of checks and prints PASS/FAIL for each.
# Exits 0 only when every critical check passes; 1 otherwise.
#
# Usage:
#   ./scripts/verify-release.sh

set -u

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# Color helpers (no-op when not a TTY).
if [ -t 1 ]; then
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  GREEN=''
  RED=''
  BOLD=''
  RESET=''
fi

fail=0
checks_passed=0
checks_failed=0

pass() {
  echo "${GREEN}PASS${RESET} — $1"
  checks_passed=$((checks_passed + 1))
}

fail_check() {
  echo "${RED}FAIL${RESET} — $1"
  if [ -n "${2:-}" ]; then
    echo "       $2"
  fi
  checks_failed=$((checks_failed + 1))
  fail=1
}

section() {
  echo ""
  echo "${BOLD}$1${RESET}"
}

# ----------------------------------------------------------------------------
# 1. package.json version matches latest CHANGELOG.md entry
# ----------------------------------------------------------------------------
section "1. Version alignment (package.json ↔ CHANGELOG.md)"

if [ ! -f package.json ]; then
  fail_check "package.json present" "missing at repo root"
elif [ ! -f CHANGELOG.md ]; then
  fail_check "CHANGELOG.md present" "missing at repo root"
else
  pkg_version=$(grep -E '^[[:space:]]*"version"[[:space:]]*:' package.json \
    | head -n1 \
    | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')

  # Latest released entry = first "## [X.Y.Z]" heading that isn't "[Unreleased]".
  latest_changelog_version=$(grep -E '^## \[[0-9]' CHANGELOG.md \
    | head -n1 \
    | sed -E 's/^## \[([^]]+)\].*/\1/')

  if [ -z "$pkg_version" ]; then
    fail_check "package.json version parseable" "could not extract version field"
  elif [ -z "$latest_changelog_version" ]; then
    fail_check "CHANGELOG.md has a released entry" 'no "## [X.Y.Z]" heading found'
  elif [ "$pkg_version" != "$latest_changelog_version" ]; then
    fail_check "package.json version matches latest CHANGELOG entry" \
      "package.json=$pkg_version  CHANGELOG=$latest_changelog_version"
  else
    pass "package.json version $pkg_version matches latest CHANGELOG entry"
  fi
fi

# ----------------------------------------------------------------------------
# 2. Working tree clean (no uncommitted changes)
# ----------------------------------------------------------------------------
section "2. Working tree clean"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail_check "git repository present" "not inside a git work tree"
else
  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    fail_check "git status --porcelain is empty" "uncommitted changes present:"
    echo "$dirty" | sed 's/^/         /'
  else
    pass "no uncommitted changes"
  fi
fi

# ----------------------------------------------------------------------------
# 3. node -c parses every .js file in packages/
# ----------------------------------------------------------------------------
section "3. node -c parse check (packages/**/*.js)"

if [ ! -d packages ]; then
  fail_check "packages/ directory present" "missing"
else
  parse_failed=0
  parse_files=0
  while IFS= read -r -d '' js_file; do
    parse_files=$((parse_files + 1))
    if ! node -c "$js_file" 2>/tmp/verify-release-parse.err; then
      fail_check "parse $js_file" "$(head -n1 /tmp/verify-release-parse.err)"
      parse_failed=1
    fi
  done < <(find packages -type f -name '*.js' \
    -not -path '*/node_modules/*' \
    -print0)

  if [ "$parse_files" -eq 0 ]; then
    fail_check "found JS files to parse" "no .js files under packages/"
  elif [ "$parse_failed" -eq 0 ]; then
    pass "all $parse_files JS files under packages/ parse cleanly"
  fi
  rm -f /tmp/verify-release-parse.err
fi

# ----------------------------------------------------------------------------
# 4. scripts/lint-docs.sh passes
# ----------------------------------------------------------------------------
section "4. Documentation lint (scripts/lint-docs.sh)"

if [ ! -x scripts/lint-docs.sh ] && [ ! -f scripts/lint-docs.sh ]; then
  fail_check "scripts/lint-docs.sh present" "missing"
else
  if bash scripts/lint-docs.sh >/tmp/verify-release-lint.out 2>&1; then
    pass "lint-docs.sh passed"
  else
    fail_check "lint-docs.sh passed" "see output:"
    sed 's/^/         /' /tmp/verify-release-lint.out
  fi
  rm -f /tmp/verify-release-lint.out
fi

# ----------------------------------------------------------------------------
# 5. node --test on tests/*.test.js (skip if none)
# ----------------------------------------------------------------------------
section "5. Test suite (node --test tests/*.test.js)"

shopt -s nullglob
test_files=(tests/*.test.js)
shopt -u nullglob

if [ "${#test_files[@]}" -eq 0 ]; then
  echo "SKIP — no tests/*.test.js files found"
else
  if node --test "${test_files[@]}" >/tmp/verify-release-test.out 2>&1; then
    pass "${#test_files[@]} test file(s) passed"
  else
    fail_check "node --test tests/*.test.js" "see output (last 30 lines):"
    tail -n 30 /tmp/verify-release-test.out | sed 's/^/         /'
  fi
  rm -f /tmp/verify-release-test.out
fi

# ----------------------------------------------------------------------------
# 6. bin entry has a valid shebang
# ----------------------------------------------------------------------------
section "6. bin entry shebang"

bin_path="packages/cli/src/index.js"
if [ ! -f "$bin_path" ]; then
  fail_check "$bin_path present" "missing"
else
  first_line=$(head -n1 "$bin_path")
  case "$first_line" in
    '#!/usr/bin/env node'|'#!/usr/bin/node')
      pass "$bin_path has shebang: $first_line"
      ;;
    '#!'*)
      fail_check "$bin_path shebang is a node interpreter" \
        "found: $first_line"
      ;;
    *)
      fail_check "$bin_path starts with a shebang line" \
        "first line: $first_line"
      ;;
  esac
fi

# ----------------------------------------------------------------------------
# 7. files[] in package.json includes all expected publish paths
# ----------------------------------------------------------------------------
section "7. package.json files[] coverage"

# Paths that must be reachable from the files[] globs. Edit this list when the
# publish surface changes.
expected_paths=(
  "packages/cli/src/index.js"
  "packages/server/src/index.js"
  "packages/client/public/index.html"
  "config/config.example.yaml"
  "config/secrets.env.example"
  "LICENSE"
  "README.md"
)

if [ ! -f package.json ]; then
  fail_check "package.json present" "missing"
else
  # Use `npm pack --dry-run --json` for an authoritative list of files npm
  # would publish. Fall back to a substring match against the raw files[]
  # array if npm is unavailable or pack fails.
  pack_listing=""
  if command -v npm >/dev/null 2>&1; then
    pack_listing=$(npm pack --dry-run --json 2>/dev/null \
      | node -e '
        let d = "";
        process.stdin.on("data", c => d += c);
        process.stdin.on("end", () => {
          try {
            const j = JSON.parse(d);
            const arr = Array.isArray(j) ? j : [j];
            for (const entry of arr) {
              if (entry && Array.isArray(entry.files)) {
                for (const f of entry.files) console.log(f.path);
              }
            }
          } catch (_) { /* fall through */ }
        });
      ' 2>/dev/null || true)
  fi

  files_missing=0
  if [ -n "$pack_listing" ]; then
    for ep in "${expected_paths[@]}"; do
      if ! printf '%s\n' "$pack_listing" | grep -qxF "$ep"; then
        fail_check "files[] would publish $ep" "not in npm pack --dry-run output"
        files_missing=1
      fi
    done
    if [ "$files_missing" -eq 0 ]; then
      pass "all ${#expected_paths[@]} expected paths are included by files[] (verified via npm pack --dry-run)"
    fi
  else
    # Fallback: ensure every expected path either exists in the raw files[]
    # block verbatim or is matched by a `**` glob prefix in that block.
    files_block=$(node -e '
      const pkg = require("./package.json");
      const files = pkg.files || [];
      console.log(files.join("\n"));
    ' 2>/dev/null || true)

    if [ -z "$files_block" ]; then
      fail_check "files[] readable from package.json" "could not parse"
    else
      for ep in "${expected_paths[@]}"; do
        matched=0
        while IFS= read -r entry; do
          [ -z "$entry" ] && continue
          # Strip trailing /** or /* for prefix comparison.
          prefix="${entry%/\*\*}"
          prefix="${prefix%/\*}"
          if [ "$entry" = "$ep" ] || [ "$prefix" = "$ep" ]; then
            matched=1; break
          fi
          # Glob prefix match: ep starts with prefix + "/".
          case "$ep" in
            "$prefix"/*) matched=1; break ;;
          esac
        done <<< "$files_block"

        if [ "$matched" -eq 0 ]; then
          fail_check "files[] covers $ep" "no entry in package.json files[] matches"
          files_missing=1
        fi
      done
      if [ "$files_missing" -eq 0 ]; then
        pass "all ${#expected_paths[@]} expected paths are covered by files[] (npm not available, used glob match)"
      fi
    fi
  fi
fi

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
echo ""
echo "${BOLD}Summary${RESET}: ${GREEN}${checks_passed} passed${RESET}, ${RED}${checks_failed} failed${RESET}"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "${RED}${BOLD}DO NOT PUBLISH${RESET} — fix the failures above and re-run."
  exit 1
fi

echo ""
echo "${GREEN}${BOLD}OK to publish.${RESET}"
exit 0
