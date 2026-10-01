/**
 * Site IA: nav mega-menus and template doc pages.
 * External hrefs skip static generation and link out directly.
 */

export type NavSectionId = 'features' | 'company' | 'resources' | 'help' | 'docs';

export interface SitePage {
  slug: string;
  title: string;
  description: string;
  /** Placeholder section headings for template pages. */
  outline: string[];
  /** When set, nav links here and no `/section/slug` page is built. */
  externalHref?: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  description: string;
  pages: SitePage[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'features',
    label: 'Features',
    description: 'What RuForge does on your machine.',
    pages: [
      {
        slug: 'downloader',
        title: 'YouTube downloader',
        description:
          'Download videos, audio, and whole playlists. See the file size first and skip what you already have.',
        outline: ['See what you are getting first', 'Whole playlists', 'Download a lot at once'],
      },
      {
        slug: 'media-library',
        title: 'Media library',
        description:
          'Everything you downloaded in one place, with your place saved in every video.',
        outline: ['Everything in one place', 'Pick up where you left off'],
      },
      {
        slug: 'player',
        title: 'Video player',
        description:
          'Watch your downloads with chapter previews, SponsorBlock skipping, and the comments beside the video.',
        outline: ['Chapters', 'SponsorBlock', 'Comments'],
      },
      {
        slug: 'music',
        title: 'Music mode',
        description:
          'Play your songs with lyrics, albums, artists, playlists, and crossfade, and find new music on YouTube Music.',
        outline: ['Your music home', 'Lyrics and Now Playing', 'Artists, albums and playlists'],
      },
      {
        slug: 'mini-player',
        title: 'Mini player',
        description:
          'Keep a video playing in a small window on top of your other apps.',
        outline: ['Keep watching while you work', 'As big or as small as you want'],
      },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Project, releases, and policies.',
    pages: [
      {
        slug: 'about',
        title: 'About RuForge',
        description:
          'Local-first YouTube downloader and player for Windows. Built by Unbound Angel with Tauri, Rust, and React.',
        outline: ['Mission', 'Stack', 'Open source', 'Windows focus'],
      },
      {
        slug: 'changelog',
        title: 'Changelog',
        description: 'Release history and version notes.',
        outline: [],
        externalHref: '/changelog',
      },
      {
        slug: 'roadmap',
        title: 'Roadmap',
        description: 'Public feature tracker and priorities.',
        outline: [],
        externalHref: '/roadmap',
      },
      {
        slug: 'releases',
        title: 'Releases and download',
        description: 'Signed installers and release assets on GitHub.',
        outline: ['Windows installer', 'Verify signatures', 'Update channel'],
        externalHref: 'https://github.com/UnboundAngel/RuForge/releases',
      },
      {
        slug: 'open-source',
        title: 'Open source',
        description: 'Apache-2.0 licensed codebase, discussions, and how to contribute.',
        outline: ['Repository', 'License', 'Discussions', 'Contributing'],
      },
      {
        slug: 'security',
        title: 'Security and privacy',
        description: 'How RuForge handles local data, updates, and reporting issues.',
        outline: ['Local-only library', 'Signed updates', 'Reporting vulnerabilities', 'Privacy policy'],
      },
      {
        slug: 'legal',
        title: 'Legal',
        description: 'Privacy, terms, and legal notice.',
        outline: [],
        externalHref: '/legal',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    description: 'Guides to install, configure, and use RuForge.',
    pages: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        description: 'Install RuForge, pick library folders, and download your first video.',
        outline: ['Install', 'First launch', 'Download folder', 'First download'],
      },
      {
        slug: 'install',
        title: 'Install and update',
        description: 'Windows requirements, installer, and in-app updates.',
        outline: ['System requirements', 'Installer', 'Auto-update', 'Dev builds'],
      },
      {
        slug: 'library-paths',
        title: 'Library folders',
        description: 'Internal vault, your download path, and how the library discovers files.',
        outline: ['Download directory', 'Internal vault and download path', 'Scan behavior', 'Case and extensions'],
      },
      {
        slug: 'cookies-ytdlp',
        title: 'yt-dlp and cookies',
        description: 'Use Explorer or a cookie file when videos need login, age verification, or membership.',
        outline: ['When cookies matter', 'Explorer flow', 'Cookie file path', 'Metadata simulate'],
      },
      {
        slug: 'formats',
        title: 'Formats and quality',
        description: 'Video vs audio, size estimates, and what yt-dlp writes to disk.',
        outline: ['Video formats', 'Audio-only', 'Size preview', 'Sidecar metadata'],
      },
      {
        slug: 'faq',
        title: 'FAQ',
        description: 'Common questions about downloads, playback, and the library.',
        outline: ['Downloads', 'Playback', 'Library', 'Updates'],
      },
      {
        slug: 'keyboard-shortcuts',
        title: 'Keyboard shortcuts',
        description: 'Player, chapters, and navigation shortcuts (reference in progress).',
        outline: ['Player', 'Chapters', 'Global'],
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Support, troubleshooting, and issue reporting.',
    pages: [
      {
        slug: 'contact',
        title: 'Contact and community',
        description: 'GitHub Discussions, issues, and where to ask questions.',
        outline: ['Discussions', 'Bug reports', 'Feature requests', 'Response expectations'],
      },
      {
        slug: 'troubleshooting',
        title: 'Troubleshooting',
        description: 'Fix stalled downloads, missing library entries, and playback glitches.',
        outline: ['Downloads stall', 'Missing files', 'Playback', 'Explorer'],
      },
      {
        slug: 'report-bug',
        title: 'Report a bug',
        description: 'What to include in a GitHub issue so we can reproduce the problem.',
        outline: ['Version', 'Steps', 'Logs', 'Sample URL or file'],
      },
      {
        slug: 'known-limitations',
        title: 'Known limitations',
        description: 'Platform scope, extension edge cases, and experimental areas.',
        outline: ['Windows shipping target', 'Linux dev only', 'Explorer webview', 'Extensions'],
      },
      {
        slug: 'migrate',
        title: 'Migrate your library',
        description: 'Point RuForge at existing folders and regroup flat downloads into playlist folders.',
        outline: ['Existing folders', 'Regroup tool', 'Duplicates', 'Metadata sidecars'],
      },
    ],
  },
  {
    id: 'docs',
    label: 'Docs',
    description: 'Guides, reference, and troubleshooting for every feature.',
    pages: [
      {
        slug: 'overview',
        title: 'Documentation',
        description: 'Guides, reference, and troubleshooting for every feature.',
        outline: [],
        externalHref: '/docs',
      },
      {
        slug: 'built-with',
        title: 'Built with',
        description:
          'How RuForge uses YouTube, yt-dlp, Tauri, React, and the rest of the stack.',
        outline: [],
        externalHref: '/docs/built-with',
      },
      {
        slug: 'getting-started',
        title: 'Getting started',
        description: 'Install RuForge, pick library folders, and download your first video.',
        outline: [],
        externalHref: '/docs/install',
      },
      {
        slug: 'settings',
        title: 'Settings reference',
        description: 'Downloads, playback, paths, debugging, and SponsorBlock options.',
        outline: [],
        externalHref: '/docs/general',
      },
      {
        slug: 'download-options',
        title: 'Download options',
        description: 'Formats, audio-only, cookies, auto previews, and queue behavior.',
        outline: [],
        externalHref: '/docs/formats-and-quality',
      },
      {
        slug: 'sponsorblock-settings',
        title: 'SponsorBlock settings',
        description: 'Categories, learning, privacy hash fetch, and sidecar files.',
        outline: [],
        externalHref: '/docs/sponsorblock-settings',
      },
      {
        slug: 'build-from-source',
        title: 'Build from source',
        description: 'Clone, npm, Tauri dev, and signed Windows build notes.',
        outline: [],
        externalHref: '/docs/build-from-source',
      },
      {
        slug: 'contributing',
        title: 'Contributing',
        description: 'Code style, Shipped log, and release expectations for contributors.',
        outline: [],
        externalHref: '/docs/contributing-guide',
      },
    ],
  },
];

const sectionById = new Map(NAV_SECTIONS.map((s) => [s.id, s]));

export function getNavSection(id: NavSectionId): NavSection {
  const section = sectionById.get(id);
  if (!section) throw new Error(`Unknown nav section: ${id}`);
  return section;
}

export function pageHref(sectionId: NavSectionId, slug: string): string {
  const section = getNavSection(sectionId);
  const page = section.pages.find((p) => p.slug === slug);
  if (!page) return `/${sectionId}`;
  if (page.externalHref) return page.externalHref;
  return `/${sectionId}/${slug}`;
}

export function getStaticPagePaths(): { section: NavSectionId; slug: string }[] {
  const paths: { section: NavSectionId; slug: string }[] = [];
  for (const section of NAV_SECTIONS) {
    for (const page of section.pages) {
      if (!page.externalHref) {
        paths.push({ section: section.id, slug: page.slug });
      }
    }
  }
  return paths;
}

export function findPage(
  sectionId: NavSectionId,
  slug: string,
): { section: NavSection; page: SitePage } | undefined {
  const section = sectionById.get(sectionId);
  if (!section) return undefined;
  const page = section.pages.find((p) => p.slug === slug);
  if (!page || page.externalHref) return undefined;
  return { section, page };
}

export function isNavPathActive(pathname: string, sectionId: NavSectionId, slug?: string): boolean {
  if (slug) {
    return pathname === pageHref(sectionId, slug);
  }
  return pathname === `/${sectionId}` || pathname.startsWith(`/${sectionId}/`);
}
