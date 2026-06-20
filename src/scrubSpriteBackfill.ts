import { invoke } from "@tauri-apps/api/core";
import { mediaPathsMatch } from "./lib/mediaPathMatch";
import { isAudioOnlyPath } from "./mediaKind";
import type { MediaFile } from "./types";

const CONCURRENCY = 3;
/** Post-scan auto backfill cap; older missing items use manual Generate Previews. */
export const SCRUB_BACKFILL_TOP_N = 3;
const SCRUB_VIDEO_EXT = /\.(mp4|mkv|webm)$/i;
const scrubBackfillInFlight = new Set<string>();

function markScrubInFlight(path: string): boolean {
  for (const p of scrubBackfillInFlight) {
    if (mediaPathsMatch(p, path)) return false;
  }
  scrubBackfillInFlight.add(path);
  return true;
}

function clearScrubInFlight(path: string): void {
  for (const p of [...scrubBackfillInFlight]) {
    if (mediaPathsMatch(p, path)) scrubBackfillInFlight.delete(p);
  }
}

export type ScrubSpritePathHooks = {
  /** Safety clear if Rust finished event was missed; spinners are driven by scrub-sprites-* events. */
  onEnd?: (path: string) => void;
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

/** Missing scrub sprites, newest first, capped for post-scan auto backfill. */
export function topNScrubBackfillCandidates(files: MediaFile[]): MediaFile[] {
  return filesMissingScrubSprites(files)
    .slice()
    .sort((a, b) => b.created - a.created)
    .slice(0, SCRUB_BACKFILL_TOP_N);
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
        if (!markScrubInFlight(f.path)) return;
        try {
          await invoke<string[]>("extract_frames", {
            videoPath: f.path,
            allowGenerate: true,
          });
        } catch {
          /* ffmpeg missing or corrupt file — skip */
        } finally {
          clearScrubInFlight(f.path);
          hooks?.onEnd?.(f.path);
        }
      }),
    );
  }
}
