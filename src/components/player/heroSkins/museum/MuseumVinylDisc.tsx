import { useId } from "react";

const GROOVE_RADII = Array.from({ length: 34 }, (_, i) => 76 + i * 3.4);

/** Antique shellac 78: brown-black body, fine grooves, cream paper label with gilt rings. */
export default function MuseumVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-mu-label-${uid}`;
  const ringPathId = `rf-mu-ring-${uid}`;
  const sheenId = `rf-mu-sheen-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="40" />
          </clipPath>
        )}
        <path id={ringPathId} d="M200 200 m-56 0 a56 56 0 1 1 112 0 a56 56 0 1 1 -112 0" />
        <radialGradient id={sheenId} cx="32%" cy="28%">
          <stop offset="0%" stopColor="rgba(255,220,170,0.1)" />
          <stop offset="100%" stopColor="rgba(255,220,170,0)" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="#140c08" />
      <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(200,160,110,0.12)" strokeWidth="1" />
      {GROOVE_RADII.map((r, i) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke={i % 4 === 0 ? "rgba(120,85,55,0.3)" : "rgba(50,32,20,0.35)"}
          strokeWidth="0.5"
        />
      ))}
      <circle cx="200" cy="200" r="195" fill={`url(#${sheenId})`} />

      <circle cx="200" cy="200" r="70" fill="#e9dcc0" />
      <circle cx="200" cy="200" r="67" fill="none" stroke="#b8923e" strokeWidth="1.6" />
      <circle cx="200" cy="200" r="45" fill="none" stroke="#b8923e" strokeWidth="1.2" />
      <text fontFamily="Georgia, serif" fontSize="8.5" letterSpacing="2.4" fill="#5a4220">
        <textPath href={`#${ringPathId}`}>OPUS · SIDE A · 78 RPM · RUFORGE RECORDING SOCIETY ·</textPath>
      </text>

      {coverSrc ? (
        <image
          href={coverSrc}
          x="160"
          y="160"
          width="80"
          height="80"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="40" fill="#cdbb95" />
      )}
      <circle cx="200" cy="200" r="41" fill="none" stroke="#8a6a2c" strokeWidth="1.4" />
      <circle cx="200" cy="200" r="5.5" fill="#140c08" stroke="#b8923e" strokeWidth="1" />
    </svg>
  );
}
