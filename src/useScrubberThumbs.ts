import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

function filterSpritePaths(paths: string[]): string[] {
  return paths.filter((p) => {
    const f = p.replace(/^.*[/\\]/, "");
    return f.startsWith("sprite_") && f.endsWith(".jpg");
  });
}

function pathsMatch(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\//g, "\\").toLowerCase();
  return norm(a) === norm(b);
}

/** Loads ffmpeg scrub sprite sheets for the player seek bar; refreshes when generation finishes. */
export function useScrubberThumbs(
  videoPath: string | undefined,
  opts: { audioOnly?: boolean; allowGenerate: boolean },
): string[] {
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const { audioOnly = false, allowGenerate } = opts;

  const reload = useCallback(() => {
    if (!videoPath?.trim() || audioOnly) {
      setScrubberThumbs([]);
      return;
    }
    void invoke<string[]>("extract_frames", {
      videoPath,
      allowGenerate,
    })
      .then((paths) => setScrubberThumbs(filterSpritePaths(paths)))
      .catch(() => setScrubberThumbs([]));
  }, [videoPath, audioOnly, allowGenerate]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!videoPath?.trim() || audioOnly) return;
    let disposed = false;
    const setup = listen<{ videoPath: string }>("scrub-sprites-updated", (ev) => {
      if (disposed || !pathsMatch(ev.payload.videoPath, videoPath)) return;
      reload();
    });
    return () => {
      disposed = true;
      void setup.then((un) => un());
    };
  }, [videoPath, audioOnly, reload]);

  return scrubberThumbs;
}
