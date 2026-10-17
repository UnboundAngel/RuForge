import { useEffect, useRef, useState, type ReactNode } from "react";

/** Put on the cover inside each card; covers scale toward the edge that clips them. */
export const SQUISH_COVER = { "data-squish-cover": "" } as const;

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

/** Port of desktop `EdgeSquishScroll` without the hover arrows, which touch screens never show. */
function SquishRow({ children }: { children: ReactNode }) {
  const clipRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const clip = clipRef.current;
    const scroll = scrollRef.current;
    if (!clip || !scroll) return;
    let last = "";
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
      const covers = [...scroll.querySelectorAll<HTMLElement>("[data-squish-cover]")];
      // All reads before any transform write, or each cover forces its own style recalc.
      const rects = covers.map((c) => c.getBoundingClientRect());
      covers.forEach((c, i) => squish(c, rects[i]!, bounds));
    };
    const ro = new ResizeObserver(sync);
    ro.observe(scroll);
    ro.observe(clip);
    const mo = new MutationObserver(sync);
    mo.observe(scroll, { childList: true, subtree: true });
    scroll.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => {
      scroll.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div
      ref={clipRef}
      className="ph-squish-clip"
      data-fade-left={edges.left ? "true" : undefined}
      data-fade-right={edges.right ? "true" : undefined}
    >
      <div ref={scrollRef} className="ph-squish-row">
        {children}
      </div>
    </div>
  );
}

export function Shelf({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ph-shelf">
      <div className="ph-shelf-head">
        <h2 className="ph-shelf-title">{title}</h2>
        {action}
      </div>
      <SquishRow>{children}</SquishRow>
    </section>
  );
}
