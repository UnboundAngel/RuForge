# RuForge: STATE



> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,

> before any task, and updates it LAST, after any task that changed shipped

> behavior or moved the project. On version bump the release ritual rolls

> this header. If this file and the code disagree, the code wins and this

> file is stale: fix it forward, do not trust it blindly.



Shipping version: 0.3.0 (unreleased)

Last shipped to users: 0.2.2

Last updated: 2026-08-02 (release ritual prep 0.3.0)

Status: 0.2.2 live on GitHub and updater.json. Downloader paste no longer flashes; soft library-duplicate warning on URL entry; every enqueue path shares the Download-click duplicate gate. Library incremental remove/upsert (no full rescan on delete or download success). Pre-spawn inspect timeout with kill-on-timeout; watchdog armed before start; auto-clear start failures only for approval auto. OBS Window Capture uses class `RuForge_Chrome_WidgetWin` for WGC. Headless `media_engine` crate backs inspect/download. Browser Companion remains developer-gated on localhost.



## Now



0.2.2 shipped. Next cycle open. Priorities unchanged: storage cap before enqueue, main-app nav restructure, Companion Browser V1 when Angel approves removing the dev gate.



Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,

`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths

hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).

Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).

Run: `npm run tauri dev`. README states Windows-only for end users; Linux is

local dev, not a shipped target yet.



Windows dev loop: `npm run dev:app` is the normal entry point (Companion asset

watcher plus `tauri dev`, both torn down on exit). `npm run tauri dev` still works

unchanged. Maintenance: `npm run dev:disk`, `npm run dev:clean:safe`,

`npm run dev:rust-recover`. Full symbols on demand: `cargo build --profile debugging`.



## What is new since last user release



Closed release 0.2.2 (what users upgrading from 0.2.1 receive). The release-note drafter

reads this for the last shipped delta, not the git tree.



**0.3.0 (unreleased, in tree):**

- Playback (MINOR): Media Session transport for OS/browser media keys (play/pause/stop/prev/next/seek) plus metadata and position.
- Music (MINOR): equal-power crossfade 0–12s (default Off, persisted); Now Playing control; A/B elements; 18s min solo (shorten fade or hard cut); arm/abort/cascade guards.
- Island: skip art/meta slide matches prev vs next (desktop overlay + taskbar); overlay waveform keeps moving while main is backgrounded; overlay collapses on blur/focus loss.
- Library: delete fails loudly if the file is still on disk after trash (locked / in use).
- Downloader: paste/fetch center stack spaced (no URL/status/pacer overlap); readable URL type; fetch status under pacer; soft-rect Download CTA.
- Island: audio output device labels marquee slowly on hover when truncated.
- Music: Now Playing bar matches header/corner shell black (`--music-shell-chrome`), not the lighter content surface.
- Island: headphones MorphMenu stays above transport (no see-through play/pause), viewport-caps + scrolls long device lists; per-row device icons from label (headphones/speakers/display/cable); icon-only at rest, opaque `#271C18` panel; outputs enumerate on main (label unlock) and push to overlay.
- Player: play/pause transport toggles use `PlayPauseMorphIcon` (play path ↔ pause bars crossfade; Now Playing, island, music/video mini, main player, row hover).
- Music: artist hero cover falls back to track art when the playlist folder cover is missing (same path album cards already used).
- Music: loopMode off/all/one (all = user span, no staging, idle endless tail kept); endless lookahead 12; "Next from" uses play-origin tag (`musicQueueSource`).
- Island: minimized/tray-hidden main shows top-center Dynamic Island overlay for main-owned playback (not when mini owns); overlay follows the monitor main was on; waveform motion no longer forces a middle-tall envelope and uses a hairline white outline; expanded headphones picker routes and remembers audio output (`audioOutputDevices`).
- Library: Video Library multi-column grid with date groups, hover shell, Morph card menu, and scroll-linked tab chrome; Vite ignores agent markdown. Snapshot/cold-open/cleanup work from earlier in the cycle still applies.
- Player: YouTube-style end flow (bottom cards 2-10s from 5% duration, ring hover, fade, Up next with left timer + full-width buttons) on main and mini. Chapter scrubber knob tracks the pointer again (no double horizontal translate).



**0.2.2 shipped:**



Additions:

- Downloads: Soft Already in your library warning appears when you paste or enter a URL, before Download.

- Library: Deletes and finished downloads update the gallery without a full rescan.

- Windows: Main and secondary windows use class RuForge_Chrome_WidgetWin so OBS Automatic selects Graphics Capture.



Fixes:

- Downloads: Paste and metadata transition no longer blanks the URL or flashes the hero.

- Downloads: Every enqueue path runs the same library duplicate check as Download click.

- Downloads: Pre-spawn inspect capped at 90s; watchdog arms before start; stuck jobs time out visibly.

- Downloads: Non-timeout start failures auto-clear only for auto jobs; manual failures stay sticky with the error.

