/** Scroll distance (px) before gallery tab strip chrome + compact title fully show. */
export const GALLERY_SCROLL_CHROME_PX = 64;

export function galleryScrollChromeAmount(scrollTop: number): number {
  return Math.min(1, Math.max(0, scrollTop / GALLERY_SCROLL_CHROME_PX));
}
