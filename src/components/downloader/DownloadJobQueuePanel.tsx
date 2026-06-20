import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Music, Video } from "lucide-react";

function computeTooltipPlacement(
  anchor: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number; transform: string } {
  const pad = 10;
  const gap = 8;
  const vw = window.innerWidth;
  const tw = Math.max(tooltipWidth, 1);
  const th = Math.max(tooltipHeight, 1);

  const preferAbove = anchor.top - gap - th >= pad;
  const top = preferAbove ? anchor.top - gap : anchor.bottom + gap;
  const translateY = preferAbove ? "-100%" : "0";

  const centerX = anchor.left + anchor.width / 2;
  const half = tw / 2;

  let left = centerX;
  let translateX = "-50%";

  if (centerX - half < pad) {
    left = anchor.left;
    translateX = "0";
  } else if (centerX + half > vw - pad) {
    left = anchor.right;
    translateX = "-100%";
  }

  return { top, left, transform: `translate(${translateX}, ${translateY})` };
}

/** Marquee text that animates when title overflows its container boundaries. */
export const MarqueeText = ({
  text,
  className = "",
  layoutKey,
  centered = false,
  fadeLeadingEdge = false,
}: {
  text: string;
  className?: string;
  layoutKey?: boolean | number | string;
  centered?: boolean;
  fadeLeadingEdge?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        const isOverflowing = textRef.current.offsetWidth > containerRef.current.offsetWidth;
        setShouldMarquee(isOverflowing);
      }
    };
    check();
    const t = setTimeout(check, 120);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", check);
    };
  }, [text, layoutKey]);

  return (
    <div
      ref={containerRef}
      className={`${className} relative overflow-hidden whitespace-nowrap ${
        shouldMarquee && fadeLeadingEdge ? "rf-marquee-fade-left" : ""
      }`}
    >
      <div
        className={`flex w-max ${shouldMarquee ? "animate-marquee" : ""}`}
        style={centered && !shouldMarquee ? { margin: "0 auto" } : undefined}
      >
        <span ref={textRef} className={shouldMarquee ? "pr-12" : ""}>
          {text}
        </span>
        {shouldMarquee && <span className="pr-12">{text}</span>}
      </div>
    </div>
  );
};

export const DOWNLOAD_CARD_SIZE_CLASS =
  "aspect-video w-80 shrink-0 sm:w-96 lg:w-[26rem]";

const HYDRATE_FADE_EASE = [0.16, 1, 0.3, 1] as const;

