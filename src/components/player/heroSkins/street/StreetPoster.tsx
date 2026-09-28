import { useId } from "react";

/** Deterministic jitter so the torn edge is stable across renders. */
function jitter(i: number) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Torn paper border in a 120-unit box where the cover spans 10..110; the hole overlaps the art slightly. */
const PAPER_PATH = (() => {
  const lo = 7;
  const hi = 113;
  const step = 2;
  const pts: string[] = [];
  let i = 0;
  const push = (x: number, y: number, nx: number, ny: number) => {
    const d = jitter(i++) * 2.2;
    pts.push(`${(x + nx * d).toFixed(2)},${(y + ny * d).toFixed(2)}`);
  };
  for (let x = lo; x < hi; x += step) push(x, lo, 0, -1);
  for (let y = lo; y < hi; y += step) push(hi, y, 1, 0);
  for (let x = hi; x > lo; x -= step) push(x, hi, 0, 1);
  for (let y = hi; y > lo; y -= step) push(lo, y, -1, 0);
  return `M${pts.join(" L")} Z M11.5,11.5 L11.5,108.5 L108.5,108.5 L108.5,11.5 Z`;
})();

export function StreetPoster() {
  const uid = useId().replace(/:/g, "");
  const shadowId = `rf-st-paper-shadow-${uid}`;
  return (
    <>
      <div className="st-wrinkle" />
      <div className="st-grain" />
      <svg className="absolute -inset-[10%] size-[120%] overflow-visible" viewBox="0 0 120 120" aria-hidden>
        <defs>
          <filter id={shadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.7" />
          </filter>
        </defs>
        <path d={PAPER_PATH} fillRule="evenodd" fill="#e3d8c1" filter={`url(#${shadowId})`} />
        <path d={PAPER_PATH} fillRule="evenodd" fill="none" stroke="#b7a684" strokeWidth="0.35" strokeOpacity="0.7" />
      </svg>
    </>
  );
}
