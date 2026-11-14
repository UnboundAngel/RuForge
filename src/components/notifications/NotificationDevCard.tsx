import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { DevNoticeCard } from "./dev/DevNoticeCard";
import { DevPollCard } from "./dev/DevPollCard";

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
  compact?: boolean;
};

/** A signed dev announcement. Polls and notices have different shapes, so each gets its own card. */
export function NotificationDevCard({ item, onAction, onContextMenu }: Props) {
  return item.kind === "dev-poll" ? (
    <DevPollCard item={item} onAction={onAction} onContextMenu={onContextMenu} />
  ) : (
    <DevNoticeCard item={item} onAction={onAction} onContextMenu={onContextMenu} />
  );
}
