import { motion } from "framer-motion";
import "./country.css";

/** Must match `.cw-mat` inset in country.css. */
const MAT = 12;
const PLANK = 34;
const OVERHANG = 9;
const OUTER = MAT + PLANK;

/** Inner edges overlap the mat so no gap shows where the clip-path roughs up the outer edge. */
const OVERLAP = 2;

const PLANKS = [
  { key: "top", cls: "cw-plank cw-plank-top", style: { top: -OUTER - 2, left: -OUTER - OVERHANG - 4, right: -OUTER - OVERHANG, height: PLANK + 2 + OVERLAP } },
  { key: "bottom", cls: "cw-plank cw-plank-bottom", style: { bottom: -OUTER, left: -OUTER - OVERHANG + 3, right: -OUTER - OVERHANG - 6, height: PLANK + OVERLAP } },
  { key: "left", cls: "cw-plank cw-plank-v cw-plank-left", style: { left: -OUTER, top: -MAT, bottom: -MAT, width: PLANK + OVERLAP } },
  { key: "right", cls: "cw-plank cw-plank-v cw-plank-right", style: { right: -OUTER + 1, top: -MAT, bottom: -MAT, width: PLANK - 1 + OVERLAP } },
];

const NAIL_INSET = OUTER - PLANK / 2;
const NAILS = [
  { left: -NAIL_INSET, top: -NAIL_INSET },
  { left: `calc(100% + ${NAIL_INSET}px)`, top: -NAIL_INSET },
  { left: -NAIL_INSET, top: `calc(100% + ${NAIL_INSET}px)` },
  { left: `calc(100% + ${NAIL_INSET}px)`, top: `calc(100% + ${NAIL_INSET}px)` },
  { left: -NAIL_INSET, top: "50%" },
  { left: `calc(100% + ${NAIL_INSET}px)`, top: "46%" },
];

const DUST = [
  { x: "-30%", y: "20%", size: 3, dur: 14, delay: 0 },
  { x: "110%", y: "10%", size: 2, dur: 17, delay: 3 },
  { x: "20%", y: "105%", size: 2.5, dur: 12, delay: 6 },
  { x: "75%", y: "-15%", size: 2, dur: 15, delay: 1.5 },
  { x: "-45%", y: "80%", size: 3.5, dur: 19, delay: 8 },
  { x: "125%", y: "70%", size: 2.5, dur: 13, delay: 4.5 },
  { x: "50%", y: "115%", size: 2, dur: 16, delay: 10 },
];

function WantedSign() {
  return (
    <div
      className="absolute left-1/2 w-[46%] drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
      style={{ top: `calc(-${OUTER}px - 7%)`, transform: "translateX(-50%) rotate(-2.2deg)" }}
    >
      <div className="cw-sign flex flex-col items-center px-[6%] pt-[4%] pb-[3%] text-[#3a2210]">
        <span className="cw-type text-[7.2cqw] leading-none font-black tracking-[0.12em]">
          WANTED
        </span>
        <span className="cw-type mt-[2%] text-[2.2cqw] leading-none font-bold tracking-[0.3em] opacity-80">
          DEAD OR ALIVE
        </span>
      </div>
      <div className="cw-nail" style={{ left: "50%", top: "14%" }} />
    </div>
  );
}

export default function CountryOrnaments({ animate }: { animate: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 [container-type:inline-size]" aria-hidden>
      <div className="cw-mat" />
      <div className="cw-lip" />
      {/* Planks are clip-pathed, so their shadow has to come from a filter on a wrapper. */}
      <div className="absolute inset-0 drop-shadow-[0_10px_14px_rgba(0,0,0,0.75)]">
        {PLANKS.map(({ key, cls, style }) => (
          <div key={key} className={cls} style={style} />
        ))}
      </div>
      {NAILS.map((pos, i) => (
        <div key={i} className="cw-nail" style={pos} />
      ))}
      <WantedSign />
      {animate &&
        DUST.map(({ x, y, size, dur, delay }, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-[#f3d9a4]"
            style={{ left: x, top: y, width: size, height: size }}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 0.7, 0.5, 0], x: [0, 26, -14, 34], y: [0, -30, -58, -90] }}
            transition={{ duration: dur, delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
    </div>
  );
}
