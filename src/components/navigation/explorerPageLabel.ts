import { extractYouTubePlaylistId, extractYouTubeVideoId } from "@/youtubeUrl";

/** "Home", "Video", "Search · lofi" and so on for the Explorer bottom bar. */
export function explorerPageLabel(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "YouTube";
  }
  const path = u.pathname.replace(/\/+$/, "") || "/";
  if (path === "/watch") return "Video";
  if (path.startsWith("/shorts/")) return "Short";
  if (path === "/results") {
    const q = u.searchParams.get("search_query")?.trim();
    return q ? `Search · ${q}` : "Search";
  }
  if (path === "/playlist") return "Playlist";
  if (path.startsWith("/@") || path.startsWith("/channel/") || path.startsWith("/c/")) return "Channel";
  if (path === "/feed/subscriptions") return "Subscriptions";
  if (path === "/feed/history") return "History";
  if (path === "/feed/you" || path === "/feed/library") return "You";
  if (path === "/") return "Home";
  return "YouTube";
}

/** A pasted YouTube link as a youtube.com page the Explorer can open, or null. */
export function resolveExplorerPasteUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const videoId = extractYouTubeVideoId(text);
  const listId = extractYouTubePlaylistId(text);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}${listId ? `&list=${listId}` : ""}`;
  }
  if (listId) return `https://www.youtube.com/playlist?list=${listId}`;
  return null;
}
