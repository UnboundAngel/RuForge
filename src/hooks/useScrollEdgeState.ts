import { useCallback, useEffect, useRef, useState } from "react";

type ScrollEdges = {
  top: boolean;
  bottom: boolean;
};

export function useScrollEdgeState(deps: unknown[] = []) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setEdges({ top: false, bottom: false });
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight - clientHeight > 1;
    setEdges({
      top: overflow && scrollTop > 4,
      bottom: overflow && scrollTop < scrollHeight - clientHeight - 4,
    });
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver(update);
    ro.observe(el);

    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [update, ...deps]);

  return { scrollRef, edges, onScroll: update };
}
