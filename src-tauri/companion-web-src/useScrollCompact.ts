import { useEffect, useRef, useState } from "react";

/** Same thresholds as the desktop Music home header: compact past 44px, back below 10px. */
export function useScrollCompact<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>(".ph-scroll");
    if (!scroller) return;
    const sync = () => {
      const y = scroller.scrollTop;
      setCompact((prev) => (!prev && y > 44 ? true : prev && y < 10 ? false : prev));
    };
    scroller.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => scroller.removeEventListener("scroll", sync);
  }, []);

  return { ref, compact };
}
