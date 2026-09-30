import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "./LibraryHome";

const EDGE_FADE_PX = 56;

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
      className={`absolute z-10 flex h-24 w-16 -translate-y-1/2 items-center text-stone-200 transition-[opacity,color] duration-150 hover:text-[color:var(--accent)] ${
        top == null ? "top-1/3" : ""
      } ${side === "left" ? "-left-6 justify-start pl-3" : "-right-6 justify-end pr-3"} ${
        shown ? "opacity-0 group-hover/shelf:opacity-100 focus-visible:opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(18,13,11,0.85),transparent)]"
      />
      <Icon size={26} strokeWidth={2.5} className="relative" />
    </button>
  );
}

/** A titled row that scrolls sideways; edge arrows show on hover and page by one screen of cards. */
export function CreatorShelf({ title, children }: { title: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [arrowTop, setArrowTop] = useState<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
      const thumb = el.querySelector<HTMLElement>(".aspect-video");
      if (thumb) {
        const box = thumb.getBoundingClientRect();
        setArrowTop(box.top - el.getBoundingClientRect().top + box.height / 2 + el.offsetTop);
      }
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [children]);

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth - EDGE_FADE_PX), behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edges.left ? `transparent, black ${EDGE_FADE_PX}px` : "black"}, ${
    edges.right ? `black calc(100% - ${EDGE_FADE_PX}px), transparent` : "black"
  })`;

  return (
    <section className="group/shelf">
      <SectionTitle>{title}</SectionTitle>
      <div className="relative">
        {/* Card hovers paint 12px past the card; the padding keeps them inside the scroll box. */}
        <div
          ref={scrollRef}
          className="-mx-3 -mt-3 overflow-x-auto overflow-y-hidden px-3 pt-3 pb-3"
          style={{ scrollbarWidth: "none", maskImage: mask, WebkitMaskImage: mask }}
        >
          {children}
        </div>
        <EdgeArrow side="left" shown={edges.left} top={arrowTop} onClick={() => page(-1)} />
        <EdgeArrow side="right" shown={edges.right} top={arrowTop} onClick={() => page(1)} />
      </div>
    </section>
  );
}
