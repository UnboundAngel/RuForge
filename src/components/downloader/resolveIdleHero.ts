import { downloadJobMediaNeedsHydration } from "../../downloadQueue";
import { downloadJobDisplayFileSizeBytes } from "../../downloadJobFileSizes";
import type { useDownloaderView } from "./useDownloaderView";

/** Hero card shown while nothing is downloading: pasted link details, a queued job, or a status line. */
export function resolveIdleHero(d: ReturnType<typeof useDownloaderView>) {
  if (d.videoInfo && !d.metadataLoading) {
    return {
      title: d.videoInfo.title,
      duration: d.videoInfo.duration,
      fileSizeBytes:
        downloadJobDisplayFileSizeBytes(
          {
            title: d.videoInfo.title,
            thumbnail: d.videoInfo.thumbnail,
            duration: d.videoInfo.duration,
            isPlaylist: d.videoInfo.isPlaylist,
            fileSizeBytes: d.videoInfo.fileSizeBytes ?? null,
            fileSizeBytesAudio: d.videoInfo.fileSizeBytesAudio ?? null,
            fileSizeBytesVideo: d.videoInfo.fileSizeBytesVideo ?? null,
          },
          d.heroAudioOnly,
        ) ?? null,
      isPlaylist: d.videoInfo.isPlaylist,
      playlistItems: d.videoInfo.playlistItems,
      loading: false,
    };
  }
  if (d.focusedJob && d.focusedJob.status !== "downloading") {
    const m = d.focusedJob.metadata;
    const needs = downloadJobMediaNeedsHydration(m);
    const rawTitle = (d.focusedJob.title ?? m?.title ?? "").trim();
    if (needs && !rawTitle) {
      return {
        title: d.downloadStartPending ? "Starting soon…" : "Fetching details…",
        duration: 0,
        fileSizeBytes: null,
        isPlaylist: false,
        playlistItems: undefined,
        loading: true,
      };
    }
    const title =
      rawTitle || (needs ? "Fetching details…" : (d.focusedJob.url || "Video").trim());
    const jobAudioOnly = d.focusedJob.options.audioOnly === true;
    return {
      title,
      duration: needs ? 0 : (m?.duration ?? 0),
      fileSizeBytes: needs ? null : downloadJobDisplayFileSizeBytes(m, jobAudioOnly),
      isPlaylist: Boolean(m?.isPlaylist),
      playlistItems: m?.playlistItems,
      loading: needs,
    };
  }
  if (
    d.url.startsWith("http") &&
    (d.metadataLoading || d.downloadStartPending || d.showDuplicateBanner)
  ) {
    const statusOnly =
      (d.metadataLoading || d.downloadStartPending) && !d.showDuplicateBanner;
    return {
      title: statusOnly
        ? ""
        : d.downloadStartPending
          ? "Starting soon…"
          : d.metadataLoading
            ? "Fetching details…"
            : (d.libraryDuplicateTitle ?? "Already in your library"),
      duration: 0,
      fileSizeBytes: null,
      isPlaylist: false,
      playlistItems: undefined,
      loading: d.metadataLoading || d.downloadStartPending,
    };
  }
  return null;
}
