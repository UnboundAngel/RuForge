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
    'What you need': {
      paragraphs: [
        'A 64-bit PC with <strong>Windows 10 or Windows 11</strong> and <strong>about 525 MB</strong> of space for the app.',
      ],
      bullets: [
        '<strong>Room for your downloads.</strong> Videos take far more space than the app itself.',
        '<strong>Internet</strong> to download. Your library and the player work offline.',
        '<strong>Microsoft Edge WebView2</strong>, the Windows part that draws the RuForge window. Most PCs already have it. If yours doesn\'t, the installer gets it for you.',
      ],
      paragraphs2: [
        'Download speed comes down to your internet. After each video finishes, RuForge joins the video and audio into one file, which is mostly disk work. Then it builds the preview images you see when you hover the seek bar, and that part uses your processor. On a slower PC you can turn the previews off with <strong>Auto scrubber previews</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
      ],
      note: 'RuForge is <strong>Windows only</strong> for now. There are no Mac or Linux downloads yet.',
    },
    'Install RuForge': {
      paragraphs: [
        'Download the installer from GitHub and run it. <strong>No admin rights needed</strong>: it installs just for your Windows account.',
      ],
      steps: [
        'Open the <a href="https://github.com/UnboundAngel/RuForge/releases/latest">latest release page</a> on GitHub.',
        'Download <code>RuForge_&lt;version&gt;_x64-setup.exe</code> (about 170 MB).',
        'Run it. If Windows warns you about an unrecognized app, click <strong>More info</strong>, then <strong>Run anyway</strong>.',
        'Click through the setup. The defaults are fine.',
        'Open RuForge from the Start menu.',
      ],
    },
    'Open it for the first time': {
      paragraphs: [
        'New downloads save to <code>C:\\RuForge\\Media</code>. You can change that in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
      ],
      bullets: [
        'RuForge opens on <strong>Videos</strong>, your library.',
        'To download something, click <strong>Download</strong> in the left sidebar or press <kbd>Ctrl</kbd>+<kbd>D</kbd>. <a href="/docs/first-download">Your first download</a> walks through it.',
        'The download tools (yt-dlp, and ffmpeg for joining video and audio) come with RuForge. There\'s nothing else to install.',
      ],
      paragraphs2: [
        'Want your files somewhere else? <a href="/docs/library-folders">Library folders</a> shows how.',
      ],
    },
    Updates: {
      paragraphs: [
        'When a new version is out, a card saying <strong>RuForge is ready to update</strong> shows up in the top-right corner. Click <strong>Install &amp; Restart</strong>.',
      ],
      bullets: [
        'RuForge checks each time you open it.',
        'It downloads the update, installs it, and reopens. A <strong>What\'s New</strong> screen lists the changes.',
        'Your downloads and settings stay put.',
        'Not now? Close the card with the <strong>X</strong>. To check by hand, go to <strong>Settings</strong> &gt; <strong>Advanced</strong> and click <strong>CHECK NOW</strong>.',
      ],
      tip: 'RuForge only installs updates signed by the RuForge developer. It checks the signature before installing.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Your first download                              */
  /* ------------------------------------------------------------------ */
  'first-download': {
    'Paste a link': {
      image: 'pastealink.png',
      paragraphs: [
        'Copy a YouTube link, press <kbd>Ctrl</kbd>+<kbd>D</kbd> to open the downloader, and paste it into the <strong>Paste link</strong> box.',
      ],
      steps: [
        'Copy a video or playlist link from YouTube. Links like <code>youtube.com/watch?v=...</code> and <code>youtu.be/...</code> both work.',
        'Open the downloader: click <strong>Download</strong> in the left sidebar or press <kbd>Ctrl</kbd>+<kbd>D</kbd>.',
        'Click the <strong>Paste link</strong> box. If a YouTube link is on your clipboard, RuForge fills it in for you. If not, press <kbd>Ctrl</kbd>+<kbd>V</kbd>.',
        'Wait a few seconds for the title, thumbnail, and file size to show up.',
      ],
      tip: 'You can also drag a link from your browser and drop it anywhere on the RuForge window.',
    },
    'Pick video or audio': {
      image: 'choose-format.png',
      paragraphs: [
        'You get <strong>video up to 1080p</strong> by default. Click the small icon next to <strong>Download</strong> to switch to audio only.',
      ],
      bullets: [
        '<strong>Video</strong>: picture and sound in one file. Change the quality under <strong>Preferred Quality</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong> (4K, 1080p, 720p, or Best Available).',
        '<strong>Audio only</strong>: just the sound, saved as <strong>M4A</strong>. Much smaller, good for music and podcasts. To get MP3 or Opus instead, turn on <strong>Download audio only</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong> and pick an <strong>Audio format</strong>.',
      ],
      paragraphs2: [
        'The file size updates when you switch, so you can compare before you click <strong>Download</strong>.',
      ],
    },
    'Watch it download': {
      image: 'watch-progress.png',
      paragraphs: [
        'Click <strong>Download</strong> and a progress bar shows the percentage, speed, and time left.',
      ],
      bullets: [
        '<strong>Preparing download</strong>: RuForge is connecting to YouTube. This can take a moment.',
        '<strong>Downloading</strong>: the file is coming in.',
        '<strong>Finishing up</strong>: RuForge is joining the video and audio into one file. The bar can sit near the end for a bit, that\'s normal.',
      ],
      paragraphs2: [
        'Changed your mind? Click <strong>Stop download</strong>.',
        'You don\'t have to watch. Go anywhere else in the app and the <strong>Download</strong> button in the sidebar turns into a progress ring with the video\'s thumbnail. Click it to come back.',
      ],
    },
    'Find it in your library': {
      image: 'find-in-library.png',
      paragraphs: [
        'Finished downloads show up in <strong>Videos</strong> in the left sidebar right away.',
      ],
      steps: [
        'Click <strong>Videos</strong> in the left sidebar.',
        'Find your download. It shows up as a <span class="docs-term" data-term="card">card</span> with its thumbnail and title.',
        'Click the card to play it.',
      ],
      paragraphs2: [
        'A downloaded playlist shows up as one <span class="docs-term" data-term="playlist collection">stack</span>. Click it to see the videos inside.',
      ],
      tip: 'Next to each download, RuForge saves the thumbnail and a small <span class="docs-term" data-term=".info.json"><code>.info.json</code></span> file with the title, chapters, and original link. That\'s how your library shows the right details offline. If you move a video, move those files with it.',
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Library folders                                  */
  /* ------------------------------------------------------------------ */
  'library-folders': {
    'Where downloads go': {
      image: 'download-directory.png',
      paragraphs: [
        'New downloads save to <code>C:\\RuForge\\Media</code>, RuForge\'s own folder. The app calls it the <strong>internal vault</strong>.',
      ],
      bullets: [
        'You can see the exact path under <strong>Internal vault</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
        'The internal vault is capped at <strong>50 GB</strong> by default. When it\'s full, RuForge won\'t start new downloads until you free up space or raise the cap with <strong>Storage Limit</strong> in <strong>Settings</strong> &gt; <strong>General</strong>.',
      ],
    },
    'Save somewhere else': {
      image: 'internal-vault.png',
      paragraphs: [
        'To save to a folder you choose, set <strong>Storage Target</strong> to <strong>CUSTOM</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
      ],
      steps: [
        'Open <strong>Settings</strong> from the left sidebar and go to <strong>Downloads</strong>.',
        'Next to <strong>Storage Target</strong>, click <strong>CUSTOM</strong>.',
        'Next to <strong>Download Path</strong>, click <strong>CHANGE DIRECTORY</strong> and pick a folder.',
        'Add the same folder to your library (see the next section) so RuForge keeps finding those files.',
      ],
      paragraphs2: [
        'Switching never moves or deletes anything. Files you already have stay where they are. Click <strong>INTERNAL</strong> to go back to the internal vault.',
      ],
    },
    'Add folders to your library': {
      headingWidget: 'spiral-loader',
      paragraphs: [
        'Your library shows the internal vault plus any folders you add under <strong>Library scan locations</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
      ],
      steps: [
        'Open <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
        'Next to <strong>Add library scan folder</strong>, click <strong>ADD FOLDER</strong> and pick a folder.',
      ],
      bullets: [
        'The internal vault is always included. You can\'t remove it.',
        'Adding a folder only changes what your library shows. It doesn\'t change where downloads save.',
        'The library updates when RuForge opens, when you change these folders, and when a download finishes.',
        'If the same video is in two folders, you see it once.',
        'When a video has its <span class="docs-term" data-term=".info.json"><code>.info.json</code></span> file next to it, the library uses that for the title and chapters instead of guessing from the file name.',
      ],
    },
    'Which files show up': {
      layout: 'split',
      paragraphs: [
        'The library picks up <strong>MP4, MKV and WebM</strong> videos and <strong>MP3, M4A, FLAC, Opus, OGG and WAV</strong> audio.',
        'Upper or lowercase extensions both work from <strong>RuForge 0.5</strong>. On 0.4.0, rename <code>video.MP4</code> to <code>video.mp4</code> if it doesn\'t show up.',
      ],
      table: {
        headers: ['Type', 'Shows up', 'Doesn\'t show up'],
        rows: [
          ['Video', '<code>.mp4</code> <code>.mkv</code> <code>.webm</code>', '<code>.avi</code> <code>.mov</code> <code>.ts</code> <code>.3gp</code> <code>.wmv</code>'],
          ['Audio', '<code>.mp3</code> <code>.m4a</code> <code>.flac</code> <code>.opus</code> <code>.ogg</code> <code>.wav</code>', '<code>.aac</code> <code>.wma</code> <code>.aiff</code>'],
        ],
      },
      collapsible: {
        label: 'Why not every format?',
        content: 'The list covers the formats YouTube downloads come in, plus common music files. Files like <code>.avi</code> and <code>.mov</code> are skipped. If a file you expect is missing, check its extension first.',
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Getting started > Glossary                                        */
  /* ------------------------------------------------------------------ */
  glossary: {
    Downloading: {
      paragraphs: [
        'A <strong>job</strong> is one download. The <strong>queue</strong> is every job that\'s waiting or running.',
      ],
      bullets: [
        '<span class="docs-term" data-term="job"><strong>Job</strong></span>: one download. Paste a link and click <strong>Download</strong> to start one.',
        '<span class="docs-term" data-term="queue"><strong>Queue</strong></span>: all the jobs that are waiting or running. While any are, the <strong>Download</strong> button in the sidebar shows a progress ring.',
        '<span class="docs-term" data-term="hero"><strong>Hero</strong></span>: the big area in the downloader with the video\'s title, thumbnail, and progress.',
        '<span class="docs-term" data-term="processing"><strong>Finishing up</strong></span>: the last step of a download, when the video and audio get joined into one file.',
        '<span class="docs-term" data-term="stall watchdog"><strong>Stall watchdog</strong></span>: notices a download that stopped making progress and steps in, so it doesn\'t hang forever.',
      ],
    },
    'Your library': {
      paragraphs: [
        'An <strong>entry</strong> is one item in your library: a single file or a whole playlist.',
      ],
      bullets: [
        '<span class="docs-term" data-term="entry"><strong>Entry</strong></span>: one item in your library.',
        '<span class="docs-term" data-term="card"><strong>Card</strong></span>: the tile you click in the library, with a thumbnail and title.',
        '<span class="docs-term" data-term="playlist collection"><strong>Playlist collection</strong></span>: videos downloaded together as a playlist. They show up as one stack you can open.',
        '<span class="docs-term" data-term="gallery"><strong>Gallery</strong></span>: another name for the library grid.',
        '<span class="docs-term" data-term="internal vault"><strong>Internal vault</strong></span>: RuForge\'s own download folder, <code>C:\\RuForge\\Media</code> by default. It\'s always in your library.',
        '<span class="docs-term" data-term="scan folder"><strong>Scan folder</strong></span>: a folder you added so its files show up in your library. The internal vault is always one of them.',
      ],
    },
    'Files next to your videos': {
      paragraphs: [
        'Each download comes with a few small files saved next to it. Keep them with the video when you move it.',
      ],
      bullets: [
        '<span class="docs-term" data-term="sidecar"><strong>Sidecar</strong></span>: any of these small files that describe a video.',
        '<span class="docs-term" data-term=".info.json"><strong>.info.json</strong></span>: the video\'s details from YouTube, like title, channel, chapters, and the original link. The library reads it to show the right info offline.',
        '<span class="docs-term" data-term=".sponsorblock.json"><strong>.sponsorblock.json</strong></span>: saved sponsor segments for a video, so RuForge doesn\'t have to look them up every time you play it.',
        '<span class="docs-term" data-term="sprite sheet"><strong>Sprite sheet</strong></span>: a grid of small frames from the video. It powers the preview you see when you hover the seek bar.',
        '<span class="docs-term" data-term="poster"><strong>Poster</strong></span>: a cover image RuForge makes from a frame of the video.',
      ],
    },
    'Watching and listening': {
      paragraphs: [
        'The <strong>player</strong> plays your downloads right in the RuForge window.',
      ],
      bullets: [
        '<span class="docs-term" data-term="player"><strong>Player</strong></span>: plays video and audio, with chapters, subtitles, keyboard shortcuts, and SponsorBlock.',
        '<span class="docs-term" data-term="mini player"><strong>Mini player</strong></span>: a small separate window, so you can keep watching while you use other apps.',
        '<span class="docs-term" data-term="control dock"><strong>Control dock</strong></span>: the bar at the bottom of the player with play/pause, volume, and loop.',
        '<span class="docs-term" data-term="chapter scrubber"><strong>Chapter scrubber</strong></span>: the seek bar split into the video\'s chapters. Hover a part to see its name, click it to jump there.',
        '<span class="docs-term" data-term="scrub preview"><strong>Scrub preview</strong></span>: the small picture that shows up when you hover the seek bar.',
        '<span class="docs-term" data-term="auto-advance"><strong>Auto-advance</strong></span>: when a video ends, the next file in the same folder starts.',
      ],
    },
  },
};
