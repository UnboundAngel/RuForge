# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.12 (unreleased)
Last shipped to users: 0.1.11
Last updated: 2026-06-20
Status: in progress

## Now

0.1.11 shipped. Open cycle is 0.1.12. Player comments drawer, music sidecar v2, activity island scrub/transport pass, Windows taskbar transport toolbar. Media tab bulge fillets realigned to 48px titlebar.

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.1.11 (what users upgrading from 0.1.10 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.1.12 (unreleased):**

- Downloads: queue metadata hydration capped at 2 concurrent get_video_info invokes via downloadQueueHydrationPool; cache hits bypass the pool (`downloadQueueHydrationPool.ts`, `downloadQueueSlice.ts`).
- Downloads: playlist batch enqueue copies hero per-item thumb/title/duration into job snapshots; rows with item thumbs skip queue hydration (`playlistDownloadPlan.ts`, `useDownloaderView.ts`).
- Scrub previews: ffmpeg per-video lock keys normalized at map boundary (`normalize_media_key`, same rule as TS `mediaPathsMatch`) so spawn, cancel, and delete share one slot per file.
- Scrub previews: `media.ffmpeg` debug category wired in Settings; fleet release log on guard Drop covers error/cancel paths (`debugCategories.ts`, `media.rs`).
- Scrub previews: global ffmpeg fleet cap (semaphore max(1, cores/2) per spawn) and `-threads 1` on all RuForge sidecar invokes; `media.ffmpeg` acquire/release logs (`media.rs`).
- Scrub previews: tail patch fills all blank trailing cells through floor(duration/5), one seek per gap cell; failures logged not swallowed (`media.rs`).
- Scrub previews: sprite ffmpeg uses method A (`-skip_frame nokey`, `-vsync passthrough`); tail cell at floor(duration/5) patched from end frame so scrub hover reaches duration (`media.rs`).
- Downloads: post-download scrub batch spawns on job termination only; post-process stdout no longer preempts before the muxed file is on disk (`downloader.rs`).
- Telemetry: shared Tokio runtime in `main.rs` before Aptabase plugin init; fixes startup panic in `tauri dev`.
- Crash recovery: root React error boundary on every window; friendly fallback UI, reload, collapsible error details.
- Windows taskbar icon: dev builds use separate AppUserModelID (`.dev`) and HWND `set_icon` so taskbar matches bundled icon instead of a stale shell cache entry.
- Window chrome: Win11 snap layout flyout on main maximize hover (`tauri-plugin-decorum`).
- Authorize Cleanup: audio tracks show watched % from listen snapshot (not playbackStorage); video unchanged.
- Authorize Cleanup: header item tally and goal progress bar (empty stone when none selected; accent when goal met); byte goal when library >=50% of cap.
- Storage: sidebar glyph and music strip warn at 50% cap (was 80%).
- Branding: in-app logo asset is `ruforgeAppIcon.png`; Tauri build reruns when `icons/icon.ico` changes so Windows taskbar/window icon embed updates.
- Video Library: on scroll, one shared left bulge only (no compact title, no stacked active pill).
- Explorer: YouTube webview bounds track the content shell below the 48px titlebar; flush to tab bottom (removed stale `top-10` host and bottom height inset).
- SponsorBlock: skip button sits just above player chrome when controls show; stays elevated (not bottom-edge) when scrubber UI hides.
- Downloads: `.temp.mp4` yt-dlp merge intermediates recognized, hard-skipped from gallery when sibling final `.mp4` exists, excluded from scrub spawn, deleted on post-download cleanup and manual sweep.
- Scrub previews: hover thumb uses `<img>` not CSS `url()` so `#` in download folder names loads sprites correctly.
- Scrub previews: thumb subdir names strip trailing dots on Windows so ffmpeg can write `sprite_*.jpg` for yt-dlp `...webm` titles.
- Scrub hover: windowed sprite sheet preload on long videos (current sheet ±1, one ahead in travel direction); ≤2 sheets still preload all; gallery `scrubSpritePaths` fast path unchanged.
- Scrub hover: rAF-throttled scrub bar hover, sprite paths cached at gallery scan (skip player IPC when complete), JPEG preload, CSS background-position previews, library scrub backfill deferred while player tab is active.
- Scrub previews: faster parallel ffmpeg generation, library backfill when auto mode is on, per-card building-previews spinner on Video Library cards.
- Media chrome: tab bulge corner SVGs and clip insets follow `--rf-titlebar-h` on Video Library and Settings.
- Settings scroll morph: numeric titlebar offset; bulge at rest only (reverted strip clip/overflow).

**0.1.11 shipped:**

Additions:
- Player comments: sliding drawer; v1 comments sidecar on download; lazy ensure sidecar; Top 25 threads cap.
- Music metadata: track sidecars v2 (`genres`, `artistMbId`); `stampTrackSidecarArtistTags` (default on); backfill pass 2.
- Windows taskbar: thumbnail transport toolbar; white icons; like heart-to-check morph.
- Music Home: Recently added / Recently listened toggle; vinyl album shelves; listen history tab.
- Music detail: gatefold track page; liner notes credits accordion; Watch on YouTube via `openUrl`.
- Activity island: off-tab video bridge; owner-aware `hasLivePlayback`; Spotify scrub; waveform AGC from cover art.
- Playback (music nav): video keeps playing in music mode; hoisted off-tab `PlayerView`.
- Onboarding: alt-radial island demo (expanded default, portal fix).
- Boot splash: edge gradient orbs.

Fixes:
- Download comments: `max_comments` grammar; `.f###` path strip; dedup preserves shared sidecar.
- Music library: single-track downloads stay standalone; lone playlist entries under `Music/`.
- Music playback: cold start 0:00; expanded close no longer silences audio.
- Activity island: transport dead-zones; scrub preview until mouseup; play icon follows bridge.
- Windows taskbar: thumbbar clicks no longer dismiss preview.
- Player: video play/pause icon not overwritten by music host sync.
- Window chrome: rounded shell when not maximized; edge resize strips.

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
