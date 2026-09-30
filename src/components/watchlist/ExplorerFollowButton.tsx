import { Icon } from "@iconify/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { followTooltip } from "@/watchlist/explorerFollow";
import { titlebarIconButtonClass } from "../TitlebarHoverButton";
import { type FollowHint, useExplorerFollow } from "./useExplorerFollow";

const LEFT_HINT_MS = 1700;
const ICON_SLOT = "relative flex h-[18px] w-[18px] shrink-0 items-center justify-center";
const T_ICON = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
const T_INSTANT = { duration: 0 };

function FollowIconLayer({ icon, shown }: { icon: string; shown: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center"
      animate={{ opacity: shown ? 1 : 0, scale: shown || reduceMotion ? 1 : 0.88 }}
      transition={reduceMotion ? T_INSTANT : T_ICON}
    >
      <Icon icon={icon} width={18} height={18} />
    </motion.span>
  );
}

export function ExplorerFollowButton() {
  const [hovering, setHovering] = useState(false);
  const [hint, setHint] = useState<FollowHint | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHint = useCallback((next: FollowHint) => {
    if (hintTimerRef.current != null) clearTimeout(hintTimerRef.current);
    setHint(next);
    hintTimerRef.current = setTimeout(() => {
      setHint(null);
      hintTimerRef.current = null;
    }, LEFT_HINT_MS);
  }, []);

  useEffect(
    () => () => {
      if (hintTimerRef.current != null) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const reduceMotion = useReducedMotion();
  const { visible, following, channelName, pending, toggle } = useExplorerFollow(flashHint);

  if (!visible) return null;

  const tooltip = followTooltip(channelName, following);

  return (
    <div className="flex h-10 max-w-[min(100vw-12rem,14rem)] flex-shrink-0 items-center gap-1.5">
      <AnimatePresence initial={false} mode="wait">
        {hint ? (
          <motion.span
            key={hint.text}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduceMotion ? 0 : 4 }}
            transition={reduceMotion ? T_INSTANT : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={
              hint.kind === "error"
                ? "pointer-events-none max-w-[9.5rem] text-right text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-amber-400/95"
                : "pointer-events-none max-w-[11rem] text-right text-[10px] font-medium leading-tight text-stone-400"
            }
          >
            {hint.text}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => void toggle()}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          aria-busy={pending}
          aria-pressed={following}
          className={`${titlebarIconButtonClass} ${pending ? "opacity-50" : ""}`}
          aria-label={tooltip}
          data-tooltip={tooltip}
        >
          <span className={ICON_SLOT}>
            <FollowIconLayer icon="ic:round-person-add-alt" shown={!following} />
            <FollowIconLayer icon="ic:round-how-to-reg" shown={following && !hovering} />
            <FollowIconLayer icon="ic:round-person-remove" shown={following && hovering} />
          </span>
        </button>
      </div>
    </div>
  );
}
