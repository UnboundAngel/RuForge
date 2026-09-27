export type PreviewStream = { url: string; duration: number | null; expiresAt: number | null };

/** Stream URLs expire (usually after about six hours); drop them well before YouTube does. */
const EXPIRY_MARGIN_SEC = 20 * 60;
const FALLBACK_TTL_SEC = 60 * 60;

export function previewStreamFresh(stream: PreviewStream, resolvedAtSec: number, nowSec: number): boolean {
  const deadline = stream.expiresAt ?? resolvedAtSec + FALLBACK_TTL_SEC;
  return nowSec < deadline - EXPIRY_MARGIN_SEC;
}
