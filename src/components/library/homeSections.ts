import type { ChannelShelf } from "./channelShelf";
import type { FeedVideo, MixedGridItem } from "./youtubeFeed";

export type HomeSection<T> =
  | { kind: "grid"; key: string; items: MixedGridItem<T>[]; title?: string }
  | { kind: "continue"; key: string; files: T[] }
  | { kind: "shorts"; key: string; videos: FeedVideo[] }
  | { kind: "watchlist"; key: string; videos: FeedVideo[] }
  | { kind: "playlists"; key: string }
  | { kind: "channel"; key: string; channel: string; channelId: string | null; items: MixedGridItem<T>[] };

export type ChannelSpotlight<T> = { channel: string; channelId: string | null; files: T[] };

type Plan =
  | { kind: "rows"; rows: number }
  | { kind: "continue" }
  | { kind: "shorts" }
  | { kind: "watchlist" }
  | { kind: "playlists" }
  | { kind: "channel" };

/**
 * YouTube's home rhythm: a video row first, then a differently shaped shelf every row or two so
 * the page never reads as one flat list. Everything after the plan is a plain grid.
 */
const PLAN: Plan[] = [
  { kind: "rows", rows: 1 },
  { kind: "watchlist" },
  { kind: "continue" },
  { kind: "rows", rows: 1 },
  { kind: "shorts" },
  { kind: "rows", rows: 2 },
  { kind: "channel" },
  { kind: "playlists" },
  { kind: "rows", rows: 1 },
  { kind: "shorts" },
  { kind: "channel" },
];

/** Shorts are a third the width of a video card, so a shelf fits a few more of them. */
export function shortsPerShelf(columns: number): number {
  return Math.min(8, columns + 2);
}

/** The channel the user keeps downloading from, if they have at least `min` of its videos. */
export function pickChannelSpotlight<T>(
  files: T[],
  channelOf: (file: T) => { channel?: string | null; channelId?: string | null } | null | undefined,
  limit: number,
  min = 3,
): ChannelSpotlight<T> | null {
  const groups = new Map<string, ChannelSpotlight<T>>();
  for (const file of files) {
    const info = channelOf(file);
    const name = info?.channel?.trim();
    if (!name) continue;
    const key = info?.channelId || name.toLowerCase();
    const group = groups.get(key) ?? { channel: name, channelId: info?.channelId ?? null, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }
  let best: ChannelSpotlight<T> | null = null;
  for (const group of groups.values()) {
    if (group.files.length >= min && (!best || group.files.length > best.files.length)) best = group;
  }
  return best ? { ...best, files: best.files.slice(0, limit) } : null;
}

export function composeHomeSections<T>({
  mixed,
  columns,
  continueFiles,
  shorts,
  watchlist,
  hasPlaylists,
  channels,
}: {
  /** Library and feed videos already interleaved, minus anything a shelf below shows. */
  mixed: MixedGridItem<T>[];
  columns: number;
  continueFiles: T[];
  shorts: FeedVideo[];
  /** Unseen uploads from followed channels, already capped to one row and stripped of premieres. */
  watchlist: FeedVideo[];
  hasPlaylists: boolean;
  /** "More from" shelves in order; each channel step takes the next non-empty one. */
  channels: ChannelShelf<T>[];
}): HomeSection<T>[] {
  const sections: HomeSection<T>[] = [];
  const perShelf = shortsPerShelf(columns);
  const shelves = channels.filter((c) => c.items.length > 0);
  let cursor = 0;
  let shortsCursor = 0;
  let channelCursor = 0;

  PLAN.forEach((step, i) => {
    const key = `${step.kind}-${i}`;
    if (step.kind === "rows") {
      const items = mixed.slice(cursor, cursor + step.rows * columns);
      cursor += items.length;
      if (items.length > 0) sections.push({ kind: "grid", key, items });
    } else if (step.kind === "continue") {
      if (continueFiles.length > 0) sections.push({ kind: "continue", key, files: continueFiles });
    } else if (step.kind === "shorts") {
      const videos = shorts.slice(shortsCursor, shortsCursor + perShelf);
      shortsCursor += videos.length;
      if (videos.length >= 3) sections.push({ kind: "shorts", key, videos });
    } else if (step.kind === "watchlist") {
      if (watchlist.length > 0) sections.push({ kind: "watchlist", key, videos: watchlist });
    } else if (step.kind === "playlists") {
      if (hasPlaylists) sections.push({ kind: "playlists", key });
    } else if (channelCursor < shelves.length) {
      sections.push({ kind: "channel", key, ...shelves[channelCursor++] });
    }
  });

  const rest = mixed.slice(cursor);
  if (rest.length > 0) sections.push({ kind: "grid", key: "rest", items: rest, title: "Keep exploring" });
  return sections;
}
