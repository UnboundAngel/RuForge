# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.8 (unreleased)
Last shipped to users: 0.1.7
Last updated: 2026-05-21
Status: in progress

## Now

0.1.7 is live on main updater.json and GitHub Release v0.1.7. Next work logs
under v0.1.8 (unreleased) in AGENTS.md. Open P0 is empty; Authorize Cleanup
(#8) works via the in-app modal (see Notes).

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.1.7 (what users on 0.1.7 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.1.7 shipped:**

Additions:
- Audio-only player hero with full-canvas LED equalizer and glass side waveforms.
- Music badge on audio library cards; hover preview keeps cover art.
- SponsorBlock skip button, scrub overlays, chapter/POI colors, Playback settings tree.
- Segmented chapter scrubber with hover thumbnail preview and chapter prev/next.
- Frosted player control dock with More menu for secondary actions.
- Settings Playback tab (auto-advance audio, prefetch, SponsorBlock).
- Floating bottom-right download queue drawer with crossfading thumbnails.
- Per-job download stall watchdog.
- Auto scrubber preview sprites on download (Settings, default on).
- Dual yt-dlp simulate for audio vs video size estimates and smoothed ETA.
- Windows volume mixer labels RuForge with app icon.
- Mini player large layout: tooltips clamp in window; volume icons match main player.

Fixes:
- Audio visualizer bars follow playback in WebView2.
- Audio-only downloads prefer m4a, not full-video-sized files.
- Duplicate library cards after muxed downloads and cross-folder dedupe.
- WebView volume/mute sync; mini handoff no longer inherits autoplay mute.
- Download pause only after Rust confirms; processing latch for HLS.
- Duration labels no longer show NaN.
- Preview ffmpeg deadlock fix; delete cancels preview work.
- Download hero clears on finish/remove; explorer bounds sync during sidebar resize.

**0.1.8 unreleased:** (see AGENTS.md Shipped log)

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
2. 429 / rate-limit spacing (#11). Configurable delay between job starts (not retry-on-failure).
3. Downloader UI polish (#12 Jim pass) or mid-download drop E2E verify (#15).

## Notes (not P0)

- SponsorBlock is fully integrated and polished. The master toggle is enabled by default. Spec: `.cursor/plans/sponsorblock_player_polish_9c15f856.plan.md`.
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
