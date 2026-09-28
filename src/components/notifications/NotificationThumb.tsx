import { useState } from "react";
import { CircleCheck, CircleX, TriangleAlert, Radio, Film } from "lucide-react";
import type { NotificationItem } from "@/notifications/types";

const KIND_ICON: Record<NotificationItem["kind"], { Icon: typeof CircleX; className: string }> = {
  "download-finished": { Icon: CircleCheck, className: "text-[color:var(--accent)]" },
  "download-failed": { Icon: CircleX, className: "text-rose-400" },
  "download-timed-out": { Icon: CircleX, className: "text-rose-400" },
  "download-blocked": { Icon: TriangleAlert, className: "text-amber-400" },
  upload: { Icon: Film, className: "text-stone-400" },
  premiere: { Icon: Film, className: "text-[color:var(--accent)]" },
  live: { Icon: Radio, className: "text-[color:var(--accent)]" },
};

export function NotificationThumb({ item }: { item: NotificationItem }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item.thumbnail && item.thumbnail !== failedSrc ? item.thumbnail : null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailedSrc(src)}
        className="h-[54px] w-24 shrink-0 rounded-[10px] bg-[color:var(--rf-popover-raised)] object-cover"
      />
    );
  }

  const { Icon, className } = KIND_ICON[item.kind];
  return (
    <div className="flex h-[54px] w-24 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--rf-popover-raised)]">
      <Icon size={20} className={className} aria-hidden />
    </div>
  );
}
