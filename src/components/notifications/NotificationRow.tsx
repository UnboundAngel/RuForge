import { formatAge } from "@/components/library/youtubeFeed";
import { notificationBody, notificationHeadline, notificationKicker, type NotificationKicker } from "@/notifications/panelModel";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { NotificationLeading } from "./NotificationLeading";
import { NotificationPrimaryAction, NotificationSideActions } from "./NotificationRowActions";
import { NotificationThumb } from "./NotificationThumb";

type Props = {
  item: NotificationItem;
  channelName: string | null;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
};

const TONE: Record<NotificationKicker["tone"], string> = {
  accent: "text-[color:var(--accent)]",
  danger: "text-rose-300",
  warn: "text-amber-300",
  muted: "text-stone-300",
};

export function NotificationRow({ item, channelName, onAction, onMarkRead, onContextMenu }: Props) {
  const channel = notificationHeadline(item, channelName).channel ?? channelName;
  const kicker = notificationKicker(item, channelName);
  const { title, detail } = notificationBody(item, kicker);
  const age = formatAge(item.createdAt / 1000);
  const read = item.read;

  return (
    <li
      onContextMenu={(e) => onContextMenu(item, e)}
      className={`group flex items-center rounded-2xl pl-2 pr-1.5 transition-colors duration-150 focus-within:bg-white/[0.06] hover:bg-white/[0.06] ${
        read ? "gap-3 py-1.5" : "gap-3.5 bg-white/[0.035] py-2"
      }`}
    >
      <NotificationThumb item={item} compact={read} badge={<NotificationLeading item={item} channelName={channel} />}>
        <NotificationPrimaryAction item={item} onAction={onAction} />
      </NotificationThumb>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold">
          <span className={`truncate ${read ? "text-stone-500" : TONE[kicker.tone]}`}>{kicker.text}</span>
          <span className="shrink-0 font-medium text-stone-600">{age}</span>
        </p>
        <p
          className={`mt-0.5 line-clamp-2 font-semibold leading-snug ${
            read ? "text-[12px] text-stone-400" : "text-[13px] text-stone-50"
          }`}
        >
          {title}
        </p>
        {detail && !read ? <p className="mt-0.5 truncate text-[11px] text-stone-500">{detail}</p> : null}
      </div>
      <NotificationSideActions item={item} onAction={onAction} onMarkRead={onMarkRead} />
    </li>
  );
}
