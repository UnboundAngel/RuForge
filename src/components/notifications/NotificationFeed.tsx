import { useMemo, type ReactNode } from "react";
import { splitByRead } from "@/notifications/panelModel";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { NotificationRow } from "./NotificationRow";
import { panelLabelClass, panelTextActionClass } from "./panelStyles";

type Props = {
  items: NotificationItem[];
  channelNames: ReadonlyMap<string, string>;
  unread: number;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
};

type SectionProps = Pick<Props, "channelNames" | "onAction" | "onMarkRead"> & {
  label: string;
  items: NotificationItem[];
  trailing?: ReactNode;
};

function FeedSection({ label, items, trailing, channelNames, onAction, onMarkRead }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="pb-3">
      <div className="flex items-center justify-between px-2 pb-1.5 pt-2">
        <h3 className={panelLabelClass}>{label}</h3>
        {trailing}
      </div>
      <ul>
        {items.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            channelName={item.channelId ? (channelNames.get(item.channelId) ?? null) : null}
            onAction={onAction}
            onMarkRead={onMarkRead}
          />
        ))}
      </ul>
    </section>
  );
}

export function NotificationFeed({ items, unread, onMarkAllRead, ...rest }: Props) {
  const { fresh, earlier } = useMemo(() => splitByRead(items), [items]);
  const markAll =
    unread > 0 ? (
      <button type="button" onClick={onMarkAllRead} className={panelTextActionClass}>
        Mark all read
      </button>
    ) : null;
  return (
    <>
      <FeedSection {...rest} label="New" items={fresh} trailing={markAll} />
      <FeedSection {...rest} label="Earlier" items={earlier} />
    </>
  );
}
