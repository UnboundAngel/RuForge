import { useEffect } from "react";

type Axis = "y" | "x";
type Anim = { target: number; pos: number; vel: number; raf: number; written: number };
type PerEl = Partial<Record<Axis, Anim>>;

/**
 * Critically damped spring rate for the glide: about 6.6 / OMEGA to settle (~700ms), and it
 * eases in as well as out, which is what makes it read as smoother than the native wheel step.
 */
const OMEGA = 9.5;
/** Elements that use the wheel for something other than scrolling opt out with the attribute; native inputs always do. */
const OWN_WHEEL = "[data-native-wheel], input[type=range], input[type=number], select";

const propOf = (axis: Axis) => (axis === "y" ? "scrollTop" : "scrollLeft");
const maxOf = (el: HTMLElement, axis: Axis) =>
  axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;

function scrollable(el: Element, axis: Axis, dir: number): boolean {
  const cs = getComputedStyle(el);
  if (!/auto|scroll|overlay/.test(axis === "y" ? cs.overflowY : cs.overflowX)) return false;
  const h = el as HTMLElement;
  if (maxOf(h, axis) <= 1) return false;
  return dir > 0 ? h[propOf(axis)] < maxOf(h, axis) - 1 : h[propOf(axis)] > 0;
}

/** Nearest ancestor that can still move in this direction, so scroll chaining behaves like native. */
function findScroller(start: EventTarget | null, axis: Axis, dir: number): HTMLElement | null {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (scrollable(el, axis, dir)) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

/**
 * Turns wheel notches into a spring-eased glide of the nearest scroller. Capture phase and
 * non-passive so it wins over the app's scrollers and WebView2's own step; the listener exists
 * only while enabled.
 */
export function useSmoothWheel(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const active = new Map<HTMLElement, PerEl>();

    const run = (el: HTMLElement, axis: Axis, anim: Anim) => {
      const key = axis === "y" ? "top" : "left";
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        anim.vel += (-2 * OMEGA * anim.vel - OMEGA * OMEGA * (anim.pos - anim.target)) * dt;
        anim.pos += anim.vel * dt;
        const settled = Math.abs(anim.target - anim.pos) < 0.3 && Math.abs(anim.vel) < 3;
        const to = settled ? anim.target : anim.pos;
        // Skip sub-quarter-pixel writes: each one costs a scroll event and a custom-scrollbar relayout for no visible change.
        if (settled || Math.abs(to - anim.written) >= 0.25) {
          el.scrollTo({ [key]: to, behavior: "instant" });
          anim.written = to;
        }
        if (settled) {
          const per = active.get(el);
          if (per) delete per[axis];
        } else anim.raf = requestAnimationFrame(tick);
      };
      anim.raf = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof Element && e.target.closest(OWN_WHEEL)) return;
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const axis: Axis = horizontal ? "x" : "y";
      let delta = horizontal && e.deltaX === 0 ? e.deltaY : horizontal ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      if (e.deltaMode === 1) delta *= 40;
      else if (e.deltaMode === 2) delta *= innerHeight;
      const el = findScroller(e.target, axis, Math.sign(delta));
      if (!el) return;
      e.preventDefault();
      // Element-level wheel handlers must not scroll the same box a second time.
      e.stopPropagation();
      const per = active.get(el) ?? {};
      active.set(el, per);
      const running = per[axis];
      if (running) {
        running.target = Math.max(0, Math.min(maxOf(el, axis), running.target + delta));
        return;
      }
      const at = el[propOf(axis)];
      const anim: Anim = { target: Math.max(0, Math.min(maxOf(el, axis), at + delta)), pos: at, vel: 0, raf: 0, written: at };
      per[axis] = anim;
      run(el, axis, anim);
    };

    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      active.forEach((per) => Object.values(per).forEach((a) => cancelAnimationFrame(a.raf)));
    };
  }, [enabled]);
}
