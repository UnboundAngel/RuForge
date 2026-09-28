# Handoff: Channel watchlist + notification center

Branch: `feature/channel-watchlist` (never push this work to main).

Plan: `docs/ruforge/plans/channel-watchlist-plan.md`. Read its "Context for the builder" and "Build protocol" sections, then find the first unchecked phase and build only that phase.

## What this is

- Follow YouTube channels. A Rust poller reads each channel's public RSS feed (no cookies, no yt-dlp rate gate) and records new uploads.
- New uploads land in a new global notification center: a bell in the title bar, shown in every mode. Download notifications move there too, and the future download history log will live there.
- Optional per-channel auto-download: video at preferred quality, respecting the storage cap.
- Other surfaces: a "New from channels you follow" shelf on Library home, an unread badge on the Videos rail item, and a desktop island notice with collapsed and expanded states when the app is hidden.

## Decisions Angel already made

- The bell is the global notification center, not a watchlist-only widget.
- No Shorts anywhere. Filter them out when uploads come in.
- Premieres and livestreams are announced when scheduled. Only the auto-download waits until they're normal videos.
- Opening the popover over the Explorer must not pause the Explorer video.
- The rail badge goes on Videos.

## Protocol per session

1. Read `STATE.md`, root `AGENTS.md`, then the plan.
2. Build one phase and run its verification.
3. Tick the phase in the plan. Then run `git add -A`, commit `watchlist: phase N <summary>`, `git push`, and `gh pr comment` on the draft PR with what landed and what's next.
4. No force push, no main, no emdashes.
