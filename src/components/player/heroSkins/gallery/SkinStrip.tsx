import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE = "48px";

/** Horizontal rail: wheel scrolls sideways, edges fade + show chevrons while there is more to see. */
export function SkinStrip({ selected, children }: { selected: number; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useLayoutEffect(() => {
    const el = railRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const item = railRef.current?.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);

  const page = (dir: 1 | -1) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.right ? "transparent" : "#000"})`;

  return (
    <div className="pointer-events-auto relative h-[clamp(120px,18vh,200px)] shrink-0">
      <div
        ref={railRef}
        onScroll={measure}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
        className="flex h-full gap-[clamp(10px,1.2vw,18px)] overflow-x-auto overflow-y-hidden px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mask }}
      >
        {children}
      </div>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => page(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? "Scroll skins left" : "Scroll skins right"}
          className={cn(
            "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white/70 ring-1 ring-white/15 backdrop-blur-sm transition-[opacity,color] duration-200 hover:text-white",
            side === "left" ? "-left-4" : "-right-4",
            edges[side] ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {side === "left" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      ))}
    </div>
  );
}
