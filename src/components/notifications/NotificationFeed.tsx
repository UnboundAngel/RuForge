import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { groupByCreator, type FeedEntry } from "@/notifications/creatorGroups";
import { bucketByDay } from "@/notifications/dayBuckets";
import { splitByRead } from "@/notifications/panelModel";
import type {
  NotificationActionId,
  NotificationItem,
} from "@/notifications/types";
import { NotificationCreatorGroup } from "./NotificationCreatorGroup";
import { NotificationRecordTiles, recordKind } from "./NotificationRecordRow";
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
  onOpenCreator: (channelId: string, channel: string) => void;
  compact?: boolean;
  /** The source tabs sit in the New row instead of taking a row of their own. */
  filterBar?: ReactNode;
};

type SectionProps = Pick<
  Props,
  | "channelNames"
  | "onAction"
  | "onMarkRead"
  | "onContextMenu"
  | "onOpenCreator"
  | "compact"
> & {
  label: string;
  /** Replaces the label text, keeping the row's spacing. */
  heading?: ReactNode;
  items: NotificationItem[];
  trailing?: ReactNode;
  collapsed?: boolean;
  /** Fold a creator's several rows into one card. */
  group?: boolean;
  /** Split the rows under quiet day labels (Today, Yesterday, ...). */
  byDay?: boolean;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type SectionEntry = FeedEntry | { type: "records"; items: NotificationItem[] };

/** Every personal best in the section joins one strip, placed where the newest one was. */
function gatherRecords(entries: FeedEntry[]): SectionEntry[] {
  const records = entries.flatMap((e) =>
    e.type === "item" && recordKind(e.item) ? [e.item] : [],
  );
  if (records.length === 0) return entries;
  const out: SectionEntry[] = [];
  for (const e of entries) {
    if (e.type !== "item" || !recordKind(e.item)) out.push(e);
    else if (e.item === records[0])
      out.push({ type: "records", items: records });
  }
  return out;
}

function FeedSection({
  label,
  heading,
  items,
  trailing,
  collapsed = false,
  group = false,
  byDay = false,
  compact = false,
  channelNames,
  onOpenCreator,
  ...rowProps
}: SectionProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const blocks = useMemo(() => {
    const toEntries = (list: NotificationItem[]) =>
      gatherRecords(
        group
          ? groupByCreator(list)
          : list.map((item) => ({ type: "item" as const, item })),
      );
    if (!byDay) return [{ label: null, entries: toEntries(items) }];
    return bucketByDay(items).map((b) => ({
      label: b.label,
      entries: toEntries(b.items),
    }));
  }, [group, byDay, items]);
  if (items.length === 0) return null;
  const offset = reduceMotion ? 0 : -8;
  const toggle = (channelId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(channelId)) next.add(channelId);
      return next;
    });
  return (
    <section className={compact ? "pb-2 pt-1" : "pb-3 pt-2"}>
      <div
        className={`flex items-center justify-between px-2 ${compact ? "pb-1 pt-1.5" : "pb-2 pt-2"}`}
      >
        {heading ?? <h3 className={panelLabelClass}>{label}</h3>}
        {trailing}
      </div>
      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="rows"
            initial={{ opacity: 0, y: offset }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.22, ease: EASE_OUT },
            }}
            exit={{
              opacity: 0,
              y: offset,
              transition: { duration: 0.14, ease: "easeIn" },
            }}
            className={`flex flex-col ${compact ? "gap-2.5" : "gap-4"}`}
          >
            {blocks.map(({ label: day, entries }) => (
              <div key={day ?? "all"}>
                {day ? (
                  <p
                    className={`px-2 text-[11px] font-semibold text-stone-500 ${compact ? "pb-1" : "pb-1.5"}`}
                  >
                    {day}
                  </p>
                ) : null}
                <ul className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}>
                  {entries.map((entry) =>
                    entry.type === "records" ? (
                      <NotificationRecordTiles
                        key={`records:${entry.items[0].id}`}
                        items={entry.items}
                        compact={compact}
                        onMarkRead={rowProps.onMarkRead}
                        onContextMenu={rowProps.onContextMenu}
                      />
                    ) : entry.type === "group" ? (
                      <NotificationCreatorGroup
                        key={`group:${day}:${entry.channelId}`}
                        channelId={entry.channelId}
                        channelNames={channelNames}
                        items={entry.items}
                        expanded={open.has(`${day}:${entry.channelId}`)}
                        onToggle={() => toggle(`${day}:${entry.channelId}`)}
                        onOpenCreator={onOpenCreator}
                        onAction={rowProps.onAction}
                        onMarkRead={rowProps.onMarkRead}
                        onContextMenu={rowProps.onContextMenu}
                      />
                    ) : (
                      <NotificationRow
                        key={entry.item.id}
                        item={entry.item}
                        channelName={
                          entry.item.channelId
                            ? (channelNames.get(entry.item.channelId) ?? null)
                            : null
                        }
                        compact={compact}
                        {...rowProps}
                      />
                    ),
                  )}
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function NotificationFeed({
  items,
  unread,
  onMarkAllRead,
  compact = false,
  filterBar,
  ...rest
}: Props) {
  const { fresh, earlier } = useMemo(() => splitByRead(items), [items]);
  const [showEarlier, setShowEarlier] = useState(false);
  const markAll =
    unread > 0 ? (
      <button
        type="button"
        onClick={onMarkAllRead}
        className={panelTextActionClass}
      >
        Mark all read
      </button>
    ) : null;
  const earlierHeading = (
    <button
      type="button"
      aria-expanded={showEarlier}
      onClick={() => setShowEarlier((v) => !v)}
      className={`${panelLabelClass} -mx-1 flex flex-1 items-center gap-1.5 rounded-full px-1 text-left transition-colors duration-150 hover:text-stone-200 focus-visible:outline-none focus-visible:text-stone-200`}
    >
      <span>Earlier</span>
      <span className="text-stone-600">{earlier.length} read</span>
      <ChevronDown
        size={13}
        aria-hidden
        className={`ml-auto transition-transform duration-200 ${showEarlier ? "rotate-180" : ""}`}
      />
    </button>
  );
  return (
    <>
      {fresh.length === 0 && filterBar ? (
        <div
          className={`flex items-center px-2 ${compact ? "pb-1 pt-1.5" : "pb-2 pt-2"}`}
        >
          {filterBar}
        </div>
      ) : null}
      <FeedSection
        {...rest}
        compact={compact}
        label="New"
        heading={filterBar}
        items={fresh}
        trailing={markAll}
        group
      />
      <FeedSection
        {...rest}
        compact={compact}
        label="Earlier"
        heading={earlierHeading}
        items={earlier}
        collapsed={!showEarlier}
        group
        byDay
      />
    </>
  );
}
