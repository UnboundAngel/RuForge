import { useState, type ReactNode } from "react";
import type { NotificationItem } from "@/notifications/types";

/**
 * 16:9 frame on the right of the row. Row actions sit on it behind a scrim on hover or focus;
 * rows without art show the actions at rest so they are never hidden behind an empty slot.
 */
export function NotificationThumb({ item, children }: { item: NotificationItem; children: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item.thumbnail && item.thumbnail !== failedSrc ? item.thumbnail : null;

  return (
    <div className="relative h-[50px] w-[88px] shrink-0">
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="h-full w-full rounded-lg bg-[color:var(--rf-popover-raised)] object-cover"
        />
      ) : null}
      <div
        className={`absolute inset-0 flex items-center gap-0.5 rounded-lg transition-opacity duration-150 ${
          src ? "justify-center bg-black/50 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" : "justify-end"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
