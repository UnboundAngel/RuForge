import { useMemo } from "react";
import { sortChannelsByTitle } from "@/watchlist/channelSort";
import type { ChannelsUiState, WatchedChannel } from "@/watchlist/types";
import { ChannelAddField } from "./ChannelAddField";
import { ChannelRow } from "./ChannelRow";
import { CheckNowButton } from "./CheckNowButton";

export type ChannelHandlers = {
  onFollowInput: (input: string) => void;
  onAutoDownload: (channelId: string, enabled: boolean) => void;
  onUnfollow: (channelId: string) => void;
  onCheckNow: () => void;
};

type Props = {
  channels: WatchedChannel[];
  ui: ChannelsUiState;
  handlers: ChannelHandlers;
};

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500";

export function ChannelsPanel({ channels, ui, handlers }: Props) {
  const sorted = useMemo(() => sortChannelsByTitle(channels), [channels]);

  return (
    <div className="pt-1">
      <ChannelAddField ui={ui} onFollowInput={handlers.onFollowInput} />
      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-stone-500">
          Not following anyone yet. Paste a link above and new uploads show up here.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pb-1 pt-2">
            <span className={labelClass}>
              {sorted.length} {sorted.length === 1 ? "channel" : "channels"}
            </span>
            <span className={labelClass}>Auto-download</span>
          </div>
          <ul className="space-y-0.5">
            {sorted.map((ch) => (
              <ChannelRow
                key={ch.channelId}
                channel={ch}
                onAutoDownload={handlers.onAutoDownload}
                onUnfollow={handlers.onUnfollow}
              />
            ))}
          </ul>
          <div className="flex justify-end px-3 pb-1 pt-2">
            <CheckNowButton until={ui.checkNowUntil} onCheckNow={handlers.onCheckNow} />
          </div>
        </>
      )}
    </div>
  );
}
