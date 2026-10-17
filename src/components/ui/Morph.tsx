/**
 * Motion for a surface that grows out of the thing you pressed. Never animate to `auto`,
 * never use Framer `layout`; animate to measured pixel targets only.
 * Menus do not morph: use the Music menu kit (`musicMenuUi.tsx`).
 */
export const MORPH_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};
