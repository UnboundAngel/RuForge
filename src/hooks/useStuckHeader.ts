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
 * 1px sentinel right above the header; once it scrolls above the pin line, the header is stuck.
 * `offsetTop` is the header's sticky `top`, for headers that pin below another one.
 */
export function useStuckHeader(offsetTop = 0) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = scrollParentOf(el);
    // Measured on scroll, not IntersectionObserver: a fast jump can carry the sentinel from
    // above the pane to below it without an intersection change, leaving a stale "stuck".
    let frame = 0;
    let current = false;
    const measure = () => {
      frame = 0;
      const rootRect = root?.getBoundingClientRect();
      // Rects are post-transform; a modal opening at scale 0.98 would shrink the gap and read as stuck.
      const scale = root && rootRect && root.offsetHeight > 0 ? rootRect.height / root.offsetHeight : 1;
      const gap = (el.getBoundingClientRect().top - (rootRect?.top ?? 0)) / (scale || 1);
      // At rest the sentinel sits exactly on the pin line, and smooth scrolling settles on
      // fractional offsets. Separate on/off lines keep it from flip-flopping there.
      const next = current ? gap < offsetTop - 0.25 : gap < offsetTop - 1;
      if (next !== current) {
        current = next;
        setStuck(next);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: HTMLElement | Window = root ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [offsetTop]);
  return { sentinelRef, stuck };
}
