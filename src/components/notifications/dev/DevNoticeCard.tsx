import { motion } from "motion/react";
import { formatAge } from "@/components/library/youtubeFeed";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { ROW_ENTER, tone } from "./devCardStyle";

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
};

/**
 * A message from the developer: a full-width card on a solid accent-washed fill, with the message in
 * the primary tone and a squared tail corner. Polls sit on the plain tonal fill with option rows.
 */
export function DevNoticeCard({ item, onAction, onContextMenu }: Props) {
  const { primary, muted } = tone(item.read);
  const link = item.actions.includes("open-link");
  return (
    <motion.li
      layout="position"
      variants={ROW_ENTER}
      onContextMenu={(e) => onContextMenu(item, e)}
      className={`rounded-2xl rounded-bl-[5px] px-4 py-3 ${
        item.read ? "bg-white/[0.035]" : "bg-[color-mix(in_srgb,var(--accent)_14%,var(--rf-popover-raised))]"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <p className={`min-w-0 flex-1 text-[13px] font-semibold leading-snug ${primary}`}>{item.title}</p>
        <span className={`shrink-0 text-[12px] ${muted}`}>{formatAge(item.createdAt / 1000)}</span>
      </div>
      {item.subtitle || link ? (
        <p className={`mt-1 text-[12px] leading-relaxed ${item.read ? muted : "text-stone-200"}`}>
          {item.subtitle}
          {link ? (
            <>
              {item.subtitle ? " " : null}
              <button
                type="button"
                onClick={() => onAction(item, "open-link")}
                className={`font-semibold underline-offset-2 transition-colors duration-150 hover:underline focus-visible:underline focus-visible:outline-none ${primary}`}
              >
                Read more
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </motion.li>
  );
}
