import { CircleCheck, CircleX, TriangleAlert, Radio, Film } from "lucide-react";
import { ChannelAvatar } from "@/components/library/VideoByline";
import type { NotificationItem } from "@/notifications/types";

const KIND_ICON: Record<NotificationItem["kind"], { Icon: typeof CircleX; className: string }> = {
  "download-finished": { Icon: CircleCheck, className: "text-[color:var(--accent)]" },
  "download-failed": { Icon: CircleX, className: "text-rose-400" },
  "download-timed-out": { Icon: CircleX, className: "text-rose-400" },
  "download-blocked": { Icon: TriangleAlert, className: "text-amber-400" },
  upload: { Icon: Film, className: "text-stone-300" },
  premiere: { Icon: Film, className: "text-[color:var(--accent)]" },
  live: { Icon: Radio, className: "text-[color:var(--accent)]" },
};

/** Channel avatar for watchlist rows, a status icon disc for download rows. */
export function NotificationLeading({ item, channelName }: { item: NotificationItem; channelName: string | null }) {
  if (item.source === "watchlist" && item.channelId) {
    return (
      <ChannelAvatar
        channelId={item.channelId}
        channel={channelName ?? item.subtitle ?? item.title}
        className="h-11 w-11"
      />
    );
  }
  const { Icon, className } = KIND_ICON[item.kind];
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--rf-popover-raised)]">
      <Icon size={20} className={className} aria-hidden />
    </div>
  );
}
