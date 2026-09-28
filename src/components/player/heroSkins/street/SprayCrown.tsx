import { useId } from "react";

const SPRAY_GOLD = "#f2c14e";
/** Hand-wobbled, not symmetric, so it reads as painted rather than an icon. */
const CROWN = "M9 60 C10 48 11 34 13 23 L31 45 C37 33 44 21 51 11 L69 43 C75 36 81 29 88 22 C89 34 90 47 91 59 C64 61 36 62 9 60 Z";
const TIPS = [
  { x: 13, y: 22, r: 4.4 },
  { x: 51, y: 10, r: 4.8 },
  { x: 88, y: 21, r: 4 },
];
const DRIPS = [
  { x: 19, y: 60.5, len: 9, w: 1.7 },
  { x: 33, y: 61.2, len: 21, w: 1.4 },
  { x: 58, y: 60.6, len: 14, w: 1.9 },
  { x: 84, y: 59.4, len: 26, w: 1.3 },
  { x: 51, y: 15, len: 7, w: 1.2 },
];

export function SprayCrown() {
  const uid = useId().replace(/:/g, "");
  const paintId = `rf-st-paint-${uid}`;
  const mistId = `rf-st-mist-${uid}`;

  const strokes = (
    <>
      <path d={CROWN} fill="none" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
      {TIPS.map(({ x, y, r }) => (
        <circle key={x} cx={x} cy={y} r={r} stroke="none" />
      ))}
    </>
  );

  return (
    <svg
      className="absolute w-[27%] overflow-visible opacity-90"
      style={{ left: "56%", top: "-31%", transform: "translateX(-50%) rotate(-9deg)" }}
      viewBox="0 0 100 95"
      aria-hidden
    >
      <defs>
        {/* Displaced edges, then speckled coverage so brick shows through like real spray. */}
        <filter id={paintId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="1" seed="8" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.45"
            result="speck"
          />
          <feComposite in="rough" in2="speck" operator="in" />
        </filter>
        <filter id={mistId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      <g stroke={SPRAY_GOLD} fill={SPRAY_GOLD} strokeWidth="10" opacity="0.22" filter={`url(#${mistId})`}>
        {strokes}
      </g>
      <g stroke={SPRAY_GOLD} fill={SPRAY_GOLD} filter={`url(#${paintId})`}>
        {strokes}
        {DRIPS.map(({ x, y, len, w }) => (
          <g key={x}>
            <path d={`M${x} ${y} Q${x + 0.4} ${y + len * 0.6} ${x - 0.2} ${y + len}`} fill="none" strokeWidth={w} strokeLinecap="round" />
            <ellipse cx={x - 0.2} cy={y + len + 0.6} rx={w * 0.85} ry={w * 1.15} stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}
