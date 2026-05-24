import type { TechTickerIconId } from './techTickerIcons';
import { docsBuiltWithItems } from './techTickerIcons';
import { builtWithCodeExamples } from './builtWithCodeExamples';
import type { CodeSnippetSource } from './readCodeSnippet';

export interface BuiltWithPage {
  slug: string;
  icon: TechTickerIconId;
  title: string;
  lead: string;
  paragraphs: string[];
  codeExamples?: CodeSnippetSource[];
  touchpoints?: string[];
}

function withCodeExamples(page: Omit<BuiltWithPage, 'codeExamples'>): BuiltWithPage {
  const examples = builtWithCodeExamples[page.slug];
  return examples?.length ? { ...page, codeExamples: examples } : page;
}

/** Maps docs mega-menu icon ids to URL slugs under `/docs/built-with/`. */
export const builtWithIconToSlug: Record<TechTickerIconId, string> = {
  youtube: 'youtube',
  ytdlp: 'ytdlp',
  sponsorblock: 'sponsorblock',
  tauri: 'tauri',
  rust: 'rust',
  react: 'react',
  ffmpeg: 'ffmpeg',
  zustand: 'zustand',
  vite: 'vite',
  typescript: 'typescript',
  tailwindcss: 'tailwindcss',
  astro: 'astro',
  microsoftedge: 'webview2',
  framer: 'framer-motion',
  lucide: 'lucide',
  sharp: 'sharp',
};

