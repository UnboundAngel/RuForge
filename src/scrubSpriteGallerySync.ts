import { listen } from "@tauri-apps/api/event";
import { isPathInExtractingSet, mediaPathsMatch } from "./lib/mediaPathMatch";
import { useRuforgeStore } from "./store/ruforgeStore";

let galleryRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGalleryScrubRefresh(): void {
  if (galleryRefreshTimer !== null) clearTimeout(galleryRefreshTimer);
  galleryRefreshTimer = setTimeout(() => {
    galleryRefreshTimer = null;
    void useRuforgeStore.getState().fetchEntries({
      manageLoadingStart: false,
      skipPosterBackfill: true,
      skipScrubBackfill: true,
    });
  }, 600);
}

function removeExtractingForPayloadPath(path: string): void {
  const st = useRuforgeStore.getState();
  const match = Object.keys(st.extractingByPath).find((p) => mediaPathsMatch(p, path));
  if (match) st.removeGalleryExtractingPath(match);
}

/** Library card spinners for post-download scrub jobs (Rust emits started/finished). */
export function wireScrubSpriteGalleryIndicators(): () => void {
  let disposed = false;
  const unsubs: Array<() => void> = [];

  void listen<{ videoPath: string }>("scrub-sprites-started", (ev) => {
    if (disposed) return;
    useRuforgeStore.getState().addGalleryExtractingPath(ev.payload.videoPath);
  }).then((un) => unsubs.push(un));

  void listen<{ videoPath: string }>("scrub-sprites-finished", (ev) => {
    if (disposed) return;
    removeExtractingForPayloadPath(ev.payload.videoPath);
  }).then((un) => unsubs.push(un));

  void listen<{ videoPath: string }>("scrub-sprites-updated", (ev) => {
    if (disposed) return;
    const path = ev.payload.videoPath;
    const wasExtracting = isPathInExtractingSet(
      path,
      useRuforgeStore.getState().extractingByPath,
    );
    removeExtractingForPayloadPath(path);
    if (wasExtracting) scheduleGalleryScrubRefresh();
  }).then((un) => unsubs.push(un));

  return () => {
    disposed = true;
    if (galleryRefreshTimer !== null) {
      clearTimeout(galleryRefreshTimer);
      galleryRefreshTimer = null;
    }
    for (const un of unsubs) un();
  };
}

export function useGalleryScrubExtracting(filePath: string): boolean {
  return useRuforgeStore((s) => isPathInExtractingSet(filePath, s.extractingByPath));
}
