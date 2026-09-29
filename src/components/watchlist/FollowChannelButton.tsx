import { useState } from "react";
import { useChannelFollow } from "./useChannelFollow";

const PILL = {
  base: "h-8 rounded-full px-3 text-[12px]",
  following: "bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-[color:var(--accent)]",
  idle: "bg-white/[0.07] text-stone-200 hover:bg-[color:var(--accent)] hover:text-stone-900",
};
/** The creator page's primary action: a soft rect, per the CTA rule, so it outranks the chrome around it. */
const CTA = {
  base: "h-10 min-w-[7.5rem] rounded-[12px] px-5 text-[13px]",
  following: "bg-white/[0.07] text-stone-200 hover:bg-white/[0.11]",
  idle: "bg-[color:var(--accent)] text-stone-900 hover:brightness-110 active:scale-[0.97]",
};

export function FollowChannelButton({
  channelId,
  channel,
  className = "",
  variant = "pill",
}: {
  channelId: string;
  channel: string;
  className?: string;
  variant?: "pill" | "cta";
}) {
  const look = variant === "cta" ? CTA : PILL;
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
      className={`${look.base} shrink-0 font-semibold tracking-normal transition-[background-color,color,filter,transform] duration-150 ${
        following ? look.following : look.idle
      } ${pending ? "opacity-50" : ""} ${className}`}
    >
      {label}
    </button>
  );
}
