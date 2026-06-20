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

function railVideosIconCenter(): { x: number; y: number } {
  const el = document.querySelector<HTMLElement>('[data-rail-tab="media"]');
  if (!el) return { x: 28, y: 94 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function slotMetrics(cardWidth: number) {
  const slotRight = cardWidth + SLOT_GAP_PX;
  const slotCenter = slotRight / 2;
  const rowWidth = cardWidth * 2 + SLOT_GAP_PX;
  const gapCenter = cardWidth + SLOT_GAP_PX / 2;
  return { slotRight, slotCenter, rowWidth, gapCenter };
}

function FlyingThumb({
  thumbnail,
  from,
  onDone,
}: {
  thumbnail: string;
  from: DOMRect;
  onDone: () => void;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) onDone();
  }, [reduced, onDone]);

  if (reduced) return null;

  const startCx = from.left + from.width / 2;
  const startCy = from.top + from.height / 2;
  const startScale = Math.max(from.width, from.height) / RAIL_ICON_PX;
  const target = railVideosIconCenter();

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
        scale: 1,
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
}: {
  items: CarouselItem[];
  currentIndex: number;
  percentage: number;
  speedLabel: string | null;
  currentTitle: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const cardWidthRef = useRef(320);
  const displayIndexRef = useRef(currentIndex);
  const promotingRef = useRef(false);
  const safeIndexRef = useRef(currentIndex);

  const [displayIndex, setDisplayIndex] = useState(currentIndex);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("pair");
  const [isPromoting, setIsPromoting] = useState(false);
  const [fly, setFly] = useState<FlyPayload | null>(null);
  const [incomingPreview, setIncomingPreview] = useState(false);
  const [promoteTargetIndex, setPromoteTargetIndex] = useState<number | null>(null);

  const promoteX = useMotionValue(0);

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, items.length - 1));
  safeIndexRef.current = safeIndex;

  const { slotRight, slotCenter, rowWidth, gapCenter } = slotMetrics(cardWidthRef.current);

  const activeItem = items[displayIndex];
  const previewItem =
    layoutMode === "pair" && displayIndex + 1 < items.length
      ? items[displayIndex + 1]
      : null;

  const eyebrowRemaining =
    isPromoting && promoteTargetIndex != null
      ? items.length - promoteTargetIndex - 1
      : items.length - displayIndex - 1;

  const showEyebrow =
    eyebrowRemaining > 0 &&
    layoutMode === "pair" &&
    !(isPromoting && promoteTargetIndex != null && promoteTargetIndex >= items.length - 1);

  const measureCardWidth = useCallback(() => {
    const card = activeCardRef.current?.querySelector<HTMLElement>("[data-download-card]");
    if (card && card.offsetWidth > 0) {
      cardWidthRef.current = card.offsetWidth;
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
      const { slotRight: right } = slotMetrics(cardWidthRef.current);
      promoteX.set(right);
      promotingRef.current = true;
      setPromoteTargetIndex(toIndex);
      setIsPromoting(true);
    },
    [items, measureCardWidth, promoteX],
  );

  useLayoutEffect(() => {
    measureCardWidth();
  });

  useLayoutEffect(() => {
    if (safeIndex < displayIndexRef.current) {
      displayIndexRef.current = safeIndex;
      setDisplayIndex(safeIndex);
      setLayoutMode(safeIndex >= items.length - 1 ? "solo" : "pair");
      promotingRef.current = false;
      setIsPromoting(false);
      setPromoteTargetIndex(null);
      promoteX.set(safeIndex >= items.length - 1 ? slotMetrics(cardWidthRef.current).slotCenter : 0);
      return;
    }

    if (safeIndex > displayIndexRef.current && !promotingRef.current) {
      beginPromote(displayIndexRef.current, safeIndex);
    }
  }, [safeIndex, items.length, beginPromote, promoteX]);

  useEffect(() => {
    if (!isPromoting || promoteTargetIndex == null) return;

    const toIndex = promoteTargetIndex;
    const toSolo = toIndex >= items.length - 1;
    const { slotCenter: center } = slotMetrics(cardWidthRef.current);
    const targetX = toSolo ? center : 0;
    let cancelled = false;

    const run = async () => {
      await animate(promoteX, targetX, {
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

      if (!toSolo) {
        promoteX.set(0);
        setIncomingPreview(true);
        window.setTimeout(() => setIncomingPreview(false), 400);
      }

      const nextSafe = safeIndexRef.current;
      if (nextSafe > toIndex) {
        beginPromote(toIndex, nextSafe);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isPromoting, promoteTargetIndex, items.length, promoteX, beginPromote]);

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

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full justify-center px-4 sm:px-6">
        <div
          ref={rowRef}
          className="relative"
          style={{ width: rowWidth }}
        >
          <div className={`${DOWNLOAD_CARD_SIZE_CLASS} pointer-events-none opacity-0`} aria-hidden />

          {showEyebrow ? (
            <BatchRemainingEyebrow remaining={eyebrowRemaining} gapCenterX={gapCenter} />
          ) : null}

          {layoutMode === "solo" && !isPromoting ? (
            <div
              ref={activeCardRef}
              className="absolute top-0"
              style={{ left: slotCenter }}
            >
              <DownloadQueueItem
                {...cardProps(activeItem, showLeftProgress, showLeftProgress ? percentage : 0, showLeftProgress ? speedLabel : null)}
              />
            </div>
          ) : null}

          {layoutMode === "pair" && !isPromoting ? (
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

      {fly ? (
        <FlyingThumb thumbnail={fly.thumbnail} from={fly.from} onDone={() => setFly(null)} />
      ) : null}
    </div>
  );
}
