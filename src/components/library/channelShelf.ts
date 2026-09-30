import type { FeedVideo, MixedGridItem } from "./youtubeFeed";

export type ChannelShelf<T> = { channel: string; channelId: string | null; items: MixedGridItem<T>[] };

type FollowedChannel = { channelId: string; title: string; followedAt: number };

/** The newest follow, so following someone puts a shelf of theirs on Library home right away. */
export function pickLatestFollow(channels: FollowedChannel[] | null | undefined, skipId: string | null): FollowedChannel | null {
  let best: FollowedChannel | null = null;
  for (const c of channels ?? []) {
    if (c.channelId === skipId || !c.title.trim()) continue;
    if (!best || c.followedAt > best.followedAt) best = c;
  }
  return best;
}

/** History entries often come without a channel id, so the name is the fallback match. */
export function watchedFromChannel(history: FeedVideo[], channelId: string | null, channel: string): FeedVideo[] {
  const name = channel.trim().toLowerCase();
  return history.filter(
    (v) => (!!channelId && v.channelId === channelId) || (!!name && v.channel?.trim().toLowerCase() === name),
  );
}

/** Newest, most viewed and already watched, taken in turns so one row shows a bit of each. */
export function pickChannelVideos(
  recent: FeedVideo[],
  watched: FeedVideo[],
  exclude: ReadonlySet<string>,
  count: number,
): FeedVideo[] {
  const popular = recent
    .filter((v) => v.viewCount != null)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const lists = [recent, popular, watched];
  const cursors = lists.map(() => 0);
  const seen = new Set(exclude);
  const out: FeedVideo[] = [];
  let progressed = true;
  while (out.length < count && progressed) {
    progressed = false;
    lists.forEach((list, i) => {
      while (out.length < count && cursors[i] < list.length) {
        const video = list[cursors[i]++];
        if (video.short || seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        out.push(video);
        progressed = true;
        break;
      }
    });
  }
  return out;
}

/** One row: up to half the user's own downloads, the rest from YouTube so the shelf shows something new. */
export function composeChannelShelf<T>(files: T[], videos: FeedVideo[], columns: number): MixedGridItem<T>[] {
  const own = files.slice(0, Math.max(Math.ceil(columns / 2), columns - videos.length));
  return [
    ...own.map((file): MixedGridItem<T> => ({ kind: "file", file })),
    ...videos.slice(0, columns - own.length).map((video): MixedGridItem<T> => ({ kind: "feed", video })),
  ];
}
