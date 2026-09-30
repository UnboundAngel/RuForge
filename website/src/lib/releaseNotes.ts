import type { RoadmapArea } from './roadmapFieldNotes';

export interface ReleaseNoteLine {
  area: string | null;
  group: RoadmapArea | null;
  text: string;
}

/** First match wins, so the more specific keywords come first. */
const AREA_KEYWORDS: [RoadmapArea, string[]][] = [
  ['Browser', ['youtube', 'explore', 'browser', 'discord', 'channel', 'webview']],
  ['Downloads', ['download', 'queue', 'yt-dlp', 'ffmpeg']],
  ['Library', ['library', 'playlist', 'liked', 'delete', 'media', 'gallery', 'thumbnail', 'storage', 'cleanup', 'export']],
  ['Player', ['player', 'playback', 'music', 'lyric', 'chapter', 'subtitle', 'sponsor', 'volume', 'island', 'audio', 'crossfade', 'scrub', 'comment', 'listen']],
  ['Performance', ['perf', 'update', 'install', 'startup', 'cache', 'crash', 'debug', 'telemetry', 'boot', 'splash']],
  ['Settings', ['setting', 'appearance', 'accent', 'chrome', 'window', 'radial', 'navigation', 'title', 'notification', 'tip', 'onboarding']],
];

function areaGroup(area: string): RoadmapArea | null {
  const key = area.toLowerCase();
  return AREA_KEYWORDS.find(([, words]) => words.some((word) => key.includes(word)))?.[0] ?? null;
}

/** Newer notes lead with `Area: sentence.`; older ones are plain sentences. */
export function splitReleaseNote(line: string): ReleaseNoteLine {
  const match = line.match(/^([A-Z][A-Za-z0-9 /&+-]{1,23}):\s+(.+)$/s);
  if (!match) return { area: null, group: null, text: line };
  return { area: match[1], group: areaGroup(match[1]), text: match[2] };
}

export function releaseAnchor(version: string): string {
  return `v${version.replace(/\./g, '-')}`;
}

/** Newest first. Same-day releases fall back to numeric version order. */
export function compareReleasesNewestFirst(
  a: { date: Date; version: string },
  b: { date: Date; version: string },
): number {
  const byDate = b.date.getTime() - a.date.getTime();
  if (byDate !== 0) return byDate;
  return b.version.localeCompare(a.version, 'en', { numeric: true });
}
