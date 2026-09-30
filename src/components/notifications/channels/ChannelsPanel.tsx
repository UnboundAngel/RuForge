import { useMemo } from "react";
import { sortChannelsByTitle } from "@/watchlist/channelSort";
import type { ChannelsUiState, WatchedChannel } from "@/watchlist/types";
import { PanelEmptyState } from "../PanelEmptyState";
import { controlLabelClass, panelLabelClass } from "../panelStyles";
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

export function ChannelsPanel({ channels, ui, handlers }: Props) {
  const sorted = useMemo(() => sortChannelsByTitle(channels), [channels]);

  return (
    <div className="pb-2">
      <ChannelAddField ui={ui} onFollowInput={handlers.onFollowInput} />
      {sorted.length === 0 ? (
        <PanelEmptyState
          icon="tabler:user-plus"
          title="Not following anyone yet"
          body="Paste a channel or video link above. New uploads from that channel show up under Notifications."
        />
      ) : (
        <section className="pt-5">
          <div className="flex items-center gap-4 px-2 pb-1.5">
            <h3 className={panelLabelClass}>Following</h3>
            <CheckNowButton until={ui.checkNowUntil} onCheckNow={handlers.onCheckNow} />
            <span className={`ml-auto text-stone-500 ${controlLabelClass}`}>Auto-download</span>
          </div>
          <ul>
            {sorted.map((ch) => (
              <ChannelRow
                key={ch.channelId}
                channel={ch}
                onAutoDownload={handlers.onAutoDownload}
                onUnfollow={handlers.onUnfollow}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
