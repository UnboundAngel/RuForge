import { useId } from "react";

import { CARTOON_INK } from "./cartoonInk";
const GROOVE_RADII = [92, 118, 146, 172];

export default function CartoonVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-toon-label-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="50" />
          </clipPath>
        )}
      </defs>

      <circle cx="200" cy="200" r="194" fill="#111" stroke={CARTOON_INK} strokeWidth="5" />

      {GROOVE_RADII.map((r) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="2"
        />
      ))}

      <path
        d="M 72 150 A 140 140 0 0 1 150 72"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M 64 186 A 140 140 0 0 1 66 170"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M 328 250 A 140 140 0 0 1 250 328"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="5"
        strokeLinecap="round"
      />

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
      <circle cx="200" cy="200" r="51" fill="none" stroke={CARTOON_INK} strokeWidth="4" />

      <circle cx="200" cy="200" r="8" fill="#000" stroke={CARTOON_INK} strokeWidth="3" />
    </svg>
  );
}
