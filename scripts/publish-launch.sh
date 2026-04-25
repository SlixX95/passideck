#!/usr/bin/env bash
# publish-launch.sh — TermDeck launch-day helper
#
# Three modes:
#   --check    Run pre-launch verification (T-24h)
#   --launch   Open every composer URL in sequence (T=0)
#   --monitor  Open post-launch monitoring dashboards (T+1h)
#
# With no flag, runs --check by default.
#
# Companion doc: docs/launch/PUBLISH-PIPELINE.md

set -u  # unset vars are errors; we do NOT use -e because failed checks must not abort the rest of the report

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_DIR="${REPO_ROOT}/docs/launch"

EXPECTED_VERSION="0.3.7"
NPM_PKG="@jhizzard/termdeck"
DOCS_URL="https://termdeck-docs.vercel.app"
GIF_URL="https://raw.githubusercontent.com/jhizzard/termdeck/main/docs/screenshots/flashback-demo.gif"
REPO_URL="https://github.com/jhizzard/termdeck"
NPM_URL="https://www.npmjs.com/package/${NPM_PKG}"

# ANSI colours — skip them when output is not a TTY.
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_BOLD=""; C_RESET=""
fi

# macOS `open` vs Linux `xdg-open`. Fall back to printing the URL.
open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  else
    echo "  (open manually) $url"
  fi
}

pass() { echo "${C_GREEN}PASS${C_RESET}  $*"; }
fail() { echo "${C_RED}FAIL${C_RESET}  $*"; FAILURES=$((FAILURES+1)); }
warn() { echo "${C_YELLOW}WARN${C_RESET}  $*"; }
head1() { echo ""; echo "${C_BOLD}== $* ==${C_RESET}"; }

FAILURES=0

do_check() {
  head1 "Pre-launch verification"

  # 1. npm shows the expected version
  local npm_version
  npm_version="$(npm view "${NPM_PKG}" version 2>/dev/null)"
  if [ "${npm_version}" = "${EXPECTED_VERSION}" ]; then
    pass "npm ${NPM_PKG} == ${EXPECTED_VERSION}"
  else
    fail "npm ${NPM_PKG} expected ${EXPECTED_VERSION}, got '${npm_version}'"
  fi

  # 2. Docs site is reachable
  local docs_code
  docs_code="$(curl -s -o /dev/null -w '%{http_code}' -I --max-time 10 "${DOCS_URL}" || true)"
  if [ "${docs_code}" = "200" ] || [ "${docs_code}" = "301" ] || [ "${docs_code}" = "308" ]; then
    pass "docs site reachable (HTTP ${docs_code}) — ${DOCS_URL}"
  else
    fail "docs site unreachable (HTTP ${docs_code}) — ${DOCS_URL}"
  fi

  # 3. Flashback GIF loads
  local gif_code
  gif_code="$(curl -s -o /dev/null -w '%{http_code}' -I --max-time 10 "${GIF_URL}" || true)"
  if [ "${gif_code}" = "200" ]; then
    pass "flashback GIF reachable (HTTP 200) — ${GIF_URL}"
  else
    fail "flashback GIF missing (HTTP ${gif_code}) — ${GIF_URL}"
  fi

  # 4. GitHub repo is public
  local repo_code
  repo_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${REPO_URL}" || true)"
  if [ "${repo_code}" = "200" ]; then
    pass "repo public (HTTP 200) — ${REPO_URL}"
  else
    fail "repo not public (HTTP ${repo_code}) — ${REPO_URL}"
  fi

  # 5. Launch source files exist
  local missing=0
  for f in show-hn-post.md twitter-thread.md linkedin-post.md devto-draft.md PUBLISH-PIPELINE.md; do
    if [ -f "${LAUNCH_DIR}/${f}" ]; then
      pass "source file present — docs/launch/${f}"
    else
      fail "source file missing — docs/launch/${f}"
      missing=$((missing+1))
    fi
  done

  # 6. Git tag exists locally (best-effort)
  if git -C "${REPO_ROOT}" tag -l "v${EXPECTED_VERSION}" | grep -q "v${EXPECTED_VERSION}"; then
    pass "git tag v${EXPECTED_VERSION} exists locally"
  else
    warn "git tag v${EXPECTED_VERSION} not found locally (may still exist on origin)"
  fi

  head1 "Summary"
  if [ "${FAILURES}" -eq 0 ]; then
    echo "${C_GREEN}${C_BOLD}Pre-launch checks passed.${C_RESET}"
    echo ""
    echo "Next: run  ./scripts/publish-launch.sh --launch  at T=0."
    return 0
  else
    echo "${C_RED}${C_BOLD}${FAILURES} check(s) failed.${C_RESET}"
    echo "Fix the failures above before launching."
    return 1
  fi
}

