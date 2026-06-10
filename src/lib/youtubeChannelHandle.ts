/** Canonical @handle for display and cache (single leading @, no URL slashes). */
export function normalizeYoutubeChannelHandle(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  let t = raw.trim();
  if (!t) return null;

  t = t.replace(/^\/+/, "");
  const at = t.indexOf("@");
  if (at >= 0) {
    t = t.slice(at);
  } else {
    return null;
  }

  if (!t.startsWith("@")) return null;
  const body = t.slice(1).trim();
  if (!body || !/^[A-Za-z0-9._-]{1,30}$/.test(body)) {
    return null;
  }

  return `@${body}`;
}
