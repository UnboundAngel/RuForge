/** Ignore pointer enter on nav icons for this long after a surface opens (Alt radial). */
export const NAV_ICON_HOVER_ARM_MS = 120;

export function navIconHoverAllowed(sinceMs: number): boolean {
  return performance.now() - sinceMs >= NAV_ICON_HOVER_ARM_MS;
}