do_launch() {
  head1 "Opening composer URLs"
  echo "Post in this order (see docs/launch/PUBLISH-PIPELINE.md):"
  echo ""
  echo "  1. Hacker News Show HN   (T+0 min)   — source: docs/launch/show-hn-post.md"
  echo "     * Post the first comment IMMEDIATELY after submitting."
  open_url "https://news.ycombinator.com/submit"
  echo ""
  echo "  2. Twitter / X thread    (T+5 min)   — source: docs/launch/twitter-thread.md"
  echo "     * Attach flashback-demo.gif to tweet 5."
  open_url "https://twitter.com/compose/tweet"
  echo ""
  echo "  3. LinkedIn post         (T+10 min)  — source: docs/launch/linkedin-post.md"
  open_url "https://www.linkedin.com/feed/"
  echo ""
  echo "  4. Facebook post         (T+15 min)  — source: docs/launch/PUBLISH-PIPELINE.md (FB template)"
  echo "     * PRIMARY reach channel. Use the personal-tone template, not LinkedIn copy."
  echo "     * Attach flashback-demo.gif as main media."
  open_url "https://www.facebook.com/"
  echo ""
  echo "  5. Instagram story       (T+20 min)  — source: docs/launch/PUBLISH-PIPELINE.md (IG template)"
  echo "     * PRIMARY reach channel. Stories are mobile-only — use the IG app."
  echo "     * Update link-in-bio to ${REPO_URL} first."
  echo ""
  echo "  6. dev.to article        (T+25 min)  — source: docs/launch/devto-draft.md"
  echo "     * Set  published: true  in the front-matter."
  open_url "https://dev.to/new"
  echo ""
  head1 "Copy-paste sources"
  echo "  Show HN:   ${LAUNCH_DIR}/show-hn-post.md"
  echo "  Twitter:   ${LAUNCH_DIR}/twitter-thread.md"
  echo "  LinkedIn:  ${LAUNCH_DIR}/linkedin-post.md"
  echo "  dev.to:    ${LAUNCH_DIR}/devto-draft.md"
  echo "  Facebook:  ${LAUNCH_DIR}/PUBLISH-PIPELINE.md  (Facebook post template)"
  echo "  Instagram: ${LAUNCH_DIR}/PUBLISH-PIPELINE.md  (Instagram story template)"
  echo "  Comments:  ${LAUNCH_DIR}/comment-playbook.md"
  echo ""
  echo "${C_BOLD}Good luck. Post the HN first comment without waiting.${C_RESET}"
}

do_monitor() {
  head1 "Opening post-launch dashboards"
  echo "  * Hacker News new submissions (find your thread): https://news.ycombinator.com/newest"
  open_url "https://news.ycombinator.com/newest"
  echo "  * Twitter analytics:                                https://analytics.twitter.com/"
  open_url "https://analytics.twitter.com/"
  echo "  * GitHub traffic:                                   ${REPO_URL}/graphs/traffic"
  open_url "${REPO_URL}/graphs/traffic"
  echo "  * npm download stats:                               ${NPM_URL}"
  open_url "${NPM_URL}"
  echo ""
  echo "Monitoring checklist (from PUBLISH-PIPELINE.md):"
  echo "  T+1h   Respond to HN comments. Acknowledge → answer → admit limits. No marketing language."
  echo "  T+3h   If HN score ≥ 10, cross-link from Twitter + FB."
  echo "  T+6h   Post to r/commandline and r/selfhosted (adapt Show HN)."
  echo "  T+24h  Snapshot results to docs/launch/LAUNCH-STATUS-\$(date +%Y-%m-%d).md."
}

usage() {
  cat <<EOF
publish-launch.sh — TermDeck launch-day helper

Usage:
  $0 [--check|--launch|--monitor|-h|--help]

Modes:
  --check     Run pre-launch verification (default)
  --launch    Open every composer URL in posting order
  --monitor   Open post-launch monitoring dashboards

See docs/launch/PUBLISH-PIPELINE.md for the full playbook.
EOF
}

MODE="${1:---check}"
case "${MODE}" in
  --check)    do_check ;;
  --launch)   do_launch ;;
  --monitor)  do_monitor ;;
  -h|--help)  usage ;;
  *)          usage; exit 2 ;;
esac
