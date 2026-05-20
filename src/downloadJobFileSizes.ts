import type { DownloadJobMediaSnapshot } from "./downloadQueue";
import type { VideoInfo } from "./types";

export type DownloadJobFileSizePair = {
  audioBytes: number | null;
  videoBytes: number | null;
};

export function fileSizePairFromVideoInfo(info: VideoInfo): DownloadJobFileSizePair {
  const audioBytes =
    typeof info.fileSizeBytesAudio === "number" && info.fileSizeBytesAudio > 0
      ? info.fileSizeBytesAudio
      : null;
  const videoBytes =
    typeof info.fileSizeBytesVideo === "number" && info.fileSizeBytesVideo > 0
      ? info.fileSizeBytesVideo
      : null;
  if (audioBytes != null || videoBytes != null) {
    return { audioBytes, videoBytes };
  }
  const legacy =
    typeof info.fileSizeBytes === "number" && info.fileSizeBytes > 0
      ? info.fileSizeBytes
      : null;
  return { audioBytes: legacy, videoBytes: legacy };
}

export function downloadJobDualSizesReady(m: DownloadJobMediaSnapshot): boolean {
  return (
    typeof m.fileSizeBytesAudio === "number" &&
    m.fileSizeBytesAudio > 0 &&
    typeof m.fileSizeBytesVideo === "number" &&
    m.fileSizeBytesVideo > 0
  );
}

export function downloadJobDisplayFileSizeBytes(
  m: DownloadJobMediaSnapshot | null | undefined,
  audioOnly: boolean,
): number | null {
  if (!m) return null;
  const fromPair = audioOnly ? m.fileSizeBytesAudio : m.fileSizeBytesVideo;
  if (typeof fromPair === "number" && fromPair > 0) return fromPair;
  if (typeof m.fileSizeBytes === "number" && m.fileSizeBytes > 0) return m.fileSizeBytes;
  return null;
}

export function snapshotWithResolvedFileSize(
  snap: DownloadJobMediaSnapshot,
  audioOnly: boolean,
): DownloadJobMediaSnapshot {
  return {
    ...snap,
    fileSizeBytes: downloadJobDisplayFileSizeBytes(snap, audioOnly),
  };
}

export function mergeVideoInfoFileSizes(
  snap: DownloadJobMediaSnapshot,
  info: VideoInfo,
  audioOnly: boolean,
): DownloadJobMediaSnapshot {
  const pair = fileSizePairFromVideoInfo(info);
  const next: DownloadJobMediaSnapshot = {
    ...snap,
    fileSizeBytesAudio:
      pair.audioBytes ??
      (typeof info.fileSizeBytesAudio === "number" && info.fileSizeBytesAudio > 0
        ? info.fileSizeBytesAudio
        : null) ??
      snap.fileSizeBytesAudio ??
      null,
    fileSizeBytesVideo:
      pair.videoBytes ??
      (typeof info.fileSizeBytesVideo === "number" && info.fileSizeBytesVideo > 0
        ? info.fileSizeBytesVideo
        : null) ??
      snap.fileSizeBytesVideo ??
      null,
  };
  return snapshotWithResolvedFileSize(next, audioOnly);
}
