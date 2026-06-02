# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.9 (unreleased)
Last shipped to users: 0.1.8
Last updated: 2026-06-02 (music stats view)
Status: in progress

## Now

0.1.9 unreleased on main: Music stats view (dedicated `MusicStatsView` with all-time + this-week summaries, top 10 tracks/artists; Home See all + Library Stats tab). Music listen stats (local play count + listen minutes per identity key, Home Your stats strip) and smart shuffle (weighted by history, likes, recency; endless autoplay at queue end). Music liked songs (heart toggle, local Liked Songs playlist in Library + Home, weighted Quick picks / Rediscover). Settings > Debugging debug log category tree (per-feature Rust/JS gates, lofty TRACE off by default, persisted toggles, boot sync to Rust). Music Explore Pick tracks prefers webview harvest before yt-dlp; browse-data poll emits when shelf JSON lands; fail-safe completeness gate; harvest wait early-bails on paste mismatch and truncated shelves (no 1.5s dead latency); panel prefers harvest over yt-dlp cache. Music mini player cover art uses full-bleed object-cover with gradient fade again (no left brick or large letterboxed card). Music right sidebar fixes (Next from/Next up labels, sticky Now playing + scroll shadow, drag-reorder queue, panel rounding, tab/history hover fixes). Phase A + visual pass: Queue / Recently played / Segments tabs; manual queue advance; play history; SponsorBlock density strip + music-only skip; row context menu. Music Explore collapsed sidebar download orbs anchor at the bottom (active on bottom edge, queued fade above); playlist batch shows one bubble until tap expands upward. Music Home shelves dedupe duplicate tracks and cap per-artist cards on Rediscover, Recently added, and Quick picks. Music Home reads YouTube sign-in from Explorer session (avatar chip hidden when logged out). Home header no longer blurs on scroll; quick picks use YTM-style tinted rows with tiny square art; library/home thumbs scaled down. Music tooltip/sidebar compliance pass: delayed black hover tooltips replaced native instant `title` tooltips across music nav/explore/right-panel controls, right panel tab clipping fixed (`Recent` label + tighter tab header spacing), divider lines removed from Segments and Explore download headers, and decorative shadows removed from music card surfaces touched by the audit. Delete moves the full sidecar set to the OS Recycle Bin (shared `media_bundle` enumerator with export), prunes empty item/thumb folders, and adds Recently Deleted (manifest + restore from system trash; title-band trash icon on Media). Media library restructure landed (bucket layout, migration command, bucket-aware scan, new downloader template). Music mode (navMode cycle reaches "music" via radial center): Spotify-style shell (black outer bg, rounded inner panels, full-width bottom player bar), Home/Explore/Library nav, embedded-tag metadata (lofty), and per-view browsing of local audio files. Alt-hold radial locks at cursor on Alt press (viewport clamp); fixed 56px icon rail (nav mode cycle on center);
nav icons animate only in the Alt radial menu (static idle glyphs on the sidebar rail); per-mode radial wedges with mode-matched palettes (default tan/brown, movie copper, music red/black); storage ring glyph;
softer content vignette; explorer webview mount/sync fix. Settings resize flash fix (opaque html/body/#root, main column
backgrounds, morph resize guard, dropped tab scale/opacity). Settings screen polish pass
(wider column, stronger section headers/spacing, row title hierarchy). Settings Downloads toggles fixed (subtitles, auto scrubber
previews: click always saves, queue rows sync, dropdown overlay no longer blocks).
Export Phase B4 USB title-bar button (removable-drive poll, filled icon when present,
opens panel with USB default dest). Phase B panel (modal, Settings + media context
menu, hide-during-run, playlist directory export). Export progress: video copies last;
live detail line in modal. Phase A bundler landed. Cloud export still planned. Plus
website/mobile work and Copy Transcript polish in tree. Open P0 is empty;
Authorize Cleanup (#8) works via the in-app modal (see Notes).

Linux dev: `tauri.conf.json` asset scopes cover `$HOME`, `/home`, `/media`,
`/mnt`, and drive letters `C:` through `F:`. Default download/internal paths
hydrate from Tauri `downloadDir` / `homeDir` on non-Windows (`src/platformPaths.ts`).
Sidecars: `src-tauri/binaries/*-x86_64-unknown-linux-gnu` (yt-dlp, ffmpeg, ffprobe).
Run: `npm run tauri dev`. README still says Windows-only for end users; Linux is
local dev, not a shipped target yet.

## What is new since last user release

Closed release 0.1.8 (what users on 0.1.8 receive). The release-note drafter
reads this for the last shipped delta, not the git tree.

**0.1.8 shipped:**

Additions:
- Playlist downloader: URL intake, per-row audio, duplicate preview, numbered playlist folder with Media stack card.
- Regroup flat playlist files from Settings Debugging tab.
- SponsorBlock fetches all skip, chapter, and POI categories; stale sidecars refresh on play.
- Color-coded scrub hover pill for every SponsorBlock segment type.
- Settings Downloads: yt-dlp Check & Update (GitHub check + auto-install).
- Settings Advanced: Check for updates auto-downloads RuForge when newer.
- General toggle reveals Debugging settings tab.
- Post-install What's New modal scroll/clamp fix.

Fixes:
- Simple seek bar no longer clips scrub hover previews.
- Scrubber sprites reload after Generate Previews; `..info.json` duration for sprite timing.
- Mini player large mode: video no longer washed by stacked blur.
- Playlist regroup matches by id, url, or title across internal and custom roots.

**0.1.9 unreleased:** Music stats view: dedicated listening stats page (`MusicStatsView`) with all-time and this-week listen time/play totals, top 10 tracks and artists, red-accent section headers; open from Home Your stats See all or Library Stats tab. Music liked songs: heart on now playing, queue, library, and home rows; persisted Liked Songs list (`ruforge-music-liked-tracks`); Library Liked Songs tab; Home shelf; liked tracks weighted in Quick picks and Rediscover. Music Explore album tracklist harvest: Pick tracks reads the complete tracklist from `ytmusic-browse-response.data` via page-context inject; short-lived browse-data poll after navigation re-emits when shelf JSON lands; fail-safe completeness gate (parsed header count must match rows — null/unparseable header or 200-row browse truncation rejects harvest); panel waits up to 1.5s for verified harvest before yt-dlp and applies complete harvest over session cache; yt-dlp fallback for incomplete harvest, >200 browse truncation, paginated shelves, or missing JSON. Music Home shelf dedup (same song / artist no longer floods Rediscover, Recently added, Quick picks; album edition names collapsed). Music shell layout fix: Home/Library gray panels extend to the bottom chrome row (Back + Explore bar stacked inside main columns, not a separate row below content). AudioHeroStage expanded player: vinyl left-clip (fixes right-edge flicker from spin bbox), opaque cover, glow RAF only with audio element. Music Explore single-track paste: `music.youtube.com/watch?v=` (and youtube.com/youtu.be watch links) auto-detect and fetch into a one-track pick panel instead of error; new URL classify/resolve helpers with vitest coverage. Earlier: Music + mini player cover art: playback UI uses object-contain so album art is not center-cropped; mini player small/compact dedicates a left column (84px compact / 144px small) for the full image at player width. Music Explore download dock redesign: collapsed panel shows a vertical column of circular track orbs (rounded-full + per-track SVG ring, indeterminate arc while queued, determinate while downloading, green checkmark on complete); minimize chevron docks the whole column as a single chip in the nav footer above Back with the remaining count overlaid inside the thumbnail. Boot bar row fully attached to sidebar: left filler div (matching sidebar width, owning bottom-left radius) + `MusicExploreBottomBar` (`flex-1`, owning bottom-right radius) form a seamless full-width band flush under the main row; `MusicNav` `sideColumn` border-radius now top-left only. Earlier: Music Explore collapsed sidebar download: single track art with progress ring, green checkmark on complete, then auto-advance; remaining queue count badge. NowPlayingBar expand control is a div role=button so the artist link stays a separate button (fixes nested button DOM warning). Music Explore sidebar pick panel: live download feedback (per-row spinner, header count), removes tracks when jobs finish, shift-range toggle deselect, row removal animation, seamless Explore nav/webview/boot bar layout (no column gap). Music Explore download path fix (enqueue honors saveToInternal / internal vault via resolveDownloadOutputDir; was using stale custom outputDir). Music Explore webview stays visible when sidebar pick/paste panel is open. Music Explore layout fix (boot bar in content column, sidebar full height, no gap at sidebar/boot junction). Music Explore webview lifecycle fix (ref-only host, no hide-on-cleanup race, show+bounds after create, HMR reattach). Music Explore crash fix (`isPasteMode` used before init in `MusicShell`). Music Explore UX fixes: bounds resync on explore enter; collapsed More menu portaled; track selection row click + Shift range with stable url keys; Load all remaining; playlist output folders use yt-dlp title not URL. Earlier: Music Explore tab is now a real music.youtube.com webview (shared Explorer cookie jar, same `explorer-data` profile). Floating download strip appears below the webview on playlist/album pages: Download all, Pick tracks (slide-up native panel), Paste URL overflow. App-wide login chip appears in the main titlebar when signed into YouTube. Dual probe (explorer-view + music-explore-view) keeps the chip current. Music Home: YouTube profile chip from Explorer session (hidden when signed out; probe via `explorer-youtube-profile` event). Header scroll blur removed. Quick picks restyled as YTM list rows with tiny square art; home/library thumbs smaller. Music mode Phase A/B: Home shelves density pass (fixed quick picks vs recently added split; added Rediscover, Artists horizontal shelf, album row); MusicArtistView and MusicAlbumView local detail pages (blurred hero, stats, tracklist, Play/Shuffle); musicDetail store slice with navigation stack; Library rows now open detail views instead of auto-playing; album dedup key changed to artistKey::albumKey; scan_media_file_direct now calls extract_music_meta for loose audio files (was returning artist: None); hasSquareCover helper for honest aspect ratios (square embedded art vs 16:9 video thumbs); NowPlayingBar artist line clickable to artist detail view; MusicExploreView fully rewritten as custom YTM download intake (URL bar, artist/album/playlist browse shelves via headless yt-dlp, 10-item pagination with Load More, per-track and batch multi-select download, audio-only enqueue via existing output path logic, Explore-only offline state); get_music_browse_info and get_playlist_items_page Tauri commands; music.youtube.com URL helpers; downloadJobStartDelayMs setting with pump spacing for batch downloads. Delete routes to OS Recycle Bin with complete sidecar cleanup and empty-folder prune; Recently Deleted view restores from system trash when recoverable. Explorer webview fix: reattach to existing `explorer-view` after HMR/hard refresh instead of failing with "already exists". Chapter scrubber fix: playhead, hover wash, and click/drag seek aligned to chapter segment grid (fixes drift and hover-ahead-of-cursor on long chaptered videos). Radial menu: Alt-release hover-to-select (hover wedge + release Alt fires action, no click needed); all icon animations removed from radial and sidebar (static render, no SMIL); per-mode wedge icon sets. Mini player: handlePopOut now works from music mode; navMode passed in handoff so mini applies data-music-mode; library tile hover scale bug fixed; handleSelectMedia emits stop-playback so main music halts. Chrome: mini button moved to PlayerView bottom bar and NowPlayingBar (left of fullscreen/expand); export button hidden in music titlebar only. SponsorBlock settings category list collapsed by default (no auto-expand on master toggle); expanded categories show vertical tree line. Export panel (configure/running/done FSM, media + playlist context menus, Settings library export, hide during run without cancel). Export bundler Phase A (`export_media_bundle` / `cancel_export_bundle`: cross-volume sidecar bundle, timestamp subfolder, canonical dedup, skip-if-exists, manifest v1). Website link audit (Features hub media-library/mini-player hrefs, `mobileHref` for mobile nav, built-with docs link, legacy 301 redirects). `/m/` link and SEO fixes (footer/nav `/m/` paths, sitemap excludes `/m/`, desktop `rel="alternate"`); pages.dev preview redirect to ruforge.app. Full mobile shell coverage: 94 `/m/*` pages covering every desktop route. Three reusable mobile templates (MobileContentPage, MobileSectionIndex, MobileDocsPage), dynamic routes for docs, built-with, legal, section content, plus bespoke pages for features hub, 6 feature details, changelog, and roadmap. Universal BaseLayout mobile redirect (UA + viewport gate) replaces per-page scripts. MobileShell auto-injects canonical + noindex SEO tags. Shared `featurePageData.ts` for desktop/mobile feature pages. Earlier: mobile landing polish (overlay scroll fix, nav accordion, Material ripple, header cross-fade), `/m/download` page with OS-detect CTA, stripped mobile-collapse responsive logic, scaffolded desktop/mobile shell architecture, full website asset audit (22.9 MB to 8.3 MB), silk background animation, Getting Started docs, docs sidebar search, Obsidian-style `/docs`, six `/features/*` pages, redesigned download page, downloader cookie fixes. (see AGENTS.md Shipped log)

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
