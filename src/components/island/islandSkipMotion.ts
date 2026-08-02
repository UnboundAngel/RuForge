import type { Variants } from "motion/react";

/** 1 = next / forward, -1 = previous / back */
export type IslandSkipDir = 1 | -1;

/** Compact pill cover: short travel, snappy. */
export const islandSkipCompactVariants: Variants = {
  enter: (dir: IslandSkipDir) => ({
    x: dir * 14,
    opacity: 0,
    scale: 0.72,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (dir: IslandSkipDir) => ({
    x: dir * -14,
    opacity: 0,
    scale: 0.72,
  }),
};

/** Expanded art + meta: slightly longer throw. */
export const islandSkipExpandedVariants: Variants = {
  enter: (dir: IslandSkipDir) => ({
    x: dir * 28,
    opacity: 0,
    scale: 0.92,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (dir: IslandSkipDir) => ({
    x: dir * -24,
    opacity: 0,
    scale: 0.94,
  }),
};

export const ISLAND_SKIP_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.7,
};
