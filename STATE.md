# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.2.1 (unreleased)
Last shipped to users: 0.2.0
Last updated: 2026-06-28 (0.2.1 patch fix pass from PROBLEMS.md)
Status: 0.2.0 live on GitHub, updater.json, and ruforge.app. 0.2.1 fixes implemented locally; not released until Angel runs signed build and release ritual.

## Now

0.2.1 patch pass landed in tree: updater install watchdogs + failed state, update-available island aligned to playback typography and CTA tokens (compact centering, expanded header/button layout), download pause/timeout/403 fixes, music playlist local cover alignment. `npm run build` clean. Ready for Angel in-app verification, then signed build + release ritual when requested.

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README states Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.2.0 (what users upgrading from 0.1.11 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.2.1 (unreleased, in tree):**

Fixes:
- Updater: download/install timeouts, failed screen with GitHub link, post-install version verify, no debug mock on overlay click.
- Updater UX: update available in expanded Dynamic Island (no floating card or titlebar pill); island compact/expanded layout aligned to playback typography and CTA tokens.
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

(none in code; Angel in-app verify on updater, pause-during-simulate, long download, music cover, optional 720p 403 with cookies)

## Next 3 (priority order)

1. Angel verify 0.2.1 fixes in-app, then signed build + release ritual when ready.
2. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
3. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell (cut from Music Phase A/B plan; needs its own pass).

## Notes (not P0)

- P2 mid-download 403 was not reproduced on CLI without cookies. Fix adds yt-dlp retries, resume-on-retry, and clearer 403 copy. Re-test in-app at 720p with your cookie mode on https://www.youtube.com/watch?v=rkdzxRaI68g.
- Music Explore: Download Playlist button disables only on local `downloadingPlaylist`, not when the queue already has active jobs for that playlist. Re-click re-runs enqueue (redundant work; per-track `enqueueDownload` dedup prevents duplicate rows). Cosmetic polish, not a blocker.
- SponsorBlock is fully integrated and polished. The master toggle is enabled by default. Spec: `.cursor/plans/sponsorblock_player_polish_9c15f856.plan.md`.
- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +
  delete_media_batch toward ~75% of the storage cap. The legacy Rust
  authorize_cleanup command is not used by the UI. Do not list this as broken.
- `docs/changes.html` is not in the repo (never committed). Version graph uses `docs/versioner.html` + `docs/versions/version-*.json` only.

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
