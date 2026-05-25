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
  /** High-visibility warning callout (orange/red tint). */
  warning?: string;
  codeBlock?: { lang?: string; code: string };
  /** Table with header row (any column count). */
  table?: { headers: string[]; rows: string[][] };
  /** Side-by-side layout: paragraphs on the left, table + collapsible on the right. */
  layout?: 'split';
  /** Collapsible hover pill (label visible, content expands on hover). */
  collapsible?: { label: string; content: string };
  /** Filename (no path) of an image in assets/tutorials/docs/. Rendered as a figure. */
  image?: string;
  /** Render a named widget inline with the section heading. */
  headingWidget?: 'spiral-loader';
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
      image: 'pastealink.png',
      paragraphs: [
        'Downloading a video is the main thing RuForge does, and it starts with a URL.',
      ],
      steps: [
        'Copy a YouTube video link from your browser. Any standard <code>youtube.com/watch?v=...</code> or <code>youtu.be/...</code> link works.',
        'In RuForge, click the URL input field at the top of the Downloader tab (or just press <kbd>Ctrl+V</kbd> anywhere on the page).',
        'Paste the link. RuForge immediately starts fetching the video metadata: title, thumbnail, and estimated file size.',
      ],
      paragraphs2: [
        'You will see the video title and thumbnail appear in the <span class="docs-term" data-term="hero">hero</span> area within a few seconds. The size estimate shows how much space the download will take on disk.',
      ],
      tip: 'You can also drag and drop a link from your browser directly into the RuForge window.',
    },
    'Choose format': {
      image: 'choose-format.png',
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
      image: 'watch-progress.png',
      paragraphs: [
        'Once you start the download, the <span class="docs-term" data-term="hero">hero</span> area turns into a live progress display.',
      ],
      bullets: [
        'A progress bar shows how far along the download is, with percentage markers at each end.',
        'Download speed and estimated time remaining appear below the bar.',
        'If the video needs post-processing (like merging separate video and audio streams), the status changes to <span class="docs-term" data-term="processing"><strong>"Processing..."</strong></span> while ffmpeg handles the mux.',
      ],
      paragraphs2: [
        'You can keep using the app while downloads run. The floating <span class="docs-term" data-term="queue">queue</span> drawer in the bottom-right corner shows all active and queued <span class="docs-term" data-term="job">jobs</span>. Click it to expand and see thumbnails, titles, and individual progress for each download.',
      ],
    },
    'Find it in your library': {
      image: 'find-in-library.png',
      paragraphs: [
        'When a download finishes, the file lands in your download folder and immediately shows up in the Media Library tab.',
      ],
      steps: [
        'Click <strong>Media Library</strong> in the left sidebar.',
        'Your new download appears as a <span class="docs-term" data-term="card">card</span> with a thumbnail, title, and duration.',
        'Click the card to open it in the <span class="docs-term" data-term="player">player</span>. That is it.',
      ],
      paragraphs2: [
        'If you downloaded a playlist, the videos are grouped together as a <span class="docs-term" data-term="playlist collection">stack card</span> in the library. Click the stack to expand it and see individual items.',
      ],
      tip: 'Downloaded files come with <span class="docs-term" data-term="sidecar">sidecar</span> metadata (a <span class="docs-term" data-term=".info.json"><code>.info.json</code></span> file from yt-dlp). This is how RuForge knows the title, uploader, chapters, and source URL without re-fetching anything.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Library folders                                  */
  /* ------------------------------------------------------------------ */
  'library-folders': {
    'Download directory': {
      image: 'download-directory.png',
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
    'Internal vault and download path': {
      image: 'internal-vault.png',
      paragraphs: [
        'RuForge stores files in two places. Both are scanned every time the library refreshes, so everything shows up in one combined view.',
      ],
      bullets: [
        '<strong>Internal vault</strong>: A folder RuForge manages automatically inside its own app data directory. When you choose <strong>Internal</strong> in the Downloads settings, new downloads land here.',
        '<strong>Custom download path</strong>: Any folder you pick on your machine. When you choose <strong>Custom</strong> in the Downloads settings, new downloads go to this folder instead.',
      ],
      paragraphs2: [
        'To switch between the two storage modes:',
      ],
      steps: [
        'Open <strong>Settings</strong> from the left sidebar.',
        'Go to the <strong>Downloads</strong> tab.',
        'The <strong>Storage Target</strong> row has an <strong>Internal / Custom</strong> toggle. Pick the one you want.',
        'If you chose Custom, click the folder path below to pick a specific directory.',
      ],
      paragraphs3: [
        'Switching storage targets does not move or delete existing files. Your old downloads stay where they are and still appear in the library, because both locations are always scanned.',
      ],
    },
    'Scan behavior': {
      headingWidget: 'spiral-loader',
      paragraphs: [
        'RuForge scans both storage locations (<span class="docs-term" data-term="internal vault">internal vault</span> and your <span class="docs-term" data-term="download path">download path</span>) for supported media files. Here is how the scan works:',
      ],
      bullets: [
        'The scan runs automatically when the app starts and after every finished download.',
        'It looks for common video formats (MP4, MKV, WebM, AVI, MOV) and audio formats (M4A, MP3, OGG, FLAC, WAV).',
        'For each file, it checks for a matching <span class="docs-term" data-term=".info.json"><code>.info.json</code></span> <span class="docs-term" data-term="sidecar">sidecar</span>. If one exists, the library uses its title, thumbnail path, chapters, and source URL instead of guessing from the filename.',
        'Duplicate entries (same source ID or matching title from different scan passes) are merged so you do not see the same video twice.',
      ],
      paragraphs2: [
        'You can manually refresh the library at any time by pulling down or clicking the refresh button in the Media Library tab.',
      ],
    },
    'Case and extensions': {
      layout: 'split',
      paragraphs: [
        'The library scanner normalizes every file extension to lowercase before checking it. <code>Video.MP4</code> is treated exactly the same as <code>video.mp4</code>.',
        'This matters because iPhones, GoPros, and older cameras save files with uppercase extensions like <code>.MOV</code> or <code>.Mp4</code>. RuForge handles all of them.',
        'Any casing variant of a recognized extension will match. <code>.MP4</code>, <code>.Mp4</code>, <code>.mP4</code> are all the same to the scanner.',
      ],
      table: {
        headers: ['Type', 'Recognized', 'Not recognized'],
        rows: [
          ['Video', '<code>.mp4</code> <code>.mkv</code> <code>.webm</code>', '<code>.avi</code> <code>.mov</code> <code>.ts</code> <code>.3gp</code> <code>.wmv</code>'],
          ['Audio', '<code>.mp3</code> <code>.m4a</code> <code>.flac</code> <code>.opus</code> <code>.ogg</code>', '<code>.wav</code> <code>.aac</code> <code>.wma</code> <code>.aiff</code>'],
        ],
      },
      collapsible: {
        label: 'Why are some common formats not recognized?',
        content: 'RuForge targets the formats YouTube and yt-dlp actually produce (<code>.mp4</code>, <code>.webm</code>, <code>.mkv</code>, <code>.m4a</code>, <code>.opus</code>). Containers like <code>.avi</code>, <code>.mov</code>, <code>.wav</code>, and <code>.ts</code> are rarely output by yt-dlp and would add scan overhead for minimal benefit. If a file you expect is missing from the library, check its extension.',
      },
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
        '<span class="docs-term" data-term="job"><strong>Job</strong></span>: A single download task. When you paste a URL and click download, that creates one job. A playlist creates one job per video.',
        '<span class="docs-term" data-term="queue"><strong>Queue</strong></span>: The list of all active and pending jobs. Visible in the floating drawer in the bottom-right corner of the downloader.',
        '<span class="docs-term" data-term="hero"><strong>Hero</strong></span>: The large progress area at the top of the downloader that shows the currently focused job (thumbnail, title, progress bar, speed, ETA).',
        '<span class="docs-term" data-term="stall watchdog"><strong>Stall watchdog</strong></span>: A background timer that watches for jobs that stop making progress. If yt-dlp hangs (no new data for too long), the watchdog kills the process and marks the job as failed.',
        '<span class="docs-term" data-term="processing"><strong>Processing</strong></span>: The phase after downloading finishes, when ffmpeg is merging video and audio streams or extracting audio. The queue row shows "Processing..." during this.',
      ],
    },
    'Library and entries': {
      paragraphs: [
        'Your media library is the collection of files RuForge knows about.',
      ],
      bullets: [
        '<span class="docs-term" data-term="entry"><strong>Entry</strong></span>: A single item in the library. Can be a standalone video/audio file or a playlist collection.',
        '<span class="docs-term" data-term="playlist collection"><strong>Playlist collection</strong></span>: A group of related files that were downloaded together as a playlist. Displayed as a stack card in the library.',
        '<span class="docs-term" data-term="gallery"><strong>Gallery</strong></span>: Another name for the media library grid. The terms are used interchangeably in the app.',
        '<span class="docs-term" data-term="scan root"><strong>Scan root</strong></span>: A folder that the library watches for media files. RuForge scans two: the internal vault and your download path. Both are always included.',
        '<span class="docs-term" data-term="card"><strong>Card</strong></span>: The visual tile in the library grid showing a thumbnail, title, duration, and watch progress for a single file.',
      ],
    },
    'Sidecars and metadata': {
      paragraphs: [
        'Sidecars are small companion files that live next to your downloaded videos.',
      ],
      bullets: [
        '<span class="docs-term" data-term="sidecar"><strong>Sidecar</strong></span>: Any file that stores metadata about a downloaded video. The most important one is the <code>.info.json</code> file.',
        '<span class="docs-term" data-term=".info.json"><strong>.info.json</strong></span>: Created by yt-dlp during download. Contains the video title, uploader, duration, chapters, thumbnail URL, source URL, and format details. RuForge reads this to populate library cards and player metadata.',
        '<span class="docs-term" data-term=".sponsorblock.json"><strong>.sponsorblock.json</strong></span>: A sidecar created by RuForge when SponsorBlock data is fetched for a video. Stores sponsor segments, chapters, and points of interest so they do not need to be re-fetched on every play.',
        '<span class="docs-term" data-term="sprite sheet"><strong>Sprite sheet</strong></span>: A grid of thumbnail frames generated by ffmpeg after download. Used for hover previews on the player scrub bar. Stored next to the video file.',
        '<span class="docs-term" data-term="poster"><strong>Poster</strong></span>: A single-frame thumbnail image generated by ffmpeg, used as the cover art for library cards when no yt-dlp thumbnail is available.',
      ],
    },
    'Player and playback': {
      paragraphs: [
        'Terms related to watching your downloaded content.',
      ],
      bullets: [
        '<span class="docs-term" data-term="player"><strong>Player</strong></span>: The built-in video/audio player in the main window. Supports chapters, subtitles, keyboard shortcuts, and SponsorBlock overlays.',
        '<span class="docs-term" data-term="mini player"><strong>Mini player</strong></span>: A separate borderless window that floats on top of other apps. You can resize it from large (full controls) down to a tiny strip.',
        '<span class="docs-term" data-term="control dock"><strong>Control dock</strong></span>: The frosted bar at the bottom of the player with play/pause, volume, loop, and other controls.',
        '<span class="docs-term" data-term="chapter scrubber"><strong>Chapter scrubber</strong></span>: A segmented progress bar that divides the video into chapters (from yt-dlp metadata). Each segment is clickable and shows the chapter title on hover.',
        '<span class="docs-term" data-term="auto-advance"><strong>Auto-advance</strong></span>: When a video ends, the player automatically plays the next file. It first tries the next item in the current folder, then falls back to the next item in the library.',
        '<span class="docs-term" data-term="scrub preview"><strong>Scrub preview</strong></span>: Thumbnail images that appear when you hover over the progress bar, generated from ffmpeg sprite sheets.',
      ],
    },
  },
};
