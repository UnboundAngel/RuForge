import { useMemo } from "react";
import { isLinkedToDiskPlaylist, linkToDiskPlaylist, unlinkFromDiskPlaylist } from "@/lib/diskPlaylistMeta";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { PlaylistCollection } from "@/types";
import { VIRTUAL_PLAYLIST_PATH_PREFIX } from "@/virtualPlaylists";

export type Membership = "all" | "some" | "none";

export function membershipIn(items: readonly { path: string }[], paths: string[]): Membership {
  if (paths.length === 0) return "none";
  const held = paths.filter((p) => items.some((i) => mediaPathsMatch(i.path, p))).length;
  return held === 0 ? "none" : held === paths.length ? "all" : "some";
}

/**
 * Downloaded playlists (folders on disk) as save targets. Saving links the video into the folder's
 * settings file instead of moving it, so unticking can only undo links, never touch the files.
 */
export function useDiskPlaylistTargets(paths: string[]) {
  const entries = useRuforgeStore((s) => s.entries);
  const notify = useRuforgeStore((s) => s.notify);
  const refresh = useRuforgeStore((s) => s.refreshVirtualPlaylists);

  const targets = useMemo(
    () =>
      entries.filter(
        (e): e is PlaylistCollection =>
          e.kind === "playlist" &&
          !e.path.startsWith(VIRTUAL_PLAYLIST_PATH_PREFIX) &&
          e.items.some((f) => !isAudioOnlyPath(f.path)),
      ),
    [entries],
  );

  const toggle = (target: PlaylistCollection, membership: Membership) => {
    if (membership === "all") {
      const linked = paths.filter((p) => isLinkedToDiskPlaylist(target.path, p));
      if (linked.length < paths.length) {
        notify(`Downloaded with ${target.title}, so it stays`);
        return;
      }
      void unlinkFromDiskPlaylist(target.path, linked).then(refresh);
      notify(`Removed from ${target.title}`);
      return;
    }
    const missing = paths.filter((p) => !target.items.some((i) => mediaPathsMatch(i.path, p)));
    void linkToDiskPlaylist(target.path, missing).then(refresh);
    notify(`Added to ${target.title}`);
  };

  return { targets, toggle };
}
