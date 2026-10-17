import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  DOWNLOAD_CARD_SIZE_CLASS,
  DownloadQueueItem,
} from "./DownloadJobQueuePanel";
import { sanitizeCarouselDisplayTitle } from "./downloaderFormat";

const SLOT_EASE = [0.16, 1, 0.3, 1] as const;
const SLIDE_DURATION = 0.52;
const FLY_DURATION = 0.5;
const SLOT_GAP_PX = 40;
const RAIL_ICON_PX = 20;

type CarouselItem = {
  thumbnail: string;
  title?: string;
  needsHydration?: boolean;
};
type FlyPayload = { thumbnail: string; from: DOMRect };
type LayoutMode = "pair" | "solo";

type FlyTarget = { x: number; y: number; size: number };

function railVideosIconCenter(): FlyTarget {
  const el = document.querySelector<HTMLElement>('[data-rail-tab="media"]');
  if (!el) return { x: 28, y: 94, size: RAIL_ICON_PX };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: RAIL_ICON_PX };
}

/** The playlist's library card when the Playlists tab shows it on screen, else the Videos rail icon. */
function flyTargetFor(playlistKey: string | null): FlyTarget {
  if (playlistKey) {
    const card = document.querySelector<HTMLElement>(
      `[data-playlist-card="${CSS.escape(playlistKey)}"] [data-squish-cover]`,
    );
    const r = card?.getBoundingClientRect();
    if (card && r && r.width > 0) {
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      // A card hidden under the downloader or scrolled off screen would swallow the flight.
      const hit = document.elementFromPoint(x, y);
      if (hit && card.contains(hit)) return { x, y, size: Math.min(r.width, r.height) };
    }
  }
  return railVideosIconCenter();
}

function slotMetrics(cardWidth: number, mode: LayoutMode = "pair") {
  const slotRight = cardWidth + SLOT_GAP_PX;
  const rowWidth =
    mode === "solo" ? cardWidth : cardWidth * 2 + SLOT_GAP_PX;
  const gapCenter = cardWidth + SLOT_GAP_PX / 2;
  return { slotRight, rowWidth, gapCenter };
}

function FlyingThumb({
  thumbnail,
  from,
  playlistKey,
  onDone,
}: {
  thumbnail: string;
  from: DOMRect;
  playlistKey: string | null;
  onDone: () => void;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Measured once: re-renders from progress ticks must not retarget (and restart) the flight.
  const [target] = useState(() => flyTargetFor(playlistKey));

  // onAnimationComplete can be lost when a burst of finishes re-renders the portal mid-flight,
  // which left the cover parked over the slot.
  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const timer = window.setTimeout(onDone, FLY_DURATION * 1000 + 250);
    return () => window.clearTimeout(timer);
  }, [reduced, onDone]);

  if (reduced) return null;

  const startCx = from.left + from.width / 2;
  const startCy = from.top + from.height / 2;
  const startScale = Math.max(from.width, from.height) / RAIL_ICON_PX;

  return createPortal(
    <motion.div
      className="pointer-events-none fixed z-[500] overflow-hidden rounded-md"
      style={{
        width: RAIL_ICON_PX,
        height: RAIL_ICON_PX,
        left: startCx - RAIL_ICON_PX / 2,
        top: startCy - RAIL_ICON_PX / 2,
        transformOrigin: "center center",
      }}
      initial={{ scale: startScale, opacity: 1 }}
      animate={{
        left: target.x - RAIL_ICON_PX / 2,
        top: target.y - RAIL_ICON_PX / 2,
        scale: target.size / RAIL_ICON_PX,
        opacity: [1, 1, 0],
      }}
      transition={{
        left: { duration: FLY_DURATION, ease: SLOT_EASE },
        top: { duration: FLY_DURATION, ease: SLOT_EASE },
        scale: { duration: FLY_DURATION, ease: SLOT_EASE },
        opacity: { duration: FLY_DURATION, times: [0, 0.72, 1], ease: "linear" },
      }}
      onAnimationComplete={onDone}
    >
      <img src={thumbnail} alt="" className="h-full w-full object-cover" />
    </motion.div>,
    document.body,
  );
}

