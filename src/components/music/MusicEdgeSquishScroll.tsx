import {
  Children,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroller that squishes cover nodes toward the clipped edge
 * (same feel as Music Profile rows). Mark covers with `data-profile-scroll-cover`.
 */
export function MusicEdgeSquishScroll({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  useEffect(() => {
    const clip = clipRef.current;
    const scroll = scrollRef.current;
    if (!clip || !scroll) return;

    const applyCoverSquish = (cover: HTMLElement, ratio: number, rootBounds: DOMRect) => {
      if (ratio >= 0.995) {
        cover.style.transform = "";
        cover.style.transformOrigin = "";
        return;
      }

      const scale = 0.88 + ratio * 0.12;
      const rect = cover.getBoundingClientRect();
      const clipRight = rect.right > rootBounds.right + 0.5;
      const clipLeft = rect.left < rootBounds.left - 0.5;
      cover.style.transform = `scale(${scale.toFixed(3)})`;
      cover.style.transformOrigin = clipRight && !clipLeft
        ? "right center"
        : clipLeft && !clipRight
          ? "left center"
          : "center center";
    };

    const sync = () => {
      const rootBounds = clip.getBoundingClientRect();
      const overflow = scroll.scrollWidth > scroll.clientWidth + 4;
      setFadeLeft(overflow && scroll.scrollLeft > 4);
      setFadeRight(overflow && scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 4);

      for (const item of scroll.children) {
        if (!(item instanceof HTMLElement)) continue;
        const cover = item.querySelector<HTMLElement>("[data-profile-scroll-cover]");
        if (!cover) continue;

        const rect = cover.getBoundingClientRect();
        const visibleLeft = Math.max(rect.left, rootBounds.left);
        const visibleRight = Math.min(rect.right, rootBounds.right);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const ratio = rect.width > 0 ? visibleWidth / rect.width : 1;
        applyCoverSquish(cover, ratio, rootBounds);
      }
    };

    sync();
    scroll.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(scroll);
    ro.observe(clip);
    const mo = new MutationObserver(sync);
    mo.observe(scroll, { childList: true, subtree: true });

    return () => {
      scroll.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={clipRef}
      className={cn("rf-profile-scroll-clip overflow-hidden min-w-0", className)}
      data-fade-left={fadeLeft ? "true" : undefined}
      data-fade-right={fadeRight ? "true" : undefined}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-3 overflow-x-auto pb-1 px-0.5 scroll-smooth rf-scrollbar rf-scrollbar-hover",
          contentClassName,
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {Children.map(children, (child) => (
          <div
            key={child && typeof child === "object" && "key" in child ? child.key : undefined}
            className="shrink-0"
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
