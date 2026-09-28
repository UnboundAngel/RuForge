import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { formatAge } from "@/components/library/youtubeFeed";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { NotificationRowActions } from "./NotificationRowActions";
import { NotificationThumb } from "./NotificationThumb";

const KIND_CHIP: Partial<Record<NotificationItem["kind"], string>> = {
  premiere: "Premiere",
  live: "Live",
};

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
};

export function NotificationRow({ item, onAction, onMarkRead }: Props) {
  const chip = KIND_CHIP[item.kind];
  const age = formatAge(item.createdAt / 1000);
  const meta = item.subtitle ? `${item.subtitle} · ${age}` : age;

  return (
    <li
      className={`flex gap-3 rounded-xl p-2 ${item.read ? "" : "bg-[color:var(--rf-popover-raised)]"}`}
    >
      <NotificationThumb item={item} />
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-[13px] font-semibold leading-snug ${item.read ? "text-stone-400" : "text-stone-100"}`}
        >
          {item.title}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {chip ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent),transparent_85%)] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent)]">
              {chip}
            </span>
          ) : null}
          <HoverMarqueeText text={meta} slow className="text-[11px] text-stone-500" />
        </div>
        <NotificationRowActions item={item} onAction={onAction} onMarkRead={onMarkRead} />
      </div>
    </li>
  );
}
