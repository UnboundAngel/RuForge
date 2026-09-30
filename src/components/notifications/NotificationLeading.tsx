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
  const badge = (
    <span className={`relative flex h-5 w-5 items-center justify-center rounded-full ${className} ${RING}`}>
      <Icon size={12} strokeWidth={3.25} aria-hidden />
    </span>
  );
  const attempts = item.ref.failedAttempts;
  if (!attempts) return badge;
  const failed = KIND_BADGE["download-failed"];
  const label = `Downloaded after ${attempts === 1 ? "1 failed attempt" : `${attempts} failed attempts`}`;
  return (
    <span className="relative flex h-5 w-5">
      {/* Hit area over the peeking ✕ and a little around it, so the ✓ itself never triggers the swap. */}
      <span
        data-tooltip={label}
        aria-label={label}
        className="peer pointer-events-auto absolute -left-3 -top-1 z-20 h-7 w-4"
      />
      <span
        className={`${STACKED} z-0 -translate-x-2.5 scale-75 peer-hover:z-10 peer-hover:translate-x-0 peer-hover:scale-100 ${failed.className}`}
      >
        <failed.Icon size={12} strokeWidth={3.25} aria-hidden />
      </span>
      <span
        className={`${STACKED} z-10 peer-hover:z-0 peer-hover:-translate-x-2.5 peer-hover:scale-75 ${className}`}
      >
        <Icon size={12} strokeWidth={3.25} aria-hidden />
      </span>
    </span>
  );
}

/** Two same-size badges in one slot; hover swaps which sits in front. */
const STACKED = `absolute inset-0 flex items-center justify-center rounded-full ${RING} transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none`;

export function NotificationKindIcon({ item }: { item: NotificationItem }) {
  const { Icon } = KIND_BADGE[item.kind];
  return <Icon size={20} strokeWidth={2} className="text-stone-600" aria-hidden />;
}
