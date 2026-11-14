import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { OVERLAY_EASE } from "@/lib/overlayMotion";

/** How a result bar marks where it ends: a hairline at the fill edge ("cap"), or separate rounded segments with a 3px gap like CleanupUsageBar ("slit"). */
const END_MARK: "cap" | "slit" = "cap";

type Props = {
  letter: string;
  label: string;
  /** Position in the poll, for the small bar stagger. */
  index: number;
  /** 0 to 100 when results are visible, null before the user has voted. */
  percent: number | null;
  picked: boolean;
  /** Clickable only while the poll is open and unvoted. */
  onPick: (() => void) | null;
  busy: boolean;
  read: boolean;
  primary: string;
  muted: string;
};

/** One compact option: letter, label, and once results are visible a fill sized to the share plus the percentage. */
export function PollOptionRow({ letter, label, index, percent, picked, onPick, busy, read, primary, muted }: Props) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const fill = picked ? "bg-[color-mix(in_srgb,var(--accent)_42%,transparent)]" : "bg-white/[0.13]";
  const track = read ? "bg-white/[0.04]" : "bg-white/[0.055]";
  const split = percent != null && END_MARK === "slit";
  // The cap fill is full width and slides in from the left, so its hairline keeps its pixel size.
  const rest = percent == null ? 0 : percent - 100;
  const barBg = split ? "" : track;
  const body = (
    <>
      <span className={`w-5 shrink-0 text-center font-semibold leading-4 ${muted}`}>{letter}</span>
      <span className={`relative flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-2 transition-colors duration-150 ${barBg} ${onPick ? "group-hover:bg-white/[0.1] group-focus-visible:bg-white/[0.1]" : ""}`}>
        {split ? (
          <span aria-hidden className="absolute inset-0 flex">
            <motion.span
              className={`h-full shrink-0 rounded-lg ${fill}`}
              style={{ minWidth: percent > 0 ? 6 : 0 }}
              initial={{ width: reduce ? `${percent}%` : "0%" }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.22, ease: OVERLAY_EASE, delay: reduce ? 0 : index * 0.035 }}
            />
            <span className={`h-full min-w-0 flex-1 rounded-lg ${track} ${percent > 0 && percent < 100 ? "ml-[3px]" : ""}`} />
          </span>
        ) : null}
        {percent != null && END_MARK === "cap" ? (
          <motion.span
            aria-hidden
            className={`absolute inset-0 ${fill}`}
            initial={{ x: reduce ? `${rest}%` : "-100%" }}
            animate={{ x: `${rest}%` }}
            transition={{ duration: 0.22, ease: OVERLAY_EASE, delay: reduce ? 0 : index * 0.035 }}
          >
            <span className="absolute inset-y-0 right-0 w-px bg-black/20" />
          </motion.span>
        ) : null}
        <span className="relative min-w-0 flex-1">
          <HoverMarqueeText text={label} active={hovered} className={`leading-4 ${picked ? "font-semibold" : ""} ${primary}`} />
        </span>
        {percent != null ? (
          <span className={`relative shrink-0 leading-4 tabular-nums ${picked ? `font-semibold ${primary}` : muted}`}>{percent}%</span>
        ) : null}
      </span>
    </>
  );
  const base = "group flex h-[26px] w-full items-center gap-1 text-left text-[12px]";
  const hover = { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) };
  return onPick ? (
    <button type="button" disabled={busy} {...hover} onClick={onPick} className={`${base} focus-visible:outline-none disabled:opacity-60`}>
      {body}
    </button>
  ) : (
    <div {...hover} className={base}>
      {body}
    </div>
  );
}