const BUILT_WITH_PAGE_DEFS: BuiltWithPage[] = [
  {
    slug: 'youtube',
    icon: 'youtube',
    title: 'YouTube Downloader',
    lead: 'You paste a YouTube link. RuForge downloads the file and plays it locally. There is no in-app YouTube player.',
    paragraphs: [
      'The downloader tab is built around the URL bar. Paste, drop a link, or copy a watch URL elsewhere and paste when you focus the bar. `extractYouTubeUrlFromText` in `youtubeUrl.ts` pulls the first valid watch or playlist URL out of messy clipboard text (tracking params stripped, playlist preferred when `list=` is present).',
      'Single videos go straight to metadata fetch. Playlist URLs expand first: `get_video_info` returns `isPlaylist` plus `playlistItems`, then `buildPlaylistEnqueuePlan` in `useDownloaderView.ts` builds one row per video with per-item audio toggles, duplicate badges, and a numbered output folder name before anything hits the queue.',
      'After download, YouTube is out of the loop. `scan_gallery` reads `.info.json` sidecars for title, `id`, chapters, and `playlist_index`. The player loads the file from disk via `convertFileSrc`. Media stack cards group playlist folders so you browse a batch like a stack, not a flat pile of files.',
      'Age-restricted or members-only videos need cookies. Settings → Downloads exposes a cookie file path and optional browser profile string. The Explorer tab (child webview) is there to log in on youtube.com when you do not already have a cookie export. yt-dlp gets the same cookie args on simulate and on actual download.',
    ],
    touchpoints: [
      '`youtubeUrl.ts` for parse, canonical URLs, and clipboard extraction',
      '`useDownloaderView.ts` for hero metadata, playlist plan, and enqueue',
      '`DownloaderView.tsx` for the URL bar UI, duplicate banner, and Download button',
      '`.info.json` sidecars written by yt-dlp; read back in `gallery.rs`',
    ],
  },
  {
    slug: 'ytdlp',
    icon: 'ytdlp',
    title: 'yt-dlp Engine',
    lead: 'Every download and metadata preview shells out to a bundled yt-dlp binary. Rust owns the process; React shows the progress.',
    paragraphs: [
      'Sidecars live under `src-tauri/binaries/yt-dlp-*` and are declared in `tauri.conf.json` `externalBin`. `ytdlp_shell_command` resolves the right binary for the host OS, then `start_download_job` in `downloader.rs` builds args from your Settings format string, output template, cookie options, and audio-only flag.',
      'Before you click Download, the hero calls `get_video_info`. That command runs two parallel `-J -s` simulates: one with your video format string, one with `bestaudio[ext=m4a]/bestaudio` for the audio size column. Partial success is fine (audio-only preview can succeed when video simulate fails). Results are cached on the frontend keyed by URL + format + cookies so rapid tab switches do not respawn yt-dlp.',
      'Stdout parsing drives the UI. Lines containing `[download]` update percent, speed, and ETA in `downloadQueueSlice`. When bytes hit 100% but ffmpeg is still muxing, a `processing` phase latch keeps the row on "Processing…" until the child exits. A stall watchdog in TypeScript marks jobs failed if stdout goes quiet too long.',
      'Finished jobs leave `{title}.info.json` (and often a `.webp` thumbnail) next to the media file. `scan_gallery` uses `id` from that sidecar for dedupe. Settings → Advanced can check upstream yt-dlp version and download a newer sidecar when one exists.',
    ],
    touchpoints: [
      '`src-tauri/src/commands/downloader.rs` spawn, progress IPC, finish events',
      '`downloadVideoInfoFetch.ts` deduped `invoke("get_video_info")` with timeout',
      '`downloadFormat.ts` for format strings shared by simulate and download',
      '`downloadQueueSlice.ts` for queue state, hero fields, and watchdog hooks',
    ],
  },
  {
    slug: 'sponsorblock',
    icon: 'sponsorblock',
    title: 'SponsorBlock API',
    lead: 'Community skip segments from SponsorBlock apply to local files, same idea as the browser extension, without streaming from YouTube.',
    paragraphs: [
      'When you press play, `useSponsorBlockPlayback` invokes `ensure_sponsorblock_segments` with the file path. Rust reads `{stem}.sponsorblock.json` beside the video if it exists. The YouTube video id comes from the yt-dlp `.info.json` sidecar (`sourceId` on the frontend). No id means no fetch; playback continues normally.',
      'Stale or missing sidecars trigger an API call. `sponsorblock_fetch_query` sends every category RuForge cares about (sponsor, selfpromo, intro, outro, preview, filler, interaction, music_offtopic, poi_highlight, chapter, etc.), not the API default sponsor-only set. Failures are silent: cached segments keep working offline.',
      'During playback the hook watches `currentTime`. Categories set to `auto` in Settings → Playback seek past segment ends. `button` mode shows `SponsorBlockSkipButton` instead. Adaptive learning adjusts per-category behavior over time based on manual skips and undo windows. Scrub overlays in `SponsorBlockScrubOverlay.tsx` and chapter ticks in `ChapterScrubber.tsx` paint the same color map as the official extension.',
      'Sidecars mean repeat plays skip the network unless you force refresh. Mini player layouts with a scrub bar get the same overlays; compact micro layouts without a scrub bar do not.',
    ],
    touchpoints: [
      '`src-tauri/src/commands/sponsorblock.rs` fetch, normalize, sidecar read/write',
      '`useSponsorBlockPlayback.ts` load on play, auto-skip, button mode',
      '`SponsorBlockSettingsTree.tsx` under Settings → Playback',
      '`SponsorBlockScrubOverlay.tsx`, `SponsorBlockSkipButton.tsx`, `sponsorBlockColors.ts`',
    ],
  },
  {
    slug: 'tauri',
    icon: 'tauri',
    title: 'Tauri v2 Shell',
    lead: 'Tauri turns the Vite React app into a signed Windows desktop binary with extra windows, sidecars, and IPC.',
    paragraphs: [
      'Two primary webviews ship today: `main` (full app) and `mini` (always-on-top pop-out). Each loads the same Vite bundle from `dist/` in release, or `http://localhost:1420` during `tauri dev`. Window chrome (minimize, maximize, close, queue drawer, mini toggle) is custom React in `App.tsx`, not native title bars (`decorations: false`).',
      'Rust commands register in `lib.rs` via `generate_handler!`. TypeScript calls them with `invoke` from `@tauri-apps/api/core`. Local media paths go through `convertFileSrc` plus `assetProtocol` scopes in `tauri.conf.json` so `<video>` can read files under your home and download drives.',
      'Cross-window playback does not share Zustand. Main emits `play-in-mini` / `play-media`; mini emits `send-to-main` and `stop-playback`. Each webview has its own JS heap, so events plus a few flat `localStorage` keys bridge state.',
      'The updater plugin fetches `updater.json` from GitHub on startup (`runUpdateCheck` in `updaterCheck.ts`). Signed NSIS builds download and install in-app. Post-install copy can be structured JSON parsed by `updatePostInstall.ts` for the scrollable What is new modal.',
    ],
    touchpoints: [
      '`src-tauri/tauri.conf.json` windows, sidecars, asset scopes, updater pubkey',
      '`App.tsx` startup update check and `UpdaterLayers.tsx` UI',
      '`MiniPlayer.tsx` second window entry; Tauri events for playback handoff',
      'Explorer child webview: `explorer_embed.rs`, `open_youtube_explorer` command',
    ],
  },
  {
    slug: 'rust',
    icon: 'rust',
    title: 'Rust Core',
    lead: 'Downloads, disk scans, ffmpeg jobs, and SponsorBlock fetches run in Rust. The React layer invokes and renders.',
    paragraphs: [
      'Command modules under `src-tauri/src/commands/` own IO-heavy work. `downloader.rs` spawns yt-dlp children, parses stdout into `download-progress` events, and cleans up on pause or cancel. `gallery.rs` walks configured folders, merges playlist stacks, dedupes by yt-dlp `id`, and normalizes chapter arrays from sidecars.',
      '`media.rs` runs ffmpeg/ffprobe sidecars with per-video async locks (`with_per_video_ffmpeg_lock`). That fixed a past deadlock where nested locks on the same file blocked sprite generation during playback. Auto scrub previews enqueue sprite sheets when a video download finishes (unless audio-only or the setting is off).',
      '`explorer_embed.rs` positions the embedded browser: in-window child on Windows, parented surface on Linux dev builds. Bounds sync coalesces through `explorerBoundsSync.ts` during sidebar animation so IPC does not fire on every frame.',
      'Windows-only niceties live here too: `windows_audio_brand.rs` renames WebView2 audio sessions in the volume mixer to "RuForge" with the app icon. Linux dev builds get broader asset scopes and platform path hydration from Tauri APIs.',
    ],
    touchpoints: [
      '`src-tauri/src/lib.rs` command registration',
      '`downloader.rs`, `gallery.rs`, `media.rs`, `sponsorblock.rs`',
      '`explorer_embed.rs` for Explorer bounds and visibility',
      'Sidecar resolution for yt-dlp, ffmpeg, ffprobe under `binaries/`',
    ],
  },
  {
    slug: 'react',
    icon: 'react',
    title: 'React 19 Core',
    lead: 'The desktop UI is React 19 inside Tauri webviews. Tabs replace a router; Zustand picks the active surface.',
    paragraphs: [
      '`main.tsx` checks `getCurrentWindow().label` and mounts either `App`, `MiniPlayer`, or `NotifyOverlayApp`. Same React 19 + StrictMode entry for each webview label.',
      '`App.tsx` is the shell: sidebar nav sets `activeTab` in Zustand (`downloader`, `explorer`, `media`, `player`, `settings`). `AnimatePresence` swaps the major views. Explorer is special: the tab body is mostly a positioned host div because the child webview paints on top.',
      'Heavy feature UIs are split components. Downloader logic sits in `useDownloaderView.ts` with UI in `DownloaderView.tsx` and `DownloadJobQueuePanel.tsx`. Player splits outer `PlayerView` (nullable `playingFile` guard) from inner `PlayerViewWithFile` so hooks never run without a file. Settings uses nested collapsible trees for SponsorBlock and playback prefs.',
      'Mini player is a separate bundle with duplicated playback UI state (progress, hover, layout mode). It listens for Tauri events instead of subscribing to the main store. Fast refresh works under `npm run tauri dev` the same as plain Vite.',
    ],
    touchpoints: [
      '`main.tsx` webview label routing',
      '`App.tsx` tab shell, window chrome, event listeners',
      '`PlayerView.tsx`, `MediaView.tsx`, `DownloaderView.tsx`, `SettingsView.tsx`',
      '`MiniPlayer.tsx` second-window playback UI',
    ],
  },
  {
    slug: 'ffmpeg',
    icon: 'ffmpeg',
    title: 'FFmpeg Processing',
    lead: 'ffmpeg and ffprobe ship as bundled sidecars for yt-dlp muxing, scrubber sprite sheets, and quiet metadata probes.',
    paragraphs: [
      'yt-dlp invokes ffmpeg when a download needs merge or post-process steps. RuForge watches stdout after the byte bar hits 100% and keeps the queue row in a Processing phase until the child process exits. Audio-only jobs skip video post-process paths.',
      'Scrubber hover previews are local sprite sheets. Settings → Downloads auto scrubber previews (default on) tells `downloader.rs` to call `extract_frames` after a successful video finish. The ffmpeg filter chain samples one frame every five seconds into 160×90 tiles on a 10×10 grid (`fps=1/5,scale=160:90,tile=10x10`). Sheets land under `.ruforge/thumbs/` beside the video.',
      '`useScrubberThumbs.ts` loads sheet paths and maps hover position to a tile. Chapter scrubber and simple scrubber both use the same hook; Generate Previews in the library calls the same Rust command when auto mode is off. Completing a sheet emits `scrub-sprites-updated` so open players reload without restart.',
      'ffprobe warms a disk cache (`ffprobe-hints` under app data). The player UI does not show codec strings today. Delete and replace flows cancel in-flight ffmpeg work via the per-file lock so files are not left locked on disk.',
    ],
    touchpoints: [
      'Sidecars `binaries/ffmpeg-*` and `binaries/ffprobe-*` in `tauri.conf.json`',
      '`src-tauri/src/commands/media.rs` sprites, posters, ffprobe cache',
      '`useScrubberThumbs.ts`, `ChapterScrubber.tsx`, `ScrubHoverPreview.tsx`',
      'Settings → Downloads auto-preview toggle (`autoScrubPreviews` in store settings)',
    ],
  },
  {
    slug: 'zustand',
    icon: 'zustand',
    title: 'Zustand State Store',
    lead: 'One Zustand store is the main-window brain: nav, settings, download queue, gallery list, and hero metadata.',
    paragraphs: [
      '`useRuforgeStore` in `ruforgeStore.ts` merges slices into a single `create()` call. `createDownloadQueueSlice` owns jobs, focus row, enqueue/pause/finish handlers, and legacy hero fields (`url`, `videoInfo`, `metadataLoading`). Gallery state holds `entries`, `galleryLoading`, and scan revision counters.',
      'Components subscribe with selectors (`useRuforgeStore(s => s.activeTab)`) to avoid rerendering the whole tree when unrelated fields change. Player scrub hover, open menus, and transient downloader UI stay in local `useState` on purpose.',
      'Persistence uses `ruforgePersistStorage.ts`: flat `localStorage` keys for settings and output paths so older builds and mini-player readers stay compatible. Download jobs also persist to survive restarts mid-queue. Gallery entries reload from disk via `fetchEntries` after boot.',
      'Zustand does not cross webviews. Mini player keeps its own playback state and syncs through Tauri events. When debugging playback handoff, check both surfaces.',
    ],
    touchpoints: [
      '`src/store/ruforgeStore.ts` main store composition',
      '`src/store/downloadQueueSlice.ts` queue CRUD, finish handler, hero clear',
      '`ruforgePersistStorage.ts` flat key mapping',
      'Not persisted: transient player UI, explorer shimmer, modal open flags',
    ],
  },
  {
    slug: 'vite',
    icon: 'vite',
    title: 'Vite Build Tool',
    lead: 'Vite bundles the desktop React app that Tauri loads in main and mini webviews.',
    paragraphs: [
      'Root `vite.config.ts` enables `@vitejs/plugin-react` and `@tailwindcss/vite`. Dev server binds port 1420 with `strictPort: true`. `tauri.conf.json` points `devUrl` there for `npm run tauri dev`. The watch config ignores the `src-tauri` tree so Rust rebuild noise does not restart the frontend dev server.',
      'Production path: `beforeBuildCommand` runs `npm run build`, which is `tsc` then `vite build`. Output lands in repo-root `dist/`, referenced as `frontendDist` in Tauri config. Tauri packages that folder into the NSIS/MSI installer.',
      'Optional `TAURI_DEV_HOST` enables HMR over LAN (protocol ws on port 1421). Chunk size warnings above ~500 kB are a known heads-up, not a release blocker.',
      'The marketing site in `website/` is a separate Astro project with its own Vite instance (`astro.config.mjs`). Only the root Vite build feeds the desktop bundle.',
    ],
    touchpoints: [
      'Root `vite.config.ts` and `package.json` scripts (`dev`, `build`)',
      '`tauri.conf.json` `beforeBuildCommand`, `devUrl`, `frontendDist`',
      'Separate `website/` Vite via Astro for Cloudflare Pages',
    ],
  },
  {
    slug: 'typescript',
    icon: 'typescript',
    title: 'TypeScript',
    lead: 'Frontend domain types and IPC boundaries are TypeScript so refactors fail at compile time, not in the webview.',
    paragraphs: [
      '`src/types.ts` defines `MediaFile`, `VideoInfo`, `DownloadJob`, chapter shapes, and progress payloads returned from Rust. Gallery entries discriminate `kind: "media"` vs playlist stacks. Sidecar fields like `sourceId` and `playlistIndex` flow from yt-dlp JSON into the player and SponsorBlock hooks.',
      '`src/store/types.ts` holds `RuforgeSettings` (download format, SponsorBlock modes, auto-advance audio, auto scrub previews, max concurrent jobs, cookie paths). Settings UI and store persist the same object shape.',
      '`npm run build` runs `tsc -b` before Vite bundles. Nullable `playingFile`, queue rows removed mid-download, and gallery scans in flight are the usual places strict null checks catch real bugs.',
      'The website under `website/src/lib/*.ts` is also TypeScript: `builtWithPages.ts`, `sitePages.ts`, nav helpers. App and site share naming (RuForge, rf-* tokens) but not a shared npm package. Copy types manually when they must align.',
    ],
    touchpoints: [
      '`src/types.ts`, `src/store/types.ts`',
      'Typed `invoke` at download, gallery, SponsorBlock, and media commands',
      '`website/src/lib/*.ts` content registries and page defs',
    ],
  },
  {
    slug: 'tailwindcss',
    icon: 'tailwindcss',
    title: 'Tailwind CSS',
    lead: 'Tailwind v4 utility classes plus rf-* CSS tokens style the desktop app and the public site from the same palette idea.',
    paragraphs: [
      'The app uses `@tailwindcss/vite` with Tailwind 4. Global tokens live in `src/index.css` under `:root` (`--bg`, `--accent`, `--surface`, radii). Settings accent color writes into `--accent` at runtime via `accentCss.ts`. Frosted player dock, queue drawer blur, and downloader hero are plain utility stacks, not a component library.',
      'The marketing site loads the same major Tailwind version through `website/src/styles/global.css` `@theme` block (`--color-rf-bg`, `--color-rf-accent`, etc.). Classes like `rf-container`, `rf-link-card`, and mega-menu overrides keep docs visually aligned without importing app CSS.',
      'Scrollbars use a shared `rf-scrollbar` class (slim accent thumb, no native arrow buttons) on both surfaces. Horizontal carousels opt out with `scrollbar-none`.',
      'Mini player adds height breakpoints (compact, micro, tiny) where controls hide or shrink based on window size. Responsive behavior is mostly Tailwind breakpoints plus a few inline measurements for micro layouts.',
    ],
    touchpoints: [
      '`@tailwindcss/vite` in root and `website/` Vite configs',
      '`src/index.css` and `website/src/styles/global.css`',
      'Component utilities in `PlayerView.tsx`, `DownloadJobQueuePanel.tsx`, `SiteHeader.astro`',
    ],
  },
  {
    slug: 'astro',
    icon: 'astro',
    title: 'Astro Site',
    lead: 'The public RuForge site in `website/` is Astro 5 static output, deployed to Cloudflare Pages.',
    paragraphs: [
      'Astro owns the landing page, changelog, roadmap, legal markdown pages, and docs routes. Most layout is `.astro` components; interactive bits (header mega-menu, hero underline) hydrate as React islands with `client:visible` or `client:load`.',
      'Docs IA is data-driven. `sitePages.ts` registers template pages; built-with tools add a dedicated route at `website/src/pages/docs/built-with/[tool].astro` that reads copy from `builtWithPages.ts`. Section indexes under `[section]/index.astro` list siblings from the same registry.',
      'Built-with pages pull live repo snippets at build time: `readCodeSnippet.ts` slices real source from one directory up (repo root), Shiki highlights them, and `CodeSnippetPanel` renders collapsible blocks. No hand-copied code in markdown.',
      'Build output is static HTML/CSS/JS (`astro build`). No server on Pages. The site version badge tracks app semver but the site can ship on its own cadence.',
    ],
    touchpoints: [
      '`website/astro.config.mjs` with `@astrojs/react` and Tailwind Vite plugin',
      '`website/src/pages/` including `docs/built-with/[tool].astro`',
      '`BuiltWithPageTemplate.astro`, `ContentPageTemplate.astro`, `BaseLayout.astro`',
      '`website/src/lib/builtWithPages.ts` page copy and snippet registry',
    ],
  },
  {
    slug: 'webview2',
    icon: 'microsoftedge',
    title: 'WebView2 Shell',
    lead: 'On Windows, WebView2 (Edge Chromium) hosts the React UI and a separate embedded surface for Explorer cookie flows.',
    paragraphs: [
      'The main window webview loads the Vite bundle. Local playback uses Tauri asset protocol scopes so `convertFileSrc` URLs resolve under your download and library paths. CSP is null in config; sandboxing is mostly Tauri capability boundaries plus path allowlists.',
      'Explorer is a child webview (`explorer-view` label on Windows) positioned over the content column. It paints above normal DOM, which is why back/forward/reload live in `ExplorerTitlebarNav` fixed at the sidebar seam, not inside the Explorer tab body. `explorerBoundsSync.ts` sends screen-space rects to `ensure_embedded_explorer_bounds` during sidebar resize.',
      'WebView2 quirks shaped a few frontend choices: native `confirm()` is dead in practice, so deletes use React `ConfirmDialog`. Audio visualizers tap `captureStream()` because analyser nodes on `<video>` alone read silence in WebView2. `applyMediaOutputState.ts` syncs volume/mute on every load because autoplay can leave elements muted after mini handoff.',
      'Rust patches Windows volume mixer labels via Core Audio so sessions show RuForge instead of a generic WebView2 name (`windows_audio_brand.rs`).',
    ],
    touchpoints: [
      '`explorer_embed.rs` child bounds, visibility, Linux surface variant',
      '`ExplorerTitlebarNav` + Explorer host div in `App.tsx`',
      '`applyMediaOutputState.ts` on `<video>` / `<audio>` in player and mini',
      '`tauri.conf.json` `assetProtocol.scope` drive and home paths',
    ],
  },
  {
    slug: 'framer-motion',
    icon: 'framer',
    title: 'Framer Motion',
    lead: 'Framer Motion shows up on the marketing site hero, not in the desktop player control dock.',
    paragraphs: [
      'Landing hero title is a React island (`HeroAnimatedTitle.tsx`) that wraps shared `AnimatedText`. On mount, motion variants fade the headline in and draw an SVG underline path. Hover morphs the path to a second Bezier for a hand-drawn wiggle.',
      'The desktop app lists `motion/react` (and legacy framer-motion in places) for mini player visualizer morphs and some AnimatePresence transitions in `App.tsx` tab swaps. Site and app pin different motion packages; each `package.json` owns its version.',
      'Simple hovers (buttons, cards, mega-menu links) stay CSS transitions in `global.css`. Motion is reserved for sequenced hero text where coordinating opacity + path length in CSS would be annoying to maintain.',
    ],
    touchpoints: [
      '`website/src/components/HeroAnimatedTitle.tsx`',
      '`website/src/components/ui/animated-underline-text-one.tsx`',
      '`MiniPlayer.tsx` compact visualizer morph paths (app bundle)',
      '`App.tsx` `AnimatePresence` tab transitions (motion/react)',
    ],
  },
  {
    slug: 'lucide',
    icon: 'lucide',
    title: 'Lucide Icons',
    lead: 'Lucide React icons are the default glyph set for downloader, library, player, settings, and queue UI.',
    paragraphs: [
      'Each file imports named icons from `lucide-react` (`Music`, `Video`, `Trash2`, `Play`, etc.). Vite tree-shakes unused exports, so importing fifteen icons in `DownloadJobQueuePanel.tsx` does not bundle the whole library.',
      'Queue rows use Music/Video toggles for per-job audio mode. Library cards show a Music pill badge on audio-only files. Player dock uses Play/Pause, skip, volume tiers, and Ellipsis for the More menu. Settings trees use chevrons for collapse. Updater overlay uses `Loader2` while downloading.',
      'Sizing is consistent: `h-4 w-4` or `size={16}` on dense rows, slightly larger on primary player actions. Icon color inherits from Tailwind text utilities or explicit accent classes.',
      'The marketing site also depends on `lucide-react` for newer nav pieces. Older site chrome still uses Iconify or inline SVG where it predates Lucide.',
    ],
    touchpoints: [
      '`DownloadJobQueuePanel.tsx`, `DownloaderView.tsx`, `MediaView.tsx`',
      '`PlayerView.tsx`, `SponsorBlockSettingsTree.tsx`, `UpdaterLayers.tsx`',
      'Website `lucide-react` in header/nav where added',
    ],
  },
  {
    slug: 'sharp',
    icon: 'sharp',
    title: 'Sharp Images',
    lead: 'Sharp is Astro image pipeline dependency. It runs at site build time, not in the desktop app.',
    paragraphs: [
      'Importing through `astro:assets` (`import { Image } from "astro:assets"`) triggers Sharp during `astro build`. Source files live under `website/src/assets/` (landing screenshots, testimonial avatars, tutorial PNGs, footer paper texture). Output is responsive WebP under `dist/_astro/*.webp`.',
      'Components pass `widths` and `sizes` so Astro generates a srcset. Landing feature rows, hero carousel slides, and testimonial columns all use this path. Layout stays stable because width/height hints reserve space before lazy-loaded images arrive.',
      'Sharp does not ship in the RuForge installer. Player thumbnails come from yt-dlp art, ffmpeg poster JPEGs, or local files on disk. Scrub sprites are ffmpeg output, not Astro image service.',
      'Adding a new marketing image: drop source in `website/src/assets/`, import in the `.astro` component, run `npm run build` in `website/` to verify Sharp output.',
    ],
    touchpoints: [
      '`website/package.json` `sharp` dependency (via Astro image service)',
      '`<Image />` in `LandingFeaturesSection.astro`, `HeroCarousel.astro`, `TestimonialsColumn.astro`',
      '`website/src/assets/` sources optimized into `dist/_astro/` on build',
    ],
  },
];

