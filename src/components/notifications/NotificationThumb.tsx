import { useState, type ReactNode } from "react";
import type { NotificationItem } from "@/notifications/types";
import { NotificationKindIcon } from "./NotificationLeading";

/**
 * 16:9 frame that leads the row, with a status badge on its corner. Row actions sit on it
 * behind a scrim on hover or keyboard focus.
 */
export function NotificationThumb({
  item,
  badge,
  children,
}: {
  item: NotificationItem;
  badge: ReactNode;
  children: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item.thumbnail && item.thumbnail !== failedSrc ? item.thumbnail : null;

  return (
    <div className="relative h-[63px] w-[112px] shrink-0">
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
      <div className="absolute inset-0 flex items-center justify-center gap-0.5 rounded-[10px] bg-black/55 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        {children}
      </div>
      <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 flex rounded-full">{badge}</span>
    </div>
  );
}