export const DownloadQueueItem = ({
  item,
  index,
  currentIndex,
  percentage,
  speedLabel,
  variant,
  title,
  needsHydration = false,
}: {
  item: { id?: string; thumbnail: string; title?: string };
  index?: number;
  currentIndex?: number;
  percentage: number;
  speedLabel?: string | null;
  variant?: "active" | "preview";
  title?: string;
  needsHydration?: boolean;
}) => {
  const isCurrent = variant
    ? variant === "active"
    : currentIndex !== undefined && index === currentIndex;
  const isPending = variant
    ? variant === "preview"
    : currentIndex !== undefined && index !== undefined && index > currentIndex;
  const opacityClass = isPending ? "opacity-55" : "opacity-100";

  let progress = 0;
  if (variant === "preview") {
    progress = 0;
  } else if (variant === "active") {
    progress = percentage;
  } else if (currentIndex !== undefined && index !== undefined) {
    if (index < currentIndex) progress = 100;
    else if (index === currentIndex) progress = percentage;
  }
  const label = needsHydration ? "" : (title ?? item.title ?? "").trim();
  const showMedia = !needsHydration && Boolean(item.thumbnail?.trim());

  return (
    <motion.div
      data-download-card
      className={`relative overflow-hidden rounded-3xl border border-white/[0.08] bg-stone-900/80 transition-all duration-500 ${DOWNLOAD_CARD_SIZE_CLASS} ${
        isCurrent
          ? "z-10 scale-[1.02] ring-2 ring-[color-mix(in_srgb,var(--accent),transparent_55%)]"
          : `scale-100 ${opacityClass}`
      }`}
    >
      <AnimatePresence initial={false}>
        {needsHydration ? (
          <motion.div
            key="shimmer"
            className="rf-download-card-shimmer absolute inset-0 bg-stone-800/90"
            aria-hidden
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: HYDRATE_FADE_EASE }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!needsHydration ? (
          <motion.div
            key="hydrated"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: HYDRATE_FADE_EASE }}
          >
            {showMedia ? (
              <>
                <img
                  src={item.thumbnail}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale"
                />
                <motion.div
                  className="absolute inset-0"
                  style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}
                >
                  <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                </motion.div>
              </>
            ) : (
              <div className="rf-download-card-shimmer absolute inset-0 bg-stone-800/90" aria-hidden />
            )}
            {label ? (
              <motion.div
                className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3.5 pt-10 ${
                  isPending ? "opacity-70" : "opacity-100"
                }`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, ease: HYDRATE_FADE_EASE, delay: 0.08 }}
              >
                <p className="line-clamp-2 text-left text-sm font-semibold leading-snug text-white sm:text-[0.95rem]">
                  {label}
                </p>
              </motion.div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isCurrent && speedLabel ? (
        <span className="absolute top-3 right-3 z-20 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold tabular-nums tracking-tight text-white backdrop-blur-sm">
          {speedLabel}
        </span>
      ) : null}
    </motion.div>
  );
};

export function UrlInputPacer({
  expanded,
  loading = false,
  compact = false,
  className = "",
}: {
  expanded: boolean;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const lineHeight = compact ? "h-px" : "h-[2px]";
  const gap = compact ? "gap-1" : "gap-1.5";
  const wide = compact ? "w-14" : "w-48";
  const lineWidth = expanded ? wide : "w-0";
  return (
    <motion.div className={`flex items-center justify-center ${gap} ${className}`}>
      <motion.div
        className={`${lineHeight} rounded-full bg-[color:var(--accent)] opacity-30 transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineWidth}`}
      />
      {loading && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className={`${compact ? "h-2 w-2 border" : "h-3 w-3 border-2"} border-white/10 border-t-[color:var(--accent)] rounded-full`}
        />
      )}
      <motion.div
        className={`${lineHeight} rounded-full bg-[color:var(--accent)] opacity-30 transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineWidth}`}
      />
    </motion.div>
  );
}

const QueueTooltip = ({
  text,
  visible,
  anchorRef,
}: {
  text: string;
  visible: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) => {
  const measureRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    transform: string;
  } | null>(null);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const tip = measureRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const tw = tip?.offsetWidth ?? 0;
      const th = tip?.offsetHeight ?? 0;
      if (tw === 0 || th === 0) return;
      setPlacement(computeTooltipPlacement(r, tw, th));
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, anchorRef, text]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        ref={measureRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999] whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 opacity-0 shadow-md ring-1 ring-white/10"
        aria-hidden
      >
        {text}
      </div>
      {placement ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10"
          style={{
            top: placement.top,
            left: placement.left,
            transform: placement.transform,
          }}
        >
          {text}
        </div>
      ) : null}
    </>,
    document.body,
  );
};

/** Shared per-job audio toggle (playlist rows + downloader hero). */
export function DownloadJobAudioToggle({
  audioOnly,
  onToggle,
  disabled = false,
  className = "",
}: {
  audioOnly: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [audioHovered, setAudioHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const IconComponent = audioOnly ? Music : Video;
  return (
    <motion.div className={`relative ${className}`}>
      <QueueTooltip
        text={audioOnly ? "Switch to audio + video" : "Switch to audio only"}
        visible={audioHovered && !disabled}
        anchorRef={buttonRef}
      />
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onMouseEnter={() => setAudioHovered(true)}
        onMouseLeave={() => setAudioHovered(false)}
        onClick={onToggle}
        aria-label={audioOnly ? "Switch to video download" : "Switch to audio-only download"}
        className="flex h-7 w-7 items-center justify-center rounded-md p-1.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 active:scale-95 disabled:pointer-events-none disabled:opacity-25"
      >
        <IconComponent
          size={13}
          strokeWidth={2.5}
          className={audioOnly ? "opacity-90" : "opacity-70"}
        />
      </button>
    </motion.div>
  );
}

/** Drawer removed; hero metadata + playlist list is the queue surface. */
export function DownloadJobQueuePanel() {
  return null;
}
