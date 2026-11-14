import { useMemo } from "react";
import { isAudioOnlyPath } from "../../mediaKind";
import { useRuforgeStore } from "../../store/ruforgeStore";

/** Library audio and video files in natural path order, the fallback queues when no playlist drives playback. */
export function useLibrarySortedMedia() {
  const galleryEntries = useRuforgeStore((s) => s.entries);
  return useMemo(() => {
    const all = galleryEntries
      .flatMap((e) => (e.kind === "media" ? [e] : e.items))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
    return {
      audioLibrarySorted: all.filter((f) => isAudioOnlyPath(f.path)),
      videoLibrarySorted: all.filter((f) => !isAudioOnlyPath(f.path)),
    };
  }, [galleryEntries]);
}