function BatchRemainingEyebrow({
  remaining,
  gapCenterX,
}: {
  remaining: number;
  gapCenterX: number;
}) {
  if (remaining <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: gapCenterX }}
      aria-hidden
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={remaining}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: SLOT_EASE }}
          className="block text-4xl font-black tabular-nums leading-none tracking-tight text-stone-500/35 sm:text-5xl"
        >
          {remaining}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function MultiDownloadSlotCarousel({
  items,
  currentIndex,
  percentage,
  speedLabel,
  currentTitle,
  playlistKey,
}: {
  items: CarouselItem[];
  currentIndex: number;
  percentage: number;
  speedLabel: string | null;
  currentTitle: string;
  /** Normalized title of the playlist being downloaded, so finished items fly onto its card. */
  playlistKey?: string | null;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const displayIndexRef = useRef(currentIndex);
  const promotingRef = useRef(false);
  const safeIndexRef = useRef(currentIndex);

  const fitRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);
  const [cardWidth, setCardWidth] = useState(320);
  const [displayIndex, setDisplayIndex] = useState(currentIndex);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    items.length <= 1 ? "solo" : "pair",
  );
  const [isPromoting, setIsPromoting] = useState(false);
  const [fly, setFly] = useState<FlyPayload | null>(null);
  const [incomingPreview, setIncomingPreview] = useState(false);
  const [promoteTargetIndex, setPromoteTargetIndex] = useState<number | null>(null);

  const promoteX = useMotionValue(0);
  const clearFly = useCallback(() => setFly(null), []);

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, items.length - 1));
  safeIndexRef.current = safeIndex;

  const renderMode: LayoutMode =
    isPromoting || items.length > 1 ? layoutMode : "solo";
  const { slotRight, rowWidth, gapCenter } = slotMetrics(cardWidth, renderMode);

  const activeItem = items[displayIndex];
  const previewItem =
    renderMode === "pair" && displayIndex + 1 < items.length
      ? items[displayIndex + 1]
      : null;

  const eyebrowRemaining =
    isPromoting && promoteTargetIndex != null
      ? items.length - promoteTargetIndex - 1
      : items.length - displayIndex - 1;

  const showEyebrow =
    eyebrowRemaining > 0 &&
    renderMode === "pair" &&
    !(isPromoting && promoteTargetIndex != null && promoteTargetIndex >= items.length - 1);

  const measureCardWidth = useCallback(() => {
    const card = activeCardRef.current?.querySelector<HTMLElement>("[data-download-card]");
    if (card && card.offsetWidth > 0) {
      setCardWidth((w) => (w === card.offsetWidth ? w : card.offsetWidth));
    }
  }, []);

  const beginPromote = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (promotingRef.current) return;

      const completed = items[fromIndex];
      const activeRect = activeCardRef.current?.getBoundingClientRect();
      if (completed?.thumbnail && activeRect) {
        setFly({ thumbnail: completed.thumbnail, from: activeRect });
      }

      measureCardWidth();
      const { slotRight: right } = slotMetrics(cardWidth, "pair");
      promoteX.set(right);
      promotingRef.current = true;
      setPromoteTargetIndex(toIndex);
      setIsPromoting(true);
    },
    [items, measureCardWidth, promoteX, cardWidth],
  );

  useLayoutEffect(() => {
    measureCardWidth();
  });

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const read = () => setAvailable(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (items.length <= 1) {
      displayIndexRef.current = 0;
      setDisplayIndex(0);
      setLayoutMode("solo");
      promotingRef.current = false;
      setIsPromoting(false);
      setPromoteTargetIndex(null);
      promoteX.set(0);
      return;
    }

    if (safeIndex < displayIndexRef.current) {
      displayIndexRef.current = safeIndex;
      setDisplayIndex(safeIndex);
      setLayoutMode(safeIndex >= items.length - 1 ? "solo" : "pair");
      promotingRef.current = false;
      setIsPromoting(false);
      setPromoteTargetIndex(null);
      promoteX.set(0);
      return;
    }

    if (safeIndex > displayIndexRef.current && !promotingRef.current) {
      beginPromote(displayIndexRef.current, safeIndex);
    }
  }, [safeIndex, items.length, beginPromote, promoteX]);

  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;
  const beginPromoteRef = useRef(beginPromote);
  beginPromoteRef.current = beginPromote;

  // Keyed on the promotion alone: progress ticks during a batch rebuild `items` and `beginPromote`
  // every few hundred ms, and restarting the slide on each one meant it never finished.
  useEffect(() => {
    if (!isPromoting || promoteTargetIndex == null) return;

    const toIndex = promoteTargetIndex;
    const toSolo = toIndex >= itemCountRef.current - 1;
    let cancelled = false;

    const run = async () => {
      await animate(promoteX, 0, {
        duration: SLIDE_DURATION,
        ease: SLOT_EASE,
      });

      if (cancelled) return;

      displayIndexRef.current = toIndex;
      setDisplayIndex(toIndex);
      setLayoutMode(toSolo ? "solo" : "pair");
      promotingRef.current = false;
      setIsPromoting(false);
      setPromoteTargetIndex(null);
      promoteX.set(0);

      if (!toSolo) {
        setIncomingPreview(true);
        window.setTimeout(() => setIncomingPreview(false), 400);
      }

      const nextSafe = safeIndexRef.current;
      if (nextSafe > toIndex) {
        beginPromoteRef.current(toIndex, nextSafe);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isPromoting, promoteTargetIndex, promoteX]);

  if (!activeItem) return null;

  const showLeftProgress = displayIndex === safeIndex && !isPromoting;
  const promotingItem = isPromoting ? items[displayIndex + 1] : null;

  const cardTitle = (item: CarouselItem, isDownloading: boolean) => {
    if (item.needsHydration) return undefined;
    const raw = isDownloading && currentTitle.trim() ? currentTitle : (item.title ?? "");
    const safe = sanitizeCarouselDisplayTitle(raw);
    return safe || undefined;
  };

  const cardProps = (item: CarouselItem, isDownloading: boolean, pct: number, speed: string | null) => ({
    item,
    variant: "active" as const,
    percentage: pct,
    speedLabel: speed,
    title: cardTitle(item, isDownloading),
    needsHydration: item.needsHydration,
  });

  // The pair is wider than the hero at large breakpoints; scale the whole row (not the layout) to fit.
  const scale = Math.min(1, available / rowWidth);
  const rowHeight = (cardWidth * 9) / 16;

  return (
    <div className="flex w-full flex-col items-center">
      <div className="w-full px-4 sm:px-6">
        <div ref={fitRef} className="flex w-full justify-center" style={{ height: rowHeight * scale }}>
        <div
          ref={rowRef}
          className="relative shrink-0 origin-top"
          style={{ width: rowWidth, transform: scale < 1 ? `scale(${scale})` : undefined }}
        >
          <div className={`${DOWNLOAD_CARD_SIZE_CLASS} pointer-events-none opacity-0`} aria-hidden />

          {showEyebrow ? (
            <BatchRemainingEyebrow remaining={eyebrowRemaining} gapCenterX={gapCenter} />
          ) : null}

          {renderMode === "solo" && !isPromoting ? (
            <div ref={activeCardRef} className="absolute top-0 left-0">
              <DownloadQueueItem
                {...cardProps(activeItem, showLeftProgress, showLeftProgress ? percentage : 0, showLeftProgress ? speedLabel : null)}
              />
            </div>
          ) : null}

          {renderMode === "pair" && !isPromoting ? (
            <>
              <div ref={activeCardRef} className="absolute top-0 left-0">
                <DownloadQueueItem
                  {...cardProps(activeItem, showLeftProgress, showLeftProgress ? percentage : 0, showLeftProgress ? speedLabel : null)}
                />
              </div>
              <AnimatePresence initial={false}>
                {previewItem ? (
                  <motion.div
                    key={`preview-${displayIndex + 1}`}
                    className="absolute top-0 left-0"
                    style={{ x: slotRight }}
                    initial={incomingPreview ? { opacity: 0, x: slotRight + 24 } : { opacity: 1, x: slotRight }}
                    animate={{ opacity: 1, x: slotRight }}
                    transition={{ duration: 0.36, ease: SLOT_EASE }}
                  >
                    <DownloadQueueItem
                      item={previewItem}
                      variant="preview"
                      percentage={0}
                      title={cardTitle(previewItem, false)}
                      needsHydration={previewItem.needsHydration}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          ) : null}

          {isPromoting && promotingItem ? (
            <motion.div
              className="absolute top-0 left-0"
              style={{ x: promoteX }}
            >
              <DownloadQueueItem
                {...cardProps(
                  promotingItem,
                  safeIndex === displayIndex + 1,
                  safeIndex === displayIndex + 1 ? percentage : 0,
                  speedLabel,
                )}
              />
            </motion.div>
          ) : null}
        </div>
        </div>
      </div>

      {fly ? (
        <FlyingThumb key={`${fly.thumbnail}:${fly.from.left}:${fly.from.top}`} thumbnail={fly.thumbnail} from={fly.from} playlistKey={playlistKey ?? null} onDone={clearFly} />
      ) : null}
    </div>
  );
}
