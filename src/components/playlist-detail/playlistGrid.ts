/**
 * Column template shared by the header and every row. Columns drop out as the pane narrows
 * (container queries): Added first, then Views, then Uploaded.
 */
export const PLAYLIST_GRID =
  "grid items-center gap-4 grid-cols-[40px_minmax(0,1fr)_72px_72px] @2xl:grid-cols-[40px_minmax(0,1fr)_130px_72px_72px] @4xl:grid-cols-[40px_minmax(0,1fr)_110px_130px_72px_72px] @6xl:grid-cols-[40px_minmax(0,1fr)_110px_130px_130px_72px_72px]";

export const COL_UPLOADED = "hidden @2xl:block";
export const COL_VIEWS = "hidden @4xl:block";
export const COL_ADDED = "hidden @6xl:block";
