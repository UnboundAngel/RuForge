import type { CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

const ORB_CANCEL_PARTICLE_MS = 520;
const CANCEL_POP_PARTICLE_COUNT = 10;

export function CancelPopParticles({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  if (!active || reducedMotion) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center overflow-visible rf-cancel-pop-burst"
      style={{ "--rf-cancel-particle-ms": `${ORB_CANCEL_PARTICLE_MS}ms` } as CSSProperties}
      aria-hidden
    >
      {Array.from({ length: CANCEL_POP_PARTICLE_COUNT }, (_, i) => {
        const angle = (i / CANCEL_POP_PARTICLE_COUNT) * Math.PI * 2;
        const dist = 14 + (i % 3) * 5;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        return (
          <span
            key={i}
            className="rf-cancel-pop-particle"
            style={
              {
                "--rf-particle-x": `${dx}px`,
                "--rf-particle-y": `${dy}px`,
                animationDelay: `${(i % 4) * 18}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
