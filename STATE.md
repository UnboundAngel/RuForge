# RuForge: STATE



> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,

> before any task, and updates it LAST, after any task that changed shipped

> behavior or moved the project. On version bump the release ritual rolls

> this header. If this file and the code disagree, the code wins and this

> file is stale: fix it forward, do not trust it blindly.



Shipping version: 0.2.2 (unreleased)

Last shipped to users: 0.2.1

Last updated: 2026-08-01 (Auto-clear start failures only for approval auto)

Status: 0.2.1 live on GitHub and updater.json. Browser Companion (dev-gated) binds localhost with progress sync, disconnected UX, cached catalog startup for large libraries, Music/Songs audio playability, and companion-local volume/mute persistence across refresh. Companion V1.1 adds fail-closed `ruforge://focus` deep link to raise the main window; dev gate unchanged. The dropped `ruforge.local` experiment is no longer a current path. Main and secondary windows use class `RuForge_Chrome_WidgetWin` so OBS Automatic picks WGC for WebView2 capture. Download start path bounds inspect waits and arms the job watchdog before spawn. Library entries support incremental remove/upsert so deletes and finished downloads avoid a full cold scan.



## Now



0.2.2 in tree: downloader paste transition no longer flashes (URL stays visible through metadata; leftover top-left chip clears on success); every downloader enqueue path uses the Download-click library duplicate check. Library incremental remove/upsert (no full rescan on delete or download success; Media/Music cold-scan once per session then quiet refresh). Download pre-spawn hang fix (90s inspect timeout + watchdog armed before `start_download_job`). OBS Window Capture fix (Win32 class `RuForge_Chrome_WidgetWin` so Automatic uses WGC). Website OG preview image (`ruforge-og.png`). Browser Companion (dev-gated) on localhost with progress sync, disconnected gates, cached catalog startup for large libraries, Music/Songs audio playability, and companion-local volume/mute persistence across refresh. Companion V1.1 `ruforge://focus` deep link raises the main window (fail-closed, no IDs/paths/commands). The `ruforge.local` experiment was dropped; localhost is the V1 browser entry point. Root `AGENTS.md` trimmed for every-task reads; extended agent context lives in `docs/agents/AGENT-REFERENCE.md`.



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



Closed release 0.2.1 (what users upgrading from 0.2.0 receive). The release-note drafter

reads this for the last shipped delta, not the git tree.



**0.2.2 (unreleased, in tree):**

- Downloads: Paste no longer flashes or blanks the center URL; successful finishes clear the leftover top-left chip; all downloader enqueue paths run the Download-click library duplicate check (warn/replace when auto-skip is off).

- Library: Incremental entry remove/upsert; delete skips full rescan; download success upserts finished file; Media/Music cold-scan once per session then quiet background refresh without backfill.

- Downloads: Pre-spawn hang closed (90s yt-dlp inspect timeout; watchdog arms before job start; failed/timed-out starts clear so music auto-save can retry). Pre-release race fixes: parallel inspect, kill-on-timeout, terminal-state guards, auto-skip pauses active children, gallery local mutations invalidate in-flight fetches. Non-timeout start failures auto-clear only for `approval: "auto"`; sticky failed rows stay for everything else.

- Music: Track row play fades over the index; content panels use soft neutral gray (`#121212`) for OLED readability instead of near-black red undertone.

- Storage cleanup: Opens on click without waiting for a cold library scan; overlay below titlebar so window controls stay visible; storage header sits under that band.

- Player: Comments edge-hold no longer blocks scrubber end or fullscreen; download toasts clear the player control dock; notify overlay sits higher.

- Downloads: Library duplicate scan runs on URL paste; soft “Already in your library” warning shows before Download. Download click no longer hangs on a cold gallery scan; replace/copy popup still appears when auto-skip is off.

- Dev tooling: `npm run dev:app` runs the Companion watcher with `tauri dev` and cleans up both trees on exit; `dev:disk`, `dev:clean:safe`, and `dev:rust-recover` added for artifact visibility, guarded opt-in cleanup, and ReFS incremental recovery. Developer-facing only, no user-visible behavior change.

