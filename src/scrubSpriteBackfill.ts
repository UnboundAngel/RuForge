import { invoke } from "@tauri-apps/api/core";
import { isAudioOnlyPath } from "./mediaKind";
import type { MediaFile } from "./types";

const CONCURRENCY = 3;
const SCRUB_VIDEO_EXT = /\.(mp4|mkv|webm)$/i;

export type ScrubSpritePathHooks = {
  onStart: (path: string) => void;
  onEnd: (path: string) => void;
};

/** mp4/mkv/webm entries whose ffmpeg scrub sprite sheets are not complete yet. */
export function filesMissingScrubSprites(files: MediaFile[]): MediaFile[] {
  return files.filter(
    (f) =>
      !isAudioOnlyPath(f.path) &&
      SCRUB_VIDEO_EXT.test(f.path) &&
      f.scrubSpritesComplete !== true,
  );
}

/** Build missing scrub sprite sheets, a few videos at a time. */
export async function ensureScrubSpritesForFiles(
  files: MediaFile[],
  hooks?: ScrubSpritePathHooks,
): Promise<void> {
  const need = filesMissingScrubSprites(files);
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const batch = need.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        hooks?.onStart(f.path);
        try {
          await invoke("extract_frames", { videoPath: f.path, allowGenerate: true });
        } catch {
          /* ffmpeg missing or corrupt file — skip */
        } finally {
          hooks?.onEnd(f.path);
        }
      }),
    );
  }
}
