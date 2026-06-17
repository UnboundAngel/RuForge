import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

/** rAF-throttled scrub hover position; avoids full player re-renders on every mousemove pixel. */
export function useScrubberHover(scrubberRef?: RefObject<HTMLElement | null>) {
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const pendingPercentRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const commitHover = useCallback(() => {
    rafRef.current = null;
    setHoverPercent(pendingPercentRef.current);
    setIsHovering(true);
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const rect =
        scrubberRef?.current?.getBoundingClientRect() ??
        e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      pendingPercentRef.current = ((e.clientX - rect.left) / rect.width) * 100;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(commitHover);
      }
    },
    [scrubberRef, commitHover],
  );

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsHovering(false);
  }, []);

  const setHoverPercentDirect = useCallback((percent: number) => {
    pendingPercentRef.current = percent;
    setHoverPercent(percent);
    setIsHovering(true);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { hoverPercent, isHovering, onMouseMove, onMouseLeave, setHoverPercentDirect };
}
