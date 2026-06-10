/** URLs safe to use in the main-window <img> (not webview-only blob/data placeholders). */
export function sanitizeYoutubeAvatarUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  let url = raw.trim();
  if (!url) return null;

  const lower = url.toLowerCase();
  if (
    lower.startsWith("blob:")
    || lower.startsWith("about:")
    || lower.startsWith("javascript:")
    || lower.startsWith("data:")
  ) {
    return null;
  }

  if (url.startsWith("//")) url = `https:${url}`;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
