import { findKnownMediaFile } from "@/lib/trustedMediaPath";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";

/** Main's own copy of an incoming file, or null when main does not already know that path. */
export function resolveTrustedMediaFile(
  file: unknown,
  opts: { includeHandoff?: boolean } = {},
): MediaFile | null {
  if (!file || typeof file !== "object") return null;
  const st = useRuforgeStore.getState();
  return findKnownMediaFile((file as { path?: unknown }).path, {
    entries: st.entries,
    files: [
      st.playingFile,
      ...(opts.includeHandoff === false ? [] : [st.activityHandoff?.file]),
      ...st.folderAudioPlaylist,
      ...st.musicShuffleBasePlaylist,
    ],
  });
}

export function filterTrustedMediaPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return paths.flatMap((p) => {
    const known = resolveTrustedMediaFile({ path: p });
    return known ? [known.path] : [];
  });
}
