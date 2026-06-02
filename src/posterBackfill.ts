import { invoke } from "@tauri-apps/api/core";
import { isAudioOnlyPath } from "./mediaKind";
import type { MediaFile } from "./types";

const CONCURRENCY = 2;

/** Videos with neither yt-dlp art, embedded cover, nor `poster.jpg` yet (typical legacy downloads). */
export function filesMissingPoster(files: MediaFile[]): MediaFile[] {
  return files.filter(
    (f) =>
      !isAudioOnlyPath(f.path) &&
      !f.thumbnailPath &&
      !f.ruforgePosterPath &&
      !f.embeddedCoverPath,
  );
}

/** Run lightweight ffmpeg poster extraction, a few files at a time. */
export async function ensurePostersForFiles(files: MediaFile[]): Promise<void> {
  const need = filesMissingPoster(files);
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const batch = need.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((f) =>
        invoke("ensure_poster_if_missing", { videoPath: f.path }).catch(() => {
          /* ffmpeg missing or corrupt file — skip */
        }),
      ),
    );
  }
}
