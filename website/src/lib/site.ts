import { APP_VERSION } from './appVersion';

export const SITE = {
  name: 'RuForge',
  url: 'https://ruforge.app',
  tagline: 'Open-source media library and yt-dlp frontend for Windows.',
  description:
    'Free Tauri desktop app with yt-dlp downloads, a local media library, music Now Playing, SponsorBlock, and chapter navigation. No ads. No telemetry in standard use.',
  github: 'https://github.com/UnboundAngel/RuForge',
  releases: 'https://github.com/UnboundAngel/RuForge/releases',
  discussions: 'https://github.com/UnboundAngel/RuForge/discussions',
  license: 'https://github.com/UnboundAngel/RuForge/blob/main/LICENSE',
  latestVersion: APP_VERSION,
  ogImage: 'https://ruforge.app/ruforge-og.png',
} as const;

/** In-site download flow (progress UI). Demo: `/download?download=demo` */
export const DOWNLOAD_PAGE = '/download';

export const LEGAL_LINKS = [
  {
    href: '/legal/privacy',
    title: 'Privacy Policy',
    file: 'PRIVACY.md',
    summary: 'What RuForge stores on your computer, what it sends and to which sites, and what it never collects.',
  },
  {
    href: '/legal/terms',
    title: 'Terms of Use',
    file: 'TERMS.md',
    summary: 'What RuForge is, your responsibilities when using it, the license, updates and the no-warranty terms.',
  },
  {
    href: '/legal/notice',
    title: 'Legal Notice',
    file: 'LEGAL.md',
    summary: 'Publisher, copyright and license, trademarks, infringement notices and third-party software.',
  },
] as const;
