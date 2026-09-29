import type { FeedVideo } from "./youtubeFeed";

export type CreatorSections = { uploads: FeedVideo[]; latest: FeedVideo[]; popular: FeedVideo[]; watched: FeedVideo[] };

/** Popular only earns a shelf when it says something the latest row doesn't. */
const MIN_POPULAR = 2;
const POPULAR_MAX = 8;
/** Shelves scroll, but past this the Videos tab is the better place to browse. */
const SHELF_MAX = 18;

/**
 * The creator page's YouTube sections, minus anything already downloaded. Popular ranks the
 * recent uploads by views: the channel tab can't be asked for YouTube's own Popular sort.
 */
export function creatorSections(recent: FeedVideo[], watched: FeedVideo[], libraryIds: ReadonlySet<string>): CreatorSections {
  const fresh = recent.filter((v) => !v.short && !libraryIds.has(v.videoId));
  const popular = fresh
    .filter((v) => v.viewCount != null)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, POPULAR_MAX);
  const seen = new Set<string>();
  return {
    uploads: fresh,
    latest: fresh.slice(0, SHELF_MAX),
    popular: popular.length >= MIN_POPULAR ? popular : [],
    watched: watched
      .filter((v) => !v.short && !libraryIds.has(v.videoId) && !seen.has(v.videoId) && seen.add(v.videoId))
      .slice(0, SHELF_MAX),
  };
}

type WithYoutube = { youtube?: { channel?: string | null; channelId?: string | null } | null };

function fromCreator(file: WithYoutube, channelId: string, name: string): boolean {
  const yt = file.youtube;
  if (!yt) return false;
  if (yt.channelId) return yt.channelId === channelId;
  return !!name && yt.channel?.trim().toLowerCase() === name;
}

/** Downloads from this creator; older files may only know the channel by name. */
export function creatorFiles<T extends WithYoutube>(files: T[], channelId: string, channel: string): T[] {
  const name = channel.trim().toLowerCase();
  return files.filter((f) => fromCreator(f, channelId, name));
}

/** Playlists that are mostly this creator's videos, so one stray clip doesn't claim a mix. */
export function creatorPlaylists<P extends { items: WithYoutube[] }>(playlists: P[], channelId: string, channel: string): P[] {
  const name = channel.trim().toLowerCase();
  return playlists.filter((p) => {
    const mine = p.items.filter((f) => fromCreator(f, channelId, name)).length;
    return mine >= 2 && mine * 2 >= p.items.length;
  });
}

export type CreatorTab = "home" | "videos" | "downloaded" | "playlists";

/** Tabs with nothing behind them stay hidden rather than open onto an empty page. */
export function creatorTabs({ downloaded, playlists }: { downloaded: number; playlists: number }): CreatorTab[] {
  const tabs: CreatorTab[] = ["home", "videos"];
  if (downloaded > 0) tabs.push("downloaded");
  if (playlists > 0) tabs.push("playlists");
  return tabs;
}

/** The dot line under the creator's name: handle, subscribers, uploads, then what's local. */
export function creatorMeta(
  profile: { handle: string | null; subscribers: string | null; videoCount: string | null } | null | undefined,
  downloaded: number,
): string[] {
  return [
    profile?.handle,
    profile?.subscribers,
    profile?.videoCount,
    downloaded > 0 ? `${downloaded} in your library` : null,
  ].filter((part): part is string => Boolean(part));
}
