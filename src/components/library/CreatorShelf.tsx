import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "./LibraryHome";

const ARROW =
  "flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-stone-300 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.12] hover:text-stone-50 active:scale-95 disabled:pointer-events-none disabled:opacity-30";
const EDGE_FADE_PX = 48;

/** A titled row that scrolls sideways; the arrows page by one screen of cards. */
export function CreatorShelf({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [children]);

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edges.left ? `transparent, black ${EDGE_FADE_PX}px` : "black"}, ${
    edges.right ? `black calc(100% - ${EDGE_FADE_PX}px), transparent` : "black"
  })`;

  return (
    <section>
      <SectionTitle>
        {title}
        {aside}
        {edges.left || edges.right ? (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => page(-1)} disabled={!edges.left} className={ARROW} aria-label="Scroll left">
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <button type="button" onClick={() => page(1)} disabled={!edges.right} className={ARROW} aria-label="Scroll right">
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </span>
        ) : null}
      </SectionTitle>
      <div
        ref={scrollRef}
        className="-mt-2 overflow-x-auto overflow-y-hidden pt-2 pb-2"
        style={{ scrollbarWidth: "none", maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
    </section>
  );
}