- Downloads / Library: Quiet reindex cannot restore a deleted row or wipe a finished upsert; zombie downloads after timeout or skip are killed.

- Storage: Cleanup opens immediately and stays below window chrome.

- Player: Comments edge-hold no longer steals the scrubber end or fullscreen; download toasts clear the control dock.

- Music: Track play control fades over the index without a layout jump.



**0.2.1 shipped:**



Additions:

- Library: Rust `library::` module is single authority for scan roots + media index; config persisted in tauri_plugin_store with one-shot localStorage import (existing Media Library surface).



Fixes:

- Updater: boot verify strict `getVersion() === pending.version` only; download/install timeouts; failed screen with GitHub link; post-install version verify.

- Updater UX: update available in expanded Dynamic Island; island flex layout with pinned footer and compact version badge.

- Downloads: pause during pre-spawn simulate no longer marks failed; 2-minute watchdog audio-only; yt-dlp retries and 403 guidance; manual retry resumes partial downloads.

- Music: playlist cover saved locally at download; shelf and album detail use same local path.



**0.2.0 shipped:**



Additions:

- Music playlists: batch downloads write `.ruforge-playlist.json` under Playlists with per-track roster; Explore harvest when webview roster is complete; signed coverUrl on album view; playlist-in-library badge by listUrl.

- Music Explore: SPA page context via History API in WebView2; YTM header title polling; music-explore-webview capability split.

- Music download dock: Ban cancel on expanded chip and collapsed orb; sidebar orbs for all active jobs; cancel-all; red cancel celebration; batch retry up to 3 attempts.

- Music library: artist view immersive hero; canonical_album prefers yt-dlp info.json; album grouping strips date stamps; metadata backfill force re-process.

- Downloads: multi-item carousel hero; batch UI persists through playlist and Explorer multi-add; Deno JS runtime auto-install; queue metadata hydration pool.

- Scrub previews: parallel ffmpeg, fleet cap, tail patch, windowed preload, library backfill.

- Debugging: dev captures library; replay last download batch (Mode A/B).

- Crash recovery: root error boundary; friendly hero with Reload app.

- Telemetry: Aptabase gated behind showDebuggingSettings; public consent overlay removed.

- Authorize Cleanup: audio listen-snapshot percent; goal progress bar; storage warn at 50% cap.

- Window chrome: Win11 snap layout flyout; Explorer webview fills content shell.



Fixes:

- Music sidecar stale coverUrl, cancel celebration timing, artist context menu crash.

- Downloads watchdog after spawn, .temp.mp4 gallery sweep, queue hydration dedup.

- Scrub previews trailing dots on Windows, img hover for # in paths.

- SponsorBlock skip button tracks player chrome; Video Library scroll bulge only.

- Dev capture main window resolve via boot-cached state.



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



## Open P0 (blocks release)



(none)



## Next 3 (priority order)



1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.

2. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell.

3. Companion Browser V1: ship when ready (dev gate removal only when Angel approves public ship); disconnected-state polish is in tree.



## Notes (not P0)

- Codex should stay out of app implementation by default in this repo. Use Codex for GitHub Actions / CI, GitHub workflow help, focused Cursor prompts and handoffs, and explicit review summaries. Each RuForge Codex chat should load the Codex memory surface, then `STATE.md` and `AGENTS.md`, then only task-routed docs. Prefer planning for feature direction and cross-chat continuity, not routine implementation steps.



- P2 mid-download 403 was not reproduced on CLI without cookies. Fix adds yt-dlp retries, resume-on-retry, and clearer 403 copy. Re-test in-app at 720p with your cookie mode on https://www.youtube.com/watch?v=rkdzxRaI68g.

- Music Explore: Download Playlist button disables only on local `downloadingPlaylist`, not when the queue already has active jobs for that playlist. Re-click re-runs enqueue (redundant work; per-track `enqueueDownload` dedup prevents duplicate rows). Cosmetic polish, not a blocker.

- SponsorBlock is fully integrated and polished. The master toggle is enabled by default. See shipped code and AGENTS.md Shipped log history.

- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +

  delete_media_batch toward ~75% of the storage cap. The legacy Rust

  authorize_cleanup command is not used by the UI. Do not list this as broken.

- `docs/changes.html` is not in the repo (never committed). Version graph uses `docs/agents/release/versioner.html` + `docs/agents/release/versions/version-*.json` only.

- Companion server is in tree but dev-gated (`showDebuggingSettings`). V1 binds `127.0.0.1` only; progress sync and disconnected reconnect UX are in tree. Not in 0.2.1 public release notes.

- Companion scope is locked in `docs/ruforge/plans/companion-action-plan.md`: V1 is same-PC browser Companion on `localhost` only (Videos + Songs, playback, mandatory progress sync as the only write path). Loopback bind, progress sync, Music/Songs playability, and disconnected-state polish are reconciled in tree; public ship still blocked on dev gate until Angel approves.



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

Per-change Shipped log: `AGENTS.md` only. This file mirrors unreleased work under "What is new since last user release" for release-note drafting.

