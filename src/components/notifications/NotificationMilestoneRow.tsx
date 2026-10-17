import { motion, useReducedMotion } from "motion/react";
import { Check, Trophy } from "lucide-react";
import { formatAge } from "@/components/library/youtubeFeed";
import type { NotificationItem } from "@/notifications/types";
import { NotificationRecordRow, recordKind } from "./NotificationRecordRow";

type Props = {
  item: NotificationItem;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
  compact?: boolean;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const DAY_MS = 86_400_000;
const WEEK = 7;

const ROW_ENTER = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
};

/** "7-day streak" is a streak of 7; the generator words every streak this way. */
function streakDays(title: string): number | null {
  const m = /^(\d+)[\s-]*day streak/i.exec(title.trim());
  return m ? Number(m[1]) : null;
}

/** The seven days ending on the day it was reached, lit for each day inside the streak. */
function weekDays(reachedAt: number, streak: number): { letter: string; lit: boolean }[] {
  return Array.from({ length: WEEK }, (_, i) => {
    const day = new Date(reachedAt - (WEEK - 1 - i) * DAY_MS);
    return { letter: day.toLocaleDateString("en", { weekday: "narrow" }), lit: i >= WEEK - streak };
  });
}

const FLAME_PATH =
  "M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69zM10.2 17.38c1.44-.35 2.18-1.39 2.38-2.31.33-1.43-.96-2.83-.09-5.09.33 1.87 3.27 3.04 3.27 5.08.08 1.53-2.66 3.7-5.56 2.32z";

/** The flame alone: the count lives in the headline so it is not said twice. Unread flames flicker slowly; the entrance is a spring pop. */
function StreakFlame({ read, reduceMotion }: { read: boolean; reduceMotion: boolean | null }) {
  return (
    <motion.div
      initial={reduceMotion ? false : { scale: 0.4, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 15, delay: 0.1 }}
      className="flex shrink-0 items-center"
    >
      <motion.svg
        viewBox="0 0 24 24"
        aria-hidden
        className={`h-11 w-11 origin-bottom ${read ? "fill-stone-600" : "fill-[color:var(--accent)]"}`}
        animate={reduceMotion || read ? undefined : { scaleY: [1, 1.06, 0.97, 1], rotate: [0, -2, 2, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      >
        <path d={FLAME_PATH} />
      </motion.svg>
    </motion.div>
  );
}

const checkClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-500 opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-white/[0.07] hover:text-stone-100 focus-visible:bg-white/[0.07] focus-visible:text-stone-100 focus-visible:opacity-100 focus-visible:outline-none group-focus-within:opacity-100 group-hover:opacity-100";

/** A stats achievement. Streaks show the flame, the count and the week; other milestones get a trophy and two lines. */
export function NotificationMilestoneRow({ item, onMarkRead, onContextMenu, compact = false }: Props) {
  const reduceMotion = useReducedMotion();
  const streak = streakDays(item.title);
  const record = streak == null ? recordKind(item) : null;
  if (record) {
    return <NotificationRecordRow item={item} kind={record} onMarkRead={onMarkRead} onContextMenu={onContextMenu} compact={compact} />;
  }
  const read = item.read;
  const age = formatAge(item.createdAt / 1000);
  return (
    <motion.li
      layout="position"
      variants={ROW_ENTER}
      data-tooltip={item.subtitle ?? undefined}
      onContextMenu={(e) => onContextMenu(item, e)}
      className={`group relative flex items-center gap-3 rounded-2xl py-2 pl-3 pr-1.5 transition-colors duration-150 focus-within:bg-white/[0.06] hover:bg-white/[0.06] ${
        compact || !read ? "bg-white/[0.03]" : ""
      }`}
    >
      {streak != null ? (
        <>
          <StreakFlame read={read} reduceMotion={reduceMotion} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5">
              <span className={`text-[14px] font-bold ${read ? "text-stone-500" : "text-stone-50"}`}>
                <span className={`font-display mr-1 text-[22px] font-extrabold leading-none tabular-nums ${read ? "" : "text-[color:var(--accent)]"}`}>
                  {streak}
                </span>
                day streak
              </span>
              <span className="text-[11px] font-medium text-stone-600">{age}</span>
            </p>
            <div className="mt-1.5 flex gap-1.5" aria-hidden>
              {weekDays(item.createdAt, streak).map((d, i, all) => (
                <motion.span
                  key={i}
                  initial={reduceMotion ? false : { scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.25 + i * 0.05 }}
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold ${
                    d.lit
                      ? `${read ? "bg-stone-600" : i === all.length - 1 ? "bg-stone-50" : "bg-[color:var(--accent)]"} text-stone-900`
                      : "bg-white/[0.05] text-stone-600"
                  }`}
                >
                  {d.lit ? <Check size={11} strokeWidth={3.5} /> : d.letter}
                </motion.span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--rf-popover-raised)]">
            <Trophy size={20} strokeWidth={2} aria-hidden className={read ? "text-stone-600" : "text-[color:var(--accent)]"} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[13px] font-semibold ${read ? "text-stone-400" : "text-stone-50"}`}>{item.title}</p>
            <p className="truncate text-[11px] text-stone-500">{[item.subtitle, age].filter(Boolean).join(" · ")}</p>
          </div>
        </>
      )}
      {!read ? (
        <button type="button" aria-label="Mark read" data-tooltip="Mark read" onClick={() => onMarkRead(item)} className={checkClass}>
          <Check size={15} strokeWidth={2.5} />
        </button>
      ) : null}
    </motion.li>
  );
}
