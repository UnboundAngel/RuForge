import { Plaque } from "./MuseumPlaque";
import "./museum.css";

/** Frame depth in px; `.mu-side` clip-paths read it through --mu-f. */
const FRAME = 34;

const SIDES = [
  { key: "top", style: { top: -FRAME, left: -FRAME, right: -FRAME, height: FRAME } },
  { key: "bottom", style: { bottom: -FRAME, left: -FRAME, right: -FRAME, height: FRAME } },
  { key: "left", style: { left: -FRAME, top: -FRAME, bottom: -FRAME, width: FRAME } },
  { key: "right", style: { right: -FRAME, top: -FRAME, bottom: -FRAME, width: FRAME } },
];

export default function MuseumOrnaments() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 [container-type:inline-size]"
      style={{ "--mu-f": `${FRAME}px` } as React.CSSProperties}
      aria-hidden
    >
      <div className="mu-canvas" />
      <div className="mu-varnish" />
      <div className="absolute inset-0 shadow-[inset_0_6px_14px_rgba(0,0,0,0.7)]" />
      {/* Sides are clip-pathed, so their wall shadow has to come from a filter on a wrapper. */}
      <div className="absolute inset-0 drop-shadow-[0_14px_18px_rgba(0,0,0,0.8)]">
        {SIDES.map(({ key, style }) => (
          <div key={key} className={`mu-side mu-${key}`} style={style} />
        ))}
      </div>
      <div className="mu-beads" />
      <Plaque frame={FRAME} />
    </div>
  );
}
