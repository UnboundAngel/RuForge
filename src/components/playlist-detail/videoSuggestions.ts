import { invoke } from "@tauri-apps/api/core";
import type { MusicPlaylistPage, MusicTrackInfo } from "@/lib/musicExploreTracks";
import { throttleMusicExplorePageFetch } from "@/lib/ytdlpPageFetchThrottle";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import type { FeedVideo } from "@/components/library/youtubeFeed";

export type VideoSuggestion =
  | { kind: "local"; key: string; file: MediaFile }
  | { kind: "outside"; key: string; video: FeedVideo };

const RELATED_LIMIT = 25;
const relatedCache = new Map<string, Promise<FeedVideo[]>>();

function toFeedVideo(info: MusicTrackInfo): FeedVideo | null {
  if (/\/shorts\//i.test(info.url)) return null;
  const videoId = /^[\w-]{11}$/.test(info.id) ? info.id : extractYouTubeVideoId(info.url);
  if (!videoId || !info.title) return null;
  return {
    videoId,
    title: info.title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    channel: info.artist,
    channelId: null,
    channelVerified: false,
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: info.duration,
    viewCount: null,
    timestamp: null,
  };
}

async function fetchPage(url: string, limit: number): Promise<FeedVideo[]> {
  const { settings } = useRuforgeStore.getState();
  await throttleMusicExplorePageFetch();
  const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
    url,
    offset: 0,
    limit,
    browserCookies: settings.browserContext || null,
    cookieFile: settings.cookieFile || null,
  });
  return page.items.map(toFeedVideo).filter((v): v is FeedVideo => v !== null);
}

/** YouTube's own mix for one video (what its watch page recommends next). Cached for the session; a failure is retried next time. */
export function fetchRelatedVideos(videoId: string): Promise<FeedVideo[]> {
  const hit = relatedCache.get(videoId);
  if (hit) return hit;
  const task = fetchPage(`https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`, RELATED_LIMIT).catch((e) => {
    relatedCache.delete(videoId);
    throw e;
  });
  relatedCache.set(videoId, task);
  return task;
}

export function searchYoutubeVideos(query: string, limit = 10): Promise<FeedVideo[]> {
  return fetchPage(`ytsearch${limit}:${query.trim()}`, limit);
}

/** Alternates the two sources so neither crowds the shelf. */
export function interleaveSuggestions<A, B>(a: readonly A[], b: readonly B[]): Array<A | B> {
  const out: Array<A | B> = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}
