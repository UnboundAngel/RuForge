import { motion } from "motion/react";
import { formatAge } from "@/components/library/youtubeFeed";
import type { NotificationItem } from "@/notifications/types";

export type RecordKind = "fastest" | "binge";

type Props = {
  item: NotificationItem;
  kind: RecordKind;
  onMarkRead: (item: NotificationItem) => void;
  onContextMenu: (item: NotificationItem, e: React.MouseEvent) => void;
  compact?: boolean;
};

const ROW_ENTER = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const } },
};

export function recordKind(item: NotificationItem): RecordKind | null {
  if (item.id.includes("best:fastest")) return "fastest";
  if (item.id.includes("best:binge")) return "binge";
  return null;
}

function usable(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function formatSpan(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

/** A rate splits into "48.2" and "MB/s"; a span stays whole. */
function tileParts(kind: RecordKind, v: number): { num: string; unit: string } {
  if (kind === "binge") return { num: formatSpan(v), unit: "Binge" };
  const mb = v / 1e6;
  if (mb >= 1) return { num: mb >= 100 ? mb.toFixed(0) : mb.toFixed(1), unit: "MB/s" };
  return { num: String(Math.max(1, Math.round(v / 1e3))), unit: "KB/s" };
}

/** What the record was about; older persisted items carry no titles, so the line falls back to the plain claim. */
function recordDetail(item: NotificationItem, kind: RecordKind): string {
  const titles = (item.record?.titles ?? []).filter((t) => t.trim());
  if (titles.length === 0) return "New personal best";
  if (kind === "fastest" || titles.length === 1) return titles[0];
  return `${titles[0]} +${titles.length - 1} more`;
}

const LABEL: Record<RecordKind, string> = { fastest: "Fastest download", binge: "Longest binge" };

/** How far the old best was beaten; nothing when there is no old best to compare. */
function gainText(value: number | undefined, previous: number | undefined): string | null {
  if (!usable(value) || !usable(previous) || previous >= value) return null;
  const gain = Math.round((value / previous - 1) * 100);
  return gain > 0 ? `+${gain}%` : null;
}

type TileProps = Omit<Props, "kind" | "item"> & { item: NotificationItem; kind: RecordKind };

/** One stat: label, the number as the hero, then what it was. The whole tile marks it read. */
function RecordTile({ item, kind, onMarkRead, onContextMenu, compact = false }: TileProps) {
  const read = item.read;
  const value = item.record?.value;
  const parts = usable(value) ? tileParts(kind, value) : null;
  const gain = gainText(value, item.record?.previous);
  const titles = (item.record?.titles ?? []).filter((t) => t.trim());
  const detail = titles.length > 0 ? recordDetail(item, kind) : formatAge(item.createdAt / 1000);
  return (
    <button
      type="button"
      onClick={() => {
        if (!read) onMarkRead(item);
      }}
      onContextMenu={(e) => onContextMenu(item, e)}
      aria-label={`${LABEL[kind]}${parts ? ` ${parts.num} ${kind === "fastest" ? parts.unit : ""}` : ""}`}
      data-tooltip={read ? undefined : "Mark read"}
      className={`flex min-w-0 flex-1 flex-col items-start rounded-2xl text-left transition-colors duration-150 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none ${
        compact ? "px-3 py-2.5" : "px-3.5 py-3"
      } ${read ? "bg-white/[0.02]" : "bg-white/[0.045]"}`}
    >
      <span className={`text-[9.5px] font-bold uppercase leading-none tracking-[0.12em] ${read ? "text-stone-600" : "text-stone-400"}`}>
        {LABEL[kind]}
      </span>
      <span className="mt-2 flex items-baseline gap-1">
        <span
          className={`font-display font-extrabold leading-none tabular-nums ${compact ? "text-[24px]" : "text-[28px]"} ${
            read ? "text-stone-300" : "text-[color:var(--accent)]"
          }`}
        >
          {parts ? parts.num : "New"}
        </span>
        {parts && kind === "fastest" ? (
          <span className={`text-[12px] font-bold ${read ? "text-stone-500" : "text-stone-200"}`}>{parts.unit}</span>
        ) : null}
        {gain ? <span className="ml-1 text-[11px] font-bold text-stone-400">{gain}</span> : null}
      </span>
      <span data-tooltip={detail} className="mt-1.5 w-full truncate text-[11px] font-medium text-stone-500">
        {detail}
      </span>
    </button>
  );
}

/** Personal bests sit side by side as a stat strip, so they never read like another feed row. */
export function NotificationRecordTiles({
  items,
  onMarkRead,
  onContextMenu,
  compact = false,
}: Omit<Props, "item" | "kind"> & { items: NotificationItem[] }) {
  return (
    <motion.li layout="position" variants={ROW_ENTER} className={`flex ${compact ? "gap-1" : "gap-2"}`}>
      {items.map((item) => {
        const kind = recordKind(item);
        return kind ? (
          <RecordTile key={item.id} item={item} kind={kind} onMarkRead={onMarkRead} onContextMenu={onContextMenu} compact={compact} />
        ) : null;
      })}
    </motion.li>
  );
}

export function NotificationRecordRow({ item, onMarkRead, onContextMenu, compact = false }: Props) {
  return <NotificationRecordTiles items={[item]} onMarkRead={onMarkRead} onContextMenu={onContextMenu} compact={compact} />;
}
