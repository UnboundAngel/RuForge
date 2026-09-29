import { useState, type ReactNode } from "react";
import type { NotificationItem } from "@/notifications/types";
import { NotificationKindIcon } from "./NotificationLeading";

/**
 * 16:9 frame that leads the row, with a status badge on its corner. The primary action
 * covers it on hover or keyboard focus.
 */
export function NotificationThumb({
  item,
  badge,
  children,
  compact = false,
}: {
  item: NotificationItem;
  badge: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item.thumbnail && item.thumbnail !== failedSrc ? item.thumbnail : null;

  return (
    <div className={`relative shrink-0 ${compact ? "h-[45px] w-[80px]" : "h-[63px] w-[112px]"}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-[color:var(--rf-popover-raised)]">
        {src ? (
          <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailedSrc(src)}
            className={`h-full w-full object-cover transition-opacity duration-150 ${item.read ? "opacity-60" : ""}`}
          />
        ) : (
          <NotificationKindIcon item={item} />
        )}
      </div>
      {children}
      <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 flex rounded-full">{badge}</span>
    </div>
  );
}
