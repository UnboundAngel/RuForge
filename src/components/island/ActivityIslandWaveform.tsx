import { motion } from "framer-motion";

type Props = {
  paused: boolean;
  accentColor: string;
  muted?: boolean;
};

const BAR_HEIGHTS = [0.4, 0.7, 1.0, 0.6, 0.4];

export function ActivityIslandWaveform({ paused, accentColor, muted }: Props) {
  const color = muted ? "rgba(255,255,255,0.45)" : accentColor;

  return (
    <div className="flex h-[16px] shrink-0 items-center justify-center gap-[2.5px]" aria-hidden>
      {BAR_HEIGHTS.map((h, i) => (
        <motion.span
          key={i}
          className="w-[2.5px] rounded-full"
          style={{ backgroundColor: color, originY: 0.5, height: '100%' }}
          animate={
            paused
              ? { scaleY: h * 0.25 }
              : { scaleY: [h * 0.4, h, h * 0.6, h * 0.9, h * 0.4] }
          }
          transition={
            paused
              ? { duration: 0.3, ease: "easeOut" }
              : { duration: 0.8 + (i % 3) * 0.15, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }
          }
        />
      ))}
    </div>
  );
}
