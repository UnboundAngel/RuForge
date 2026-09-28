import { useId } from "react";

const GROOVE_RADII = Array.from({ length: 16 }, (_, i) => 66 + i * 5.6);
const CONCHO_COUNT = 8;
const CONCHO_RADIUS = 170;

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

const CONCHOS = Array.from({ length: CONCHO_COUNT }, (_, i) => {
  const a = (i / CONCHO_COUNT) * Math.PI * 2;
  const cx = 200 + Math.cos(a) * CONCHO_RADIUS;
  const cy = 200 + Math.sin(a) * CONCHO_RADIUS;
  return { cx, cy, star: starPath(cx, cy, 8, 3.4) };
});

export default function CountryVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-cw-label-${uid}`;
  const leatherId = `rf-cw-leather-${uid}`;
  const silverId = `rf-cw-silver-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="44" />
          </clipPath>
        )}
        <radialGradient id={leatherId} cx="50%" cy="50%" r="50%">
          <stop offset="72%" stopColor="#3d2311" />
          <stop offset="86%" stopColor="#6b4020" />
          <stop offset="100%" stopColor="#2e190a" />
        </radialGradient>
        <radialGradient id={silverId} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f4f1ea" />
          <stop offset="55%" stopColor="#a9a39a" />
          <stop offset="100%" stopColor="#4d4842" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill={`url(#${leatherId})`} />
      <circle cx="200" cy="200" r="190" fill="none" stroke="#f1e4c8" strokeOpacity="0.75" strokeWidth="1.6" strokeDasharray="5 4" />
      <circle cx="200" cy="200" r="151" fill="none" stroke="#f1e4c8" strokeOpacity="0.75" strokeWidth="1.6" strokeDasharray="5 4" />
      <circle cx="200" cy="200" r="146" fill="#130d09" stroke="#1e1208" strokeWidth="2" />

      {GROOVE_RADII.map((r, i) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke={i % 4 === 0 ? "rgba(150,100,50,0.22)" : "rgba(60,40,25,0.35)"}
          strokeWidth="0.6"
        />
      ))}

      {CONCHOS.map(({ cx, cy, star }, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="12" fill={`url(#${silverId})`} stroke="#2b2620" strokeWidth="1.2" />
          <circle cx={cx} cy={cy} r="9.5" fill="none" stroke="#3a352f" strokeOpacity="0.6" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
          <path d={star} fill="#b8893a" stroke="#4a3210" strokeWidth="0.8" strokeLinejoin="round" />
        </g>
      ))}

      {coverSrc ? (
        <image
          href={coverSrc}
          x="156"
          y="156"
          width="88"
          height="88"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="44" fill="#5c3b1c" />
      )}
      <circle cx="200" cy="200" r="45" fill="none" stroke="#b8893a" strokeWidth="3" />
      <circle cx="200" cy="200" r="6" fill="#000" stroke="#b8893a" strokeWidth="1.5" />
    </svg>
  );
}
