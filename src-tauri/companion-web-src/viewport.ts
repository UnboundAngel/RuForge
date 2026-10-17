import { useEffect, useState } from "react";

type NavigatorStandalone = Navigator & { standalone?: boolean };

function isStandalone(): boolean {
  return (navigator as NavigatorStandalone).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function safeAreaTop(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

// iOS home screen apps drawn under a translucent status bar get a layout viewport one status
// bar shorter than the screen while the page is pinned to the top edge (WebKit 301994), so
// `100%` stops short of the bottom. Content under the status bar (a top inset) is the tell;
// the app is then exactly screen-sized. With an opaque bar `100%` is already right.
function measure(): number | null {
  if (!isStandalone() || safeAreaTop() === 0) return null;
  const { width, height } = window.screen;
  const portrait = window.innerHeight >= window.innerWidth;
  const screenW = portrait ? Math.min(width, height) : Math.max(width, height);
  // iPad split view and stage manager windows are not screen-sized; trust the browser there.
  if (Math.abs(window.innerWidth - screenW) > 2) return null;
  return portrait ? Math.max(width, height) : Math.min(width, height);
}

/** Pixel height for the app shell, or null when CSS `100%` is already right. */
export function useAppViewport(): number | null {
  const [h, setH] = useState(measure);
  useEffect(() => {
    const sync = () => setH(measure());
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);
  return h;
}
