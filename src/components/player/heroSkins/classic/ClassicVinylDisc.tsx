import { useId } from "react";

export function ClassicVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-vinyl-label-${uid}`;
  const sheenId = `rf-vinyl-sheen-${uid}`;

  const grooves: React.ReactElement[] = [];
  for (let i = 0; i < 28; i++) {
    const r = 76 + i * 4.2;
    if (r >= 194) break;
    grooves.push(
      <circle
        key={i}
        cx="200"
        cy="200"
        r={r}
        fill="none"
        stroke={i % 3 === 0 ? "rgba(55,55,55,0.35)" : "rgba(30,30,30,0.25)"}
        strokeWidth="0.5"
      />,
    );
  }

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="50" />
          </clipPath>
        )}
        <radialGradient id={sheenId} cx="30%" cy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="#0d0d0d" />
      <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

      {grooves}

      <circle cx="200" cy="200" r="195" fill={`url(#${sheenId})`} />

      <circle cx="200" cy="200" r="54" fill="#1a1510" />
      <circle cx="200" cy="200" r="53" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />

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
        <circle cx="200" cy="200" r="50" fill="#221a12" />
      )}

      <circle cx="200" cy="200" r="7" fill="#000" />
      <circle cx="200" cy="200" r="8.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  );
}
