import { useId } from "react";

/**
 * 120-unit box where the cover spans 10..110 and the paper border 7..11.5.
 * Hung between two nails on the border; the control point sits below the chord so it sags with gravity.
 */
const P0 = { x: 9.2, y: 46 };
const P1 = { x: 19, y: 56 };
const P2 = { x: 46, y: 9.2 };
const LINK_STEP = 3.1;
const NAILS = [P0, P2];

function bezier(t: number) {
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
  };
}

const LINKS = (() => {
  const samples = Array.from({ length: 241 }, (_, i) => bezier(i / 240));
  const links: { x: number; y: number; angle: number; flat: boolean }[] = [];
  let travelled = 0;
  let next = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    travelled += Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled < next) continue;
    links.push({
      x: b.x,
      y: b.y,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      flat: links.length % 2 === 0,
    });
    next += LINK_STEP;
  }
  return links;
})();

export function StreetChain() {
  const uid = useId().replace(/:/g, "");
  const chromeId = `rf-st-chrome-${uid}`;
  const shadowId = `rf-st-chain-shadow-${uid}`;
  return (
    <svg className="absolute -inset-[10%] size-[120%] overflow-visible" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id={chromeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdfdfd" />
          <stop offset="45%" stopColor="#9aa0a8" />
          <stop offset="55%" stopColor="#eef1f4" />
          <stop offset="100%" stopColor="#5c6169" />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.5" dy="1.1" stdDeviation="0.6" floodColor="#000" floodOpacity="0.75" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        {LINKS.map(({ x, y, angle, flat }, i) => (
          <g key={i} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(1)})`}>
            {flat ? (
              <ellipse rx="2.3" ry="1.35" fill="none" stroke={`url(#${chromeId})`} strokeWidth="0.95" />
            ) : (
              <rect x="-2.4" y="-0.45" width="4.8" height="0.9" rx="0.45" fill={`url(#${chromeId})`} />
            )}
          </g>
        ))}
        {NAILS.map(({ x, y }) => (
          <g key={x}>
            <circle cx={x} cy={y} r="1.6" fill="#3a3632" />
            <circle cx={x} cy={y} r="1.15" fill={`url(#${chromeId})`} />
          </g>
        ))}
      </g>
    </svg>
  );
}
