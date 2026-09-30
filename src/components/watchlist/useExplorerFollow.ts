import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { explorerChannelRef } from "@/watchlist/channelUrl";
import { errorText } from "@/watchlist/channelManage";
import {
  type VideoOwner,
  cachedVideoOwner,
  followedForRef,
  lookupVideoOwner,
  rememberPageChannel,
} from "@/watchlist/explorerFollow";
import { followChannel, resolveChannel, unfollowChannel } from "@/watchlist/watchlistActions";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

export type FollowHint = { kind: "follow" | "unfollow" | "error"; text: string };

function useVideoOwner(videoId: string | null): VideoOwner | null | undefined {
  const [owner, setOwner] = useState<VideoOwner | null | undefined>(() =>
    videoId ? cachedVideoOwner(videoId) : undefined,
  );
  useEffect(() => {
    if (!videoId) {
      setOwner(undefined);
      return;
    }
    const hit = cachedVideoOwner(videoId);
    setOwner(hit);
    if (hit !== undefined) return;
    let alive = true;
    void lookupVideoOwner(videoId).then((o) => {
      if (alive) setOwner(o);
    });
    return () => {
      alive = false;
    };
  }, [videoId]);
  return owner;
}

export function useExplorerFollow(onHint: (hint: FollowHint) => void) {
  const lastExplorerUrl = useRuforgeStore((s) => s.lastExplorerUrl);
  const snapshot = useWatchlistStore((s) => s.snapshot);
  const ref = useMemo(() => explorerChannelRef(lastExplorerUrl), [lastExplorerUrl]);
  const owner = useVideoOwner(ref?.kind === "video" ? ref.videoId : null);
  const followed = followedForRef(snapshot, ref, owner?.channelId ?? null);
  const channelName = followed?.title ?? owner?.channel ?? (ref?.kind === "handle" ? ref.handle : null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const toggle = useCallback(async () => {
    if (pendingRef.current) return;
    let pageUrl = lastExplorerUrl;
    try {
      pageUrl = await invoke<string>("get_embedded_explorer_webview_url");
      useRuforgeStore.getState().setLastExplorerUrl(pageUrl);
    } catch {
      pageUrl = lastExplorerUrl;
    }
    const liveRef = explorerChannelRef(pageUrl);
    if (!liveRef) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const liveOwner = liveRef.kind === "video" ? await lookupVideoOwner(liveRef.videoId) : null;
      const current = followedForRef(
        useWatchlistStore.getState().snapshot,
        liveRef,
        liveOwner?.channelId ?? null,
      );
      if (current) {
        await unfollowChannel(current.channelId);
        onHint({ kind: "unfollow", text: "Unfollowed" });
        return;
      }
      const ch = await resolveChannel(pageUrl);
      rememberPageChannel(liveRef, ch.channelId);
      await followChannel(ch);
      onHint({ kind: "follow", text: "Following" });
    } catch (e) {
      onHint({ kind: "error", text: errorText(e, "Could not find that channel.") });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [lastExplorerUrl, onHint]);

  return { visible: ref != null, following: followed != null, channelName, pending, toggle };
}
