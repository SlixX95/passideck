#!/bin/bash
# Bump TermDeck version across package.json + all active docs in one command.
# Usage: ./scripts/bump-version.sh 0.3.7
#
# Updates package.json and replaces the OLD version with the NEW version
# across all active docs. Does NOT touch sprint STATUS logs or historical
# narrative files.

set -e

NEW_VERSION="$1"
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: ./scripts/bump-version.sh <new-version>"
  echo "Example: ./scripts/bump-version.sh 0.3.7"
  exit 1
fi

# Read current version from package.json
OLD_VERSION=$(node -e "process.stdout.write(require('./package.json').version)")

if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  echo "Already at $NEW_VERSION — nothing to do."
  exit 0
fi

echo "Bumping $OLD_VERSION → $NEW_VERSION"
echo ""

# 1. Update package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ package.json"

# 2. Active docs to update (NOT sprint STATUS logs, NOT historical narrative)
DOCS=(
  CHANGELOG.md
  CLAUDE.md
  README.md
  docs/LAUNCH-READINESS.md
  docs/GETTING-STARTED.md
  docs/launch/show-hn-post.md
  docs/launch/twitter-thread.md
  docs/launch/linkedin-post.md
  docs/launch/devto-draft.md
  docs/launch/comment-playbook.md
  docs/launch/tester-brief.md
  docs/launch/blog-post-rumen.md
  docs/CONTRADICTIONS.md
)

UPDATED=0
for f in "${DOCS[@]}"; do
  if [ -f "$f" ] && grep -q "$OLD_VERSION" "$f" 2>/dev/null; then
    sed -i '' "s/${OLD_VERSION}/${NEW_VERSION}/g" "$f"
    UPDATED=$((UPDATED + 1))
    echo "  ✓ $f"
  fi
done

echo ""
echo "Done: package.json + $UPDATED docs updated from $OLD_VERSION to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Add a [$NEW_VERSION] entry to CHANGELOG.md"
echo "  2. git add -A && git commit -m 'v$NEW_VERSION: <summary>'"
echo "  3. git push origin main"
echo "  4. npm publish --access public --auth-type=web"
