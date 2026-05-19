# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.6 (unreleased)
Last shipped to users: 0.1.5
Last updated: 2026-05-18
Status: in progress

## Now

0.1.5 is live on main updater.json. Work toward 0.1.6 is in the Shipped log
in AGENTS.md (explorer titlebar nav, sidebar collapse label fix, mini player
responsive tiers, and any new lines appended there). No 0.1.6 release ritual
yet. Open P0 is empty; Authorize Cleanup (#8) works via the in-app modal (see
Notes).

Known version split (do not trust the 0.1.6 header blindly): live users are
on 0.1.5, STATE targets 0.1.6 unreleased, but package.json / tauri.conf.json
/ Cargo.toml and the AGENTS.md Shipped log header still read 0.1.5
(unreleased). The triplet is the base of record until aligned. A dedicated
alignment pass (Iteration 3 or 4) rolls the triplet and AGENTS.md Shipped
header to 0.1.6 unreleased. Until then, do not bump versions off the STATE
header alone.

## What is new since last user release

Closed release 0.1.5 (what users on 0.1.5 received). The release-note drafter
reads this for the last shipped delta, not the git tree. For the in-flight
0.1.6 cycle, mirror AGENTS.md Shipped log into this section after each ship
task until the ritual rolls the header.

**0.1.5 shipped:**

Additions:
- Audio-only download mode. Toggle extracts audio only, no video file on disk.
- Processing phase. Queue row and hero show "Processing" while ffmpeg extracts.
- In-app delete confirm modal. Replaces native confirm() which is dead in WebView2.
- Duplicate skip feedback. "Already in library" then row removes.

Fixes:
- Ghost queue rows on library delete. Queue job removed when its file is deleted.
- Hero URL not clearing after download. Clears when finished URL matches hero.
- Double-dot sidecar bug. Scanner now finds Title..info.json, fixes ~43% of
  library entries that had null sourceUrl.

**0.1.6 unreleased (see AGENTS.md Shipped log, keep in sync):**
- Explorer title bar. Back, forward, reload in ExplorerTitlebarNav flush at
  sidebar edge; queue stays in WindowControls.
- Sidebar collapse label. No popLayout flash while the rail narrows.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Mini player responsive layouts. Spotify-like micro/compact/bar tiers; scale
   chrome and controls with window size; lower min window size.
2. F-12 estimate accuracy. get_video_info simulate ignores format and cookies,
   produces wildly wrong size estimates. Prerequisite for storage-check (#10).
3. ETA smoothing (#9). Rolling average over last N progress samples instead of
   instantaneous rate.

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
