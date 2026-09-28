import { useState } from "react";
import { useChannelFollow } from "./useChannelFollow";

export function FollowChannelButton({
  channelId,
  channel,
  className = "",
}: {
  channelId: string;
  channel: string;
  className?: string;
}) {
  const { following, pending, toggle } = useChannelFollow(channelId, channel);
  const [hovering, setHovering] = useState(false);
  const label = following ? (hovering ? "Unfollow" : "Following") : "Follow";
  const tooltip = following ? `Following ${channel}. Click to unfollow` : `Follow ${channel} for new uploads`;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-pressed={following}
      aria-busy={pending}
      data-tooltip={tooltip}
      className={`h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold tracking-normal transition-colors duration-150 ${
        following
          ? "bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-[color:var(--accent)]"
          : "bg-white/[0.07] text-stone-200 hover:bg-[color:var(--accent)] hover:text-stone-900"
      } ${pending ? "opacity-50" : ""} ${className}`}
    >
      {label}
    </button>
  );
}
