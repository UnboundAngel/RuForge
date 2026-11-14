import type { MediaFile } from "@/types";

export type VideoPlaylistSuggestion = {
  id: string;
  channelId: string;
  title: string;
  verified: boolean;
  files: MediaFile[];
};

export const MIN_GROUP_SIZE = 4;

/**
 * Channels with enough library videos to make a playlist, minus those the user already named a
 * playlist after. Biggest group first.
 */
export function suggestVideoPlaylists(
  files: readonly MediaFile[],
  existingTitles: readonly string[],
  limit = 6,
): VideoPlaylistSuggestion[] {
  const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const groups = new Map<string, { title: string; verified: boolean; files: MediaFile[] }>();
  for (const file of files) {
    const id = file.youtube?.channelId;
    const name = file.youtube?.channel?.trim();
    if (!id || !name) continue;
    const group = groups.get(id) ?? { title: name, verified: false, files: [] };
    group.files.push(file);
    if (file.youtube?.channelVerified) group.verified = true;
    groups.set(id, group);
  }
  return [...groups]
    .filter(([, g]) => g.files.length >= MIN_GROUP_SIZE && !taken.has(g.title.toLowerCase()))
    .map(([id, g]) => ({ id: `channel:${id}`, channelId: id, title: g.title, verified: g.verified, files: g.files }))
    .sort((a, b) => b.files.length - a.files.length || a.title.localeCompare(b.title))
    .slice(0, limit);
}
