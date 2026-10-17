import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScrollEdgeState } from "@/hooks/useScrollEdgeState";
import { filterNotificationItems } from "@/notifications/panelModel";
import type {
  NotificationActionId,
  NotificationCenterFilter,
  NotificationCenterTab,
  NotificationItem,
  NotificationPrefs,
} from "@/notifications/types";
import type { ChannelsUiState, WatchedChannel } from "@/watchlist/types";
import { ChannelsPanel, type ChannelHandlers } from "./channels/ChannelsPanel";
import { NotificationCenterHeader } from "./NotificationCenterHeader";
import {
  NotificationContextMenu,
  type NotificationMenuState,
} from "./NotificationContextMenu";
import { NotificationEmpty } from "./NotificationEmpty";
import { NotificationFilterBar } from "./NotificationFilterBar";
import { NotificationFeed } from "./NotificationFeed";
import {
  NotificationPrefsView,
  type PrefsHandlers,
} from "./NotificationPrefsView";
import { PanelScreenTransition } from "./PanelScreenTransition";

const SCREEN_ORDER: Record<NotificationCenterTab, number> = {
  feed: 0,
  channels: 1,
  history: 2,
  settings: 3,
};

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
  onOpenCreator: (channelId: string, channel: string) => void;
  onClose: () => void;
  /** Island density: smaller header and stacked settings rows for a narrow host. */
  compact?: boolean;
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
  onOpenCreator,
  onClose,
  compact = false,
}: NotificationCenterPanelProps) {
  const [filter, setFilter] = useState<NotificationCenterFilter>("all");
  const { total, unreadBy } = useMemo(() => {
    const total: Record<NotificationCenterFilter, number> = {
      all: 0,
      watchlist: 0,
      download: 0,
      security: 0,
      stats: 0,
      playlist: 0,
    };
    const unreadBy = { ...total };
    for (const i of items) {
      total.all++;
      total[i.source]++;
      if (!i.read) {
        unreadBy.all++;
        unreadBy[i.source]++;
      }
    }
    return { total, unreadBy };
  }, [items]);
  const unread = unreadBy.all;
  // A filter that has emptied (everything muted or cleared) falls back to All instead of a blank feed.
  const activeFilter = total[filter] > 0 ? filter : "all";
  const shown = useMemo(
    () => filterNotificationItems(items, activeFilter),
    [items, activeFilter],
  );
  const channelNames = useMemo(
    () => new Map(channels.map((c) => [c.channelId, c.title])),
    [channels],
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<NotificationMenuState | null>(null);
  const [menuReserve, setMenuReserve] = useState(0);
  const { scrollRef, edges, onScroll } = useScrollEdgeState([tab, items.length]);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Under a filter, "Mark all read" clears what the user can see, not the other sources.
  const markShownRead = useCallback(() => {
    if (activeFilter === "all") onMarkAllRead();
    else for (const i of shown) if (!i.read) onMarkRead(i);
  }, [activeFilter, shown, onMarkAllRead, onMarkRead]);

  const openMenu = useCallback(
    (item: NotificationItem, e: React.MouseEvent) => {
      e.preventDefault();
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      setMenu({ item, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [],
  );

  useEffect(() => {
    if (tab !== "feed") setMenu(null);
  }, [tab]);

  return (
    <div
      ref={rootRef}
      className="relative flex max-h-full min-h-0 flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      <NotificationCenterHeader
        tab={tab}
        unread={unread}
        channelCount={channels.length}
        onTab={onTab}
        onClose={onClose}
        compact={compact}
      />
      <div
        className="rf-scroll-edge-wrap flex min-h-0 flex-1 flex-col"
        data-scroll-top={edges.top}
        data-scroll-bottom={edges.bottom}
      >
        <div
          ref={scrollRef}
          onScroll={() => {
            onScroll();
            if (menu) closeMenu();
          }}
          className="rf-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2"
          style={
            menuReserve > 0 ? { paddingBottom: 8 + menuReserve } : undefined
          }
        >
          <PanelScreenTransition
            screenKey={tab === "feed" ? `feed:${items.length === 0}` : tab}
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
                compact={compact}
              />
            ) : tab === "channels" ? (
              <ChannelsPanel
                channels={channels}
                ui={channelsUi}
                handlers={channelHandlers}
              />
            ) : items.length === 0 ? (
              <NotificationEmpty
                hasChannels={channels.length > 0}
                onFollowChannel={() => onTab("channels")}
              />
            ) : (
              <NotificationFeed
                items={shown}
                channelNames={channelNames}
                unread={unreadBy[activeFilter]}
                compact={compact}
                onAction={onAction}
                onMarkRead={onMarkRead}
                onMarkAllRead={markShownRead}
                onContextMenu={openMenu}
                onOpenCreator={onOpenCreator}
                filterBar={
                  <NotificationFilterBar
                    value={activeFilter}
                    total={total}
                    onChange={setFilter}
                  />
                }
              />
            )}
          </PanelScreenTransition>
        </div>
      </div>
      {menu ? (
        <NotificationContextMenu
          key={menu.item.id + menu.x + menu.y}
          menu={menu}
          containerRef={rootRef}
          onReserve={setMenuReserve}
          onAction={onAction}
          onMarkRead={onMarkRead}
          onMute={prefsHandlers.onMute}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}
