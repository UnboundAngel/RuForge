/** Must match default `size` on `RadialMenu`. */
export const RADIAL_MENU_SIZE_DEFAULT = 280;

const FRAME_PADDING = 32;
const HINT_GAP = 10;
const LABEL_SLACK = 44;
export const RADIAL_MENU_SAFE_MARGIN = 12;

export function radialMenuHalfExtent(
  size = RADIAL_MENU_SIZE_DEFAULT,
): number {
  const radius = size / 2;
  const frameHalf = (size + FRAME_PADDING) / 2;
  const hintReach = radius + HINT_GAP + LABEL_SLACK;
  return Math.max(frameHalf, hintReach);
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
