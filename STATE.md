# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.7 (unreleased)
Last shipped to users: 0.1.6
Last updated: 2026-05-21
Status: in progress

## Now

0.1.6 is live on main updater.json and GitHub Release v0.1.6. Next work logs
under v0.1.7 (unreleased) in AGENTS.md. Open P0 is empty; Authorize Cleanup
(#8) works via the in-app modal (see Notes).

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

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

- Downloader hero progress: 0/100 flank the bar only (no traveling percent); speed/time under the bar instead of bottom-right.
- Downloader URL chip: paperclip hidden when URL left the queue; bar hero clears on remove if no row matches; pinned chips pruned with queue.
- Downloader UI: collapsible queue redesigned as a slide-out pop-up that sits on the right screen edge; hoisted active card z-indices for perfect tooltip visibility.
- Downloader UI: redesigned expanded queue state, removing dividers, wrapping, and button clutter with high-fidelity Lucide icons and hover-revealed action controls.
- Downloader UI: hero backdrop and queue row thumbnails crossfade when focus or thumb changes.
- Download queue: per-job stall watchdog (activity-based, not a global timer); failed row + notification when yt-dlp progress stops.
- Downloader metadata: `get_video_info` simulates use cookie context like downloads; one failed simulate no longer drops the other.
- Downloader/gallery duration: no `NaN:NaN` labels; invalid yt-dlp durations normalized at source and in `formatDuration`.
- Download queue panel: safe ordered job list (no crash when a memoized id outlives its row).
- Download queue: finish handler resolves URL and clears hero in one `set()`; IPC carries `url` when the row is already gone; remove clears matching hero.
- Download queue: pause waits for Rust invoke before store update and pump.
- Downloader: processing phase latch for `download_reached_full` (multi-fragment streams).
- Linux dev: asset protocol scopes and platform default paths (`platformPaths.ts`, `tauri.conf.json`).
- Audio-only download: `bestaudio[ext=m4a]/bestaudio` plus no `--audio-quality 0`; fixes full-video-sized audio files from `bestaudio/best` fallback and ffmpeg VBR Q0 up-encode.
- Downloader: dual simulate for separate audio/video size estimates; smoothed ETA with fast-download catch-up; queue transfer total uses max(progress, metadata).
- Downloader: smoothed hero ETA; quality/audio-aware file size via yt-dlp simulate; metadata cache keyed by format.
- Downloader: production metadata loading and progress bar regressions (monotonic %, shared yt-dlp fetch, hydration gate).
- Explorer (Linux): `explorer-surface` child window overlay instead of in-window child webview.
- Explorer bounds: rAF sync during sidebar/window resize; deduped IPC; listeners stay up through sidebar animation.
- Library replace: removes matched file before re-download when user picks Replace (fixes duplicate audio + video rows).
- Delete / replace: cancels stray ffmpeg preview sidecars so Windows file locks clear sooner.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
2. 429 / rate-limit spacing (#11). Configurable delay between job starts (not retry-on-failure).
3. Downloader UI polish (#12 Jim pass) or mid-download drop E2E verify (#15).

## Notes (not P0)

- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +
  delete_media_batch toward ~75% of the storage cap. The legacy Rust
  authorize_cleanup command is not used by the UI. Do not list this as broken.

## Project reference (static, rarely changes)

Core value: local YouTube downloader and player. The downloader is the wedge.
Player, gallery, Explorer support that story. Not a Plex competitor.
Stack: Tauri v2, Rust, React 19, TypeScript, Zustand, yt-dlp.
Windows: two webviews, main and mini, optional explorer. Linux: same layout for
local `tauri dev`; path defaults and asset scopes tuned, no Linux installer/updater
in release ritual yet. Zustand does not span webviews. Cross-window sync is Tauri
emit/listen only.
Version triplet must stay aligned every bump: package.json,
src-tauri/tauri.conf.json, src-tauri/Cargo.toml.
Zustand audit doc (cite, do not restate inline):
c:\Users\Attic\.cursor\plans\zustand_migration_audit_53cd5b61.plan.md
