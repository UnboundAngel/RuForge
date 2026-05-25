/**
 * Rich body content for docs pages.
 *
 * Each key matches a `DocsPage.slug` from `docsTree.ts`.
 * Sections are keyed by the outline heading (exact match).
 *
 * Content blocks:
 *  - `paragraphs`: plain text paragraphs rendered as `<p>`.
 *  - `steps`: ordered numbered steps (renders as `<ol>`).
 *  - `bullets`: unordered list items (renders as `<ul>`).
 *  - `note`: callout block, rendered in a tinted aside.
 *  - `codeBlock`: fenced code block with optional `lang` label.
 *  - `tip`: friendly tip callout.
 */

export interface DocsSectionContent {
  paragraphs?: string[];
  /** Additional paragraphs rendered after steps/bullets. */
  paragraphs2?: string[];
  /** Third paragraph group, rendered after paragraphs2. */
  paragraphs3?: string[];
  steps?: string[];
  bullets?: string[];
  note?: string;
  tip?: string;
  codeBlock?: { lang?: string; code: string };
}

export type DocsPageContent = Record<string, DocsSectionContent>;

export const DOCS_CONTENT: Record<string, DocsPageContent> = {

  /* ------------------------------------------------------------------ */
  /*  Getting started > Download and install                             */
  /* ------------------------------------------------------------------ */
  install: {
    'System requirements': {
      paragraphs: [
        'RuForge is a desktop app built on Tauri and WebView2. It runs on any modern Windows machine without needing you to install extra runtimes or dependencies.',
      ],
      bullets: [
        'Windows 10 (version 1803 or later) or Windows 11.',
        'WebView2 runtime. Most Windows machines already have this installed through Edge updates. If yours does not, the RuForge installer will prompt you to grab it.',
        'Around 300 MB of free disk space for the app itself, plus however much room you need for your downloads.',
        'An internet connection for downloading videos. The app itself works offline once installed (your library, player, and settings all work without a connection).',
      ],
      note: 'macOS and Linux builds are not available yet. Linux works as a local development target for contributors, but there are no packaged installers for end users at this time.',
    },
    'Install on Windows': {
      paragraphs: [
        'The installer is a standard Windows NSIS setup wizard. It installs per-user (no admin rights needed) and takes about a minute.',
      ],
      steps: [
        'Open the <a href="https://github.com/UnboundAngel/RuForge/releases/latest">latest release page</a> on GitHub.',
        'Download the file named <code>RuForge_&lt;version&gt;_x64-setup.exe</code>. This is the Windows installer.',
        'Run the installer. Windows may show a SmartScreen warning because the app is new. Click <strong>More info</strong>, then <strong>Run anyway</strong>.',
        'Follow the setup wizard. The defaults are fine for most people.',
        'Open RuForge from the Start menu or the desktop shortcut the installer created.',
      ],
      tip: 'If you prefer not to use the NSIS installer, there is also an MSI package on the same release page. It works the same way but uses the Windows Installer service instead.',
    },
    'First launch': {
      paragraphs: [
        'The first time you open RuForge, a few things happen behind the scenes:',
      ],
      bullets: [
        'Your default download folder is set to your Windows Downloads directory (for example, <code>C:\\Users\\You\\Downloads</code>). You can change this later in Settings.',
        'The bundled copies of yt-dlp and ffmpeg are ready to go. You do not need to install them separately.',
        'The app checks for updates automatically (more on that below).',
      ],
      paragraphs2: [
        'You should see the Downloader tab right away. That is the main screen. Paste a YouTube URL into the input at the top and you are ready to go.',
      ],
    },
    'Auto-updates': {
      paragraphs: [
        'RuForge checks for new versions every time you open the app. If a newer version is available, a small card appears in the top-right corner showing what changed.',
      ],
      steps: [
        'The update card shows a short summary of additions and fixes.',
        'Click <strong>Download &amp; Install</strong> to grab the update. Progress is shown inline.',
        'Once downloaded, the app asks you to restart. Your downloads, library, and settings carry over automatically.',
      ],
      paragraphs3: [
        'After installing an update, a "What\'s New" screen pops up with the full list of changes. You can scroll through it or dismiss it.',
      ],
      tip: 'Updates are signed with a private key and verified against the public key baked into the app. This means the app will only install genuine updates from the RuForge team.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Your first download                              */
  /* ------------------------------------------------------------------ */
  'first-download': {
    'Paste a link': {
      paragraphs: [
        'Downloading a video is the main thing RuForge does, and it starts with a URL.',
      ],
      steps: [
        'Copy a YouTube video link from your browser. Any standard <code>youtube.com/watch?v=...</code> or <code>youtu.be/...</code> link works.',
        'In RuForge, click the URL input field at the top of the Downloader tab (or just press <kbd>Ctrl+V</kbd> anywhere on the page).',
        'Paste the link. RuForge immediately starts fetching the video metadata: title, thumbnail, and estimated file size.',
      ],
      paragraphs2: [
        'You will see the video title and thumbnail appear in the hero area within a few seconds. The size estimate shows how much space the download will take on disk.',
      ],
      tip: 'You can also drag and drop a link from your browser directly into the RuForge window.',
    },
    'Choose format': {
      paragraphs: [
        'Before you hit download, you can choose what format you want.',
      ],
      bullets: [
        '<strong>Video</strong> (default): Downloads the best available video and audio, muxed into a single file (usually MP4). This is what most people want.',
        '<strong>Audio only</strong>: Extracts just the audio track as an M4A file. Much smaller file size, perfect for music or podcasts.',
      ],
      paragraphs2: [
        'Toggle between Video and Audio using the switch next to the download button. The size estimate updates immediately so you can see the difference before committing.',
      ],
    },
    'Watch progress': {
      paragraphs: [
        'Once you start the download, the hero area turns into a live progress display.',
      ],
      bullets: [
        'A progress bar shows how far along the download is, with percentage markers at each end.',
        'Download speed and estimated time remaining appear below the bar.',
        'If the video needs post-processing (like merging separate video and audio streams), the status changes to <strong>"Processing..."</strong> while ffmpeg handles the mux.',
      ],
      paragraphs2: [
        'You can keep using the app while downloads run. The floating queue drawer in the bottom-right corner shows all active and queued jobs. Click it to expand and see thumbnails, titles, and individual progress for each download.',
      ],
    },
    'Find it in your library': {
      paragraphs: [
        'When a download finishes, the file lands in your download folder and immediately shows up in the Media Library tab.',
      ],
      steps: [
        'Click <strong>Media Library</strong> in the left sidebar.',
        'Your new download appears as a card with a thumbnail, title, and duration.',
        'Click the card to open it in the player. That is it.',
      ],
      paragraphs2: [
        'If you downloaded a playlist, the videos are grouped together as a stack card in the library. Click the stack to expand it and see individual items.',
      ],
      tip: 'Downloaded files come with sidecar metadata (a <code>.info.json</code> file from yt-dlp). This is how RuForge knows the title, uploader, chapters, and source URL without re-fetching anything.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Library folders                                  */
  /* ------------------------------------------------------------------ */
  'library-folders': {
    'Download directory': {
      paragraphs: [
        'By default, RuForge saves everything to your Windows Downloads folder. You can change this at any time.',
      ],
      steps: [
        'Open <strong>Settings</strong> from the left sidebar.',
        'Go to the <strong>Downloads</strong> tab.',
        'Click the folder path next to <strong>Output folder</strong> to pick a new location.',
      ],
      paragraphs2: [
        'All future downloads go to whatever folder you choose here. Existing files stay where they are. The media library scans both the old and new locations, so nothing disappears from your library when you switch.',
      ],
    },
    'Custom roots': {
      paragraphs: [
        'Besides your main download folder, you can point RuForge at additional folders on your computer. This is handy if you already have a collection of videos somewhere else, or if you keep downloads on a second drive.',
      ],
      steps: [
        'Open <strong>Settings</strong> and go to the <strong>General</strong> tab.',
        'Under <strong>Library roots</strong>, click <strong>Add folder</strong>.',
        'Pick any folder on your machine. RuForge scans it for video and audio files and adds them to your library.',
      ],
      paragraphs2: [
        'You can add as many custom roots as you want. Each one is scanned every time the library refreshes. Removing a root from the list does not delete any files; it just stops showing them in the library.',
      ],
    },
    'Scan behavior': {
      paragraphs: [
        'RuForge scans your download directory and all custom roots for supported media files. Here is how the scan works:',
      ],
      bullets: [
        'The scan runs automatically when the app starts and after every finished download.',
        'It looks for common video formats (MP4, MKV, WebM, AVI, MOV) and audio formats (M4A, MP3, OGG, FLAC, WAV).',
        'For each file, it checks for a matching <code>.info.json</code> sidecar. If one exists, the library uses its title, thumbnail path, chapters, and source URL instead of guessing from the filename.',
        'Duplicate entries (same source ID or matching title from different scan passes) are merged so you do not see the same video twice.',
      ],
      paragraphs2: [
        'You can manually refresh the library at any time by pulling down or clicking the refresh button in the Media Library tab.',
      ],
    },
    'Case and extensions': {
      paragraphs: [
        'File extensions are matched case-insensitively. A file named <code>Video.MP4</code> is treated the same as <code>video.mp4</code>. This matters because some devices (like iPhones) save files with uppercase extensions.',
      ],
      bullets: [
        'The scan normalizes extensions before matching, so <code>.MP4</code>, <code>.Mp4</code>, and <code>.mp4</code> all register as valid video files.',
        'If you have files with unusual containers (like <code>.ts</code> transport streams or <code>.3gp</code>), they may not appear in the library. RuForge focuses on the most common formats.',
      ],
      tip: 'If a file you expect to see is missing from the library, double-check its extension and make sure the folder it lives in is listed as a download directory or custom root.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Glossary                                        */
  /* ------------------------------------------------------------------ */
  glossary: {
    'Queue and jobs': {
      paragraphs: [
        'These terms come up whenever you are downloading something.',
      ],
      bullets: [
        '<strong>Job</strong>: A single download task. When you paste a URL and click download, that creates one job. A playlist creates one job per video.',
        '<strong>Queue</strong>: The list of all active and pending jobs. Visible in the floating drawer in the bottom-right corner of the downloader.',
        '<strong>Hero</strong>: The large progress area at the top of the downloader that shows the currently focused job (thumbnail, title, progress bar, speed, ETA).',
        '<strong>Stall watchdog</strong>: A background timer that watches for jobs that stop making progress. If yt-dlp hangs (no new data for too long), the watchdog kills the process and marks the job as failed.',
        '<strong>Processing</strong>: The phase after downloading finishes, when ffmpeg is merging video and audio streams or extracting audio. The queue row shows "Processing..." during this.',
      ],
    },
    'Library and entries': {
      paragraphs: [
        'Your media library is the collection of files RuForge knows about.',
      ],
      bullets: [
        '<strong>Entry</strong>: A single item in the library. Can be a standalone video/audio file or a playlist collection.',
        '<strong>Playlist collection</strong>: A group of related files that were downloaded together as a playlist. Displayed as a stack card in the library.',
        '<strong>Gallery</strong>: Another name for the media library grid. The terms are used interchangeably in the app.',
        '<strong>Scan root</strong>: A folder that the library watches for media files. Your download directory is always a scan root. Custom roots are extra folders you add manually.',
        '<strong>Card</strong>: The visual tile in the library grid showing a thumbnail, title, duration, and watch progress for a single file.',
      ],
    },
    'Sidecars and metadata': {
      paragraphs: [
        'Sidecars are small companion files that live next to your downloaded videos.',
      ],
      bullets: [
        '<strong>Sidecar</strong>: Any file that stores metadata about a downloaded video. The most important one is the <code>.info.json</code> file.',
        '<strong>.info.json</strong>: Created by yt-dlp during download. Contains the video title, uploader, duration, chapters, thumbnail URL, source URL, and format details. RuForge reads this to populate library cards and player metadata.',
        '<strong>.sponsorblock.json</strong>: A sidecar created by RuForge when SponsorBlock data is fetched for a video. Stores sponsor segments, chapters, and points of interest so they do not need to be re-fetched on every play.',
        '<strong>Sprite sheet</strong>: A grid of thumbnail frames generated by ffmpeg after download. Used for hover previews on the player scrub bar. Stored next to the video file.',
        '<strong>Poster</strong>: A single-frame thumbnail image generated by ffmpeg, used as the cover art for library cards when no yt-dlp thumbnail is available.',
      ],
    },
    'Player and playback': {
      paragraphs: [
        'Terms related to watching your downloaded content.',
      ],
      bullets: [
        '<strong>Player</strong>: The built-in video/audio player in the main window. Supports chapters, subtitles, keyboard shortcuts, and SponsorBlock overlays.',
        '<strong>Mini player</strong>: A separate borderless window that floats on top of other apps. You can resize it from large (full controls) down to a tiny strip.',
        '<strong>Control dock</strong>: The frosted bar at the bottom of the player with play/pause, volume, loop, and other controls.',
        '<strong>Chapter scrubber</strong>: A segmented progress bar that divides the video into chapters (from yt-dlp metadata). Each segment is clickable and shows the chapter title on hover.',
        '<strong>Auto-advance</strong>: When a video ends, the player automatically plays the next file. It first tries the next item in the current folder, then falls back to the next item in the library.',
        '<strong>Scrub preview</strong>: Thumbnail images that appear when you hover over the progress bar, generated from ffmpeg sprite sheets.',
      ],
    },
  },
};
