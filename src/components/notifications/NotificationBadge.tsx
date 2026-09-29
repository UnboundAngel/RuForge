import { unreadBadgeLabel } from "@/notifications/panelModel";

export function NotificationBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-black tabular-nums text-black/85 ring-2 ring-[#1a1411] ${className}`}
    >
      {unreadBadgeLabel(count)}
    </span>
  );
}
