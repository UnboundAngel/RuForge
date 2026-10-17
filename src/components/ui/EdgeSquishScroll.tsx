import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ScrollEdges = { left: boolean; right: boolean };

/** Put on the cover inside each card; covers scale toward the edge that clips them. */
const SQUISH_COVER_ATTR = "data-squish-cover";

/** Matches the edge fade in `.rf-squish-scroll-clip`. */
const FADE_PX = 32;

/** Page by one screen, keeping the faded edge card in view so the row reads as continuous. */
function pageEdgeSquishScroll(el: HTMLElement | null, dir: 1 | -1) {
  if (el) el.scrollBy({ left: dir * Math.max(FADE_PX, el.clientWidth - FADE_PX * 2), behavior: "smooth" });
}

function squish(cover: HTMLElement, rect: DOMRect, bounds: DOMRect) {
  const visible = Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left));
  const ratio = rect.width > 0 ? visible / rect.width : 1;
  if (ratio >= 0.995) {
    cover.style.transform = "";
    cover.style.transformOrigin = "";
    return;
  }
  const clipRight = rect.right > bounds.right + 0.5;
  const clipLeft = rect.left < bounds.left - 0.5;
  cover.style.transform = `scale(${(0.88 + ratio * 0.12).toFixed(3)})`;
  cover.style.transformOrigin =
    clipRight && !clipLeft ? "right center" : clipLeft && !clipRight ? "left center" : "center center";
}

/**
 * Carousel affordance from the design rules: a chevron on a soft radial shade in the page's own
 * hue, shown while the row is hovered. Never a button chip.
 */
function EdgeArrow({
  side,
  shown,
  top,
  onClick,
}: {
  side: "left" | "right";
  shown: boolean;
  top: number | null;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={shown ? 0 : -1}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      style={top == null ? undefined : { top }}
      className={cn(
        "rf-shelf-arrow absolute z-10 flex h-24 w-16 -translate-y-1/2 items-center transition-[opacity,color] duration-150",
        top == null && "top-1/2",
        side === "left" ? "-left-6 justify-start pl-3" : "-right-6 justify-end pr-3",
        shown ? "opacity-0 group-hover/squish:opacity-100 focus-visible:opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span aria-hidden className="rf-shelf-arrow-shade absolute inset-0" />
      <Icon size={26} strokeWidth={2.5} className="relative" />
    </button>
  );
}

/**
 * The one horizontal card scroller: covers squish toward the clipped edge and the row fades
 * whichever side still has cards behind it.
 */
export function EdgeSquishScroll({
  children,
  className,
  contentClassName,
  scrollRef,
  wrapItems = true,
  wheelScroll = false,
  arrows = false,
  gap,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** For scroll-into-view. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Off when children are already the row items (AnimatePresence lists, a column-flow grid). */
  wrapItems?: boolean;
  /** Vertical wheel scrolls the row sideways; for rails that do not sit in a vertical scroller. */
  wheelScroll?: boolean;
  /** Hover edge arrows that page by one screen, centered on the first cover. */
  arrows?: boolean;
  /** Px between items when it comes from layout constants rather than a class. */
  gap?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ left: false, right: false });
  const [arrowTop, setArrowTop] = useState<number | null>(null);

  const setScroll = useCallback(
    (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (scrollRef) scrollRef.current = el;
    },
    [scrollRef],
  );

  useEffect(() => {
    const root = rootRef.current;
    const clip = clipRef.current;
    const scroll = innerRef.current;
    if (!root || !clip || !scroll) return;

    let last = "";
    // Covers carry a transform transition for hover, so a fresh card's first squish would
    // visibly shrink into place right after the view fades in.
    const placed = new WeakSet<HTMLElement>();
    const sync = () => {
      const overflow = scroll.scrollWidth > scroll.clientWidth + 4;
      const next = {
        left: overflow && scroll.scrollLeft > 4,
        right: overflow && scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 4,
      };
      const key = `${next.left}${next.right}`;
      if (key !== last) {
        last = key;
        setEdges(next);
      }
      const bounds = clip.getBoundingClientRect();
      const covers = [...scroll.querySelectorAll<HTMLElement>(`[${SQUISH_COVER_ATTR}]`)];
      // All reads before any transform write, or each cover forces its own style recalc.
      const rects = covers.map((cover) => cover.getBoundingClientRect());
      const rootTop = arrows && covers[0] ? root.getBoundingClientRect().top : 0;
      const fresh: HTMLElement[] = [];
      covers.forEach((cover, i) => {
        if (!placed.has(cover)) {
          placed.add(cover);
          fresh.push(cover);
          cover.style.transition = "none";
        }
        squish(cover, rects[i], bounds);
      });
      if (fresh.length > 0) {
        // Commit the untransitioned transform before the class transition comes back.
        void scroll.offsetWidth;
        for (const cover of fresh) cover.style.transition = "";
      }
      if (arrows && covers[0]) {
        const box = rects[0];
        setArrowTop(Math.round(box.top + box.height / 2 - rootTop));
      }
    };

    // Re-renders insert nodes into the row in many small bursts. The first one syncs at once so
    // new cards never paint unsquished; the rest of the frame folds into one trailing sync.
    let mutationFrame = 0;
    let mutationPending = false;
    const syncAfterMutations = () => {
      if (mutationFrame) {
        mutationPending = true;
        return;
      }
      sync();
      mutationFrame = requestAnimationFrame(() => {
        mutationFrame = 0;
        if (mutationPending) {
          mutationPending = false;
          sync();
        }
      });
    };

    // Items are observed too: cards that animate their width change the row without a DOM mutation.
    const ro = new ResizeObserver(sync);
    const observeItems = () => {
      for (const item of scroll.children) ro.observe(item);
    };
    ro.observe(scroll);
    ro.observe(clip);
    observeItems();
    const mo = new MutationObserver(() => {
      observeItems();
      syncAfterMutations();
    });
    mo.observe(scroll, { childList: true, subtree: true });
    scroll.addEventListener("scroll", sync, { passive: true });
    sync();

    return () => {
      scroll.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
      if (mutationFrame) cancelAnimationFrame(mutationFrame);
    };
  }, [arrows]);

  return (
    <div ref={rootRef} className={cn("group/squish relative min-w-0", className)}>
      <div
        ref={clipRef}
        className="rf-squish-scroll-clip h-full min-w-0 overflow-hidden"
        data-fade-left={edges.left ? "true" : undefined}
        data-fade-right={edges.right ? "true" : undefined}
      >
        <div
          ref={setScroll}
          className={cn("flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-0.5 pb-1", contentClassName)}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", gap }}
          onWheel={
            wheelScroll
              ? (e) => {
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollBy({ left: e.deltaY, behavior: "instant" });
                }
              : undefined
          }
        >
          {wrapItems
            ? Children.map(children, (child) => <div className="shrink-0">{child}</div>)
            : children}
        </div>
      </div>
      {arrows ? (
        <>
          <EdgeArrow side="left" shown={edges.left} top={arrowTop} onClick={() => pageEdgeSquishScroll(innerRef.current, -1)} />
          <EdgeArrow side="right" shown={edges.right} top={arrowTop} onClick={() => pageEdgeSquishScroll(innerRef.current, 1)} />
        </>
      ) : null}
    </div>
  );
}
