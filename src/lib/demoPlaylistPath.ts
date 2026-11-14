/** Neither a virtual id nor a folder, so no save path can mistake the onboarding demo for a real playlist. */
export const DEMO_PLAYLIST_PATH = "ruforge-demo://starter-mix";

export function isDemoPlaylistPath(path: string | null | undefined): boolean {
  return path === DEMO_PLAYLIST_PATH;
}
