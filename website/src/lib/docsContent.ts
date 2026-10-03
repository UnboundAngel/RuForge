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

  /* ------------------------------------------------------------------ */
  /*  Downloader > Formats and quality                                   */
  /* ------------------------------------------------------------------ */
  'formats-and-quality': {
    'Video quality': {
      paragraphs: [
        'Pick a quality with <strong>Preferred Quality</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>. The default is <strong>1080p (HD)</strong>.',
      ],
      table: {
        headers: ['Setting', 'What you get'],
        rows: [
          ['<strong>720p</strong>', 'Up to 720p. Smallest files.'],
          ['<strong>1080p (HD)</strong>', 'Up to 1080p. The default.'],
          ['<strong>4K (2160p)</strong>', 'Up to 4K. Much bigger files.'],
          ['<strong>Best Available</strong>', 'The highest quality the video has.'],
        ],
      },
      paragraphs2: [
        'Each setting is a ceiling. If a video doesn\'t come in that quality, RuForge takes the best one below it.',
      ],
    },
    'Audio only': {
      paragraphs: [
        'Turn on <strong>Download audio only</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong> to save just the sound. That\'s handy for music, podcasts, and talks.',
      ],
      bullets: [
        '<strong>Audio format</strong> appears once audio only is on. Pick <strong>M4A</strong> (the default), <strong>MP3</strong>, or <strong>OPUS</strong>.',
        'M4A is the fastest, since it\'s what YouTube sends. MP3 and Opus get converted after the download.',
        'In a playlist preview you can also switch single videos between audio and video before you download.',
      ],
    },
    Subtitles: {
      paragraphs: [
        '<strong>Download Subtitles</strong> is on by default and saves English captions next to each video, so the player can show them offline.',
      ],
      bullets: [
        'Pick other languages under <strong>Subtitle Languages</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong>.',
        'RuForge saves both captions the creator uploaded and YouTube\'s automatic ones.',
        'Audio-only downloads skip subtitles.',
      ],
    },
    'Files saved with each download': {
      paragraphs: [
        'Next to every video, RuForge saves a few small files. Keep them with the video if you move it.',
      ],
      bullets: [
        'The <strong>thumbnail</strong>, as a <code>.jpg</code>.',
        'A <span class="docs-term" data-term=".info.json"><code>.info.json</code></span> file with the title, channel, chapters, and original link. Your library reads it to show the right details offline.',
        'Subtitles, as <code>.vtt</code> files, when they\'re turned on.',
        'Comments, if you turn on <strong>Download comments</strong>. It\'s off by default.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Downloader > yt-dlp and cookies                                    */
  /* ------------------------------------------------------------------ */
  'cookies-and-ytdlp': {
    'When you need cookies': {
      paragraphs: [
        'Most videos download without signing in. Some need YouTube to know who you are: age-restricted videos, members-only videos, and some private or unlisted ones.',
        'For those, RuForge passes your YouTube sign-in to the downloader as <strong>cookies</strong>. You pick where they come from.',
      ],
    },
    'Pick a cookie source': {
      paragraphs: [
        'Open the downloader. Above the <strong>Paste link</strong> box is a row of cookie sources. It shows when nothing is downloading and the box is empty.',
      ],
      table: {
        headers: ['Source', 'Uses'],
        rows: [
          ['<strong>None</strong>', 'No sign-in. Fine for public videos. The default.'],
          ['<strong>Internal</strong>', 'Your sign-in from Explorer, the YouTube browser built into RuForge. Sign in there once.'],
          ['<strong>Firefox</strong>, <strong>Edge</strong>, <strong>Safari</strong>, <strong>Brave</strong>', 'Your sign-in from that browser on this PC.'],
          ['<strong>Cookies</strong>', 'A <code>cookies.txt</code> file you pick.'],
        ],
      },
      note: 'Chrome isn\'t in the list. If Chrome is your browser, use <strong>Internal</strong> or a <code>cookies.txt</code> file instead.',
    },
    'Use a cookies.txt file': {
      steps: [
        'Export your YouTube cookies to a <code>cookies.txt</code> file with a browser extension that saves them in Netscape format.',
        'In the downloader, click <strong>Cookies</strong> in the cookie row.',
        'Pick the file. RuForge remembers it for next time.',
      ],
      warning: 'A cookies file can sign anyone into your YouTube account. Keep it private and delete it when you\'re done.',
    },
    'Keep yt-dlp up to date': {
      paragraphs: [
        'RuForge downloads with <strong>yt-dlp</strong>, a free tool that comes with the app. YouTube changes often, so yt-dlp gets frequent updates.',
      ],
      bullets: [
        'When a newer yt-dlp is out, a banner in the downloader says <strong>A newer yt-dlp is out</strong>. Click <strong>Update</strong>.',
        'You can also update from <strong>Settings</strong> &gt; <strong>Downloads</strong> &gt; <strong>Updates</strong> with <strong>CHECK &amp; UPDATE</strong>.',
        'Updates never install on their own, and they wait until your downloads are finished or paused.',
        'Some downloads also need <strong>Deno</strong>, a small helper that answers YouTube\'s download check. RuForge offers to install it the first time it\'s needed (about 100 MB, kept in RuForge\'s own folder).',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Troubleshooting > Common issues                                    */
  /* ------------------------------------------------------------------ */
  'common-issues': {
    'A download stalls or times out': {
      paragraphs: [
        'RuForge watches every download. If one stops making progress, it steps in instead of hanging forever.',
      ],
      bullets: [
        'A stuck video stops with <strong>Download stalled</strong>. Check your internet, then click <strong>Retry</strong> or <strong>Resume</strong>. Resume picks up where it left off.',
        'A stuck song in a batch shows <strong>Timed out</strong> and the queue moves on to the next one.',
        'In a playlist, failed videos are retried automatically, up to three tries each.',
      ],
    },
    'A download fails': {
      paragraphs: [
        'The message under the failed download usually says what to do. The most common ones:',
      ],
      table: {
        headers: ['Message says', 'Fix'],
        rows: [
          ['yt-dlp is <strong>out of date</strong>', 'Update it from the banner, or with <strong>CHECK &amp; UPDATE</strong> in <strong>Settings</strong> &gt; <strong>Downloads</strong> &gt; <strong>Updates</strong>. Then retry.'],
          ['<strong>JavaScript runtime needed</strong>', 'Click <strong>Install</strong>. RuForge installs Deno and retries the failed downloads on its own.'],
          ['<strong>HTTP 403</strong>', 'The download link expired. Click <strong>Retry</strong>.'],
          ['<strong>rate-limited</strong>', 'YouTube is slowing you down. Wait a few minutes, lower <strong>Concurrent downloads</strong>, or add a <strong>Batch start delay</strong> in Settings.'],
        ],
      },
      paragraphs2: [
        'For anything else, the message comes straight from yt-dlp. <a href="/docs/cookies-and-ytdlp">Updating yt-dlp</a> fixes most of them.',
      ],
    },
    'The video needs you to sign in': {
      paragraphs: [
        'Age-restricted and members-only videos need your YouTube sign-in. Pick a cookie source above the <strong>Paste link</strong> box: <strong>Internal</strong> (sign in to Explorer first), a browser, or a <code>cookies.txt</code> file.',
        '<a href="/docs/cookies-and-ytdlp">yt-dlp and cookies</a> walks through each one.',
      ],
    },
    'Not enough storage': {
      paragraphs: [
        'If a download won\'t fit, RuForge puts it on hold and shows <strong>Not enough storage</strong> instead of filling your disk.',
      ],
      bullets: [
        'Free up space on the drive, then resume it.',
        'Saving to the internal vault? It has a 50 GB cap by default. Raise it with <strong>Storage Limit</strong> in <strong>Settings</strong> &gt; <strong>General</strong>.',
      ],
    },
    'A file is missing from your library': {
      bullets: [
        'Make sure its folder is in your library: <strong>Settings</strong> &gt; <strong>Downloads</strong> &gt; <strong>Library scan locations</strong> &gt; <strong>ADD FOLDER</strong>.',
        'Check the file type. The library shows MP4, MKV, and WebM videos and MP3, M4A, FLAC, Opus, OGG, and WAV audio.',
        'On RuForge 0.4.0, rename uppercase extensions like <code>.MP4</code> to lowercase. From 0.5 both work.',
      ],
      paragraphs2: [
        '<a href="/docs/library-folders">Library folders</a> has the details.',
      ],
    },
    'The app shows an error screen': {
      paragraphs: [
        'If you see <strong>uh oh.. something broke in the ui</strong>, click <strong>Reload app</strong>. That usually fixes it, and your library and downloads are safe.',
        'If it keeps happening, open <strong>Error details</strong> and click <strong>Report</strong>. <a href="/docs/report-a-bug">Report a bug</a> explains what happens next.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Troubleshooting > Report a bug                                     */
  /* ------------------------------------------------------------------ */
  'report-a-bug': {
    'Before you report': {
      bullets: [
        'Update RuForge. The fix may already be out.',
        'For download problems, update yt-dlp too. See <a href="/docs/cookies-and-ytdlp">yt-dlp and cookies</a>.',
        'Check <a href="/docs/common-issues">Common issues</a> and <a href="/docs/known-limitations">Known limitations</a>.',
      ],
    },
    'What to include': {
      bullets: [
        '<strong>Your RuForge version.</strong> It\'s under <strong>Settings</strong> &gt; <strong>Advanced</strong> &gt; <strong>Updates</strong>, next to <strong>Installed</strong>.',
        '<strong>What you did</strong>, step by step, and what you expected to happen.',
        '<strong>The exact error message</strong>, copied from the failed download or the error screen.',
        '<strong>The link</strong>, if the problem is with one video and it\'s public. Don\'t share private or members-only links.',
        '<strong>A screenshot</strong>, if something looks wrong.',
      ],
    },
    'From the error screen': {
      paragraphs: [
        'If RuForge shows its error screen, open <strong>Error details</strong>.',
      ],
      bullets: [
        '<strong>Copy all</strong> copies the error so you can paste it anywhere.',
        '<strong>Report</strong> opens a new GitHub issue in your browser, already filled in with the error and your version. Nothing is sent until you read it and post it yourself.',
      ],
    },
    'Where to post it': {
      paragraphs: [
        'Post bugs on <a href="https://github.com/UnboundAngel/RuForge/issues/new">GitHub Issues</a>. You need a free GitHub account.',
        'Not sure it\'s a bug? Ask on <a href="https://github.com/UnboundAngel/RuForge/discussions">GitHub Discussions</a> first.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Troubleshooting > Known limitations                                */
  /* ------------------------------------------------------------------ */
  'known-limitations': {
    'Windows only': {
      paragraphs: [
        'RuForge runs on <strong>64-bit Windows 10 and 11</strong>. There are no Mac or Linux versions yet. Both are on the <a href="/roadmap">roadmap</a>.',
      ],
    },
    'Made for YouTube': {
      paragraphs: [
        'RuForge is built and tested for <strong>YouTube</strong> and <strong>YouTube Music</strong>. Dragging in links and picking them up from your clipboard only works with YouTube links.',
        'Links from other sites can sometimes download, because yt-dlp supports them, but they aren\'t supported. If one breaks, there\'s no fix coming.',
      ],
    },
    'The queue clears when you close the app': {
      paragraphs: [
        'Downloads that are waiting or running are lost when you quit RuForge. Finished files are safe in your library.',
        'Reloading the window keeps the queue. Running downloads come back paused, and you can resume them.',
      ],
    },
    'Signed-in videos need cookies': {
      paragraphs: [
        'Age-restricted, members-only, and some private videos only download with your YouTube sign-in. See <a href="/docs/cookies-and-ytdlp">yt-dlp and cookies</a>.',
      ],
    },
    'Audio playback': {
      bullets: [
        'There\'s no volume leveling between songs yet.',
        'Songs can crossfade, but there\'s no true gapless playback, so albums that flow from track to track may have a short gap.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  Troubleshooting > FAQ                                              */
  /* ------------------------------------------------------------------ */
  faq: {
    'Is RuForge free?': {
      paragraphs: [
        'Yes. RuForge is free and open source under the Apache-2.0 license. No ads, no subscription, no account.',
      ],
    },
    'Do I need a YouTube account?': {
      paragraphs: [
        'No. Public videos download without signing in. You only need your sign-in for age-restricted or members-only videos. See <a href="/docs/cookies-and-ytdlp">yt-dlp and cookies</a>.',
      ],
    },
    'Where do my downloads go?': {
      paragraphs: [
        'To <code>C:\\RuForge\\Media</code> by default. You can pick any folder instead. See <a href="/docs/library-folders">Library folders</a>.',
      ],
    },
    'Can I download whole playlists?': {
      paragraphs: [
        'Yes. Paste a playlist link and RuForge lists every video first. Reorder them, switch single videos to audio only, and see which ones you already have. Each playlist saves to its own folder, in order.',
      ],
    },
    'Does it work offline?': {
      paragraphs: [
        'Your library and the player work fully offline. You only need internet to download, check for updates, and load things like lyrics and SponsorBlock segments the first time.',
      ],
    },
    'How do updates work?': {
      paragraphs: [
        'RuForge checks for a new version each time it opens. When one is out, click <strong>Install &amp; Restart</strong>. Your library and settings stay put. See <a href="/docs/install">Download and install</a>.',
      ],
    },
    'Is there a Mac or Linux version?': {
      paragraphs: [
        'Not yet. RuForge is Windows only for now. Both are on the <a href="/roadmap">roadmap</a>.',
      ],
    },
    'Does RuForge collect my data?': {
      paragraphs: [
        'No. There are no accounts, no ads, no usage stats and no crash reports. The update check is the only request the project counts. <a href="/docs/security-and-privacy">Security and privacy</a> lists everything RuForge connects to and why.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  About RuForge > About                                              */
  /* ------------------------------------------------------------------ */
  about: {
    'What RuForge does': {
      paragraphs: [
        'RuForge is a free Windows app that saves YouTube videos and music to your PC, keeps them in one library, and plays them offline.',
        'Paste a link or a whole playlist and RuForge downloads it in the quality you pick. Everything you save shows up in one library, with a player that has chapters, subtitles, sponsor skipping, and a mini player you can pin on top of other windows. Music gets its own mode, with albums, lyrics, and playlists.',
      ],
    },
    'What it is built on': {
      paragraphs: [
        'RuForge downloads with <strong>yt-dlp</strong> and joins video and audio with <strong>ffmpeg</strong>, two of the most trusted open tools for the job. The app itself is built with <strong>Tauri</strong> and <strong>Rust</strong>, with a <strong>React</strong> interface.',
        '<a href="/docs/built-with">Built with</a> covers each one and what it does inside RuForge.',
      ],
    },
    'Why Windows first': {
      paragraphs: [
        'Doing one platform well beats doing three badly. RuForge is built and tested on Windows 10 and 11 first. Mac and Linux are on the <a href="/roadmap">roadmap</a>.',
      ],
    },
    'Free and open source': {
      paragraphs: [
        'RuForge is free, with no ads, accounts, or paid tier. All of the code is public on GitHub. See <a href="/docs/open-source">Open source</a>.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  About RuForge > Open source                                        */
  /* ------------------------------------------------------------------ */
  'open-source': {
    License: {
      paragraphs: [
        'RuForge is licensed under <strong>Apache-2.0</strong>. You can use it, change it, and share it, including in your own projects, as long as you keep the license and copyright notices.',
        'Read the full text in the <a href="https://github.com/UnboundAngel/RuForge/blob/main/LICENSE">LICENSE file</a>.',
      ],
    },
    'Source code': {
      paragraphs: [
        'All of the code is on <a href="https://github.com/UnboundAngel/RuForge">GitHub</a>. Every release there comes with the installer and its release notes.',
      ],
    },
    'Open projects inside RuForge': {
      paragraphs: [
        'RuForge stands on other open projects:',
      ],
      bullets: [
        '<strong>yt-dlp</strong> downloads the videos.',
        '<strong>ffmpeg</strong> joins video and audio and converts audio formats.',
        '<strong>SponsorBlock</strong> supplies the sponsor segments the player skips.',
        '<strong>MusicBrainz</strong> and <strong>Cover Art Archive</strong> fill in song details and album art.',
        '<strong>LRCLIB</strong> supplies synced lyrics.',
      ],
      paragraphs2: [
        'From RuForge 0.5, their license texts install with the app, in the <code>licenses</code> folder inside the RuForge install folder.',
      ],
    },
    'Get involved': {
      bullets: [
        'Ideas and questions: <a href="https://github.com/UnboundAngel/RuForge/discussions">GitHub Discussions</a>.',
        'Bugs: <a href="/docs/report-a-bug">Report a bug</a>.',
        'What\'s planned next: the <a href="/roadmap">roadmap</a>.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  About RuForge > Security and privacy                               */
  /* ------------------------------------------------------------------ */
  'security-and-privacy': {
    'No account, no ads': {
      paragraphs: [
        'RuForge has no account and no ads. Your library, history, and settings stay on your PC.',
      ],
    },
    'What leaves your PC': {
      paragraphs: [
        'RuForge only connects to a service when a feature needs it:',
      ],
      table: {
        headers: ['Service', 'When', 'What it gets'],
        rows: [
          ['<strong>YouTube</strong>', 'Downloads, video details, thumbnails, channel pages', 'The videos and channels you ask for'],
          ['<strong>SponsorBlock</strong>', 'Playing a video, if SponsorBlock is on in Settings &gt; Playback', 'A short piece of a hash of the video ID, never the ID itself'],
          ['<strong>MusicBrainz</strong>, <strong>Cover Art Archive</strong>', 'After an audio download', 'The artist and song title'],
          ['<strong>LRCLIB</strong>', 'Loading lyrics', 'The artist, title, album, and length'],
          ['<strong>Wikipedia</strong>, <strong>Wikidata</strong>', 'Opening an artist page', 'The artist name'],
          ['<strong>ruforge.app</strong>, <strong>GitHub</strong>', 'When RuForge opens', 'A check for new RuForge and yt-dlp versions. The RuForge check goes to ruforge.app, which counts it and points it to GitHub'],
          ['<strong>Discord</strong>', 'Only if you turn it on in Settings &gt; General (off by default)', 'What you\'re playing, sent to the Discord app on your PC'],
        ],
      },
    },
    'Your YouTube sign-in': {
      bullets: [
        'Signing in is optional. RuForge only uses your sign-in when you pick a cookie source for a download.',
        'Cookies are handed to yt-dlp and go only to YouTube. With <strong>Internal</strong>, they\'re copied to a temporary file for that download and deleted after.',
        'When you\'re signed in to Explorer, your library home loads your YouTube recommendations and watch history to show next to your downloads. Turn the recommendations off with <strong>YouTube feed in Video Library</strong> in Settings.',
      ],
    },
    'Usage stats and crash reports': {
      paragraphs: [
        'RuForge doesn\'t collect usage stats or crash reports. The only request the project counts is the update check.',
        'The <strong>Report</strong> button on the error screen opens a GitHub issue in your browser for you to read first. Nothing is sent on its own.',
      ],
    },
    'Signed updates': {
      paragraphs: [
        'Updates come from RuForge\'s GitHub releases. Each one is signed, and RuForge checks the signature before installing, so a tampered update gets rejected.',
      ],
    },
    'Where your data lives': {
      bullets: [
        'Your downloads: <code>C:\\RuForge\\Media</code>, or the folder you picked.',
        'Settings, playlists, and your Explorer sign-in: <code>%APPDATA%\\com.attic.ruforge</code>.',
        'Caches like channel pictures: <code>%LOCALAPPDATA%\\com.attic.ruforge</code>.',
      ],
      paragraphs2: [
        'The full details are in the <a href="/legal/privacy">privacy policy</a>. Found a security problem? See <a href="/docs/contact">Contact</a>.',
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /*  About RuForge > Contact and community                             */
  /* ------------------------------------------------------------------ */
  contact: {
    'Questions and ideas': {
      paragraphs: [
        'Ask questions, share ideas, and request features on <a href="https://github.com/UnboundAngel/RuForge/discussions">GitHub Discussions</a>.',
      ],
    },
    Bugs: {
      paragraphs: [
        'Post bugs on <a href="https://github.com/UnboundAngel/RuForge/issues/new">GitHub Issues</a>. <a href="/docs/report-a-bug">Report a bug</a> covers what to include.',
      ],
    },
    'Security issues': {
      paragraphs: [
        'Please don\'t post security problems in public. Report them privately through <a href="https://github.com/UnboundAngel/RuForge/security/advisories/new">GitHub security advisories</a>.',
      ],
    },
  },
};
