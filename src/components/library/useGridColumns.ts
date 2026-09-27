import { useLayoutEffect, useRef, useState } from "react";

/** Narrowest a card may get per density before the grid drops a column. */
const MIN_CARD_PX: Record<string, number> = { Cozy: 380, Default: 300, Compact: 240 };
export const GRID_GAP_PX: Record<string, number> = { Cozy: 20, Default: 16, Compact: 12 };

export function gridColumnsFor(width: number, density: string): number {
  const min = MIN_CARD_PX[density] ?? MIN_CARD_PX.Default;
  const gap = GRID_GAP_PX[density] ?? GRID_GAP_PX.Default;
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

/**
 * Column count from the container's own width rather than breakpoints, so the page knows where
 * row two ends and can slot the feed shelf in after it.
 */
export function useGridColumns<T extends HTMLElement>(density: string) {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(gridColumnsFor(el.clientWidth, density));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [density]);
  return { ref, columns };
}
