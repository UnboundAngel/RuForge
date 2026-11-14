import { useCallback, useRef, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import type { SwapDirection } from "@/components/motion/PageSwap";

/**
 * Direction of the current page swap. AnimatePresence reads the latest value for the exiting page,
 * so it is derived in render from where the library was last mounted.
 */
export function useLibraryPageMotion({
  filter,
  pageKey,
  scrollRef,
  homeScrollTopRef,
  resetChrome,
}: {
  filter: string;
  pageKey: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  homeScrollTopRef: RefObject<number>;
  resetChrome: () => void;
}) {
  const reduce = useReducedMotion();
  const mountedRef = useRef<{ key: string; isPage: boolean } | null>(null);
  const prev = mountedRef.current;
  const direction: SwapDirection = pageKey ? "forward" : prev?.isPage ? "back" : "tab";
  const isPage = !!pageKey;

  // Runs when the incoming page mounts, so the outgoing page never visibly jumps and the new one
  // appears already at its scroll position.
  const onEnter = useCallback(
    (key: string) => {
      const last = mountedRef.current;
      if (last?.key === key) return;
      mountedRef.current = { key, isPage };
      const el = scrollRef.current;
      if (!el || !last) return;
      if (isPage) el.scrollTop = 0;
      else if (last.isPage) el.scrollTop = homeScrollTopRef.current;
      else {
        resetChrome();
        el.scrollTop = 0;
      }
    },
    [isPage, scrollRef, homeScrollTopRef, resetChrome],
  );

  return { reduce, direction, onEnter, bodyKey: pageKey ?? `home:${filter}` };
}