export const BUILT_WITH_PAGES: BuiltWithPage[] = BUILT_WITH_PAGE_DEFS.map((page) =>
  withCodeExamples(page),
);

const pageBySlug = new Map(BUILT_WITH_PAGES.map((p) => [p.slug, p]));

export function builtWithHref(slug: string): string {
  return `/docs/built-with/${slug}`;
}

export function builtWithHrefForIcon(icon: TechTickerIconId): string {
  return builtWithHref(builtWithIconToSlug[icon]);
}

export function findBuiltWithPage(slug: string): BuiltWithPage | undefined {
  return pageBySlug.get(slug);
}

export function getBuiltWithStaticPaths(): { tool: string }[] {
  return BUILT_WITH_PAGES.map((p) => ({ tool: p.slug }));
}

/** Ordered list matching the docs mega-menu grid (for index sidebar). */
export function getBuiltWithNavItems(): { slug: string; title: string; icon: TechTickerIconId }[] {
  return docsBuiltWithItems.map((item) => {
    const slug = builtWithIconToSlug[item.icon];
    const page = pageBySlug.get(slug);
    return { slug, title: page?.title ?? item.name, icon: item.icon };
  });
}

/** `data-built-with-nav` on `<html>` for view-transition direction scripts. */
export type BuiltWithNavKind = 'index' | 'detail';

export interface BuiltWithNavContext {
  kind: BuiltWithNavKind;
  /** Mega-menu / sidebar order index; omitted on index page. */
  index?: number;
  activeSlug?: string;
}

const navIndexBySlug = new Map(
  getBuiltWithNavItems().map((item, index) => [item.slug, index] as const),
);

/** Sidebar / mega-menu order (0 … n-1). */
export function getBuiltWithPageNavIndex(slug: string): number {
  return navIndexBySlug.get(slug) ?? -1;
}

export function getBuiltWithNavContextForSlug(slug: string): BuiltWithNavContext {
  const index = getBuiltWithPageNavIndex(slug);
  return { kind: 'detail', index, activeSlug: slug };
}

export function getBuiltWithIndexNavContext(): BuiltWithNavContext {
  return { kind: 'index' };
}
