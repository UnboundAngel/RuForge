import { motion } from "framer-motion";
import { CARTOON_INK as INK } from "./cartoonInk";

type Doodle = {
  key: string;
  /** Percent of the cover box; negative sits outside it. */
  box: { top?: string; right?: string; bottom?: string; left?: string; size: string };
  tilt: number;
  bobSec: number;
  delay: number;
  art: React.ReactNode;
};

const Sparkle = () => (
  <path
    d="M50 4 C54 36 64 46 96 50 C64 54 54 64 50 96 C46 64 36 54 4 50 C36 46 46 36 50 4 Z"
    fill={INK}
  />
);

const EighthNote = () => (
  <g fill={INK} stroke={INK} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="34" cy="76" rx="18" ry="13" transform="rotate(-20 34 76)" stroke="none" />
    <path d="M50 72 V14" strokeWidth="8" fill="none" />
    <path d="M50 14 C62 26 80 30 76 52" strokeWidth="8" fill="none" />
  </g>
);

const BeamedNotes = () => (
  <g fill={INK} stroke={INK} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="22" cy="80" rx="14" ry="10" transform="rotate(-20 22 80)" stroke="none" />
    <ellipse cx="72" cy="70" rx="14" ry="10" transform="rotate(-20 72 70)" stroke="none" />
    <path d="M34 76 V22 M84 66 V12" strokeWidth="7" fill="none" />
    <path d="M34 22 L84 12" strokeWidth="12" fill="none" />
  </g>
);

const MotionTicks = () => (
  <g stroke={INK} strokeWidth="8" strokeLinecap="round" fill="none">
    <path d="M12 30 L40 22" />
    <path d="M8 56 L44 52" />
    <path d="M14 82 L40 84" />
  </g>
);

const DOODLES: Doodle[] = [
  { key: "spark-big", box: { top: "-9%", right: "-8%", size: "15%" }, tilt: 8, bobSec: 2.4, delay: 0, art: <Sparkle /> },
  { key: "spark-small", box: { top: "-13%", right: "12%", size: "6%" }, tilt: -10, bobSec: 1.9, delay: 0.5, art: <Sparkle /> },
  { key: "note", box: { bottom: "10%", right: "-17%", size: "13%" }, tilt: 12, bobSec: 2.8, delay: 0.3, art: <EighthNote /> },
  { key: "beamed", box: { top: "-6%", left: "-44%", size: "12%" }, tilt: -14, bobSec: 3.1, delay: 0.9, art: <BeamedNotes /> },
  { key: "ticks", box: { bottom: "-4%", left: "-62%", size: "9%" }, tilt: 0, bobSec: 2.2, delay: 0.6, art: <MotionTicks /> },
  { key: "spark-low", box: { bottom: "-12%", right: "4%", size: "7%" }, tilt: 20, bobSec: 2.6, delay: 1.2, art: <Sparkle /> },
];

export default function CartoonDoodles({ bobbing }: { bobbing: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {DOODLES.map(({ key, box, tilt, bobSec, delay, art }) => (
        <motion.svg
          key={key}
          viewBox="0 0 100 100"
          className="absolute overflow-visible"
          style={{
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            left: box.left,
            width: box.size,
            height: box.size,
          }}
          initial={false}
          animate={
            bobbing
              ? { y: [0, -7, 0], rotate: [tilt, tilt + 6, tilt] }
              : { y: 0, rotate: tilt }
          }
          transition={
            bobbing
              ? { duration: bobSec, delay, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.4, ease: "easeOut" }
          }
        >
          {art}
        </motion.svg>
      ))}
    </div>
  );
}
