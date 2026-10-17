/** Must match default `size` on `RadialMenu`. */
export const RADIAL_MENU_SIZE_DEFAULT = 252;

/** Room around the disc for its float shadow; the overlay webview clips anything past this. */
export const RADIAL_MENU_FRAME_PADDING = 64;
export const RADIAL_MENU_SAFE_MARGIN = 12;

export function radialMenuHalfExtent(
  size = RADIAL_MENU_SIZE_DEFAULT,
): number {
  return (size + RADIAL_MENU_FRAME_PADDING) / 2;
}

export function clampRadialMenuCenter(
  x: number,
  y: number,
  size = RADIAL_MENU_SIZE_DEFAULT,
): { x: number; y: number } {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  const half = radialMenuHalfExtent(size);
  const m = RADIAL_MENU_SAFE_MARGIN;
  const minX = ox + half + m;
  const maxX = ox + vw - half - m;
  const minY = oy + half + m;
  const maxY = oy + vh - half - m;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}
