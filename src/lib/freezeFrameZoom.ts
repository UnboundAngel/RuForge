export type ZoomState = { scale: number; x: number; y: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
/** Where the visible frame sits inside the viewport at 1x (letterboxing excluded). */
export type ContentRect = { x: number; y: number; width: number; height: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const ZOOM_IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/** One 100px wheel notch is about a 1.22x step. */
const WHEEL_SENSITIVITY = 0.002;

export function isZoomed(state: ZoomState): boolean {
  return state.scale > ZOOM_MIN;
}

/**
 * Scales around `cursor` (viewport coords) so the content point under it stays put.
 * Negative `delta` zooms in, matching wheel deltaY.
 */
export function zoomAt(state: ZoomState, cursor: Point, delta: number): ZoomState {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.scale * Math.exp(-delta * WHEEL_SENSITIVITY)));
  if (next === state.scale) return state;
  if (next === ZOOM_MIN) return ZOOM_IDENTITY;
  const k = next / state.scale;
  return {
    scale: next,
    x: cursor.x - (cursor.x - state.x) * k,
    y: cursor.y - (cursor.y - state.y) * k,
  };
}

export function panBy(state: ZoomState, dx: number, dy: number): ZoomState {
  return { scale: state.scale, x: state.x + dx, y: state.y + dy };
}

function clampAxis(t: number, scale: number, viewport: number, start: number, size: number): number {
  const scaled = size * scale;
  if (scaled <= viewport) return (viewport - scaled) / 2 - start * scale;
  const min = viewport - (start + size) * scale;
  const max = 0 - start * scale;
  return Math.min(max, Math.max(min, t));
}

/**
 * Keeps the scaled frame covering the viewport on every axis where it is larger than the
 * viewport, and centered on axes where it is still smaller (letterbox side).
 */
export function clampPan(state: ZoomState, viewport: Size, content: ContentRect): ZoomState {
  if (!isZoomed(state)) return ZOOM_IDENTITY;
  return {
    scale: state.scale,
    x: clampAxis(state.x, state.scale, viewport.width, content.x, content.width),
    y: clampAxis(state.y, state.scale, viewport.height, content.y, content.height),
  };
}

/** The rect `object-fit: contain` paints an intrinsic-size frame into. */
export function containRect(viewport: Size, intrinsic: Size): ContentRect {
  if (intrinsic.width <= 0 || intrinsic.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, width: viewport.width, height: viewport.height };
  }
  const fit = Math.min(viewport.width / intrinsic.width, viewport.height / intrinsic.height);
  const width = intrinsic.width * fit;
  const height = intrinsic.height * fit;
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
}

export function formatZoom(scale: number): string {
  const rounded = Math.round(scale * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}x`;
}
