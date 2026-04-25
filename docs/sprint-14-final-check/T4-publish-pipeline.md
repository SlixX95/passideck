# T4 — Automated Publishing Pipeline

## Goal

Create a publish pipeline doc and a helper script that makes launch day as mechanical as possible.

## Deliverables

### 1. `docs/launch/PUBLISH-PIPELINE.md` (new)

Document the exact steps for publishing to each channel, with copy-paste text and links:

**Pre-launch (T-24h):**
- [ ] Confirm npm shows 0.3.7: `npm view @jhizzard/termdeck version`
- [ ] Confirm docs site is live: `curl -sI https://termdeck-docs.vercel.app`
- [ ] Confirm GIF loads: `curl -sI https://raw.githubusercontent.com/jhizzard/termdeck/main/docs/screenshots/flashback-demo.gif`
- [ ] Collect tester feedback from David/Jonathan/Yasin
- [ ] Create HN account if needed, build minimal karma

**Launch sequence (T=0):**
1. Post Show HN (title + body from `docs/launch/show-hn-post.md`)
2. Immediately post first comment (from show-hn-post.md)
3. Post Twitter thread (from `docs/launch/twitter-thread.md`) — attach GIF to tweet 5
4. Post LinkedIn (from `docs/launch/linkedin-post.md`)
5. Post Facebook (adapt LinkedIn post for FB audience — more personal, less jargon)
6. Post Instagram story with GIF + link in bio
7. Post dev.to article (from `docs/launch/devto-draft.md`) — set `published: true`

**Post-launch (T+1h to T+24h):**
- Monitor HN comments, respond to questions
- Cross-link HN post from Twitter/LinkedIn if it gets traction
- Post to r/commandline and r/selfhosted after HN has a score

### 2. `scripts/publish-launch.sh` (new)

A helper that verifies pre-launch conditions and opens the right URLs:

```bash
#!/bin/bash
# Pre-launch verification + URL opener
echo "Pre-launch checks..."
npm view @jhizzard/termdeck version
curl -sI https://termdeck-docs.vercel.app | head -1
curl -sI https://raw.githubusercontent.com/jhizzard/termdeck/main/docs/screenshots/flashback-demo.gif | head -1
echo ""
echo "Opening publishing URLs..."
open "https://news.ycombinator.com/submit"
open "https://twitter.com/compose/tweet"
open "https://www.linkedin.com/feed/"
open "https://dev.to/new"
echo ""
echo "Copy-paste sources:"
echo "  Show HN:  docs/launch/show-hn-post.md"
echo "  Twitter:   docs/launch/twitter-thread.md"
echo "  LinkedIn:  docs/launch/linkedin-post.md"
echo "  dev.to:    docs/launch/devto-draft.md"
echo "  Facebook:  adapt LinkedIn post (more personal, less jargon)"
```

Keep it simple — verification + URL opener + copy-paste pointers.

## Files you own
- docs/launch/PUBLISH-PIPELINE.md (create)
- scripts/publish-launch.sh (create)

## Acceptance criteria
- [ ] PUBLISH-PIPELINE.md has pre-launch, launch, and post-launch sections
- [ ] scripts/publish-launch.sh runs the pre-checks and opens URLs
- [ ] Facebook and Instagram included (Josh's strongest channels)
- [ ] Write [T4] DONE to STATUS.md
