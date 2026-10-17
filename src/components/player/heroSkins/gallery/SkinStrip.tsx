import { useEffect, useRef, type ReactNode } from "react";
import { EdgeSquishScroll } from "@/components/ui/EdgeSquishScroll";

/** Horizontal rail: wheel scrolls sideways, edges fade + show arrows while there is more to see. */
export function SkinStrip({ selected, children }: { selected: number; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const item = railRef.current?.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <EdgeSquishScroll
      scrollRef={railRef}
      arrows
      wrapItems={false}
      wheelScroll
      className="pointer-events-auto h-[clamp(120px,18vh,200px)] shrink-0"
      contentClassName="h-full gap-[clamp(10px,1.2vw,18px)] px-2 pt-2 pb-0"
    >
      {children}
    </EdgeSquishScroll>
  );
}
