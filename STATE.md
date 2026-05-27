# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.9 (unreleased)
Last shipped to users: 0.1.8
Last updated: 2026-05-27
Status: in progress

## Now

0.1.8 is shipping: playlist downloads, SponsorBlock category fetch and scrub hover,
Settings yt-dlp and app update checks, scrubber preview fixes, mini player large-mode
clarity, plus the public website work already on main. Open P0 is empty; Authorize
Cleanup (#8) works via the in-app modal (see Notes).

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

**0.1.9 unreleased:** Website link audit (Features hub media-library/mini-player hrefs, `mobileHref` for mobile nav, built-with docs link, legacy 301 redirects). `/m/` link and SEO fixes (footer/nav `/m/` paths, sitemap excludes `/m/`, desktop `rel="alternate"`); pages.dev preview redirect to ruforge.app. Full mobile shell coverage: 94 `/m/*` pages covering every desktop route. Three reusable mobile templates (MobileContentPage, MobileSectionIndex, MobileDocsPage), dynamic routes for docs, built-with, legal, section content, plus bespoke pages for features hub, 6 feature details, changelog, and roadmap. Universal BaseLayout mobile redirect (UA + viewport gate) replaces per-page scripts. MobileShell auto-injects canonical + noindex SEO tags. Shared `featurePageData.ts` for desktop/mobile feature pages. Earlier: mobile landing polish (overlay scroll fix, nav accordion, Material ripple, header cross-fade), `/m/download` page with OS-detect CTA, stripped mobile-collapse responsive logic, scaffolded desktop/mobile shell architecture, full website asset audit (22.9 MB to 8.3 MB), silk background animation, Getting Started docs, docs sidebar search, Obsidian-style `/docs`, six `/features/*` pages, redesigned download page, downloader cookie fixes. (see AGENTS.md Shipped log)

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
2. 429 / rate-limit spacing (#11). Configurable delay between job starts (not retry-on-failure).
3. Downloader UI polish (#12 Jim pass) or mid-download drop E2E verify (#15).

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
