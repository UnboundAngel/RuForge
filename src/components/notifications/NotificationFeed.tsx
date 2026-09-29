import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
};

type SectionProps = Pick<Props, "channelNames" | "onAction" | "onMarkRead" | "onContextMenu"> & {
  label: string;
  items: NotificationItem[];
  trailing?: ReactNode;
  collapsed?: boolean;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function FeedSection({ label, items, trailing, collapsed = false, channelNames, ...rowProps }: SectionProps) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  const offset = reduceMotion ? 0 : -8;
  return (
    <section className="pb-3">
      <div className="flex items-center justify-between px-2 pb-2 pt-2">
        <h3 className={panelLabelClass}>{label}</h3>
        {trailing}
      </div>
      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.ul
            key="rows"
            initial={{ opacity: 0, y: offset }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: offset, transition: { duration: 0.14, ease: "easeIn" } }}
            className="flex flex-col gap-2"
          >
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                channelName={item.channelId ? (channelNames.get(item.channelId) ?? null) : null}
                {...rowProps}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

export function NotificationFeed({ items, unread, onMarkAllRead, ...rest }: Props) {
  const { fresh, earlier } = useMemo(() => splitByRead(items), [items]);
  const [showEarlier, setShowEarlier] = useState(false);
  const markAll =
    unread > 0 ? (
      <button type="button" onClick={onMarkAllRead} className={panelTextActionClass}>
        Mark all read
      </button>
    ) : null;
  const earlierToggle = (
    <button
      type="button"
      aria-expanded={showEarlier}
      onClick={() => setShowEarlier((v) => !v)}
      className={panelTextActionClass}
    >
      {showEarlier ? "Hide" : `Show ${earlier.length}`}
    </button>
  );
  return (
    <>
      <FeedSection {...rest} label="New" items={fresh} trailing={markAll} />
      <FeedSection {...rest} label="Earlier" items={earlier} trailing={earlierToggle} collapsed={!showEarlier} />
    </>
  );
}
