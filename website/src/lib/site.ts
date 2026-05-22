export const SITE = {
  name: 'RuForge',
  tagline: 'YouTube downloader, local library, and player for Windows.',
  description:
    'RuForge downloads YouTube with yt-dlp, keeps a local library, and plays videos with chapters, subtitles, and a mini player.',
  github: 'https://github.com/UnboundAngel/RuForge',
  releases: 'https://github.com/UnboundAngel/RuForge/releases',
  discussions: 'https://github.com/UnboundAngel/RuForge/discussions',
  license: 'https://github.com/UnboundAngel/RuForge/blob/main/LICENSE',
  latestVersion: '0.1.7',
  ogImage:
    'https://repository-images.githubusercontent.com/1235101565/9467631f-98c4-4fac-b475-4c1020ec9868',
} as const;

export const LEGAL_LINKS = [
  { href: '/legal/privacy', title: 'Privacy Policy', file: 'PRIVACY.md' },
  { href: '/legal/terms', title: 'Terms of Use', file: 'TERMS.md' },
  { href: '/legal/notice', title: 'Legal Notice', file: 'LEGAL.md' },
] as const;
