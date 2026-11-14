import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import { CompactPillContent } from "./CompactHint";
import { SHRINK_EASE } from "./islandShared";

export function CelebrateHint({ label = "nice!" }: { label?: string }) {
  return (
    <CompactPillContent exit>
      <motion.span
        key={label}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="text-[13px] font-semibold tracking-tight text-stone-100"
      >
        {label}
      </motion.span>
    </CompactPillContent>
  );
}

const CELEBRATE_COLORS = ["var(--accent)", "#f5ede4", "#c4a574", "#e8d4a8"] as const;

export function CelebrateBurst({ count = 16, spread = 1 }: { count?: number; spread?: number }) {
  const reducedMotion = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.15;
        const dist = (32 + (i % 4) * 14) * spread;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 10 * spread,
          rot: (i * 51) % 360,
          color: CELEBRATE_COLORS[i % CELEBRATE_COLORS.length],
          w: i % 3 === 0 ? 5 : 3,
          h: i % 3 === 0 ? 3 : 5,
        };
      }),
    [count, spread],
  );

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-[1px]"
          style={{
            width: p.w,
            height: p.h,
            marginLeft: -p.w / 2,
            marginTop: -p.h / 2,
            background: p.color,
          }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
          animate={{
            opacity: 0,
            x: p.x,
            y: p.y + 18 * spread,
            scale: 0.2,
            rotate: p.rot,
          }}
          transition={{
            duration: 0.72,
            ease: SHRINK_EASE,
            delay: (p.id % 5) * 0.025,
          }}
        />
      ))}
    </div>
  );
}
