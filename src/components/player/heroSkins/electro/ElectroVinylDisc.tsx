import { useId } from "react";

const GROOVE_RADII = Array.from({ length: 24 }, (_, i) => 66 + i * 5.2);
const PRISM_RINGS = [
  { r: 186, color: "#ff4a30" },
  { r: 183, color: "#ffc070" },
  { r: 180, color: "#48d6ff" },
  { r: 118, color: "#ff4a30" },
  { r: 115.5, color: "#48d6ff" },
];

export default function ElectroVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-ex-label-${uid}`;
  const sheenId = `rf-ex-sheen-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="48" />
          </clipPath>
        )}
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,120,60,0.14)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0)" />
          <stop offset="70%" stopColor="rgba(72,214,255,0.1)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="#050507" />
      {GROOVE_RADII.map((r) => (
        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
      ))}
      {PRISM_RINGS.map(({ r, color }) => (
        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="0.9" />
      ))}
      <circle cx="200" cy="200" r="196" fill={`url(#${sheenId})`} />

      {coverSrc ? (
        <image
          href={coverSrc}
          x="152"
          y="152"
          width="96"
          height="96"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="48" fill="#140806" />
      )}
      <circle cx="198" cy="200" r="49.5" fill="none" stroke="#ff4a30" strokeOpacity="0.8" strokeWidth="1" />
      <circle cx="202" cy="200" r="49.5" fill="none" stroke="#48d6ff" strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="200" cy="200" r="49.5" fill="none" stroke="#ffe7c0" strokeWidth="0.8" />

      <circle cx="200" cy="200" r="6" fill="#000" stroke="#ffe7c0" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}
