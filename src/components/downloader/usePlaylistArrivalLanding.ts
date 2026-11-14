import { useEffect } from "react";
import { animate, cubicBezier } from "motion/react";

import {
  claimPlaylistArrivals,
  findPlaylistCardCover,
  usePlaylistArrivals,
  type PlaylistArrival,
} from "../../lib/playlistFlyTargets";
import { useRuforgeStore } from "../../store/ruforgeStore";

const FLIGHT_SEC = 0.8;
const STAGGER_SEC = 0.09;
/** Matches the round thumbnail on the sidebar button so each flight starts as that chip. */
const RAIL_THUMB_PX = 32;
const COVER_RADIUS_PX = 16;
const POLL_MS = 300;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const EASE_X = cubicBezier(0.22, 1, 0.36, 1);
const EASE_Y = cubicBezier(0.6, 0, 0.3, 1);
const EASE_SCALE = cubicBezier(0.5, 0, 0.2, 1);
const EASE_CLIP = cubicBezier(0.7, 0, 0.2, 1);

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

/**
 * One thumbnail from the sidebar button into the card cover. The flyer owns a clone of the image
 * decoded at finish and never changes its src, so it stays visible while the library regenerates
 * the card's own previews underneath.
 */
async function flyOne(cover: HTMLElement, arrival: PlaylistArrival, delaySec: number): Promise<void> {
  if (!arrival.image) return;
  const target = cover.getBoundingClientRect();
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
    opacity: "0",
    willChange: "transform, clip-path",
  });
  const img = arrival.image.cloneNode() as HTMLImageElement;
  img.alt = "";
  img.draggable = false;
  Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
  ghost.appendChild(img);
  document.body.appendChild(ghost);

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ghost.style.transform = `translate(${target.left}px, ${target.top}px)`;
      ghost.style.borderRadius = `${COVER_RADIUS_PX}px`;
      await animate(ghost, { opacity: [0, 1, 0] }, { duration: 0.3, delay: delaySec });
      return;
    }
    const from = railAnchorCenter();
    let last = target;
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
    if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000));
    ghost.style.opacity = "1";
    await animate(0, 1, { duration: FLIGHT_SEC, ease: "linear", onUpdate: frame });
    // Hand over to the card's own cover with a short fade instead of a pop.
    await animate(ghost, { opacity: [1, 0] }, { duration: 0.18 });
  } finally {
    ghost.remove();
  }
}

/**
 * Plays waiting playlist videos into their card the first time that card is on screen with nothing
 * covering the library. Mounted once, from the sidebar download button.
 */
export function usePlaylistArrivalLanding(): void {
  const groups = usePlaylistArrivals((s) => s.groups);
  const covered = useRuforgeStore((s) => s.downloaderOpen || s.settingsOpen);
  const waiting = Object.keys(groups).length > 0;

  useEffect(() => {
    if (!waiting || covered) return;
    const tick = () => {
      for (const [id, group] of Object.entries(usePlaylistArrivals.getState().groups)) {
        const cover = findPlaylistCardCover(group.keys);
        if (!cover || !mostlyOnScreen(cover)) continue;
        const claimed = claimPlaylistArrivals(id);
        if (!claimed) continue;
        const ordered = [...claimed.arrivals].sort((a, b) => b.at - a.at);
        ordered.forEach((arrival, i) => {
          void flyOne(cover, arrival, i * STAGGER_SEC);
        });
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, covered]);
}
