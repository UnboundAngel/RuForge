import { useCallback, useRef, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { errorText } from "@/watchlist/channelManage";
import { followChannel, unfollowChannel } from "@/watchlist/watchlistActions";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

/** Follow state for a library channel, where the UC id is already known from the download metadata. */
export function useChannelFollow(channelId: string | null | undefined, channel: string | null | undefined) {
  const following = useWatchlistStore(
    (s) => !!channelId && !!s.snapshot?.channels.some((c) => c.channelId === channelId),
  );
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const toggle = useCallback(async () => {
    const title = channel?.trim();
    if (!channelId || !title || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    const notify = useRuforgeStore.getState().notify;
    try {
      const current = useWatchlistStore.getState().snapshot?.channels.some((c) => c.channelId === channelId);
      if (current) {
        await unfollowChannel(channelId);
        notify(`Unfollowed ${title}`);
      } else {
        await followChannel({ channelId, title, handle: null });
        notify(`Following ${title}. New uploads show on Library home.`);
      }
    } catch (e) {
      notify(errorText(e, "Could not update that channel."), "warning");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [channelId, channel]);

  return { following, pending, available: !!channelId && !!channel?.trim(), toggle };
}
