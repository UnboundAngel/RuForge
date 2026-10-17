/** Shared by the library playlist card and the downloader, which only knows the playlist's title. */
export function playlistCardKey(title: string): string {
  return title.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
