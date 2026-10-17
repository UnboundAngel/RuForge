import { useLayoutEffect, useRef, useState } from "react";

/** Narrowest a card may get before the grid drops a column. */
const MIN_CARD_PX = 320;
/** Wide windows grow cards instead of adding columns; seven across reads as a wall, not a feed. */
const MAX_COLUMNS = 4;
/** Matches `--rf-grid-gap-x` in `index.css`. */
export const GRID_GAP_PX = 16;

export function gridColumnsFor(width: number): number {
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GRID_GAP_PX) / (MIN_CARD_PX + GRID_GAP_PX))));
}

/** Column count from the container's own width rather than viewport breakpoints. */
export function useGridColumns<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(gridColumnsFor(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, columns };
}
