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
};

const TONE: Record<NotificationKicker["tone"], string> = {
  accent: "text-[color:var(--accent)]",
  danger: "text-rose-300",
  warn: "text-amber-300",
  muted: "text-stone-300",
};

export function NotificationRow({ item, channelName, onAction, onMarkRead }: Props) {
  const channel = notificationHeadline(item, channelName).channel ?? channelName;
  const kicker = notificationKicker(item, channelName);
  const { title, detail } = notificationBody(item, kicker);
  const age = formatAge(item.createdAt / 1000);

  return (
    <li
      className={`group flex items-center gap-3.5 rounded-2xl py-2 pl-2 pr-1.5 transition-colors duration-150 focus-within:bg-white/[0.06] hover:bg-white/[0.06] ${
        item.read ? "" : "bg-white/[0.035]"
      }`}
    >
      <NotificationThumb item={item} badge={<NotificationLeading item={item} channelName={channel} />}>
        <NotificationPrimaryAction item={item} onAction={onAction} />
      </NotificationThumb>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold">
          <span className={`truncate ${item.read ? "text-stone-500" : TONE[kicker.tone]}`}>{kicker.text}</span>
          <span className="shrink-0 font-medium text-stone-600">{age}</span>
        </p>
        <p
          className={`mt-1 line-clamp-2 text-[13px] font-semibold leading-snug ${
            item.read ? "text-stone-400" : "text-stone-50"
          }`}
        >
          {title}
        </p>
        {detail ? <p className="mt-0.5 truncate text-[11px] text-stone-500">{detail}</p> : null}
      </div>
      <NotificationSideActions item={item} onAction={onAction} onMarkRead={onMarkRead} />
    </li>
  );
}
