# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.11 (unreleased)
Last shipped to users: 0.1.10
Last updated: 2026-06-14 (Windows taskbar transport toolbar)
Status: in progress

## Now

0.1.10 shipped. Open cycle is 0.1.11. Activity island model A (always-mounted single node). D-audio claim+teardown+handoff-sync built; video pop-out handoff race fixed.

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.1.10 (what users upgrading from 0.1.9 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.1.11 (unreleased):**

- Windows taskbar: thumbbar clicks no longer dismiss the taskbar preview (`taskbar_thumbbar.rs`).
- Windows taskbar: thumbbar button clicks route transport (WM_COMMAND LOWORD + message filter + deferred emit); play/pause media-element fallback (`taskbar_thumbbar.rs`, `taskbarTransportSync.ts`).
- Windows taskbar: thumbnail transport toolbar on main HWND (prev / play-pause / next); `ruforge:taskbar-transport` + `sync_taskbar_transport` (`taskbar_thumbbar.rs`, `taskbarTransportSync.ts`).
- Music detail: liner notes under release metadata; sparse archive footer (YouTube, dates, path only); opacity/y expand animation (`MusicTrackCredits.tsx`, `MusicTrackView.tsx`).
- Music detail: song view loads sidecar metadata and listen stats on open; background enrich when sidecar missing (`MusicShell.tsx`).
- Music detail: cinematic song screen with immersive release typography, Watch on YouTube via `openUrl`, compact Play/Back/Like chrome (`MusicTrackView.tsx`).
- Music playback: cold start always 0:00; no stored resume on normal play; mini back-to-app handoff unchanged.
- Music Home: Recently added / Recently listened toggle; playlist glass rows, singles grid, albums vinyl shelf; Rediscover removed; listen tab with relative time and empty state.
- Music library: single-track downloads stay standalone (not album shelves); lone yt-dlp playlist entries save under `Music/`; album page artist matching fixed; title-equals-album sidecar stripped on enrich.
- Playback (music nav): video keeps playing across music-mode enter; hoisted off-tab PlayerView; parks + stops only on audio claim.
- Activity island: owner-aware hasLivePlayback; compact chrome when paused on owning surface.
- Activity island: scrubber fill-only (no hover thumb); capture-stream analyser duplicate audio fix (`IslandExpandedContent.tsx`, `audioAnalyserGraph.ts`).
- Activity island: scrubber fixed height, inner-bar drag rect, pinned clock widths for flush cursor (`IslandExpandedContent.tsx`).
- Activity island: scrubber drag uses frozen track rect; release preview holds until bridge seek lands (no stale snap); next-track transport alignment fix (`IslandExpandedContent.tsx`).
- Activity island: transport dead-zones fixed — center/wing wrappers no longer steal clicks; icons/overlays pass through to buttons; waveform non-interactive until hover pop-out (`IslandExpandedContent.tsx`, `IslandVolumeControl.tsx`, `IslandWaveformHoverSlot.tsx`).
- Playback scrub: Spotify model — audio/video keeps playing during drag; thumb tracks cursor (preview only); one seek on release with gain de-click envelope when analyser graph exists (`beginScrub`/`releaseScrub` replaces `pauseForScrub`/`resumeAfterScrub`; `useMusicPlayback.ts`, `PlayerView.tsx`, island/NowPlayingBar scrubbers).
- Activity island: scrub generation token cancels orphaned deferred pause and seeked resume when user toggles play during or after scrub (`useMusicPlayback.ts`, `PlayerView.tsx`).
- Activity island: expanded controls reorganized (centered transport, hover volume slider with red muted icon + middle-click mute, reserved slider slot avoids prev-track overlap, waveform → mini, cover opens player).
- Activity island: media-mode shell is hue-matched espresso pocket `#181210` (music stays `#000`) for cutout on default chrome.
- Activity island: waveform bars use blurred cover slices (no canvas palette extraction); dead `prominentColor` island code removed.
- Player: video play/pause icon fixed; idle music host no longer overwrites video paused state (`PlayerView.tsx`).
- Onboarding: 500ms Alt ring; swap hint after ring; dismissed pill stays gone until new step or debug replay.
- Window chrome: rounded outer shell when not maximized; square when maximized (`mainWindowFrame.ts`, `App.tsx`).
- Window chrome: edge resize strips restore borderless drag-resize (`WindowResizeEdges.tsx`).
- Activity island (E-audio): 5-bar waveform restored; cover accent via `extractProminentColorFromPath` (blob URL, vibrant bucket pick).
- Playback (D-audio): video pop-out module-level `play-in-mini` bridge; handoff emits inside `mini-player-ready` callback.
- Playback (D-audio): `activity-handoff-sync` island metadata on mini file change; video handoff seek retry at `loadedmetadata`.
- Playback (D-audio): unified `claimMainPlayback()` + `activity-mini-teardown`; Tauri `allow-destroy` for mini close.
- Boot splash: Siri-style edge orbs loader (default + music modes).
- Activity island (E-audio): live `main-music` off music mode; `main-video` frozen unchanged.
- Music polish: mini-ready-before-emit, volume wheel fix, stale listen adopt.
- Onboarding: island-only Alt-hold progress pill (no full-screen cards); dev replay + Settings > Debugging.

**0.1.10 shipped:**

Additions:
- Website release automation (`prep:website-release`, site version from package.json).
- Listen-event log (Rust JSONL, dual-surface sessions, stats from snapshot).
- Music profile screen (YouTube identity, stats, liked, recent plays, storage).
- Music storage strip on Home/Library.
- YouTube titlebar profile chip (Log in pill, spinner, @handle hover).

Fixes:
- Music Explore auto-save 15s listen gate.
- Download complete celebrations and watchdog timeout/batch advance pass.
- Listen log integrity (v2 events, cutover marker).
- Music mini corners and skip autoplay.
- Music stats/profile/home layout and copy polish.
- Storage glyph opens cleanup; YouTube @handle probe scoped to topbar.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
2. Downloader UI polish (#12 Jim pass) or mid-download drop E2E verify (#15).
3. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell (cut from Music Phase A/B plan; needs its own pass).

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

## Shipped log
- Redesigned track detail page with parsed masonry credits grid and interactive explorer button
- Polished track detail view buttons (removed Back/Heart outer circles, reduced Play Now button size)
- Redesigned the music detail description and track credits into a two-column alignment style, avoiding flat left-aligned text, and polished the file path link footer icon.
