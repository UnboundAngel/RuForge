import { useId } from "react";

const PACK_RINGS = Array.from({ length: 34 }, (_, i) => 84 + i * 3.4);
const TEETH = 6;

function polar(ang: number, r: number) {
  return `${(200 + Math.cos(ang) * r).toFixed(2)},${(200 + Math.sin(ang) * r).toFixed(2)}`;
}

/** Drive teeth point inward from the hub ring into the spindle hole. */
const TEETH_PATHS = Array.from({ length: TEETH }, (_, i) => {
  const a = (i / TEETH) * Math.PI * 2;
  return `M${polar(a - 0.2, 34)} L${polar(a - 0.1, 20)} L${polar(a + 0.1, 20)} L${polar(a + 0.2, 34)} Z`;
});

/** Windows cut through the hub between the spokes, as on a real cassette spool. */
const HUB_WINDOWS = Array.from({ length: 3 }, (_, i) => {
  const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
  const span = 0.62;
  return `M${polar(a - span, 44)} A44,44 0 0 1 ${polar(a + span, 44)} L${polar(a + span * 0.8, 62)} A62,62 0 0 0 ${polar(a - span * 0.8, 62)} Z`;
});

/** Cassette reel: glossy wound tape pack around a white toothed spool. */
export default function LofiReelDisc(_props: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const packId = `rf-lf-pack-${uid}`;
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={packId} cx="50%" cy="50%" r="50%">
          <stop offset="35%" stopColor="#140d0a" />
          <stop offset="85%" stopColor="#24170f" />
          <stop offset="100%" stopColor="#120b08" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill={`url(#${packId})`} />
      {PACK_RINGS.map((r, i) => (
        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke={i % 6 === 0 ? "rgba(255,210,180,0.07)" : "rgba(0,0,0,0.3)"} strokeWidth="0.6" />
      ))}
      <circle cx="200" cy="200" r="197" fill="none" stroke="rgba(255,220,190,0.12)" strokeWidth="1.2" />

      <circle cx="200" cy="200" r="78" fill="#efe9df" />
      <circle cx="200" cy="200" r="78" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      {HUB_WINDOWS.map((d, i) => (
        <path key={i} d={d} fill="#140d0a" />
      ))}
      <circle cx="200" cy="200" r="34" fill="#140d0a" />
      {TEETH_PATHS.map((d, i) => (
        <path key={i} d={d} fill="#efe9df" />
      ))}
      <circle cx="200" cy="200" r="34" fill="none" stroke="#d6cfc3" strokeWidth="2" />
    </svg>
  );
}
