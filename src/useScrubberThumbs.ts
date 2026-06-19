import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { mediaPathsMatch } from "./lib/mediaPathMatch";
import { spriteSheetIndexForHover } from "./scrubSpritePreview";

const SHORT_VIDEO_SHEET_MAX = 2;
const NEIGHBOR_RADIUS = 1;

function filterSpritePaths(paths: string[]): string[] {
  return paths.filter((p) => {
    const f = p.replace(/^.*[/\\]/, "");
    return f.startsWith("sprite_") && f.endsWith(".jpg");
  });
}

function sortSpritePaths(paths: string[]): string[] {
  return [...paths].sort();
}

function preloadIndicesForSheet(
  sheetIdx: number,
  pathCount: number,
  prevSheet: number | null,
): Set<number> {
  const indices = new Set<number>();
  for (let d = -NEIGHBOR_RADIUS; d <= NEIGHBOR_RADIUS; d++) {
    const i = sheetIdx + d;
    if (i >= 0 && i < pathCount) indices.add(i);
  }
  if (prevSheet !== null) {
    if (sheetIdx > prevSheet) {
      const ahead = sheetIdx + NEIGHBOR_RADIUS + 1;
      if (ahead < pathCount) indices.add(ahead);
    } else if (sheetIdx < prevSheet) {
      const ahead = sheetIdx - NEIGHBOR_RADIUS - 1;
      if (ahead >= 0) indices.add(ahead);
    }
  }
  return indices;
}

function clearImageCache(cache: Map<number, HTMLImageElement>) {
  for (const img of cache.values()) {
    img.src = "";
  }
  cache.clear();
}

function usePreloadSpriteSheets(
  paths: string[],
  spriteHover: { hoverTimeSec: number; isActive: boolean } | null,
) {
  const cacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const prevSheetRef = useRef<number | null>(null);

  useEffect(() => {
    const cache = cacheRef.current;

    if (paths.length === 0) {
      clearImageCache(cache);
      prevSheetRef.current = null;
      return;
    }

    if (paths.length <= SHORT_VIDEO_SHEET_MAX) {
      clearImageCache(cache);
      prevSheetRef.current = null;
      const images: HTMLImageElement[] = [];
      for (const p of paths) {
        const img = new Image();
        img.src = convertFileSrc(p);
        images.push(img);
      }
      return () => {
        for (const img of images) {
          img.src = "";
        }
      };
    }

    if (!spriteHover?.isActive) {
      clearImageCache(cache);
      prevSheetRef.current = null;
      return;
    }

    const sheetIdx = spriteSheetIndexForHover(spriteHover.hoverTimeSec, paths.length);
    const wanted = preloadIndicesForSheet(sheetIdx, paths.length, prevSheetRef.current);
    prevSheetRef.current = sheetIdx;

    for (const [idx, img] of cache) {
      if (!wanted.has(idx)) {
        img.src = "";
        cache.delete(idx);
      }
    }

    for (const idx of wanted) {
      if (cache.has(idx)) continue;
      const img = new Image();
      img.src = convertFileSrc(paths[idx]!);
      cache.set(idx, img);
    }
  }, [paths, spriteHover?.hoverTimeSec, spriteHover?.isActive]);

  useEffect(() => {
    return () => {
      clearImageCache(cacheRef.current);
      prevSheetRef.current = null;
    };
  }, []);
}

/** Loads ffmpeg scrub sprite sheets for the player seek bar; refreshes when generation finishes. */
export function useScrubberThumbs(
  videoPath: string | undefined,
  opts: {
    audioOnly?: boolean;
    allowGenerate: boolean;
    initialPaths?: string[] | null;
    scrubSpritesComplete?: boolean;
    spriteHover?: { hoverTimeSec: number; isActive: boolean } | null;
  },
): string[] {
  const {
    audioOnly = false,
    allowGenerate,
    initialPaths,
    spriteHover = null,
  } = opts;

  const cachedInitial = useMemo(() => {
    if (!initialPaths?.length) return null;
    const filtered = filterSpritePaths(initialPaths);
    return filtered.length > 0 ? sortSpritePaths(filtered) : null;
  }, [initialPaths]);

  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>(() =>
    cachedInitial ?? [],
  );

  usePreloadSpriteSheets(scrubberThumbs, spriteHover);

  const reload = useCallback(async () => {
    if (!videoPath?.trim() || audioOnly) {
      setScrubberThumbs([]);
      return;
    }

    try {
      let paths = await invoke<string[]>("list_scrub_sprite_paths", { videoPath });
      if (paths.length === 0 && allowGenerate) {
        paths = await invoke<string[]>("extract_frames", { videoPath, allowGenerate });
      }
      const filtered = filterSpritePaths(paths);
      setScrubberThumbs(sortSpritePaths(filtered));
    } catch {
      setScrubberThumbs([]);
    }
  }, [videoPath, audioOnly, allowGenerate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!videoPath?.trim() || audioOnly) return;
    let disposed = false;
    const setup = listen<{ videoPath: string }>("scrub-sprites-updated", (ev) => {
      if (disposed || !mediaPathsMatch(ev.payload.videoPath, videoPath)) return;
      void reload();
    });
    return () => {
      disposed = true;
      void setup.then((un) => un());
    };
  }, [videoPath, audioOnly, reload]);

  return scrubberThumbs;
}
