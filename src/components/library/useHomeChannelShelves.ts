import { useMemo } from "react";
import type { MediaFile } from "@/types";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import { type ChannelShelf, composeChannelShelf, pickChannelVideos, pickLatestFollow, watchedFromChannel } from "./channelShelf";
import { pickChannelSpotlight } from "./homeSections";
import { useChannelVideos } from "./useChannelVideos";

type ShelfPick = { channel: string; channelId: string | null; files: MediaFile[] };

/**
 * "More from" shelves for Library home: the newest follow first, then the channel the user
 * downloads most. Each mixes the user's own files with that channel's newest, most viewed and
 * already watched uploads from YouTube.
 */
export function useHomeChannelShelves({
  active,
  files,
  columns,
  exclude,
}: {
  active: boolean;
  /** Library files not already on another shelf. */
  files: MediaFile[];
  columns: number;
  /** Video ids already in the library or on another shelf. */
  exclude: ReadonlySet<string>;
}): ChannelShelf<MediaFile>[] {
  const followed = useWatchlistStore((s) => s.snapshot?.channels);

  const picks = useMemo((): ShelfPick[] => {
    if (!active) return [];
    const library = pickChannelSpotlight(files, (f) => f.youtube, columns);
    const latest = pickLatestFollow(followed, library?.channelId ?? null);
    const out: ShelfPick[] = [];
    if (latest) {
      out.push({
        channel: latest.title,
        channelId: latest.channelId,
        files: files.filter((f) => f.youtube?.channelId === latest.channelId),
      });
    }
    if (library) out.push(library);
    return out;
  }, [active, files, columns, followed]);

  const channelIds = useMemo(() => picks.flatMap((p) => (p.channelId ? [p.channelId] : [])), [picks]);
  const { byChannel, history } = useChannelVideos(channelIds, active);

  return useMemo(() => {
    const taken = new Set(exclude);
    return picks.map(({ channel, channelId, files: own }) => {
      const recent = channelId ? (byChannel[channelId] ?? []) : [];
      const videos = pickChannelVideos(recent, watchedFromChannel(history, channelId, channel), taken, columns);
      const items = composeChannelShelf(own, videos, columns);
      for (const item of items) if (item.kind === "feed") taken.add(item.video.videoId);
      return { channel, channelId, items };
    });
  }, [picks, byChannel, history, exclude, columns]);
}
