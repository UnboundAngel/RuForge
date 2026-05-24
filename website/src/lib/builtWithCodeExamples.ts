import type { CodeSnippetSource } from './readCodeSnippet';

export const builtWithCodeExamples: Record<string, CodeSnippetSource[]> = {
  youtube: [
    {
      file: 'src/youtubeUrl.ts',
      startLine: 24,
      endLine: 48,
      caption: 'Playlist links normalize to a stable `list=` id before the downloader treats them as a batch.',
    },
    {
      file: 'src/youtubeUrl.ts',
      startLine: 175,
      endLine: 202,
      caption: 'Clipboard paste and drag-drop text run through the same URL extractor (playlist wins when `list=` is present).',
    },
    {
      file: 'src/components/downloader/useDownloaderView.ts',
      startLine: 239,
      endLine: 263,
      caption: 'After `get_video_info` marks a playlist, the hero builds a per-video enqueue plan with duplicate and audio overrides.',
    },
  ],
  ytdlp: [
    {
      file: 'src-tauri/src/commands/downloader.rs',
      startLine: 1003,
      endLine: 1056,
      caption: '`get_video_info` runs parallel yt-dlp `-J -s` simulates for video and audio format strings before the UI shows sizes.',
    },
    {
      file: 'src/downloadVideoInfoFetch.ts',
      startLine: 39,
      endLine: 81,
      caption: 'The downloader hero calls Rust through a deduped, timed `invoke("get_video_info")` keyed by URL, format, and cookies.',
    },
    {
      file: 'src-tauri/src/commands/downloader.rs',
      startLine: 1371,
      endLine: 1402,
      caption: 'Active jobs spawn the bundled yt-dlp sidecar, attach stdout parsing, and register the child with the download manager.',
    },
  ],
  sponsorblock: [
    {
      file: 'src-tauri/src/commands/sponsorblock.rs',
      startLine: 188,
      endLine: 224,
      caption: 'Rust requests every skip, chapter, and POI category from SponsorBlock (not the sponsor-only API default).',
    },
    {
      file: 'src-tauri/src/commands/sponsorblock.rs',
      startLine: 238,
      endLine: 318,
      caption: '`ensure_sponsorblock_segments` reads `{stem}.sponsorblock.json` or refetches when stale, then writes the sidecar.',
    },
    {
      file: 'src/hooks/useSponsorBlockPlayback.ts',
      startLine: 82,
      endLine: 150,
      caption: 'On play the hook loads segments via IPC and auto-seeks when a category is set to auto-skip in Settings → Playback.',
    },
  ],
  tauri: [
    {
      file: 'src-tauri/tauri.conf.json',
      startLine: 6,
      endLine: 10,
      caption: 'Tauri dev loads Vite on port 1420; release builds run `npm run build` into `dist/` first.',
    },
    {
      file: 'src-tauri/tauri.conf.json',
      startLine: 42,
      endLine: 50,
      caption: 'Sidecar binaries for yt-dlp, ffmpeg, and ffprobe ship inside the installer bundle.',
    },
    {
      file: 'src/updaterCheck.ts',
      startLine: 10,
      endLine: 27,
      caption: 'Startup calls plugin-updater `check()` against live `updater.json` and returns a typed teaser for the overlay card.',
    },
  ],
  rust: [
    {
      file: 'src-tauri/src/lib.rs',
      startLine: 124,
      endLine: 159,
      caption: 'Command registration wires download, gallery scan, SponsorBlock, explorer bounds, and media preview IPC in one handler.',
    },
    {
      file: 'src-tauri/src/commands/gallery.rs',
      startLine: 849,
      endLine: 877,
      caption: '`scan_gallery` sweeps duplicate yt-dlp leftovers, then walks the download folder into typed `GalleryEntry` rows.',
    },
    {
      file: 'src-tauri/src/commands/media.rs',
      startLine: 297,
      endLine: 319,
      caption: 'Sprite generation runs under a per-file ffmpeg lock and emits `scrub-sprites-updated` when sheets land on disk.',
    },
  ],
  react: [
    {
      file: 'src/main.tsx',
      startLine: 16,
      endLine: 27,
      caption: 'Each webview label (`main`, `mini`, `notify`) mounts the same React entry with a different root component.',
    },
    {
      file: 'src/App.tsx',
      startLine: 1489,
      endLine: 1538,
      caption: 'Zustand `activeTab` swaps Downloader, Explorer, Media, Player, and Settings without a router package.',
    },
    {
      file: 'src/components/PlayerView.tsx',
      startLine: 1543,
      endLine: 1551,
      caption: 'Player outer shell reads `playingFile` from the store; hooks stay inside `PlayerViewWithFile` when a file exists.',
    },
  ],
  ffmpeg: [
    {
      file: 'src-tauri/src/commands/media.rs',
      startLine: 69,
      endLine: 106,
      caption: 'ffmpeg runs as a Tauri sidecar with a per-video lock so preview jobs cannot deadlock each other.',
    },
    {
      file: 'src-tauri/src/commands/media.rs',
      startLine: 258,
      endLine: 294,
      caption: 'Scrubber sprites use `fps=1/5` and a 10×10 tile filter; finished sheets live beside the video under `.ruforge/thumbs/`.',
    },
  ],
  zustand: [
    {
      file: 'src/store/ruforgeStore.ts',
      startLine: 203,
      endLine: 238,
      caption: 'One store holds nav tab, downloader hero fields, gallery list, and settings defaults for the main webview.',
    },
    {
      file: 'src/store/ruforgeStore.ts',
      startLine: 605,
      endLine: 620,
      caption: 'Only settings and output paths persist; queue rows and gallery entries reload from disk on boot.',
    },
    {
      file: 'src/store/downloadQueueSlice.ts',
      startLine: 912,
      endLine: 963,
      caption: 'Finish handler clears the hero URL, promotes the next slot, and triggers a silent gallery rescan on success.',
    },
  ],
  vite: [
    {
      file: 'vite.config.ts',
      startLine: 8,
      endLine: 18,
      caption: 'Dev server binds port 1420 for `tauri dev`, enables React + Tailwind v4, and ignores `src-tauri` file churn.',
    },
    {
      file: 'src-tauri/tauri.conf.json',
      startLine: 6,
      endLine: 10,
      caption: '`beforeBuildCommand` runs root `npm run build` (`tsc` + Vite) before Tauri packages the UI.',
    },
  ],
  typescript: [
    {
      file: 'src/types.ts',
      startLine: 1,
      endLine: 17,
      caption: '`MediaFile` carries sidecar ids, chapters, and playlist index so gallery and player share one shape.',
    },
    {
      file: 'src/types.ts',
      startLine: 53,
      endLine: 65,
      caption: '`VideoInfo` types playlist expansion, dual size fields, and hero metadata from yt-dlp simulate.',
    },
    {
      file: 'src/updaterCheck.ts',
      startLine: 5,
      endLine: 27,
      caption: 'Updater and IPC boundaries use discriminated unions so UI branches stay exhaustive at compile time.',
    },
  ],
  tailwindcss: [
    {
      file: 'src/index.css',
      startLine: 21,
      endLine: 36,
      caption: 'Desktop `:root` tokens back accent, surfaces, and radii; `--accent` syncs from Settings at runtime.',
    },
    {
      file: 'website/src/styles/global.css',
      startLine: 4,
      endLine: 27,
      caption: 'Marketing site `@theme` maps the same rf-* palette so docs and app chrome feel like one product.',
    },
  ],
  astro: [
    {
      file: 'website/astro.config.mjs',
      startLine: 1,
      endLine: 18,
      caption: 'Astro 5 static site with React islands, Tailwind v4 via Vite, and `fs.allow` so build can read repo snippets.',
    },
    {
      file: 'website/src/pages/docs/built-with/[tool].astro',
      startLine: 1,
      endLine: 30,
      caption: 'Each built-with tool page is a static route generated from `builtWithPages.ts` at build time.',
    },
    {
      file: 'website/src/lib/builtWithPages.ts',
      startLine: 16,
      endLine: 19,
      caption: 'Page copy and snippet sources merge in TypeScript so prose and code blocks stay in sync.',
    },
  ],
  webview2: [
    {
      file: 'src-tauri/src/commands/explorer_embed.rs',
      startLine: 46,
      endLine: 63,
      caption: '`ensure_embedded_explorer_bounds` positions the Explorer child webview over the content column rect.',
    },
    {
      file: 'src-tauri/src/commands/explorer_embed.rs',
      startLine: 98,
      endLine: 129,
      caption: 'Windows skips redundant IPC when logical bounds unchanged; Linux uses a separate parented surface.',
    },
    {
      file: 'src/applyMediaOutputState.ts',
      startLine: 1,
      endLine: 10,
      caption: 'Volume and mute are applied explicitly because WebView2 autoplay can leave `<video>` muted after handoff.',
    },
  ],
  'framer-motion': [
    {
      file: 'website/src/components/HeroAnimatedTitle.tsx',
      startLine: 8,
      endLine: 23,
      caption: 'Landing hero hydrates as a React island and passes underline paths into shared `AnimatedText`.',
    },
    {
      file: 'website/src/components/ui/animated-underline-text-one.tsx',
      startLine: 15,
      endLine: 82,
      caption: 'Framer Motion variants draw the hand-written underline on load and morph the path on hover.',
    },
  ],
  lucide: [
    {
      file: 'src/components/downloader/DownloadJobQueuePanel.tsx',
      startLine: 4,
      endLine: 18,
      caption: 'Queue UI imports only the glyphs it needs; Vite tree-shakes the rest of `lucide-react`.',
    },
    {
      file: 'src/components/MediaView.tsx',
      startLine: 1,
      endLine: 14,
      caption: 'Library cards use Music, Play, and Trash icons for audio badge, preview, and delete actions.',
    },
  ],
  sharp: [
    {
      file: 'website/src/components/LandingFeaturesSection.astro',
      startLine: 1,
      endLine: 4,
      caption: 'Feature screenshots import through `astro:assets`, which triggers Sharp during `astro build`.',
    },
    {
      file: 'website/src/components/LandingFeaturesSection.astro',
      startLine: 43,
      endLine: 56,
      caption: '`<Image />` emits responsive WebP widths so landing rows stay sharp without shipping full PNG weight.',
    },
  ],
};
