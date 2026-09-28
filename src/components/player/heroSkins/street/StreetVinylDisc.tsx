import { useId } from "react";

const GROOVE_RADII = Array.from({ length: 24 }, (_, i) => 68 + i * 4.6);
const STROBE_ROWS = [
  { r: 194.5, count: 120 },
  { r: 190, count: 114 },
];

const STROBE_DOTS = STROBE_ROWS.flatMap(({ r, count }) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { cx: 200 + Math.cos(a) * r, cy: 200 + Math.sin(a) * r };
  }),
);

/** Turntable platter with strobe dots, felt slipmat, record on top. */
export default function StreetVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-st-label-${uid}`;
  const platterId = `rf-st-platter-${uid}`;
  const sheenId = `rf-st-sheen-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="50" />
          </clipPath>
        )}
        <linearGradient id={platterId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e9ecef" />
          <stop offset="40%" stopColor="#8b9097" />
          <stop offset="60%" stopColor="#d7dbe0" />
          <stop offset="100%" stopColor="#5a5f66" />
        </linearGradient>
        <radialGradient id={sheenId} cx="30%" cy="28%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="199" fill={`url(#${platterId})`} />
      {STROBE_DOTS.map(({ cx, cy }, i) => (
        <circle key={i} cx={cx.toFixed(2)} cy={cy.toFixed(2)} r="1.25" fill="#1d1f22" />
      ))}
      <circle cx="200" cy="200" r="186" fill="#141414" />
      <circle cx="200" cy="200" r="184" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      <circle cx="200" cy="200" r="178" fill="#0a0a0a" />
      {GROOVE_RADII.map((r, i) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke={i % 3 === 0 ? "rgba(70,70,70,0.4)" : "rgba(35,35,35,0.4)"}
          strokeWidth="0.6"
        />
      ))}
      <circle cx="200" cy="200" r="178" fill={`url(#${sheenId})`} />

      {coverSrc ? (
        <image
          href={coverSrc}
          x="150"
          y="150"
          width="100"
          height="100"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="50" fill="#2a1a12" />
      )}
      <circle cx="200" cy="200" r="51" fill="none" stroke="#f2c14e" strokeWidth="2.2" />
      <circle cx="200" cy="200" r="6" fill={`url(#${platterId})`} stroke="#111" strokeWidth="1" />
    </svg>
  );
}
