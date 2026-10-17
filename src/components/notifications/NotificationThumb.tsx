import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { FallbackImg } from "@/components/ui/FallbackImg";
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
  dense = false,
}: {
  item: NotificationItem;
  badge: ReactNode;
  children: ReactNode;
  compact?: boolean;
  /** Island density: a smaller frame whatever the read state. */
  dense?: boolean;
}) {
  const size = dense ? "h-[38px] w-[68px]" : compact ? "h-[45px] w-[80px]" : "h-[63px] w-[112px]";
  if (item.kind === "security-blocked") {
    return (
      <div className={`relative shrink-0 ${size}`}>
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[color:var(--rf-popover-raised)]">
          <ShieldCheck
            size={compact || dense ? 20 : 26}
            strokeWidth={1.75}
            className={item.read ? "text-stone-600" : "text-stone-300"}
            aria-hidden
          />
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className={`relative shrink-0 ${size}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-[color:var(--rf-popover-raised)]">
        <FallbackImg
          src={item.thumbnail}
          referrerPolicy="no-referrer"
          className={`h-full w-full object-cover transition-opacity duration-150 ${item.read ? "opacity-60" : ""}`}
          fallback={<NotificationKindIcon item={item} />}
        />
      </div>
      {children}
      <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 flex rounded-full">{badge}</span>
    </div>
  );
}
