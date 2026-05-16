const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Canonical 11-char YouTube video id, or null if not a recognizable watch URL. */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const short = trimmed.match(/(?:^|\/\/)(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (short?.[1] && YT_ID_RE.test(short[1])) return short[1];

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (YT_ID_RE.test(id)) return id;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "www.youtube.com"
    ) {
      const v = url.searchParams.get("v");
      if (v && YT_ID_RE.test(v)) return v;

      const pathMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/i);
      if (pathMatch?.[1] && YT_ID_RE.test(pathMatch[1])) return pathMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

const TRACKING_PARAMS = [
  "si",
  "feature",
  "pp",
  "fbclid",
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/** Stable comparison key: `youtube:<id>` when id is known, else normalized URL string. */
export function normalizeYouTubeUrlForCompare(input: string): string {
  const id = extractYouTubeVideoId(input);
  if (id) return `youtube:${id}`;

  try {
    const url = new URL(input.trim());
    for (const p of TRACKING_PARAMS) url.searchParams.delete(p);
    url.hash = "";
    return url.toString().toLowerCase();
  } catch {
    return input.trim().toLowerCase();
  }
}

export function youtubeUrlsMatch(a: string, b: string): boolean {
  const idA = extractYouTubeVideoId(a);
  const idB = extractYouTubeVideoId(b);
  if (idA && idB) return idA === idB;
  return normalizeYouTubeUrlForCompare(a) === normalizeYouTubeUrlForCompare(b);
}

/** True when the string contains a recognizable YouTube watch URL. */
export function isYouTubeUrl(input: string): boolean {
  return extractYouTubeVideoId(input) !== null;
}

/**
 * True for `youtube.com/watch` or `m.youtube.com/watch` with a valid `v` id
 * (Explorer header queue control — matches in-webview watch pages, not shorts/embed).
 */
export function isYouTubeDotComWatchPageUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    if (!/^\/watch\/?$/i.test(u.pathname)) return false;
    const v = u.searchParams.get("v");
    return Boolean(v && YT_ID_RE.test(v));
  } catch {
    return false;
  }
}

const YT_URL_IN_TEXT_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/gi;

/** Stable https watch URL for the downloader field, or null if not YouTube. */
export function canonicalYouTubeWatchUrl(input: string): string | null {
  const id = extractYouTubeVideoId(input);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

/** First YouTube URL in arbitrary clipboard text (whitespace, quotes, extra lines). */
export function extractYouTubeUrlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = canonicalYouTubeWatchUrl(trimmed);
  if (direct) return direct;

  const matches = trimmed.match(YT_URL_IN_TEXT_RE);
  if (!matches) return null;

  for (const candidate of matches) {
    const canonical = canonicalYouTubeWatchUrl(candidate);
    if (canonical) return canonical;
  }

  return null;
}

/** Stable watch URL for one playlist entry from yt-dlp preview metadata. */
export function playlistItemWatchUrl(item: {
  webpageUrl?: string;
  id?: string;
}): string | null {
  const fromWeb = item.webpageUrl?.trim();
  if (fromWeb) {
    const c = canonicalYouTubeWatchUrl(fromWeb);
    if (c) return c;
  }
  const id = item.id?.trim();
  if (id && YT_ID_RE.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  return null;
}
