/** Min width before a column can hold cover + readable title. */
export const QUICK_PICK_MIN_COL_PX = 260;
export const QUICK_PICK_MAX_COLS = 4;
export const QUICK_PICK_MAX_ROWS = 3;
/** Absolute pool ceiling; visible count is still cols × rows. */
export const QUICK_PICKS_POOL_CAP = 16;

export function quickPickColumnCount(widthPx: number): number {
  if (widthPx <= 0) return 2;
  return Math.max(
    1,
    Math.min(QUICK_PICK_MAX_COLS, Math.floor(widthPx / QUICK_PICK_MIN_COL_PX)),
  );
}

export function quickPickVisibleCount(cols: number): number {
  return Math.min(QUICK_PICKS_POOL_CAP, cols * QUICK_PICK_MAX_ROWS);
}
