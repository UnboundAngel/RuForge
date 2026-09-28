import { invoke } from "@tauri-apps/api/core";
import type { VideoStats } from "@/components/library/youtubeFeed";
import { type ExplorerChannelRef, findFollowed } from "./channelUrl";
import type { WatchedChannel, WatchlistSnapshot } from "./types";

export type VideoOwner = { channelId: string; channel: string | null };

// Module scoped so the 800 ms Explorer URL poll never refetches or loses a resolved page.
const videoOwners = new Map<string, VideoOwner | null>();
const videoOwnerLookups = new Map<string, Promise<VideoOwner | null>>();
const pageChannels = new Map<string, string>();

export function refKey(ref: ExplorerChannelRef): string {
  switch (ref.kind) {
    case "id":
      return `id:${ref.channelId}`;
    case "handle":
      return `handle:${ref.handle.toLowerCase()}`;
    case "path":
      return `path:${ref.path.toLowerCase()}`;
    case "video":
      return `video:${ref.videoId}`;
  }
}

/** `undefined` means not looked up yet; `null` means the lookup found no owner. */
export function cachedVideoOwner(videoId: string): VideoOwner | null | undefined {
  return videoOwners.get(videoId);
}

export function lookupVideoOwner(videoId: string): Promise<VideoOwner | null> {
  const hit = videoOwners.get(videoId);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = videoOwnerLookups.get(videoId);
  if (pending) return pending;
  const p = invoke<VideoStats[]>("get_video_stats", { videoIds: [videoId] })
    .then((rows) => {
      const row = rows.find((r) => r.videoId === videoId);
      const owner = row?.channelId ? { channelId: row.channelId, channel: row.channel } : null;
      videoOwners.set(videoId, owner);
      return owner;
    })
    .catch(() => null)
    .finally(() => videoOwnerLookups.delete(videoId));
  videoOwnerLookups.set(videoId, p);
  return p;
}

/** Called after a click resolves the page, so `/c/` paths and handle-less follows show Following next time. */
export function rememberPageChannel(ref: ExplorerChannelRef, channelId: string): void {
  pageChannels.set(refKey(ref), channelId);
  if (ref.kind === "video" && videoOwners.get(ref.videoId) == null) {
    videoOwners.set(ref.videoId, { channelId, channel: null });
  }
}

export function followedForRef(
  snapshot: WatchlistSnapshot | null,
  ref: ExplorerChannelRef | null,
  videoChannelId: string | null,
): WatchedChannel | null {
  if (!snapshot || !ref) return null;
  const direct = findFollowed(snapshot, ref, videoChannelId);
  if (direct) return direct;
  const cached = pageChannels.get(refKey(ref));
  return cached ? (snapshot.channels.find((c) => c.channelId === cached) ?? null) : null;
}

export function followTooltip(channelName: string | null, following: boolean): string {
  const name = channelName?.trim() || "this channel";
  return following ? `Following ${name}. Click to unfollow` : `Follow ${name} for new uploads`;
}
