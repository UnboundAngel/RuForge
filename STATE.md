# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.11 (unreleased)
Last shipped to users: 0.1.10
Last updated: 2026-06-13 (handoff-sync + video mini seek fix)
Status: in progress

## Now

0.1.10 shipped. Open cycle is 0.1.11. D-audio claim+teardown+handoff-sync built; re-cold-boot #5 island swap + B seek. E-audio signed off except island layout (Jim).

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

- Playback (D-audio): `activity-handoff-sync` island metadata on mini file change; video handoff seek retry at `loadedmetadata`.
- Playback (D-audio): unified `claimMainPlayback()` + `activity-mini-teardown`; Tauri `allow-destroy` for mini close.
- Boot splash: Siri-style edge orbs loader (default + music modes).
- Activity island (E-audio): live `main-music` off music mode; `main-video` frozen unchanged.
- Music polish: mini-ready-before-emit, volume wheel fix, stale listen adopt.
- Onboarding: demo overlay (dev replay + Settings > Debugging).

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
