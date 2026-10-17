import { type RefObject, useLayoutEffect, useState } from "react";
import { animate, cubicBezier } from "motion/react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { arrivalKey, claimLibraryArrival, useLibraryArrivals } from "./libraryArrivals";

const FLIGHT_SEC = 0.8;
/** Matches the round download thumb on the sidebar rail so the flight starts as that chip. */
const RAIL_THUMB_PX = 32;
const COVER_RADIUS_PX = 16;

function mostlyOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.height <= 0) return false;
  const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return visible / r.height >= 0.6;
}

function railAnchorCenter(): { x: number; y: number } {
  const rail = document.querySelector<HTMLElement>('[data-rail-tab="downloader"]');
  if (!rail) return { x: 32, y: 96 };
  const r = rail.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Horizontal leads and vertical lags, so the path bows out of the rail instead of a straight diagonal.
const EASE_X = cubicBezier(0.22, 1, 0.36, 1);
const EASE_Y = cubicBezier(0.6, 0, 0.3, 1);
const EASE_SCALE = cubicBezier(0.5, 0, 0.2, 1);
const EASE_CLIP = cubicBezier(0.7, 0, 0.2, 1);

async function flyIntoCover(cover: HTMLElement, thumbnail: string | null): Promise<void> {
  const target = cover.getBoundingClientRect();
  const src = thumbnail ?? cover.querySelector("img")?.src ?? null;

  const ghost = document.createElement("div");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${target.width}px`,
    height: `${target.height}px`,
    zIndex: "9000",
    pointerEvents: "none",
    overflow: "hidden",
    background: "var(--rf-well-raised)",
    transformOrigin: "50% 50%",
    transform: `translate(${target.left}px, ${target.top}px)`,
    willChange: "transform, clip-path",
  });
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
    ghost.appendChild(img);
  }
  document.body.appendChild(ghost);

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ghost.style.borderRadius = `${COVER_RADIUS_PX}px`;
      await animate(ghost, { opacity: [0, 1] }, { duration: 0.2 });
      return;
    }
    const from = railAnchorCenter();
    let last = target;
    // The slot is re-measured every frame so scrolling or a reflow mid-flight still lands in it.
    const frame = (t: number) => {
      const r = cover.isConnected ? cover.getBoundingClientRect() : last;
      if (r.height > 0) last = r;
      const { width: w, height: h } = last;
      const side = Math.max(0, (w - h) / 2) * (1 - EASE_CLIP(t));
      const radius = lerp(h / 2, COVER_RADIUS_PX, EASE_CLIP(t));
      const x = lerp(from.x, last.left + w / 2, EASE_X(t)) - w / 2;
      const y = lerp(from.y, last.top + h / 2, EASE_Y(t)) - h / 2;
      const scale = lerp(RAIL_THUMB_PX / h, 1, EASE_SCALE(t));
      ghost.style.width = `${w}px`;
      ghost.style.height = `${h}px`;
      ghost.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      ghost.style.clipPath = `inset(0px ${side}px 0px ${side}px round ${radius}px)`;
    };
    frame(0);
    await animate(0, 1, { duration: FLIGHT_SEC, ease: "linear", onUpdate: frame });
  } finally {
    ghost.remove();
  }
}

/**
 * Plays a fresh download's flight from the sidebar download button into this card's cover the first
 * time the card is on screen with nothing covering the library. Returns true while the ghost is in the air.
 */
export function useLibraryArrivalFlight(path: string, coverRef: RefObject<HTMLElement | null>): boolean {
  const pending = useLibraryArrivals((s) => arrivalKey(path) in s.arrivals);
  const covered = useRuforgeStore((s) => s.downloaderOpen || s.settingsOpen);
  const [flying, setFlying] = useState(false);

  useLayoutEffect(() => {
    if (!pending || covered) return;
    const cover = coverRef.current;
    if (!cover) return;
    let disposed = false;
    const launch = () => {
      if (disposed) return;
      const arrival = claimLibraryArrival(path);
      if (!arrival) return;
      setFlying(true);
      void flyIntoCover(cover, arrival.thumbnail).finally(() => setFlying(false));
    };
    if (mostlyOnScreen(cover)) {
      launch();
      return () => {
        disposed = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= 0.6)) {
          io.disconnect();
          launch();
        }
      },
      { threshold: [0.6] },
    );
    io.observe(cover);
    return () => {
      disposed = true;
      io.disconnect();
    };
  }, [pending, covered, path, coverRef]);

  return flying;
}
