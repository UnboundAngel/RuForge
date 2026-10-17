import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { formatAge } from "@/components/library/youtubeFeed";
import { ChannelAvatar } from "@/components/library/VideoByline";
import { notificationHeadline } from "@/notifications/panelModel";
import type {
  NotificationActionId,
  NotificationItem,
} from "@/notifications/types";
import { NotificationRow } from "./NotificationRow";

type Props = {
  channelId: string;
  channelNames: ReadonlyMap<string, string>;
  items: NotificationItem[];
  expanded: boolean;
  onToggle: () => void;
  onOpenCreator: (channelId: string, channel: string) => void;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Height and opacity share one curve, so the cards below track the card's edge frame by frame. */
const RESTING = { duration: 0.26, ease: EASE_OUT } as const;
const INSTANT = { duration: 0 } as const;

const iconButtonClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors duration-150 hover:bg-white/[0.07] hover:text-stone-100 focus-visible:bg-white/[0.07] focus-visible:text-stone-100 focus-visible:outline-none";

/** Several unread uploads from one creator, folded into a card. The face opens their page; the card opens the list. */
export function NotificationCreatorGroup({
  channelId,
  channelNames,
  items,
  expanded,
  onToggle,
  onOpenCreator,
  onAction,
  onMarkRead,
  onContextMenu,
}: Props) {
  const reduceMotion = useReducedMotion();
  const known = channelNames.get(channelId) ?? null;
  const channel =
    notificationHeadline(items[0], known).channel ??
    known ??
    "A creator you follow";
  const newest = Math.max(...items.map((i) => i.createdAt));
  const unread = items.filter((i) => !i.read).length;
  return (
    <motion.li
      layout="position"
      className={`overflow-hidden rounded-2xl bg-white/[0.05] transition-colors duration-150 ${expanded ? "" : "hover:bg-white/[0.025]"}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            onToggle();
          }
        }}
        className="group flex cursor-pointer items-center gap-2.5 py-2 pl-2 pr-1.5 focus-visible:outline-none"
      >
        <button
          type="button"
          aria-label={`Open ${channel} in RuForge`}
          data-tooltip={`Open ${channel}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCreator(channelId, channel);
          }}
          className="shrink-0 rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          <ChannelAvatar
            channelId={channelId}
            channel={channel}
            className="h-10 w-10"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-stone-50">
            {channel}
          </p>
          <p className="flex items-baseline gap-1.5 text-[11px] font-semibold">
            {unread > 0 ? (
              <span className="text-[color:var(--accent)]">
                {unread} new uploads
              </span>
            ) : (
              <span className="text-stone-400">{items.length} uploads</span>
            )}
            <span className="shrink-0 font-medium text-stone-600">
              {formatAge(newest / 1000)}
            </span>
          </p>
        </div>
        {unread > 0 ? (
          <button
            type="button"
            aria-label="Mark all read"
            data-tooltip="Mark all read"
            onClick={(e) => {
              e.stopPropagation();
              for (const i of items) onMarkRead(i);
            }}
            className={`${iconButtonClass} opacity-0 group-focus-within:opacity-100 group-hover:opacity-100`}
          >
            <Check size={15} strokeWidth={2.5} />
          </button>
        ) : null}
        <ChevronDown
          size={16}
          aria-hidden
          className={`mr-1 shrink-0 text-stone-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="rows"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              hidden: {
                height: 0,
                opacity: 0,
                transition: reduceMotion ? INSTANT : RESTING,
              },
              show: {
                height: "auto",
                opacity: 1,
                transition: reduceMotion
                  ? INSTANT
                  : { ...RESTING, staggerChildren: 0.04, delayChildren: 0.05 },
              },
            }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-0.5 pb-1.5 pl-3 pr-1">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  channelName={channel}
                  compact
                  flat
                  onAction={onAction}
                  onMarkRead={onMarkRead}
                  onContextMenu={onContextMenu}
                />
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
