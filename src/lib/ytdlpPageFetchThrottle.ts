/** Client-side spacing between paginated music Explore yt-dlp page fetches. */

const MIN_PAGE_FETCH_GAP_MS = 2_800;
let lastPageFetchAt = 0;

export async function throttleMusicExplorePageFetch(): Promise<void> {
  const now = Date.now();
  const wait = MIN_PAGE_FETCH_GAP_MS - (now - lastPageFetchAt);
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }
  lastPageFetchAt = Date.now();
}

/** Cap how many playlist pages one UI action may request. */
export const MUSIC_EXPLORE_MAX_PLAYLIST_PAGES_PER_ACTION = 8;
