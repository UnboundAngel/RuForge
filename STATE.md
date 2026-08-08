# RuForge: STATE



> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,

> before any task, and updates it LAST, after any task that changed shipped

> behavior or moved the project. On version bump the release ritual rolls

> this header. If this file and the code disagree, the code wins and this

> file is stale: fix it forward, do not trust it blindly.



Shipping version: 0.3.1 (unreleased)

Last shipped to users: 0.3.0

Last updated: 2026-08-08 (Settings media outer shell)

Status: 0.3.0 live on GitHub and updater.json. 0.3.1 in tree: Discord Rich Presence end-to-end (Rust worker, Settings toggles, main-window transport, onboarding). Settings is a centered popup with categorized top tabs and search instead of a full page. Webview reload no longer clears Discord IPC. Media Session OS keys; music crossfade; desktop Dynamic Island overlay with headphones output; video end screen; Video Library grid and faster snapshot. Browser Companion remains developer-gated on localhost.



## Now



Settings is a centered popup with categorized top tabs and search. Discord Rich Presence live in tree (reload fix landed). Before public Discord ship: staleness guard (Next 1). Companion Browser V1 remains gated. Other priorities: storage cap, main-app nav restructure.



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



Closed release 0.3.0 (what users upgrading from 0.2.2 receive). The release-note drafter

reads this for the last shipped delta, not the git tree.



**0.3.1 (unreleased, in tree):**

- Settings: centered popup with categorized top tabs (Preferences / Library / System), iconed pills, and settings search.
- Downloader: immersive active-download hero shows poster + preparing/downloading/finishing phases (fixes silent start stall and fake 100% during merge).
- Discord: Rich Presence Rust worker, General Settings privacy toggles, main-window transport, and island onboarding step (ships with 0.4.0 gate; Debugging preview available). Island Discord step polish: media frame + Settings-path compact; Alt hold finishes after collapse. Webview reload no longer disables Discord IPC mid-remount.



**0.3.0 shipped:**



Additions:

- Playback: OS/browser Media Session transport (media keys, metadata, position).

- Music: Equal-power crossfade 0–12s (default Off) with Now Playing control and solo-floor guards.

- Island: Desktop Dynamic Island overlay when main is minimized or tray-hidden during main-owned playback.

- Island: Headphones output picker routes and remembers the audio device.

- Music: Loop mode off / all / one; queue Next from play-origin tags; endless lookahead 12.

- Player: YouTube-style video end screen with suggestion cards and Up next.

- Library: Video Library multi-column grid with date groups and Morph card menu.

- Player: Shared play/pause morph icon across Now Playing, island, mini, and main.



Fixes:

- Island: Skip slide direction matches prev vs next on overlay and taskbar.

- Island: Overlay waveform keeps moving while main is backgrounded; collapses on blur.

- Library: Delete fails loudly when the file is still locked after trash.

- Library: Video Library paints after disk walk; cold open single-flights the snapshot.

- Downloader: Paste/fetch idle stack no longer overlaps; readable URL type.

- Player: Chapter scrubber knob tracks the pointer again.

- Music: Artist hero falls back to track art when playlist folder cover is missing.

- Music: Neighbor scan no longer wipes endless staging.



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



1. Discord Rich Presence staleness guard: clear presence if no snapshot within N×15s (destroyed main webview can leave a stale card). Land before Discord ships to users.

2. Storage cap before enqueue (#10). Block when estimate exceeds free disk.

3. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell.



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

