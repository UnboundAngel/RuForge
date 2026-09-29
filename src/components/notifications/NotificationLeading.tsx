import { Check, Film, Pause, Radio, X } from "lucide-react";
import { ChannelAvatar } from "@/components/library/VideoByline";
import type { NotificationItem } from "@/notifications/types";

const KIND_BADGE: Record<NotificationItem["kind"], { Icon: typeof X; className: string }> = {
  "download-finished": { Icon: Check, className: "bg-[color:var(--accent)] text-stone-900" },
  "download-failed": { Icon: X, className: "bg-rose-400 text-stone-900" },
  "download-timed-out": { Icon: X, className: "bg-rose-400 text-stone-900" },
  "download-blocked": { Icon: Pause, className: "bg-amber-400 text-stone-900" },
  upload: { Icon: Film, className: "bg-stone-200 text-stone-900" },
  premiere: { Icon: Film, className: "bg-[color:var(--accent)] text-stone-900" },
  live: { Icon: Radio, className: "bg-[color:var(--accent)] text-stone-900" },
};

const RING = "ring-[3px] ring-[color:var(--rf-popover-bg)]";

/** Corner badge on the thumbnail: the channel's face for uploads, a status chip for downloads. */
export function NotificationLeading({ item, channelName }: { item: NotificationItem; channelName: string | null }) {
  if (item.source === "watchlist" && item.channelId) {
    return (
      <ChannelAvatar
        channelId={item.channelId}
        channel={channelName ?? item.subtitle ?? item.title}
        className={`h-6 w-6 text-[10px]! ${RING}`}
      />
    );
  }
  const { Icon, className } = KIND_BADGE[item.kind];
  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${className} ${RING}`}>
      <Icon size={12} strokeWidth={3.25} aria-hidden />
    </span>
  );
}

export function NotificationKindIcon({ item }: { item: NotificationItem }) {
  const { Icon } = KIND_BADGE[item.kind];
  return <Icon size={20} strokeWidth={2} className="text-stone-600" aria-hidden />;
}
