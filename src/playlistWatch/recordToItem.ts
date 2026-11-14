import type { NotificationItem } from "@/notifications/types";
import type { PlaylistNewRecord } from "./types";

export function isPlaylistRecord(v: unknown): v is PlaylistNewRecord {
  const r = v as PlaylistNewRecord | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.listId === "string" &&
    typeof r.outputDir === "string" &&
    typeof r.folderName === "string" &&
    Array.isArray(r.videos) &&
    r.videos.length > 0
  );
}

export function playlistVideoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function playlistToastCopy(r: PlaylistNewRecord): string {
  const n = r.videos.length;
  return `${n} new ${n === 1 ? "video" : "videos"} in ${r.title || "a playlist"}`;
}

const SUBTITLE_TITLES = 3;

/** A row folds batches over time, so the text names a few titles and counts the rest. */
function subtitleFor(videos: { title: string }[]): string {
  const n = videos.length;
  const head = `${n} new ${n === 1 ? "video" : "videos"}`;
  const titles = videos.slice(0, SUBTITLE_TITLES).map((v) => v.title).filter(Boolean);
  if (titles.length === 0) return head;
  const more = n > titles.length ? ` +${n - titles.length} more` : "";
  return `${head}: ${titles.join(", ")}${more}`;
}

/** One row per playlist: a later batch for the same list folds into the row instead of stacking. */
export function recordToItem(r: PlaylistNewRecord, previous?: NotificationItem): NotificationItem {
  const prior = previous?.ref.playlist?.videos ?? [];
  const seen = new Set(r.videos.map((v) => v.id));
  const videos = [...r.videos, ...prior.filter((v) => !seen.has(v.id))];
  return {
    id: `playlist:${r.listId}`,
    source: "playlist",
    kind: "playlist-new",
    title: r.title || "Playlist",
    subtitle: subtitleFor(videos),
    thumbnail: videos[0] ? `https://i.ytimg.com/vi/${videos[0].id}/mqdefault.jpg` : null,
    channelId: null,
    createdAt: r.at * 1000,
    read: false,
    actions: ["queue"],
    ref: {
      url: r.listUrl,
      playlist: { listId: r.listId, outputDir: r.outputDir, folderName: r.folderName, videos },
    },
  };
}
