import { useId } from "react";
import { jitter } from "./jagged";

const GROOVE_RADII = Array.from({ length: 26 }, (_, i) => 70 + i * 4.4);

const SCRATCHES = Array.from({ length: 16 }, (_, i) => {
  const r = 75 + jitter(i) * 110;
  const start = jitter(i + 30) * Math.PI * 2;
  const sweep = (0.15 + jitter(i + 60) * 0.5) * (jitter(i + 90) > 0.5 ? 1 : -1);
  const p = (a: number) => `${(200 + Math.cos(a) * r).toFixed(1)},${(200 + Math.sin(a) * r).toFixed(1)}`;
  return `M${p(start)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 ${sweep > 0 ? 1 : 0} ${p(start + sweep)}`;
});

/** Beat-up record: scratches, pink paper label, marker scrawl. */
export default function PunkVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-pk-label-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="34" />
          </clipPath>
        )}
      </defs>

      <circle cx="200" cy="200" r="198" fill="#0b0b0b" />
      {GROOVE_RADII.map((r, i) => (
        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke={i % 3 === 0 ? "rgba(70,70,70,0.4)" : "rgba(35,35,35,0.4)"} strokeWidth="0.6" />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.7" strokeLinecap="round">
        {SCRATCHES.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      <circle cx="200" cy="200" r="60" fill="#ff2e88" />
      <path
        d="M146 200 C146 170 170 145 201 146 C232 147 255 171 254 201 C253 231 229 255 199 254 C170 253 147 229 147 203"
        fill="none"
        stroke="#111"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text x="200" y="176" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="12" letterSpacing="1.5" fill="#111">
        SIDE A
      </text>
      {coverSrc ? (
        <image href={coverSrc} x="166" y="166" width="68" height="68" clipPath={`url(#${labelClipId})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <circle cx="200" cy="200" r="34" fill="#111" />
      )}
      <path d="M222 236 L238 250 M238 236 L222 250" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      <circle cx="200" cy="200" r="5.5" fill="#0b0b0b" stroke="#111" strokeWidth="1" />
    </svg>
  );
}
