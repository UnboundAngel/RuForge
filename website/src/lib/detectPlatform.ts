export type DetectedPlatform = 'windows' | 'linux' | 'mac';

export const PLATFORM_LABELS: Record<DetectedPlatform, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
};

export function detectPlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  if (platform.includes('mac') || ua.includes('mac')) return 'mac';
  return 'windows';
}

export function downloadCtaLabel(os: DetectedPlatform): string {
  return `Download for ${PLATFORM_LABELS[os]}`;
}
