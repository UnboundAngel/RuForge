import { formatAge } from "@/components/library/youtubeFeed";
import { notificationHeadline, notificationMeta } from "@/notifications/panelModel";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { NotificationLeading } from "./NotificationLeading";
import { NotificationRowActions } from "./NotificationRowActions";
import { NotificationThumb } from "./NotificationThumb";

type Props = {
  item: NotificationItem;
  channelName: string | null;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
};

function accentStatus(item: NotificationItem): string | null {
  if (item.kind === "live") return "Live now";
  if (item.kind === "premiere") return item.subtitle;
  return null;
}

export function NotificationRow({ item, channelName, onAction, onMarkRead }: Props) {
  const headline = notificationHeadline(item, channelName);
  const age = formatAge(item.createdAt / 1000);
  const status = accentStatus(item);
  const meta = status ? age : notificationMeta(item, age, headline.channel != null);

  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 focus-within:bg-white/[0.04] hover:bg-white/[0.04]">
      <span
        aria-label={item.read ? undefined : "Unread"}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.read ? "" : "bg-[color:var(--accent)]"}`}
      />
      <NotificationLeading item={item} channelName={headline.channel ?? channelName} />
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-[14px] leading-snug ${item.read ? "text-stone-400" : "text-stone-100"} ${
            headline.channel ? "" : "font-medium"
          }`}
        >
          {headline.channel ? (
            <>
              <span className="font-semibold">{headline.channel}</span> {headline.verb}:{" "}
            </>
          ) : null}
          {headline.title}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px]">
          {status ? (
            <span className="shrink-0 font-semibold text-[color:var(--accent)]">{status} ·</span>
          ) : null}
          <span className="truncate text-stone-500">{meta}</span>
        </div>
      </div>
      <NotificationThumb item={item}>
        <NotificationRowActions item={item} onAction={onAction} onMarkRead={onMarkRead} />
      </NotificationThumb>
    </li>
  );
}
