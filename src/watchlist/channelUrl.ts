import { extractYouTubeVideoId } from "@/youtubeUrl";
import type { WatchedChannel, WatchlistSnapshot } from "./types";

export type ExplorerChannelRef =
  | { kind: "id"; channelId: string }
  | { kind: "handle"; handle: string }
  | { kind: "path"; path: string }
  | { kind: "video"; videoId: string };

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const PAGE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeHandle(handle: string): string {
  return (handle.startsWith("@") ? handle : `@${handle}`).toLowerCase();
}

/** Which channel a youtube.com page belongs to, as far as the URL alone can tell. Shorts never count. */
export function explorerChannelRef(url: string): ExplorerChannelRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!PAGE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const [first = "", second = ""] = parsed.pathname.split("/").filter(Boolean);
  const head = first.toLowerCase();

  if (head === "shorts") return null;
  if (head === "watch" || head === "live") {
    const videoId = extractYouTubeVideoId(parsed.href);
    return videoId ? { kind: "video", videoId } : null;
  }
  if (head === "channel") return CHANNEL_ID_RE.test(second) ? { kind: "id", channelId: second } : null;
  if (first.startsWith("@") && first.length > 1) return { kind: "handle", handle: safeDecode(first) };
  if ((head === "c" || head === "user") && second) return { kind: "path", path: `/${head}/${second}` };
  return null;
}

/** `videoChannelId` is the owner of a watch page, which only a stats lookup can supply. */
export function findFollowed(
  snapshot: WatchlistSnapshot | null,
  ref: ExplorerChannelRef | null,
  videoChannelId?: string | null,
): WatchedChannel | null {
  if (!snapshot || !ref) return null;
  switch (ref.kind) {
    case "id":
      return snapshot.channels.find((c) => c.channelId === ref.channelId) ?? null;
    case "handle": {
      const want = normalizeHandle(ref.handle);
      return snapshot.channels.find((c) => c.handle != null && normalizeHandle(c.handle) === want) ?? null;
    }
    case "video":
      return videoChannelId ? (snapshot.channels.find((c) => c.channelId === videoChannelId) ?? null) : null;
    case "path":
      return null;
  }
}
