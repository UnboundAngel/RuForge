import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";

/** Grace after playback starts (or the pointer leaves) so the chrome does not vanish under a fresh click. */
const HIDE_DELAY_MS = 1200;
/** Pointer this close to the top or left window edge brings the chrome back. */
const REVEAL_EDGE_PX = 16;

function videoPlayingNow(): boolean {
  const snap = getMainPlaybackBridge();
  return getMainPlaybackBridgeOwner() === "player-video" && snap != null && !snap.paused;
}

/** Title band and rail sizes per density; must match `--rf-titlebar-h` and `--rf-rail-w` in `index.css`. */
function chromeBounds(): { top: number; left: number } {
  const compact = document.documentElement.dataset.rfDensity === "compact";
  return compact ? { top: 42, left: 44 } : { top: 48, left: 56 };
}

/**
 * True while the title band and rail should fold into the window rim: `active` (setting on, player showing),
 * the video is playing, and the pointer is away from where the chrome lives.
 */
export function useAutoHideChrome(active: boolean): boolean {
  const playing = useSyncExternalStore(subscribeMainPlaybackBridge, videoPlayingNow);
  const [nearChrome, setNearChrome] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    if (!active) {
      setNearChrome(false);
      return;
    }
    const onMove = (e: MouseEvent) => {
      const { top, left } = chromeBounds();
      const near = hiddenRef.current
        ? e.clientY <= REVEAL_EDGE_PX || e.clientX <= REVEAL_EDGE_PX
        : e.clientY <= top || e.clientX <= left;
      setNearChrome(near);
    };
    const onLeave = () => setNearChrome(false);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [active]);

  const wantHidden = active && playing && !nearChrome;
  useEffect(() => {
    if (!wantHidden) {
      setHidden(false);
      return;
    }
    const t = window.setTimeout(() => setHidden(true), HIDE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [wantHidden]);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.dataset.rfChromeHidden = "1";
    else delete root.dataset.rfChromeHidden;
    return () => {
      delete root.dataset.rfChromeHidden;
    };
  }, [hidden]);

  return hidden;
}
