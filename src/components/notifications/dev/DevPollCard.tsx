import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { formatAge } from "@/components/library/youtubeFeed";
import { isPollPick, type NotificationActionId, type NotificationItem } from "@/notifications/types";
import { PollOptionRow } from "./PollOptionRow";
import { ROW_ENTER, tone } from "./devCardStyle";

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
};

/** Only the question and the options. Percentages appear only after a vote or at close. */
export function DevPollCard({ item, onAction, onContextMenu }: Props) {
  const { primary, muted } = tone(item.read);
  const options = item.ref.devOptions ?? [];
  const vote = item.ref.devVote;
  const counts = vote?.counts ?? null;
  // Only this poll's options count, so stray ids in a tally cannot shrink every share.
  const total = counts ? options.reduce((sum, o) => sum + (counts[o.id] ?? 0), 0) : 0;
  const closed = item.ref.endsAt != null && item.ref.endsAt <= Date.now();
  return (
    <motion.li
      layout="position"
      variants={ROW_ENTER}
      onContextMenu={(e) => onContextMenu(item, e)}
      className={`rounded-2xl px-3 py-2.5 ${item.read ? "" : "bg-white/[0.035]"}`}
    >
      <div className="flex items-baseline gap-2">
        <p className={`min-w-0 flex-1 text-[13px] font-semibold leading-snug ${primary}`}>{item.title}</p>
        {closed ? (
          <span className="flex shrink-0 items-center gap-1 self-start pt-0.5 text-[12px] font-semibold leading-none text-amber-300">
            <Lock size={11} strokeWidth={2.5} aria-hidden />
            Closed
          </span>
        ) : (
          <span className={`shrink-0 text-[12px] ${muted}`}>{formatAge(item.createdAt / 1000)}</span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {options.map((o, i) => {
          const action = item.actions.find((a) => isPollPick(a) && a === `poll-pick-${o.id}`);
          return (
            <PollOptionRow
              key={o.id}
              letter={String.fromCharCode(65 + i)}
              label={o.label}
              index={i}
              percent={counts ? (total > 0 ? Math.round(((counts[o.id] ?? 0) / total) * 100) : 0) : null}
              picked={vote?.pick === o.id}
              onPick={action ? () => onAction(item, action) : null}
              busy={vote?.busy ?? false}
              read={item.read}
              primary={primary}
              muted={muted}
            />
          );
        })}
      </div>
      {vote?.error ? <p className="mt-1.5 truncate text-[12px] text-rose-300">{vote.error}</p> : null}
    </motion.li>
  );
}
