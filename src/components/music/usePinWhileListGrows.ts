import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/** How long after a playlist change the tracklist may still be animating its rows. */
const PIN_MS = 900;

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === "auto" || y === "scroll") return p;
  }
  return null;
}

/**
 * Keeps `ref` still on screen while the tracklist above it grows or shrinks, by scrolling the
 * page the same distance. Chromium's scroll anchoring picks a visible tracklist row as its
 * anchor, so on its own the Recommended shelf jumps a row every time a song lands.
 * Scroll events fire before animation frames, so any movement left at frame time is layout,
 * never the user's own scrolling.
 */
export function usePinWhileListGrows(ref: RefObject<HTMLElement | null>, listLength: number): void {
  const lastTop = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const seenLength = useRef(listLength);
  if (seenLength.current !== listLength) {
    seenLength.current = listLength;
    // Render runs before the commit, so this is still where the section sat before the list changed.
    if (ref.current) lastTop.current = ref.current.getBoundingClientRect().top;
  }

  useEffect(() => {
    const el = ref.current;
    const scroller = el && scrollParent(el);
    if (!el || !scroller) return;
    scrollerRef.current = scroller;
    const record = () => {
      lastTop.current = el.getBoundingClientRect().top;
    };
    record();
    scroller.addEventListener("scroll", record, { passive: true });
    return () => scroller.removeEventListener("scroll", record);
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller || lastTop.current === null) return;
    const onScreen = () => {
      const view = scroller.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.top < view.bottom && r.bottom > view.top;
    };
    const settle = () => {
      const top = el.getBoundingClientRect().top;
      if (lastTop.current !== null && top !== lastTop.current && onScreen()) {
        scroller.scrollTop += top - lastTop.current;
      }
      lastTop.current = el.getBoundingClientRect().top;
    };
    // Before paint: catches rows that appear at full height.
    settle();
    const until = performance.now() + PIN_MS;
    let frame = 0;
    const tick = (now: number) => {
      settle();
      if (now < until) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, listLength]);
}
