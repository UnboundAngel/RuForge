# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.10 (unreleased)
Last shipped to users: 0.1.9
Last updated: 2026-06-09 (Music storage strip)
Status: in progress

## Now

0.1.10 cycle open on main. Music mode bottom storage strip (library used GB, cap bar on internal vault; hides for playback, Explore bar, downloads). YouTube titlebar profile chip with real @handle probe. Last user release is 0.1.9. Open P0 empty. Next: storage cap (#10), downloader UI polish (#12), nav restructure.

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.1.9 (what users on 0.1.9 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.1.9 shipped:**

Additions:
- Music mode: Spotify-style local library (Home, Explore, Library, now-playing bar, vinyl expanded player, embedded tag metadata).
- YouTube Music Explore: embedded webview, download strip, Pick tracks, Paste URL, per-track orb progress dock, audio-only batch downloads.
- Music detail pages: artist (MusicBrainz, mosaic hero, vinyl cards), album, and song views with Play/Shuffle and navigation stack.
- Music metadata enrichment: `{stem}.musicmeta.json` sidecars at download time and via Settings backfill.
- Music right panel: Queue, Recently played, and Segments tabs; manual queue; drag-reorder; play history; music-only SponsorBlock skip.
- Music listen stats and smart shuffle: play counts, Home stats strip, dedicated Stats view, weighted shuffle.
- Liked Songs: heart on now playing and detail tracklists; virtual playlist with collage cover; Library tab and Home shelf.
- Radial navigation: Alt-hold menu with per-mode palettes; 56px icon rail; nav mode cycle including Music.
- Media library buckets: Videos/Music/Movies/Shows/Playlists layout; Settings migration tool.
- Delete and Recently Deleted: OS Recycle Bin with full sidecar cleanup; restore from trash when recoverable.
- Export bundle: timestamped export folder; USB title-bar button; panel from context menus and Settings.
- Settings debug logging: per-category Rust/JS toggles with boot sync (lofty TRACE off by default).
- App-wide YouTube profile chip; music row context menus.
- Website and mobile: Obsidian-style docs, six feature pages, download flow, 94-page `/m/` mobile shell.

Fixes:
- Music Explore: webview lifecycle, internal vault download path, browse JSON tracklist harvest, single-track paste URLs.
- Music layout and UI: panel height, delayed tooltips, right panel tabs, mini player cover, queue drag without accidental play.
- Music liked UX: no shelf jump on like; Home Liked shelf without scroll jolt; heart sizing matches transport icons.
- Gallery scan: duplicate sweep off hot path; poster backfill skips embedded-cover audio.
- Library migrate moves musicmeta sidecars; artist metadata disk cache on revisits.
- Mini player: pop-out from music mode, stops main on library pick, transparent corners, hover z-order.
- Chapter scrubber alignment; Explorer HMR reattach; radial Alt-release hover-to-select.
- Music mini dual-play guard; downloader cookie export fallback; notification enter flash.

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
