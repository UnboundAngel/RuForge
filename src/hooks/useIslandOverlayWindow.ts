import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

import {
  islandOverlayTransitionBounds,
  type IslandOverlayBounds,
} from "@/lib/islandOverlayBounds";

const SETTLE_MS = 600;
const MONITOR_POLL_MS = 750;
const CURSOR_POLL_MS = 50;
/** Set on the element wrapping the pill in `IslandOverlayApp`. */
const ISLAND_HIT_SELECTOR = "[data-island-hit]";

function sendBounds(bounds: IslandOverlayBounds) {
  void invoke("sync_island_overlay_bounds", bounds).catch(() => {});
}

export function useIslandOverlayBounds(width: number, height: number) {
  const appliedRef = useRef<IslandOverlayBounds | null>(null);

  useEffect(() => {
    const { now, settle } = islandOverlayTransitionBounds(appliedRef.current, { width, height });
    appliedRef.current = now;
    sendBounds(now);
    if (!settle) return;
    const timer = window.setTimeout(() => {
      appliedRef.current = settle;
      sendBounds(settle);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [width, height]);
}

/** Follows the user's foreground window to another monitor. Held while expanded so it never jumps mid-use. */
export function useIslandFollowActiveMonitor(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void invoke("island_follow_active_monitor").catch(() => {});
    }, MONITOR_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}

/**
 * Windows treats the transparent part of the overlay as solid, so clicks next to the pill would
 * land on RuForge. Ignore cursor events unless the cursor is over the pill; since an ignoring window
 * receives no mouse events, the cursor position is polled instead.
 */
export function useIslandClickThrough(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let ignoring: boolean | null = null;
    let buttonDown = false;
    let probing = false;

    const setIgnoring = (next: boolean) => {
      if (ignoring === next) return;
      ignoring = next;
      void invoke("set_island_click_through", { ignore: next }).catch(() => {});
    };

    const probe = async () => {
      if (probing) return;
      probing = true;
      try {
        const pos = await invoke<[number, number] | null>("island_cursor_position");
        if (cancelled || buttonDown) return;
        const hit = pos ? document.elementFromPoint(pos[0], pos[1]) : null;
        setIgnoring(!hit?.closest(ISLAND_HIT_SELECTOR));
      } catch {
        /* ignore */
      } finally {
        probing = false;
      }
    };

    const onDown = () => {
      buttonDown = true;
    };
    const onUp = () => {
      buttonDown = false;
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onUp);

    void probe();
    const timer = window.setInterval(() => void probe(), CURSOR_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onUp);
      void invoke("set_island_click_through", { ignore: false }).catch(() => {});
    };
  }, [enabled]);
}
