export type PreviewStream = {
  url: string;
  duration: number | null;
  expiresAt: number | null;
  hookStart: number | null;
};

/** Stream URLs expire (usually after about six hours); drop them well before YouTube does. */
const EXPIRY_MARGIN_SEC = 20 * 60;
const FALLBACK_TTL_SEC = 60 * 60;

export function previewStreamFresh(stream: PreviewStream, resolvedAtSec: number, nowSec: number): boolean {
  const deadline = stream.expiresAt ?? resolvedAtSec + FALLBACK_TTL_SEC;
  return nowSec < deadline - EXPIRY_MARGIN_SEC;
}

export const PREVIEW_SEC = 15;
const SHORT_TRACK_SEC = 30;
/** About where the first chorus lands in pop-structured songs. */
const GUESS_FRACTION = 0.35;
const GUESS_MIN_SEC = 30;
const GUESS_MAX_SEC = 75;

/** Where a preview starts: the hook when known, else a guess at the first chorus, always leaving a full window. */
export function previewStartSec(duration: number | null, hookStart: number | null): number {
  if (duration == null || !Number.isFinite(duration) || duration <= SHORT_TRACK_SEC) return 0;
  const latest = duration - PREVIEW_SEC;
  const start =
    hookStart ?? Math.min(GUESS_MAX_SEC, Math.max(GUESS_MIN_SEC, duration * GUESS_FRACTION));
  return Math.max(0, Math.min(latest, start));
}