- Dev build cost: dev profile emits line tables only with dependency debug info off (`ruforge_lib.lib` 1540 MB to 356 MB, `ruforge.pdb` 273 MB to 57 MB, Rust leaf rebuilds 28s to 15s, backtraces unchanged); opt-in `debugging` profile restores full symbols; Companion directories in `.taurignore` stop app restarts on Companion edits. Developer-facing only.

- Windows capture: Win32 class `RuForge_Chrome_WidgetWin` on main/mini/explorer/notify windows so OBS Window Capture Automatic selects Windows Graphics Capture; BitBlt cannot sample WebView2 GPU frames. HW accel and transparent rounded shell unchanged.

- Downloads / media engine: headless `media_engine` workspace crate extracts inspect, validated download args, throttled progress, inspection expiry, job state, and runtime boundaries; RuForge download commands delegate through thin Tauri adapters; Finch-facing `media_engine_*` commands added.

- Companion (dev-gated): React companion-web playback ownership fixed so audio/video clicks stop the previous element, controls bind to the active media kind, progress posts use the backend position/duration/state contract, and Audio mode renders app-style Quick picks, Liked Songs, Artists, Albums, and Local Files sections instead of one long list.

- Companion (dev-gated): React companion-web pairing restored: fresh /?c= links redeem through POST /pair before /library, auth errors map to stable gates, and paired sessions normalize to /paired.

- Companion (dev-gated): companion-web replaced with a React-built client that directly ports the RuForge Music UI. Audio mode: MusicLibraryView-style song/album/artist tabs, NowPlayingBar 3-column grid, queue right-panel, dense song rows with lazy thumbs, same black/charcoal/red tokens. All existing backend behaviors preserved (stream tokens, progress sync, SponsorBlock, scrub sprites, reconnect, gates). Build: `npm run companion:build`.

- Companion (dev-gated): Audio mode redesigned to RuForge Music design language: near-black surfaces, red accent, dense vertical song rows, audio player dock with artwork and track info. Video mode unchanged.

- Companion (dev-gated): companion-web reskinned as a static adaptation of the AI Studio import layout with nav-over-hero, TOP row, horizontal library rows, search/details overlays, lazy signed thumbs, and stable in-place refresh during background reindex; playback/progress/SponsorBlock/scrub/session behavior unchanged.

- Companion (dev-gated): SponsorBlock segments served via enriched `/sidecar/:id`; companion-web auto-skips segments and shows skip button; SB enable is companion-local.

- Companion (dev-gated): Scrub preview sprites served via signed `/sprite/:id/:idx`; companion-web shows hover sprite thumbnail on the custom scrub bar.

- Companion (dev-gated): Custom player controls (replaces native `<video controls>`): play/pause, scrub bar with SponsorBlock color overlays, time display, speed, loop, SB toggle, mute, fullscreen. Loop, speed, SB enable all companion-local.

- Companion (dev-gated): companion-web persists volume and mute across refresh in companion-local localStorage and applies saved output before stream playback.

- Companion (dev-gated): Music/Songs audio-only files get browser playability projection and stream resolution separate from video/remux rules.

- Companion (dev-gated): large library opens can serve a cached Rust catalog immediately while the canonical reindex refreshes in the background.

- Companion (dev-gated): companion-web inline playback errors for stream/token/decode failures; app stays paired unless network or session auth fails.

- Companion (dev-gated): dropped the `ruforge.local` same-PC experiment; localhost remains the only V1 browser entry point.

- Companion V1.1: `ruforge://focus` deep link raises the main window only (fail-closed; no library or download actions).

- Companion (dev-gated): companion-web disconnected and session-lost gates with reconnect backoff and re-pair guidance after RuForge restart.

- Companion (dev-gated): progress sync via authenticated `POST/GET /progress/:id` (media ID only over HTTP; path bridged internally to `playbackStorage.ts`).

- Companion (dev-gated): Browser Companion V1 slice binds loopback only, opens localhost URL, Settings and companion-web copy no longer present LAN/phone/TV V1.

- Docs: root `AGENTS.md` de-bloated for Cursor; extended context in `docs/agents/AGENT-REFERENCE.md`.

- Docs: Codex audit workspace and packaged skill routing added under `docs/agents/codex/` and `docs/agents/skills/`.

- Docs: Codex memory surface added and research-skill routing tightened for explicit research tasks.

- Docs: Codex memory compacted with durable Claude imports and stale context labels.

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

