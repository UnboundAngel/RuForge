import type { WatchedChannel } from "./types";

export function sortChannelsByTitle(channels: WatchedChannel[]): WatchedChannel[] {
  return [...channels].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
