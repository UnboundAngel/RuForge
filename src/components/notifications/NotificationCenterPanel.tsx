import { useMemo, useRef } from "react";
import { filterNotificationItems } from "@/notifications/panelModel";
import type {
  NotificationActionId,
  NotificationCenterTab,
  NotificationItem,
  NotificationPrefs,
} from "@/notifications/types";
import type { ChannelsUiState, WatchedChannel } from "@/watchlist/types";
import { ChannelsPanel, type ChannelHandlers } from "./channels/ChannelsPanel";
import { NotificationCenterHeader } from "./NotificationCenterHeader";
import { NotificationEmpty } from "./NotificationEmpty";
import { NotificationFeed } from "./NotificationFeed";
import { NotificationPrefsView, type PrefsHandlers } from "./NotificationPrefsView";
import { PanelScreenTransition } from "./PanelScreenTransition";

const SCREEN_ORDER: Record<NotificationCenterTab, number> = { feed: 0, channels: 1, history: 2, settings: 3 };

export type NotificationCenterPanelProps = {
  items: NotificationItem[];
  channels: WatchedChannel[];
  channelsUi: ChannelsUiState;
  channelHandlers: ChannelHandlers;
  prefs: NotificationPrefs;
  prefsHandlers: PrefsHandlers;
  tab: NotificationCenterTab;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onTab: (tab: NotificationCenterTab) => void;
  onOpenSettings: () => void;
  onClose: () => void;
};

/** Props only, so the in-page popover and the overlay webview render the same panel. */
export function NotificationCenterPanel({
  items,
  channels,
  channelsUi,
  channelHandlers,
  prefs,
  prefsHandlers,
  tab,
  onAction,
  onMarkRead,
  onMarkAllRead,
  onTab,
  onOpenSettings,
  onClose,
}: NotificationCenterPanelProps) {
  const shown = useMemo(() => filterNotificationItems(items, "all"), [items]);
  const unread = useMemo(() => shown.reduce((n, i) => (i.read ? n : n + 1), 0), [shown]);
  const channelNames = useMemo(() => new Map(channels.map((c) => [c.channelId, c.title])), [channels]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex max-h-full min-h-0 flex-col">
      <NotificationCenterHeader
        tab={tab}
        unread={unread}
        channelCount={channels.length}
        onTab={onTab}
        onClose={onClose}
      />
      <div ref={scrollRef} className="rf-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        <PanelScreenTransition
          screenKey={tab === "feed" ? `feed:${shown.length === 0}` : tab}
          order={SCREEN_ORDER[tab]}
          onSwap={() => scrollRef.current?.scrollTo({ top: 0 })}
        >
          {tab === "settings" ? (
            <NotificationPrefsView
              prefs={prefs}
              handlers={prefsHandlers}
              channels={channels}
              onManageChannels={() => onTab("channels")}
              onAllSettings={onOpenSettings}
            />
          ) : tab === "channels" ? (
            <ChannelsPanel channels={channels} ui={channelsUi} handlers={channelHandlers} />
          ) : shown.length === 0 ? (
            <NotificationEmpty hasChannels={channels.length > 0} onFollowChannel={() => onTab("channels")} />
          ) : (
            <NotificationFeed
              items={shown}
              channelNames={channelNames}
              unread={unread}
              onAction={onAction}
              onMarkRead={onMarkRead}
              onMarkAllRead={onMarkAllRead}
            />
          )}
        </PanelScreenTransition>
      </div>
    </div>
  );
}
