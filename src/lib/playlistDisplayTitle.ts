/** Folder-derived playlist names carry underscores; cards and the detail screen show spaces. */
export function playlistDisplayTitle(title: string): string {
  return title.replace(/_/g, " ");
}
