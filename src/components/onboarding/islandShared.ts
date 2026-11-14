import { OVERLAY_EASE } from "@/lib/overlayMotion";

export const SHRINK_EASE = OVERLAY_EASE;

export const ISLAND_SPRING = {
  type: "spring" as const,
  stiffness: 350,
  damping: 27,
  mass: 0.8,
};
