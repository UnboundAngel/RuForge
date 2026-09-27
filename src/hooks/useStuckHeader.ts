import { useEffect, useRef, useState } from "react";

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

/**
 * True while a sticky header has content scrolled under it. Put the returned ref on a
 * 1px sentinel right above the header; once it leaves the scroll pane, the header is stuck.
 */
export function useStuckHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      root: scrollParentOf(el),
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { sentinelRef, stuck };
}
