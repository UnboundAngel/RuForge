/**
 * Obsidian-style docs sidebar tree.
 * Each section can have children (collapsible in the sidebar).
 */

import { DOCS_CONTENT } from './docsContent';

export interface DocsPage {
  slug: string;
  title: string;
  description: string;
  outline: string[];
  /** When set, sidebar links here instead of building a docs page. */
  externalHref?: string;
}

export interface DocsSection {
  id: string;
  label: string;
  /** Whether the section starts expanded in the sidebar. */
  defaultOpen?: boolean;
  pages: DocsPage[];
}

const FULL_DOCS_TREE: DocsSection[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    defaultOpen: true,
    pages: [
      {
        slug: 'install',
        title: 'Download and install',
        description:
          'What you need, how to install RuForge on Windows, and how updates work.',
        outline: [
          'What you need',
          'Install RuForge',
          'Open it for the first time',
          'Updates',
        ],
      },
      {
        slug: 'first-download',
        title: 'Your first download',
        description:
          'Paste a YouTube link, pick video or audio, and play the file from your library.',
        outline: [
          'Paste a link',
          'Pick video or audio',
          'Watch it download',
          'Find it in your library',
        ],
      },
      {
        slug: 'library-folders',
        title: 'Library folders',
        description:
          'Where downloads save, how to pick your own folder, and which files show up in your library.',
        outline: [
          'Where downloads go',
          'Save somewhere else',
          'Add folders to your library',
          'Which files show up',
        ],
      },
      {
        slug: 'glossary',
        title: 'Glossary',
        description:
          'Plain definitions for the words you see in RuForge and in these docs.',
        outline: [
          'Downloading',
          'Your library',
          'Files next to your videos',
          'Watching and listening',
        ],
      },
    ],
  },
  {
    id: 'downloader',
    label: 'Downloader',
    pages: [
      {
        slug: 'how-downloading-works',
        title: 'How downloading works',
        description:
          'URL intake, format preview, the queue, and processing lifecycle from paste to file on disk.',
        outline: [
          'URL intake',
          'Format and size preview',
          'Queue and hero progress',
          'Processing and finish',
        ],
      },
      {
        slug: 'playlist-downloads',
        title: 'Playlist downloads',
        description:
          'Download full playlists into numbered folders, toggle audio per row, and see duplicate warnings.',
        outline: [
          'Playlist URL detection',
          'Per-video audio toggle',
          'Ordered subfolders',
          'Regroup flat files',
        ],
      },
      {
        slug: 'download-queue',
        title: 'Download queue',
        description:
          'Floating queue drawer with thumbnails, pause and resume, and status at a glance.',
        outline: [
          'Floating drawer',
          'Job controls',
          'Thumbnails and marquee titles',
          'Stall watchdog',
        ],
      },
      {
        slug: 'audio-only',
        title: 'Audio-only downloads',
        description:
          'Extract m4a audio without pulling a full video stream. Dedicated audio hero when you play.',
        outline: [
          'Download toggle',
          'Format selection',
          'Library badge',
          'LED visualizer',
        ],
      },
      {
        slug: 'formats-and-quality',
        title: 'Formats and quality',
        description:
          'Pick the video quality, the audio format, and subtitles, and see what gets saved next to each file.',
        outline: [
          'Video quality',
          'Audio only',
          'Subtitles',
          'Files saved with each download',
        ],
      },
      {
        slug: 'cookies-and-ytdlp',
        title: 'yt-dlp and cookies',
        description:
          'Download videos that need you to be signed in, and keep the downloader up to date.',
        outline: [
          'When you need cookies',
          'Pick a cookie source',
          'Use a cookies.txt file',
          'Keep yt-dlp up to date',
        ],
      },
    ],
  },
  {
    id: 'media-library',
    label: 'Media library',
    pages: [
      {
        slug: 'browsing-your-library',
        title: 'Browsing your library',
        description:
          'Scan folders, filter by type, and see watch progress on every card.',
        outline: [
          'Library roots',
          'Card layout',
          'Progress indicators',
          'Quick open in player',
        ],
      },
      {
        slug: 'scan-and-metadata',
        title: 'Scan and metadata',
        description:
          'How RuForge indexes files, reads sidecars, and deduplicates entries.',
        outline: [
          'File scan',
          'Sidecar matching',
          'Dedupe logic',
          'Refresh behavior',
        ],
      },
      {
        slug: 'replace-and-delete',
        title: 'Replace and delete',
        description:
          'Remove files from disk, cancel in-flight previews, and replace downloads with a new format.',
        outline: [
          'Delete flow',
          'Replace download',
          'Preview cancellation',
          'Queue cleanup',
        ],
      },
    ],
  },
  {
    id: 'player',
    label: 'Player',
    pages: [
      {
        slug: 'video-playback',
        title: 'Video playback',
        description:
          'Watch local files with keyboard shortcuts, volume, loop, and a frosted control dock.',
        outline: [
          'Playback controls',
          'Keyboard shortcuts',
          'Control dock',
          'Auto-advance',
        ],
      },
      {
        slug: 'chapters-and-previews',
        title: 'Chapters and previews',
        description:
          'Segmented chapter bar, hover thumbnails, and optional ffmpeg sprite sheets.',
        outline: [
          'yt-dlp chapters',
          'Chapter navigation',
          'Hover previews',
          'Auto sprites',
        ],
      },
      {
        slug: 'custom-subtitles',
        title: 'Custom subtitles',
        description:
          'VTT cues rendered over the video with drag positioning that persists.',
        outline: [
          'Cue overlay',
          'Drag and persist',
          'Main and mini player',
        ],
      },
    ],
  },
  {
    id: 'sponsorblock',
    label: 'SponsorBlock',
    pages: [
      {
        slug: 'segment-types',
        title: 'Segment types',
        description:
          'Sponsor, intro, outro, selfpromo, interaction, music offtopic, preview, filler, chapter, highlight, and POI.',
        outline: [
          'Skip categories',
          'Chapter segments',
          'Highlight and POI',
          'Music offtopic',
        ],
      },
      {
        slug: 'skip-and-overlays',
        title: 'Skip and scrub overlays',
        description:
          'Skip button, color-coded segments on the scrubber, and hover pills.',
        outline: [
          'Skip button',
          'Scrub bar colors',
          'Hover preview pill',
          'Adaptive learning',
        ],
      },
      {
        slug: 'sponsorblock-settings',
        title: 'SponsorBlock settings',
        description:
          'Master toggle, per-category tree, privacy hash fetch, and sidecar files.',
        outline: [
          'Master toggle',
          'Category tree',
          'Sidecar files',
          'API and privacy',
        ],
      },
    ],
  },
  {
    id: 'mini-player',
    label: 'Mini player',
    pages: [
      {
        slug: 'pop-out-window',
        title: 'Pop-out window',
        description:
          'Detach playback into a borderless corner window from the title bar.',
        outline: [
          'How to open',
          'Window behavior',
          'Always on top',
          'Back to app',
        ],
      },
      {
        slug: 'size-layouts',
        title: 'Size layouts',
        description:
          'Large, compact, micro, and tiny layouts that adapt to the window height.',
        outline: [
          'Large mode',
          'Compact mode',
          'Micro and tiny',
          'Responsive breakpoints',
        ],
      },
      {
        slug: 'library-browse',
        title: 'Library browse',
        description:
          'Pick the next file from the bottom media row in large mode.',
        outline: [
          'Media strip',
          'Window lock',
          'Playback handoff',
        ],
      },
      {
        slug: 'cross-window-sync',
        title: 'Cross-window sync',
        description:
          'How the main window and mini player stay in sync via Tauri events.',
        outline: [
          'Event bridge',
          'Play and stop',
          'Volume and mute',
          'File handoff',
        ],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    pages: [
      {
        slug: 'general',
        title: 'General settings',
        description:
          'Theme, accent color, paths, and startup behavior.',
        outline: [
          'Theme and accent',
          'Startup behavior',
          'Paths',
          'Debugging toggle',
        ],
      },
      {
        slug: 'downloads-settings',
        title: 'Downloads settings',
        description:
          'Output folder, parallel jobs, cookie sync, and automatic scrubber previews.',
        outline: [
          'Output folder',
          'Parallel jobs',
          'Auto scrubber previews',
          'yt-dlp update',
        ],
      },
      {
        slug: 'playback-settings',
        title: 'Playback settings',
        description:
          'Auto-advance, prefetch, SponsorBlock categories, and ReplayGain.',
        outline: [
          'Auto-advance',
          'Prefetch',
          'SponsorBlock tree',
          'ReplayGain',
        ],
      },
      {
        slug: 'advanced-and-debugging',
        title: 'Advanced and debugging',
        description:
          'App update check, yt-dlp version, regroup tool, and cycle updater.',
        outline: [
          'Check for updates',
          'yt-dlp check and update',
          'Regroup playlists',
          'Cycle updater',
        ],
      },
    ],
  },
  {
    id: 'explorer',
    label: 'Explorer',
    pages: [
      {
        slug: 'when-to-use-explorer',
        title: 'When to use Explorer',
        description:
          'Cookie and session flows for age-restricted or members-only content.',
        outline: [
          'Use cases',
          'Not a general browser',
          'Title bar navigation',
        ],
      },
      {
        slug: 'cookie-export',
        title: 'Cookie export',
        description:
          'How Explorer passes cookies to yt-dlp for authenticated downloads.',
        outline: [
          'Browser context',
          'Export flow',
          'Fallback without cookies',
        ],
      },
    ],
  },
  {
    id: 'auto-updater',
    label: 'Auto-updater',
    pages: [
      {
        slug: 'how-updates-work',
        title: 'How updates work',
        description:
          'Signed Windows updates checked on startup with a teaser card and post-install notes.',
        outline: [
          'Check on startup',
          'Download and install',
          'Signature verification',
        ],
      },
      {
        slug: 'whats-new-screen',
        title: "What's new screen",
        description:
          'Post-install modal with additions, fixes, and the version teaser.',
        outline: [
          'Teaser card',
          'Structured notes',
          'Version comparison',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    pages: [
      {
        slug: 'common-issues',
        title: 'Common issues',
        description:
          'Fix downloads that stall or fail, videos that need a sign-in, and files missing from your library.',
        outline: [
          'A download stalls or times out',
          'A download fails',
          'The video needs you to sign in',
          'Not enough storage',
          'A file is missing from your library',
          'The app shows an error screen',
        ],
      },
      {
        slug: 'report-a-bug',
        title: 'Report a bug',
        description:
          'What to include in a GitHub issue so the problem can be found and fixed.',
        outline: [
          'Before you report',
          'What to include',
          'From the error screen',
          'Where to post it',
        ],
      },
      {
        slug: 'known-limitations',
        title: 'Known limitations',
        description:
          'What RuForge does not do yet, so you know before you hit it.',
        outline: [
          'Windows only',
          'Made for YouTube',
          'The queue clears when you close the app',
          'Signed-in videos need cookies',
          'Audio playback',
        ],
      },
      {
        slug: 'faq',
        title: 'FAQ',
        description:
          'Quick answers about cost, accounts, downloads, updates, and your data.',
        outline: [
          'Is RuForge free?',
          'Do I need a YouTube account?',
          'Where do my downloads go?',
          'Can I download whole playlists?',
          'Does it work offline?',
          'How do updates work?',
          'Is there a Mac or Linux version?',
          'Does RuForge collect my data?',
        ],
      },
    ],
  },
  {
    id: 'about',
    label: 'About RuForge',
    pages: [
      {
        slug: 'about',
        title: 'About RuForge',
        description:
          'What RuForge is, what it is built on, and why it runs on Windows.',
        outline: [
          'What RuForge does',
          'What it is built on',
          'Why Windows first',
          'Free and open source',
        ],
      },
      {
        slug: 'open-source',
        title: 'Open source',
        description:
          'The license, the source code, and the open projects RuForge stands on.',
        outline: [
          'License',
          'Source code',
          'Open projects inside RuForge',
          'Get involved',
        ],
      },
      {
        slug: 'security-and-privacy',
        title: 'Security and privacy',
        description:
          'What stays on your PC, what goes out and why, and how updates are kept safe.',
        outline: [
          'No account, no ads',
          'What leaves your PC',
          'Your YouTube sign-in',
          'Usage stats and crash reports',
          'Signed updates',
          'Where your data lives',
        ],
      },
      {
        slug: 'contact',
        title: 'Contact and community',
        description:
          'Where to ask questions, share ideas, report bugs, and report security issues.',
        outline: [
          'Questions and ideas',
          'Bugs',
          'Security issues',
        ],
      },
    ],
  },
  {
    id: 'contributing',
    label: 'Contributing',
    pages: [
      {
        slug: 'build-from-source',
        title: 'Build from source',
        description:
          'Clone, install dependencies, run Tauri dev, and signed Windows build notes.',
        outline: [
          'Prerequisites',
          'Dev command',
          'Signed build',
          'Binaries',
        ],
      },
      {
        slug: 'contributing-guide',
        title: 'Contributing guide',
        description:
          'Code style, Shipped log, and release expectations for contributors.',
        outline: [
          'Pull requests',
          'AGENTS.md and STATE.md',
          'No emdashes rule',
          'Release ritual',
        ],
      },
    ],
  },
];

/** Pages and headings without written content stay out of the site until they are written. */
export const DOCS_TREE: DocsSection[] = FULL_DOCS_TREE.map((section) => ({
  ...section,
  pages: section.pages.flatMap((page) => {
    if (page.externalHref) return [page];
    const content = DOCS_CONTENT[page.slug];
    if (!content) return [];
    const outline = page.outline.filter((heading) => content[heading]);
    return outline.length > 0 ? [{ ...page, outline }] : [];
  }),
})).filter((section) => section.pages.length > 0);

/** Flat lookup: slug -> { section, page, sectionIndex, pageIndex }. */
export interface DocsPageMatch {
  section: DocsSection;
  page: DocsPage;
  sectionIndex: number;
  pageIndex: number;
}

const slugMap = new Map<string, DocsPageMatch>();
for (let si = 0; si < DOCS_TREE.length; si++) {
  const section = DOCS_TREE[si];
  for (let pi = 0; pi < section.pages.length; pi++) {
    const page = section.pages[pi];
    if (!page.externalHref) {
      slugMap.set(page.slug, { section, page, sectionIndex: si, pageIndex: pi });
    }
  }
}

export function findDocsPage(slug: string): DocsPageMatch | undefined {
  return slugMap.get(slug);
}

export function allDocsSlugs(): string[] {
  return Array.from(slugMap.keys());
}

/** Previous and next page for sequential navigation. */
export function docsNavNeighbors(slug: string): { prev?: DocsPage; next?: DocsPage } {
  const flat: DocsPage[] = [];
  for (const section of DOCS_TREE) {
    for (const page of section.pages) {
      if (!page.externalHref) flat.push(page);
    }
  }
  const idx = flat.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? flat[idx - 1] : undefined,
    next: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined,
  };
}
