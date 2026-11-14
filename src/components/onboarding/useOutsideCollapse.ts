import { useEffect, useRef, type RefObject } from "react";

import { LIGHTBOX_ATTR } from "./ExpandedDemo";

/**
 * Fires on a pointerdown outside `rootRef`. Capture phase and never stops the event,
 * so the click still reaches whatever the user pressed (a tab collapses the island and opens).
 */
export function useOutsideCollapse(
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onOutside: () => void,
): void {
  const cbRef = useRef(onOutside);
  cbRef.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest(`[${LIGHTBOX_ATTR}]`)) return;
      cbRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [enabled, rootRef]);
}
