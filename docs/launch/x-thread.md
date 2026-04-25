# X thread — TermDeck product launch

**Target:** X (Twitter) — pin to profile
**Posting time:** 5 minutes after the Show HN post lands
**Audience:** devtools-on-X + MCP-interested dev community
**Distinct from:** `docs/launch/blog-post-4plus1-orchestration.md` and `docs/launch/x-thread-orchestration.md` (the "how I built it" meta track). This thread is the **product** launch.

---

## Tweet 1 (hero — GIF + one-line pitch)

> I built a terminal that remembers what you fixed last month.
>
> [Flashback GIF — docs/screenshots/flashback-demo.gif]
>
> When a panel hits an error, TermDeck automatically surfaces similar fixes from your memory across every project you've worked on. You don't ask. You don't search. It notices.

**Character count:** ~270 chars (safe under X's 280 limit for text). GIF goes in the media attachment, doesn't count.

---

## Tweet 2 (the moment — the Tuesday story)

> The moment that earned the feature its name:
>
> I was 3 minutes into debugging a Postgres foreign-key migration error when a memory I'd written 6 weeks ago on a different project surfaced in the corner of the panel. I was about to spend 40 minutes on it. It took 10 seconds instead.
>
> I call it Flashback.

**Character count:** ~290. Trim "6 weeks" → "weeks" if over, or tighten the second sentence.

---

## Tweet 3 (the stack — three bullets)

> The stack. Three MIT packages that work together or standalone:
>
> → TermDeck — browser terminal multiplexer w/ 7 layouts, 8 themes, Flashback
> → Mnestra — persistent dev memory MCP server (Claude Code, Cursor, Windsurf, Cline, Continue)
> → Rumen — async learning layer, runs on a cron
>
> Node 18+.

**Character count:** ~275.

---

## Tweet 4 (install — one command)

> Install:
>
> npx @jhizzard/termdeck
>
> That's it. Three commands if you count opening the browser and picking a layout.
>
> Tier 1 (local multiplexer + metadata) is zero-config. Tier 2 (Flashback + Mnestra memory) is one wizard. Tier 3 (Rumen async learning) is one more.
>
> Docs: https://termdeck-docs.vercel.app

**Character count:** ~280. Tight.

---

## Tweet 5 (why — the honest framing)

> I built this because I was losing real hours to the same errors on different projects. Not a theoretical problem — a bad Tuesday I had one too many times.
>
> Flashback has caught 6 real ones for me in the past week. One developer's scale — not validation at multi-user scale yet. But it's real to me.
>
> github.com/jhizzard/termdeck

**Character count:** ~290.

---

## Notes for Josh

- **Do not post until the Show HN is live.** X thread goes up 5 minutes after HN so the two signals stack without fragmenting the first-hour rush.
- **Pin tweet 1 to your profile** for the first 72 hours.
- **Reply pattern:** the X thread usually gets less traction than HN for cold launches. Expect ~5–15 replies in the first hour, up to ~50 if HN amplifies it. Respond to every reply within 30 min for the first 4 hours (same rule as HN).
- **GIF format:** X accepts GIFs up to 15 MB, 1280×720 preferred. If the GIF hits the 4 MB GitHub README limit but is still under 15 MB, post the larger version on X.
- **Numbers to verify before posting:** "6 real ones in the past week" — this appears in both tweet 5 and the Show HN body. Keep them consistent. If Josh's actual Flashback-firing count differs, update both files simultaneously.
- **Tuesday story framing:** tweet 2 says "Postgres foreign-key migration error." If Josh has a more specific real story (the exact project, the exact error message), swap that in. Concrete beats generic.
- **Bluesky cross-post:** same copy, post simultaneously to Bluesky (`bsky.app/profile/jhizzard.bsky.social` or whichever handle Josh uses). Bluesky gets the indie devtools crowd that X has partially lost.

---

**End of x-thread.md.**
