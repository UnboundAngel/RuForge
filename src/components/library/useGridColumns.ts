import { useLayoutEffect, useRef, useState } from "react";

/** Narrowest a card may get per density before the grid drops a column. */
const MIN_CARD_PX: Record<string, number> = { Cozy: 380, Default: 320, Compact: 260 };
/** Wide windows grow cards instead of adding columns; seven across reads as a wall, not a feed. */
const MAX_COLUMNS: Record<string, number> = { Cozy: 3, Default: 4, Compact: 5 };
export const GRID_GAP_PX: Record<string, number> = { Cozy: 20, Default: 16, Compact: 12 };

export function gridColumnsFor(width: number, density: string): number {
  const min = MIN_CARD_PX[density] ?? MIN_CARD_PX.Default;
  const gap = GRID_GAP_PX[density] ?? GRID_GAP_PX.Default;
  const max = MAX_COLUMNS[density] ?? MAX_COLUMNS.Default;
  return Math.max(1, Math.min(max, Math.floor((width + gap) / (min + gap))));
}

/** Column count from the container's own width rather than viewport breakpoints. */
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
