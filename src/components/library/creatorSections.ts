import type { FeedVideo } from "./youtubeFeed";

export type CreatorSections = { latest: FeedVideo[]; popular: FeedVideo[]; watched: FeedVideo[] };

/** Popular only earns a shelf when it says something the latest row doesn't. */
const MIN_POPULAR = 2;

/**
 * The creator page's YouTube shelves, minus anything already downloaded. Popular ranks the
 * recent uploads by views: the channel tab can't be asked for YouTube's own Popular sort.
 */
export function creatorSections(
  recent: FeedVideo[],
  watched: FeedVideo[],
  libraryIds: ReadonlySet<string>,
  columns: number,
): CreatorSections {
  const fresh = recent.filter((v) => !v.short && !libraryIds.has(v.videoId));
  const popular = fresh
    .filter((v) => v.viewCount != null)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, columns);
  const seen = new Set<string>();
  return {
    latest: fresh.slice(0, columns * 2),
    popular: popular.length >= MIN_POPULAR ? popular : [],
    watched: watched
      .filter((v) => !v.short && !libraryIds.has(v.videoId) && !seen.has(v.videoId) && seen.add(v.videoId))
      .slice(0, columns * 2),
  };
}

/** Downloads from this creator; older files may only know the channel by name. */
export function creatorFiles<T extends { youtube?: { channel?: string | null; channelId?: string | null } | null }>(
  files: T[],
  channelId: string,
  channel: string,
): T[] {
  const name = channel.trim().toLowerCase();
  return files.filter((f) => {
    const yt = f.youtube;
    if (!yt) return false;
    if (yt.channelId) return yt.channelId === channelId;
    return !!name && yt.channel?.trim().toLowerCase() === name;
  });
}
