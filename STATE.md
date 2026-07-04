# RuForge — STATE



> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,

> before any task, and updates it LAST, after any task that changed shipped

> behavior or moved the project. On version bump the release ritual rolls

> this header. If this file and the code disagree, the code wins and this

> file is stale: fix it forward, do not trust it blindly.



Shipping version: 0.2.2 (unreleased)

Last shipped to users: 0.2.1

Last updated: 2026-07-04 (companion action plan moved into plans; doc routing cleanup)

Status: 0.2.1 live on GitHub and updater.json. Website download URLs follow updater.json at build time; OG preview uses `ruforge-og.png` on ruforge.app. LAN companion remains dev-gated only in tree; companion-web session survives refresh while RuForge stays running.



## Now



0.2.2 in tree: website OG preview image (`ruforge-og.png`). Companion LAN server in tree behind `showDebuggingSettings` only; companion-web probes session cookie on boot (refresh and bare `/` work while RuForge runs), mobile-first layout, QR modal polish.



Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,

`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths

hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).

Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).

Run: `npm run tauri dev`. README states Windows-only for end users; Linux is

local dev, not a shipped target yet.



## What is new since last user release



Closed release 0.2.1 (what users upgrading from 0.2.0 receive). The release-note drafter

reads this for the last shipped delta, not the git tree.



**0.2.2 (unreleased, in tree):**

- Docs: second-pass doc layout (`docs/agents/`, `docs/ruforge/`), AGENTS Doc routing table, reference pointer updates.

- Docs: agent-doc cleanup (Shipped log authority, stale banners, pointer fixes; `AGENTS.md`, `STATE.md`).

- Docs: Companion action plan moved under `docs/ruforge/plans/`; stale Companion routing references corrected.

- Companion LAN (dev-gated): cinematic loading scene (glass layers, breathe-accent sidebar, PS5-inspired progress rail) in companion-web.
- Companion LAN (dev-gated): paired URL normalizes to `/paired` after session confirm; reassurance copy in debug strip.
- Companion LAN (dev-gated): companion-web branded loading card; desktop QR pairing modal with copy/open/refresh; Open in web and Show QR controls in Settings debugging.



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

3. Companion LAN pairing: finish and ship when ready (currently dev-gated).



## Notes (not P0)



- P2 mid-download 403 was not reproduced on CLI without cookies. Fix adds yt-dlp retries, resume-on-retry, and clearer 403 copy. Re-test in-app at 720p with your cookie mode on https://www.youtube.com/watch?v=rkdzxRaI68g.

- Music Explore: Download Playlist button disables only on local `downloadingPlaylist`, not when the queue already has active jobs for that playlist. Re-click re-runs enqueue (redundant work; per-track `enqueueDownload` dedup prevents duplicate rows). Cosmetic polish, not a blocker.

- SponsorBlock is fully integrated and polished. The master toggle is enabled by default. See shipped code and AGENTS.md Shipped log history.

- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +

  delete_media_batch toward ~75% of the storage cap. The legacy Rust

  authorize_cleanup command is not used by the UI. Do not list this as broken.

- `docs/changes.html` is not in the repo (never committed). Version graph uses `docs/agents/release/versioner.html` + `docs/agents/release/versions/version-*.json` only.

- Companion LAN server is in tree but dev-gated (`showDebuggingSettings`). Not in 0.2.1 public release notes.

- Companion scope is locked in `docs/ruforge/plans/companion-action-plan.md`: V1 is same-PC browser Companion on `localhost` only (Videos + Songs, playback, mandatory progress sync as the only write path). Current code binds `0.0.0.0` (LAN) and has no progress write path yet, both flagged there as implementation reconciliation / new work, not shipped V1.



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

