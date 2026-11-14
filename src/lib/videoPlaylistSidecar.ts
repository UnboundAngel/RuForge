import { invoke } from "@tauri-apps/api/core";
import { findPlaylistSidecarByListUrl } from "@/lib/playlistDownloadSidecar";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  sanitizePlaylistFolderName,
} from "@/youtubeUrl";

export type VideoPlaylistSidecarItem = { url: string; title: string };

type RosterTrack = { url: string | null; id: string | null; title: string };

/**
 * The sidecar roster replaces itself on every kickoff, so a later run (new videos, or a re-download
 * that skipped duplicates) sends the old tracks first and only appends the ones it has not seen.
 */
export function mergeRoster(
  existing: ReadonlyArray<{ url?: string | null; id?: string | null; title: string }>,
  items: VideoPlaylistSidecarItem[],
): RosterTrack[] {
  const out: RosterTrack[] = existing.map((t) => ({
    url: t.url ?? null,
    id: t.id ?? (t.url ? extractYouTubeVideoId(t.url) : null),
    title: t.title,
  }));
  const seen = new Set(out.map((t) => t.id).filter((id): id is string => Boolean(id)));
  for (const item of items) {
    const id = extractYouTubeVideoId(item.url);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push({ url: item.url, id, title: item.title });
  }
  return out;
}

/**
 * Writes the playlist sidecar for a video playlist download and returns the folder to use plus how
 * many tracks the playlist already had. The folder follows the YouTube list id (same list appends,
 * another list with the same title gets "Title (2)"). Falls back to the title-based folder when the
 * URL has no list id or the sidecar cannot be written, so a sidecar problem never blocks the download.
 */
export async function prepareVideoPlaylistFolderDetailed(input: {
  outputDir: string;
  title: string;
  sourceUrl: string;
  items: VideoPlaylistSidecarItem[];
}): Promise<{ folder: string; previousCount: number }> {
  const base = sanitizePlaylistFolderName(input.title || "playlist");
  const listId = extractYouTubePlaylistId(input.sourceUrl);
  const outputDir = input.outputDir.trim();
  if (!listId || !outputDir || input.items.length === 0) return { folder: base, previousCount: 0 };
  const listUrl = `https://www.youtube.com/playlist?list=${listId}`;
  try {
    const found = await findPlaylistSidecarByListUrl([outputDir], listUrl).catch(() => null);
    const previous = found?.sidecar.tracks ?? [];
    const folder = await invoke<string>("kickoff_playlist_download_sidecar", {
      outputDir,
      folderName: base,
      listUrl,
      title: input.title.trim() || base,
      tracks: mergeRoster(previous, input.items),
      metadata: null,
      resolveByListId: true,
    });
    // Dynamic so the store graph never imports the watcher back.
    void import("@/playlistWatch/playlistWatchSync").then((m) => m.syncPlaylistWatch());
    return { folder: folder || base, previousCount: previous.length };
  } catch (e) {
    console.warn("[RuForge] video playlist sidecar kickoff failed:", e);
    return { folder: base, previousCount: 0 };
  }
}

export async function prepareVideoPlaylistFolder(
  input: Parameters<typeof prepareVideoPlaylistFolderDetailed>[0],
): Promise<string> {
  return (await prepareVideoPlaylistFolderDetailed(input)).folder;
}
