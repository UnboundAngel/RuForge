/**
 * Shared feature page section data for both desktop and mobile routes.
 * Images are referenced by filename; the consuming .astro file resolves
 * them via import.meta.glob on the tutorials asset directory.
 */

export interface FeatureSectionDef {
  heading: string;
  body: string;
  bullets: string[];
  imageFile: string;
  imageAlt: string;
}

export interface FeaturePageDef {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  imageDir: string;
  sections: FeatureSectionDef[];
}

export const FEATURE_PAGES: FeaturePageDef[] = [
  {
    slug: 'downloader',
    title: 'Downloader',
    metaTitle: 'Downloader: persistent queue and playlists',
    metaDescription: 'Download videos and audio offline with a yt-dlp frontend. Queue survives restarts, supports playlists and audio extraction.',
    description: 'Reliable YouTube downloads with real size estimates, playlist folders, audio extraction, and a queue that does not pretend hung jobs are fine.',
    imageDir: 'download',
    sections: [
      {
        heading: 'Paste a URL and go',
        body: 'Drop a YouTube link into the input and RuForge fetches metadata immediately. You see the title, thumbnail, and size estimates before anything downloads. The hero area shows a live progress bar with speed and ETA once a job starts.',
        bullets: [
          'Metadata fetch uses yt-dlp simulate (no partial download)',
          'Size estimates differ for audio-only vs video (dual simulate)',
          'Clipboard paste, drag-drop, and manual entry all work',
        ],
        imageFile: 'downloadStep1.png',
        imageAlt: 'RuForge downloader with URL pasted and metadata loaded',
      },
      {
        heading: 'Playlist support',
        body: 'Paste a playlist URL and every video appears as a row with its own toggle. Flip individual rows to audio-only, see per-row sizes, and check for duplicates before you commit. Downloads land in a numbered subfolder so file order matches playlist order.',
        bullets: [
          'Per-row audio/video toggle with individual size previews',
          'Duplicate detection warns before you waste bandwidth',
          'Output folder: PlaylistName/01 - Title.mp4, 02 - Title.mp4, etc.',
          'Settings tool regroups flat files into playlist folders after the fact',
        ],
        imageFile: 'downloadStep2.png',
        imageAlt: 'RuForge playlist download with per-row controls',
      },
      {
        heading: 'Queue and format control',
        body: 'The floating queue drawer lives in the bottom-right corner. Thumbnails crossfade as jobs advance. Pause, resume, reorder, or replace a job without leaving the page. Format selection picks between video (best muxed) or audio-only (m4a extraction, not a re-encode).',
        bullets: [
          'Audio-only uses `-f bestaudio[ext=m4a]/bestaudio`, not video re-encode',
          'Stall watchdog: if yt-dlp idles too long, kills the process and marks failed',
          'Replace button re-downloads over an existing library file in place',
          'Cookie/session support for age-restricted or members-only content',
        ],
        imageFile: 'download2.png',
        imageAlt: 'RuForge download queue drawer with active jobs',
      },
      {
        heading: 'Post-download processing',
        body: 'After a successful download, RuForge generates scrubber preview sprites (ffmpeg sprite sheets) so hover previews work immediately in the player. Duplicate outputs from yt-dlp (video-only + muxed for the same id) are cleaned up automatically.',
        bullets: [
          'Sprite generation runs in background (toggle off in Settings > Downloads)',
          'Orphan .fNNN video-only leftovers removed after mux completes',
          'Library scan picks up new files and deduplicates by source_id',
          'Processing phase shows "Processing..." in queue row while ffmpeg works',
        ],
        imageFile: 'downloadStep3.png',
        imageAlt: 'RuForge download complete with processing indicator',
      },
    ],
  },
  {
    slug: 'media-library',
    title: 'Media Library',
    metaTitle: 'Local media library with auto-scan',
    metaDescription: 'Browse downloaded videos and audio in a local gallery. Filters, search, duplicate detection, playback persistence.',
    description: 'Local file scanning with sidecar metadata, watch progress on every card, and automatic deduplication so your library stays clean.',
    imageDir: 'library',
    sections: [
      {
        heading: 'Folder scanning and discovery',
        body: 'Point RuForge at your download folder and any custom roots. The library scans for video and audio files, reads yt-dlp sidecars for metadata (title, uploader, source_id), and builds gallery cards with thumbnails.',
        bullets: [
          'Supports mp4, mkv, webm, m4a, and common video/audio extensions',
          'Reads .info.json sidecars for title, uploader, duration, source URL',
          'Multiple library roots: default download path plus custom folders',
          'Refresh scan on demand or after new downloads land',
        ],
        imageFile: 'libraryStep1.png',
        imageAlt: 'RuForge media library grid with video cards',
      },
      {
        heading: 'Watch progress and thumbnails',
        body: 'Each card shows a thin progress bar at the bottom representing how far you watched. Hover reveals the cover thumbnail (audio files keep cover art, video files show a frame). The bar data persists in localStorage so progress survives restarts.',
        bullets: [
          'Furthest-reached position stored per file (not just last position)',
          'Thumbnail bars use playback storage for mini progress indicators',
          'Audio cards display a Music pill in the top-left corner',
          'Hover does not blank audio files, cover art stays visible',
        ],
        imageFile: 'libraryStep2.png',
        imageAlt: 'Library cards with watch progress bars and thumbnails',
      },
      {
        heading: 'Deduplication and cleanup',
        body: 'Gallery scan groups files by source_id from their sidecar. If yt-dlp left behind a video-only fragment next to the muxed output, it gets hidden. Delete removes the file, cancels any in-flight ffmpeg preview work, and waits for the per-file lock before cleanup.',
        bullets: [
          'Dedupe by source_id across directories (cross-dir merge in fetchEntries)',
          'Delete cancels ffmpeg sprite generation if still running',
          'Replace re-downloads over the matched file (audio vs video ext aware)',
          'Ghost queue rows disappear when you delete from the library',
        ],
        imageFile: 'libraryStep3.png',
        imageAlt: 'Library with deduplicated entries and delete confirmation',
      },
    ],
  },
  {
    slug: 'player',
    title: 'Media Player',
    metaTitle: 'Built-in media player for downloaded files',
    metaDescription: 'Watch downloaded videos with chapter navigation, SponsorBlock skip, audio-only visualizer, and a floating mini player.',
    description: 'Chapter-aware scrubber, sprite hover previews, LED equalizer for audio, draggable subtitles, and smooth auto-advance between files.',
    imageDir: 'player',
    sections: [
      {
        heading: 'Chapter scrubber',
        body: 'If the video has chapters in its yt-dlp sidecar (.info.json), the scrub bar splits into labeled segment pills. Hover a segment to see the chapter title and a thumbnail frame pulled from the sprite sheet. Jump chapters with prev/next buttons or Shift+Arrow keys.',
        bullets: [
          'Chapters parsed from .info.json and normalized against video duration',
          'CSS grid columns (fr units) so segments never overflow the bar',
          'Long chapter titles use MarqueeText scroll instead of clipping',
          'Chapter data stays local in the sidecar, no extra API calls needed',
        ],
        imageFile: 'player-chapters.png',
        imageAlt: 'RuForge player with chapter scrubber segments and hover preview',
      },
      {
        heading: 'Scrubber previews and controls',
        body: 'On download (or on demand), ffmpeg generates sprite sheets for hover thumbnails. Move your cursor over the scrub bar and see the exact frame at that position. The frosted control dock at the bottom holds play/pause, volume, loop, and secondary actions in a More menu.',
        bullets: [
          'Sprite sheets built by ffmpeg at configurable intervals',
          'Global hover line tracks cursor position across simple and chapter bars',
          'Auto-advance: next file in folder queue, then sorted library list',
          'Keyboard: Space play/pause, arrows seek, M mute, F fullscreen',
        ],
        imageFile: 'playerStep1.png',
        imageAlt: 'Player controls dock with scrubber hover preview visible',
      },
      {
        heading: 'Audio-only playback',
        body: 'When you open an audio file, the video area becomes a full LED equalizer hero. 90 frequency bars react to the music via Web Audio AnalyserNode. Cover art fills the background with blur. Side waveforms animate alongside the bars.',
        bullets: [
          'Whispers-style full-canvas 90-bar dancer (loudness-driven, not frequency-mapped)',
          'Adaptive visible row window tracks recent peak usage',
          'captureStream() tap so bars follow actual playback in WebView2',
          'Falls back to media-element source if captureStream reads silence',
        ],
        imageFile: 'player-audio-hero.png',
        imageAlt: 'Audio-only player with LED equalizer bars over album art',
      },
      {
        heading: 'Subtitles and transitions',
        body: 'Custom subtitle overlay renders VTT cues directly over the video element (native track stays hidden). The overlay is vertically draggable and clamped so captions never sit under the progress bar. Video transitions between files use an opacity dip without remounting the element.',
        bullets: [
          'VTT cue rendering with useSubtitleCueOverlay hook',
          'Vertical drag position persists in localStorage',
          'Layout clamps against scrub strip ref and player shell',
          'No flash on auto-advance: opacity dip, not element remount',
        ],
        imageFile: 'playerStep3.png',
        imageAlt: 'Player with subtitle overlay positioned above controls',
      },
    ],
  },
  {
    slug: 'sponsorblock',
    title: 'SponsorBlock',
    metaTitle: 'SponsorBlock on downloaded videos',
    metaDescription: 'Automatic sponsor segment skip on downloaded files. Color-coded scrub overlay, per-category controls, offline once cached.',
    description: 'Privacy hash-based segment fetch, skip button with adaptive learning, color-coded scrub bar overlays matching the browser extension palette, and a per-category settings tree.',
    imageDir: 'sponsor',
    sections: [
      {
        heading: 'Privacy hash-based segment fetch',
        body: 'On first play, RuForge hashes the video source_id and queries the SponsorBlock API with a prefix (not the full hash). The API returns matching segments for all categories: sponsor, intro, outro, self-promo, interaction, music_offtopic, chapter, and POI highlights.',
        bullets: [
          'SHA-256 prefix query (k-anonymity, server never sees the full video id)',
          'Requests all skip/chapter/POI categories, not just sponsor-only',
          'Segments cached in a .sponsorblock.json sidecar next to the video',
          'Stale sidecars refresh on next play (no manual clear needed)',
        ],
        imageFile: 'sponsorStep1.png',
        imageAlt: 'SponsorBlock segments loaded for a video in RuForge',
      },
      {
        heading: 'Skip button with learning',
        body: 'When playback enters a skip-category segment, a colored skip button appears. Press it to jump to the end of the segment. Per-category adaptive learning tracks what you actually skip versus what you sit through. Categories you never skip eventually stop prompting.',
        bullets: [
          'Button fill color matches the segment category',
          'Per-category skip ratio stored locally',
          'Learning adapts over time: frequent skips auto-skip, infrequent ones keep the prompt',
          'Master toggle in Settings > Playback (enabled by default)',
        ],
        imageFile: 'sponsorStep2.png',
        imageAlt: 'Skip button visible during a sponsor segment',
      },
      {
        heading: 'Color-coded scrub bar overlay',
        body: 'The scrub bar shows colored regions for every segment type. Colors match the official SponsorBlock browser extension palette. POI highlights appear as thin ticks. Chapter segments get their own distinct shade. The overlay renders on both the main player and mini player scrub bars.',
        bullets: [
          'Sponsor: #00d400, Self-promo: #ffff00, Interaction: #cc00ff',
          'Chapter: #FFC83D, Music off-topic: #ff9900, POI highlight: #FF1684',
          'Hover tooltip shows segment type name for each colored region',
          'Overlay opacity 0.7 so underlying progress bar stays readable',
        ],
        imageFile: 'sponsor-scrub.png',
        imageAlt: 'Scrub bar with color-coded SponsorBlock segment overlays',
      },
      {
        heading: 'Settings tree',
        body: 'Settings > Playback has a collapsible SponsorBlock tree. Toggle the master switch or drill into per-category controls. Each category shows its skip ratio and lets you force auto-skip, prompt-only, or disable. The SponsorBlock icon uses the bundled SVG from the official extension branding.',
        bullets: [
          'Master toggle: on/off for all SponsorBlock behavior',
          'Per-category: auto-skip, manual prompt, or disabled',
          'Skip ratio display: "Skipped 12/15 times" style counters',
          'Categories: sponsor, selfpromo, interaction, intro, outro, music_offtopic, poi_highlight, chapter',
        ],
        imageFile: 'sponsorStep3.png',
        imageAlt: 'SponsorBlock settings tree with per-category toggles',
      },
    ],
  },
  {
    slug: 'mini-player',
    title: 'Mini Player',
    metaTitle: 'Mini player floating window',
    metaDescription: 'Compact transparent player window for downloaded media. Resizable to micro mode, cover art, full controls.',
    description: 'A separate always-on-top window with five responsive layout tiers, cover art backgrounds, library browsing, and real-time sync back to the main app.',
    imageDir: 'mini',
    sections: [
      {
        heading: 'Pop-out window',
        body: 'Click the mini player button and RuForge opens a second transparent Tauri window. The main window keeps running. Playback state syncs between windows via Tauri emit/listen events (not shared memory or Zustand). "Back to app" focuses the main window before closing mini.',
        bullets: [
          'Separate Tauri webview label: "mini" (main is "main")',
          'Transparent undecorated window with clip-path rounded corners',
          'Cross-window events: play-media, stop-playback, send-to-main, play-in-mini',
          'Closing mini does not stop playback in main',
        ],
        imageFile: 'miniStep1.png',
        imageAlt: 'Mini player popped out next to the main RuForge window',
      },
      {
        heading: 'Adaptive size layouts',
        body: 'The mini window has five layout tiers based on height. Large mode (full controls and optional library strip). Compact mode below 180px (cover art background, centered cluster). Micro mode at 86-135px (marquee title, core controls). Tiny mode at 70-85px (title left, play/next right).',
        bullets: [
          'Large: full scrub bar, volume, loop, shuffle, SponsorBlock overlay',
          'Compact: cover art fills background with gradient, centered play cluster',
          'Micro (Size 2): loop and rewind hide below 250px/210px width',
          'Tiny (Size 1): minimum 70px height, marquee title, two buttons only',
        ],
        imageFile: 'miniStep2.png',
        imageAlt: 'Mini player in compact layout with cover art background',
      },
      {
        heading: 'Library browse and sync',
        body: 'In large mode, a Video Library strip lets you browse and select files without going back to the main app. The window locks to 430x275 while browsing (no active file), then restores flexible resize when you pick something. All playback commands round-trip through Tauri events.',
        bullets: [
          'Library strip toggle hidden while browsing (shows full grid)',
          'Pin button keeps mini always-on-top (hover reveal in compact/micro)',
          'Cover art priority: local thumbnailPath, then ruforgePosterPath, then placeholder',
          'Volume icon tiers and mute state match main player behavior',
        ],
        imageFile: 'miniStep3.png',
        imageAlt: 'Mini player large mode with library strip open',
      },
    ],
  },
  {
    slug: 'settings',
    title: 'Settings',
    metaTitle: 'RuForge settings and configuration',
    metaDescription: 'Configure downloads, yt-dlp updates, SponsorBlock categories, library paths, and player behavior.',
    description: 'General appearance and paths, download controls with yt-dlp auto-update, playback preferences with SponsorBlock tree, and advanced update/debugging tools.',
    imageDir: 'settings',
    sections: [
      {
        heading: 'General and appearance',
        body: 'The General tab controls theme, accent color, and library paths. Default download path and internal data path are set here. A toggle at the bottom reveals the Debugging tab for power-user tools like playlist regroup and updater cycle.',
        bullets: [
          'Accent color picker (used across UI highlights and buttons)',
          'Output path: where downloads land by default',
          'Internal path: where sidecars, sprites, and SponsorBlock caches live',
          'Toggle "Show Debugging tab" to access regroup and updater tools',
        ],
        imageFile: 'settingsStep1.png',
        imageAlt: 'RuForge Settings General tab with path configuration',
      },
      {
        heading: 'Downloads tab',
        body: 'Controls parallel job count, output folder overrides, and auto scrubber previews (ffmpeg sprite generation after download). The yt-dlp Check and Update button queries GitHub for the latest release and auto-installs a user-local copy if newer.',
        bullets: [
          'Auto scrubber previews: toggle ffmpeg sprite sheet generation on/off',
          'yt-dlp update: checks GitHub releases, downloads to user-local path',
          'Parallel jobs: how many downloads run concurrently (default 2)',
          'Browser context for cookies: None (default), or path to cookie file',
        ],
        imageFile: 'settingsStep2.png',
        imageAlt: 'Settings Downloads tab with yt-dlp update and preview toggles',
      },
      {
        heading: 'Playback and advanced',
        body: 'Playback tab holds auto-advance (next file in queue), SponsorBlock tree (master toggle plus per-category controls), and prefetch settings. Advanced tab has the app update checker that auto-downloads RuForge when a newer version is available via the updater endpoint.',
        bullets: [
          'Auto-advance: play next in folder queue, then sorted library',
          'SponsorBlock settings tree: master, per-category skip/prompt/disable',
          'Advanced: Check for Updates button (compares against updater.json)',
          'Debugging: playlist regroup tool, cycle updater for testing',
        ],
        imageFile: 'settingsStep3.png',
        imageAlt: 'Settings Playback tab with SponsorBlock category tree',
      },
    ],
  },
];

export function findFeaturePage(slug: string): FeaturePageDef | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}

export function featurePageSlugs(): string[] {
  return FEATURE_PAGES.map((p) => p.slug);
}
