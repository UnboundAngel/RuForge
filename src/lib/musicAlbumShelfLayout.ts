export const MUSIC_ALBUM_CARD_WIDTH_SM_PX = 144;
export const MUSIC_ALBUM_CARD_WIDTH_MD_PX = 160;
export const MUSIC_ALBUM_SHELF_GAP_RECENT_PX = 40;
export const MUSIC_ALBUM_SHELF_GAP_HOME_PX = 20;

export function musicAlbumCardWidthPx(): number {
  if (typeof window === "undefined") return MUSIC_ALBUM_CARD_WIDTH_MD_PX;
  return window.matchMedia("(min-width: 768px)").matches
    ? MUSIC_ALBUM_CARD_WIDTH_MD_PX
    : MUSIC_ALBUM_CARD_WIDTH_SM_PX;
}

export function musicAlbumShelfFitCount(
  containerWidth: number,
  cardWidth: number,
  gap: number,
): number {
  if (containerWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
}
