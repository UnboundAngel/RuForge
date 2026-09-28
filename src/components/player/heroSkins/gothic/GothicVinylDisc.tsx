import { useId } from "react";

const GROOVE_RADII = Array.from({ length: 22 }, (_, i) => 70 + i * 5.6);
const STUD_COUNT = 12;

export default function GothicVinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-goth-label-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="46" />
          </clipPath>
        )}
      </defs>

      <circle cx="200" cy="200" r="197" fill="#070506" strokeOpacity="0.5" strokeWidth="1.5" className="stroke-(--goth-metal)" />
      <circle cx="200" cy="200" r="190" fill="none" strokeOpacity="0.8" strokeWidth="1" className="stroke-(--goth-blood)" />

      {GROOVE_RADII.map((r, i) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          strokeWidth="0.6"
          strokeOpacity={i % 4 === 0 ? 0.5 : 0.35}
          className={i % 4 === 0 ? "stroke-(--goth-blood)" : "stroke-[#28201f]"}
        />
      ))}

      <circle cx="200" cy="200" r="62" strokeWidth="3" className="fill-[#0e0909] stroke-(--goth-blood)" />
      {Array.from({ length: STUD_COUNT }, (_, i) => {
        const a = (i / STUD_COUNT) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={200 + Math.cos(a) * 55}
            cy={200 + Math.sin(a) * 55}
            r="2"
            className="fill-(--goth-metal)"
          />
        );
      })}

      {coverSrc ? (
        <image
          href={coverSrc}
          x="154"
          y="154"
          width="92"
          height="92"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="46" className="fill-(--goth-blood)" />
      )}
      <circle cx="200" cy="200" r="47" fill="none" strokeWidth="1.5" className="stroke-(--goth-metal)" />

      <circle cx="200" cy="200" r="7" fill="#000" strokeWidth="1.5" className="stroke-(--goth-metal)" />
    </svg>
  );
}
