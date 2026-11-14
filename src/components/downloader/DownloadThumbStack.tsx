import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { OVERLAY_EASE } from "../../lib/overlayMotion";

const MAX_LAYERS = 3;

/**
 * Round thumbnails piled on the sidebar download button, newest on top. Each older one sits a step
 * up and to the left, smaller and fainter. `srcs` is ordered newest first.
 */
export function DownloadThumbStack({
  srcs,
  size,
  count,
}: {
  srcs: string[];
  size: number;
  count: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const layers = srcs.slice(0, MAX_LAYERS);
  const transition = { duration: reduce ? 0 : 0.22, ease: OVERLAY_EASE };
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        {layers
          .map((src, depth) => ({ src, depth }))
          .reverse()
          .map(({ src, depth }) => (
            <motion.span
              key={src}
              initial={{ opacity: 0, scale: 0.7, x: 0, y: 6 }}
              animate={{
                opacity: 1 - depth * 0.28,
                scale: 1 - depth * 0.1,
                x: -depth * 3.5,
                y: -depth * 3.5,
              }}
              exit={{ opacity: 0, scale: 0.7, transition }}
              transition={transition}
              style={{ zIndex: MAX_LAYERS - depth }}
              className="absolute inset-0 overflow-hidden rounded-full bg-[color:var(--rf-surface-deep)] shadow-[0_0_0_1.5px_var(--rf-surface-deep)]"
            >
              <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
            </motion.span>
          ))}
      </AnimatePresence>
      {count > 1 ? (
        <span className="absolute -bottom-1.5 -right-1.5 z-10 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[color:var(--accent)] px-1 text-[8px] font-black leading-none tabular-nums text-stone-950">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}
