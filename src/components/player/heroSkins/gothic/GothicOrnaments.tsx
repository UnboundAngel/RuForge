import { useRef } from "react";
import { motion } from "framer-motion";
import { GothicBlood } from "./GothicBlood";
import { useGothicPalette } from "./gothicPalette";
import "./gothic.css";

/** Must match `.goth-frame` inset/padding in index.css; corner art is drawn in these px. */
const RAIL = "22px";

const CORNERS = [
  { key: "tl", style: { top: `-${RAIL}`, left: `-${RAIL}` }, flip: "scale(1,1)" },
  { key: "tr", style: { top: `-${RAIL}`, right: `-${RAIL}` }, flip: "scale(-1,1)" },
  { key: "bl", style: { bottom: `-${RAIL}`, left: `-${RAIL}` }, flip: "scale(1,-1)" },
  { key: "br", style: { bottom: `-${RAIL}`, right: `-${RAIL}` }, flip: "scale(-1,-1)" },
];

const CANDLES = [
  { key: "tall", style: { right: `calc(-${RAIL} - 11%)`, bottom: `-${RAIL}`, height: "26%" }, delay: 0 },
  { key: "short", style: { right: `calc(-${RAIL} - 18%)`, bottom: `-${RAIL}`, height: "16%" }, delay: 0.5 },
];

/** Drawn for the top-left corner in a 76px box; the 22px rail spans 0..22 on both axes. */
function CornerPlate() {
  return (
    <g fill="none" strokeLinecap="round" className="stroke-(--goth-metal)">
      <path d="M4 64 V11 Q4 4 11 4 H64" strokeWidth="1.6" />
      <path d="M18.5 50 V18.5 H50" strokeWidth="1" strokeOpacity="0.7" />
      <path d="M11 26 C15 32 7 38 11 44 C13 47 11 52 11 54" strokeWidth="1.2" />
      <path d="M26 11 C32 15 38 7 44 11 C47 13 52 11 54 11" strokeWidth="1.2" />
      <circle cx="4" cy="66" r="1.6" className="fill-(--goth-metal)" stroke="none" />
      <circle cx="66" cy="4" r="1.6" className="fill-(--goth-metal)" stroke="none" />
      <g strokeWidth="1">
        <circle cx="11" cy="7.8" r="3" />
        <circle cx="11" cy="14.2" r="3" />
        <circle cx="7.8" cy="11" r="3" />
        <circle cx="14.2" cy="11" r="3" />
      </g>
      <circle cx="11" cy="11" r="2.4" strokeWidth="1" className="fill-(--goth-blood)" />
    </g>
  );
}

function Spikes() {
  const heights = [10, 16, 12, 22, 14, 34, 14, 22, 12, 16, 10];
  const step = 100 / heights.length;
  const d = heights
    .map((h, i) => `M${i * step + 1} 40 L${i * step + step / 2} ${40 - h} L${(i + 1) * step - 1} 40 Z`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="absolute left-1/2 h-[9%] w-[62%] overflow-visible"
      style={{ top: `calc(-${RAIL} - 9%)`, transform: "translateX(-50%)" }}
    >
      <path d={d} strokeWidth="0.8" vectorEffect="non-scaling-stroke" className="fill-(--goth-frame) stroke-(--goth-metal)" />
    </svg>
  );
}

function Candle({ flicker, delay }: { flicker: boolean; delay: number }) {
  const loop = { duration: 1.1, delay, repeat: Infinity, ease: "easeInOut" } as const;
  return (
    <>
      <motion.div
        className="absolute left-1/2 top-[12%] h-[80%] w-[340%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,60,30,0.32)_0%,transparent_65%)]"
        initial={false}
        animate={flicker ? { opacity: [0.6, 1, 0.7, 0.95, 0.6] } : { opacity: 0.8 }}
        transition={flicker ? loop : { duration: 0.3 }}
      />
      <svg viewBox="0 0 40 100" preserveAspectRatio="xMidYMax meet" className="relative h-full w-full overflow-visible">
        <path d="M13 30 H27 V100 H13 Z" fill="#151012" stroke="#2a2224" strokeWidth="0.8" />
        <path d="M13 30 H27 V33 C25 33 25 44 23.5 44 C22 44 22 35 20 35 C18 35 18 52 16 52 C14 52 14.5 36 13 34 Z" className="fill-(--goth-blood)" />
        <path d="M20 30 V25" stroke="#0a0606" strokeWidth="1.5" />
        <motion.g
          style={{ originX: 0.5, originY: 1 }}
          initial={false}
          animate={flicker ? { scaleY: [1, 1.2, 0.88, 1.12, 1], scaleX: [1, 0.9, 1.06, 0.95, 1] } : { scaleY: 1, scaleX: 1 }}
          transition={flicker ? loop : { duration: 0.3 }}
        >
          <path d="M20 3 C27 12 28 19 20 27 C12 19 13 12 20 3 Z" fill="#c2261a" />
          <path d="M20 9 C24.5 15 25 20 20 26 C15 20 15.5 15 20 9 Z" fill="#ff8a3a" />
          <path d="M20 15 C22 18 22 21 20 25 C18 21 18 18 20 15 Z" fill="#ffe2a8" />
        </motion.g>
      </svg>
    </>
  );
}

export default function GothicOrnaments({
  animate,
  coverSrc,
}: {
  animate: boolean;
  coverSrc: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useGothicPalette(coverSrc, rootRef);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div className="goth-frame-rim" />
      <div className="goth-frame" />
      <div className="goth-frame-lip" />
      <GothicBlood />
      <Spikes />
      {CORNERS.map(({ key, style, flip }) => (
        <svg
          key={key}
          viewBox="0 0 76 76"
          className="absolute h-[76px] w-[76px]"
          style={{ ...style, transform: flip }}
        >
          <CornerPlate />
        </svg>
      ))}
      {CANDLES.map(({ key, style, delay }) => (
        <div key={key} className="absolute w-[7%]" style={style}>
          <Candle flicker={animate} delay={delay} />
        </div>
      ))}
    </div>
  );
}
