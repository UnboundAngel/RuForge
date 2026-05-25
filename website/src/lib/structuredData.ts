import { SITE } from './site';

export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE.url}/#software`,
    name: 'RuForge',
    description:
      'Free open-source desktop media library and yt-dlp frontend for Windows. Downloads videos and audio for offline viewing, with persistent download queues, SponsorBlock integration, chapter navigation, and a local media library with playback.',
    url: SITE.url,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows 10, Windows 11',
    softwareVersion: SITE.latestVersion,
    downloadUrl: `${SITE.url}/download`,
    license: SITE.license,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE.url}/#organization`,
      name: 'Unbound Angel',
      url: SITE.url,
    },
  };
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: 'Unbound Angel',
    url: SITE.url,
    sameAs: [SITE.github],
  };
}
