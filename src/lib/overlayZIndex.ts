/**
 * Shared overlay stacking tiers. Prefer these class strings over raw z-[N]
 * when touching a surface so confirm can sit above every fullscreen that
 * triggers it without racing JSX tree order.
 */
export const OVERLAY_Z_CLASS = {
  settings: "z-[300]",
  fullscreen: "z-[400]",
  confirm: "z-[450]",
  updater: "z-[600]",
  menus: "z-[9999]",
  crash: "z-[100000]",
} as const;

export type OverlayZTier = keyof typeof OVERLAY_Z_CLASS;
