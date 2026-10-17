import { useEffect, useRef } from "react";

/** Runs `cb` every frame while `active`; when inactive it paints one still frame and parks. */
export function useRafLoop(cb: (now: number, dt: number) => void, active = true) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!active) {
      const raf = requestAnimationFrame((now) => cbRef.current(now, 0));
      return () => cancelAnimationFrame(raf);
    }
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      cbRef.current(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
