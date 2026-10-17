import { motion } from "motion/react";
import { formatAge } from "@/components/library/youtubeFeed";
import { notificationBody, notificationHeadline, notificationKicker, type NotificationKicker } from "@/notifications/panelModel";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { NotificationLeading } from "./NotificationLeading";
import { NotificationMilestoneRow } from "./NotificationMilestoneRow";
import { NotificationPrimaryAction, NotificationSideActions } from "./NotificationRowActions";
import { NotificationThumb } from "./NotificationThumb";

type Props = {
  item: NotificationItem;
  channelName: string | null;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
  compact?: boolean;
  /** Inside a creator card, which already supplies the surface. */
  flat?: boolean;
};

/** Picks up the stagger of a creator card's list; outside one there is no parent variant and it stays inert. */
const ROW_ENTER = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const } },
};

const TONE: Record<NotificationKicker["tone"], string> = {
  accent: "text-[color:var(--accent)]",
  danger: "text-rose-300",
  warn: "text-amber-300",
  muted: "text-stone-300",
};

/** Uploads already name the channel and finished downloads say so in the kicker; only exceptions earn a corner badge. */
function quietBadge(item: NotificationItem): boolean {
  return item.source === "watchlist" || (item.kind === "download-finished" && !item.ref.failedAttempts);
}

export function NotificationRow({ item, channelName, onAction, onMarkRead, onContextMenu, compact = false, flat = false }: Props) {
  if (item.kind === "stats-milestone") {
    return <NotificationMilestoneRow item={item} onMarkRead={onMarkRead} onContextMenu={onContextMenu} compact={compact} />;
  }
  const channel = notificationHeadline(item, channelName).channel ?? channelName;
  const kicker = notificationKicker(item, channelName);
  const { title, detail } = notificationBody(item, kicker);
  const age = formatAge(item.createdAt / 1000);
  const read = item.read;
  return (
    <motion.li
      layout="position"
      variants={ROW_ENTER}
      onContextMenu={(e) => onContextMenu(item, e)}
      className={`group relative flex items-center rounded-2xl transition-colors duration-150 focus-within:bg-white/[0.06] hover:bg-white/[0.06] ${
        compact
          ? `gap-2.5 py-1.5 pl-1.5 pr-1.5 ${flat ? "" : "bg-white/[0.03]"}`
          : read
            ? "gap-3 py-1.5 pl-2 pr-1.5"
            : "gap-3.5 bg-white/[0.035] py-2 pl-2 pr-1.5"
      }`}
    >
      <NotificationThumb
        item={item}
        compact={read}
        dense={compact}
        badge={compact && quietBadge(item) ? null : <NotificationLeading item={item} channelName={channel} />}
      >
        <NotificationPrimaryAction item={item} onAction={onAction} />
      </NotificationThumb>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold">
          <span className={`truncate ${read ? "text-stone-500" : TONE[kicker.tone]}`}>{kicker.text}</span>
          <span className="shrink-0 font-medium text-stone-600">{age}</span>
        </p>
        <p data-tooltip={compact ? title : undefined} className={`mt-0.5 font-semibold leading-snug ${compact ? "truncate" : "line-clamp-2"} ${read ? "text-[12px] text-stone-400" : "text-[13px] text-stone-50"}`}>
          {title}
        </p>
        {detail && !read ? <p className="mt-0.5 truncate text-[11px] text-stone-500">{detail}</p> : null}
      </div>
      <NotificationSideActions item={item} onAction={onAction} onMarkRead={onMarkRead} dense={compact} />
    </motion.li>
  );
}
