import { APP_VERSION } from './appVersion';

export const SITE = {
  name: 'RuForge',
  url: 'https://ruforge.app',
  tagline: 'Open-source media library and yt-dlp frontend for Windows.',
  description:
    'Free Tauri desktop app with yt-dlp downloads, SponsorBlock, chapter navigation, and a local media library. No ads, no telemetry.',
  github: 'https://github.com/UnboundAngel/RuForge',
  releases: 'https://github.com/UnboundAngel/RuForge/releases',
  discussions: 'https://github.com/UnboundAngel/RuForge/discussions',
  license: 'https://github.com/UnboundAngel/RuForge/blob/main/LICENSE',
  latestVersion: APP_VERSION,
  ogImage:
    'https://repository-images.githubusercontent.com/1235101565/9467631f-98c4-4fac-b475-4c1020ec9868',
} as const;

/** In-site download flow (progress UI). Demo: `/download?download=demo` */
export const DOWNLOAD_PAGE = '/download';

export const LEGAL_LINKS = [
  { href: '/legal/privacy', title: 'Privacy Policy', file: 'PRIVACY.md' },
  { href: '/legal/terms', title: 'Terms of Use', file: 'TERMS.md' },
  { href: '/legal/notice', title: 'Legal Notice', file: 'LEGAL.md' },
] as const;
