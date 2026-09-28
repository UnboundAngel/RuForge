import { LofiRain } from "./LofiRain";
import "./lofi.css";

const PLATE_SRC = "/skins/lofi.jpg";
const STEAM = [
  { delay: "0s", dur: "5.5s", x: "0%" },
  { delay: "2.1s", dur: "6.5s", x: "35%" },
  { delay: "3.8s", dur: "6s", x: "-25%" },
];

/** Painted plate, with live rain, lamp and steam placed in its own coordinates so they track it at any size. */
export default function LofiBackdrop() {
  return (
    <div className="lf-scene" aria-hidden>
      <div className="lf-plate">
        <img src={PLATE_SRC} alt="" draggable={false} className="lf-plate-img" />
        <LofiRain pane="main" />
        <LofiRain pane="side" />
        <div className="lf-lamp-glow" />
        <div className="lf-steam-origin">
          {STEAM.map((s) => (
            <span
              key={s.delay}
              className="lf-steam"
              style={{ "--delay": s.delay, "--dur": s.dur, "--x": s.x } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="lf-vignette" />
    </div>
  );
}
