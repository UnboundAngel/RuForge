# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.7 (unreleased)
Last shipped to users: 0.1.6
Last updated: 2026-05-20
Status: in progress

## Now

0.1.6 is live on main updater.json and GitHub Release v0.1.6. Next work logs
under v0.1.7 (unreleased) in AGENTS.md. Open P0 is empty; Authorize Cleanup
(#8) works via the in-app modal (see Notes).

## What is new since last user release

Closed release 0.1.6 (what users on 0.1.6 receive). The release-note drafter
reads this for the last shipped delta, not the git tree. For the in-flight
0.1.7 cycle, mirror AGENTS.md Shipped log into this section after each ship
task until the ritual rolls the header.

**0.1.6 shipped:**

Additions:
- Mini player micro and compact layouts (window height down to 70px).
- Explorer back, forward, and reload in the title bar.
- Video poster thumbnails when switching tracks.
- Mini player Video Library browse mode (430x275, no resize while browsing).

Fixes:
- Audio visualizer crash when toggling play/pause.
- Sidebar collapse label flash while the rail narrows.

**0.1.7 unreleased:** (see AGENTS.md Shipped log, keep in sync)

(none yet)

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. F-12 estimate accuracy. get_video_info simulate ignores format and cookies,
   produces wildly wrong size estimates. Prerequisite for storage-check (#10).
2. ETA smoothing (#9). Rolling average over last N progress samples instead of
   instantaneous rate.
3. 429 / rate-limit spacing (#11). Configurable delay between job starts (not retry-on-failure).

## Notes (not P0)

- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +
  delete_media_batch toward ~75% of the storage cap. The legacy Rust
  authorize_cleanup command is not used by the UI. Do not list this as broken.

## Project reference (static, rarely changes)

Core value: local YouTube downloader and player. The downloader is the wedge.
Player, gallery, Explorer support that story. Not a Plex competitor.
Stack: Tauri v2, Rust, React 19, TypeScript, Zustand, yt-dlp.
Windows: two webviews, main and mini, optional explorer. Zustand does not span
webviews. Cross-window sync is Tauri emit/listen only.
Version triplet must stay aligned every bump: package.json,
src-tauri/tauri.conf.json, src-tauri/Cargo.toml.
Zustand audit doc (cite, do not restate inline):
c:\Users\Attic\.cursor\plans\zustand_migration_audit_53cd5b61.plan.md
