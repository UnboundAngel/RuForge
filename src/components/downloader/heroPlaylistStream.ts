import { cookieContextFromSettings } from "../../downloadQueue";
import { buildPlaylistEnqueuePlan } from "../../playlistDownloadPlan";
import {
  beginPlaylistPreview,
  endPlaylistPreview,
  getPlaylistPreviewState,
  setPlaylistListing,
} from "../../lib/playlistPreviewState";
import { mergePlaylistBatch, startPlaylistPreviewStream } from "../../lib/playlistPreviewStream";
import { useRuforgeStore } from "../../store/ruforgeStore";
import type { VideoInfo } from "../../types";

/**
 * The downloader hero shows a pasted playlist while it is still being listed. One stream at a time;
 * it belongs to the pasted link, not to the effect that started it, so re-renders and queue changes
 * never restart it. It ends when the link changes or is cleared.
 */
let owner: { url: string; cancel: () => void } | null = null;

export function heroPlaylistStreamOwns(url: string): boolean {
  return owner?.url === url;
}

export function cancelHeroPlaylistStream(): void {
  if (!owner) return;
  owner.cancel();
  owner = null;
  endPlaylistPreview();
  useRuforgeStore.getState().setDownloaderMetadataLoading(false);
}

/** Debounced start for a pasted playlist link; the returned cleanup only drops the pending start. */
export function scheduleHeroPlaylistStream(
  url: string,
  preferredQuality: string,
  onAllDuplicates: () => void,
): () => void {
  const st = useRuforgeStore.getState();
  st.setDownloaderMetadataLoading(true);
  const timer = setTimeout(() => {
    if (useRuforgeStore.getState().url.trim() !== url) return;
    startHeroPlaylistStream({
      url,
      preferredQuality,
      onNotPlaylist: () => useRuforgeStore.getState().setMetadataError("This link is not a playlist."),
      onFinished: (info) => {
        const s = useRuforgeStore.getState();
        if (!s.settings.skipDuplicatesAutomatically || !info.playlistItems?.length) return;
        const plan = buildPlaylistEnqueuePlan(
          info.playlistItems,
          s.entries,
          {},
          s.settings.downloadAudioOnly,
          true,
          getPlaylistPreviewState().excluded,
        );
        if (plan.toDownload.length > 0 || plan.duplicates.length === 0) return;
        onAllDuplicates();
        s.notify("All videos in this playlist are already in your library.", "info");
      },
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!heroPlaylistStreamOwns(url)) useRuforgeStore.getState().setDownloaderMetadataLoading(false);
  };
}

function startHeroPlaylistStream(opts: {
  url: string;
  preferredQuality: string;
  /** The listing ended and every row is in. */
  onFinished: (info: VideoInfo) => void;
  /** yt-dlp said this link is not a playlist after all; the caller falls back to a plain fetch. */
  onNotPlaylist: () => void;
}): void {
  const { url } = opts;
  cancelHeroPlaylistStream();
  beginPlaylistPreview(url);
  let gotRows = false;

  const cancel = startPlaylistPreviewStream({
    url,
    cookies: cookieContextFromSettings(useRuforgeStore.getState().settings),
    onBatch: (items, meta) => {
      const st = useRuforgeStore.getState();
      if (owner?.url !== url || st.url.trim() !== url) return;
      if (meta?.count) setPlaylistListing(url, true, meta.count);
      const prev = st.videoInfoUrl === url ? st.videoInfo : null;
      st.setVideoInfo(mergePlaylistBatch(prev, items, meta), {
        sourceUrl: url,
        preferredQuality: opts.preferredQuality,
      });
      if (!gotRows) {
        gotRows = true;
        st.setMetadataError(null);
        st.setDownloaderMetadataLoading(false);
      }
    },
    onEnd: (_total, error) => {
      const st = useRuforgeStore.getState();
      if (owner?.url !== url) return;
      setPlaylistListing(url, false);
      st.setDownloaderMetadataLoading(false);
      if (st.url.trim() !== url) return;
      if (!gotRows) {
        if (error && /not a playlist/i.test(error)) {
          opts.onNotPlaylist();
          return;
        }
        st.setMetadataError(error ?? "This playlist has no videos.");
        return;
      }
      if (st.videoInfo?.isPlaylist && st.videoInfoUrl === url) opts.onFinished(st.videoInfo);
    },
  });
  owner = { url, cancel };
}
