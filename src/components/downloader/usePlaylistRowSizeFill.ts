import { useEffect, useRef } from "react";

import { ytdlpVideoFormatForMetadata } from "../../downloadFormat";
import { cookieContextFromSettings } from "../../downloadQueue";
import { fetchPlaylistRowSizes } from "../../downloadVideoInfoFetch";
import { playlistItemKey } from "../../playlistDownloadPlan";
import {
  clearPlaylistSizeErrors,
  getPlaylistPreviewState,
  recordPlaylistSizeErrors,
} from "../../lib/playlistPreviewState";
import { useRuforgeStore } from "../../store/ruforgeStore";
import type { PlaylistItem } from "../../types";
import { playlistItemWatchUrl } from "../../youtubeUrl";

const ROWS_PER_BATCH = 5;
/** How long to wait for more rows while the listing is still streaming in. */
const LISTING_POLL_MS = 400;
const SIZE_UNAVAILABLE = "Size unavailable";

function rowHasSizes(item: PlaylistItem): boolean {
  return (
    (typeof item.fileSizeBytesVideo === "number" && item.fileSizeBytesVideo > 0) ||
    (typeof item.fileSizeBytesAudio === "number" && item.fileSizeBytesAudio > 0)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Playlist rows arrive without sizes so the list shows in seconds. This fills sizes top-down a few
 * rows at a time, skips rows the user cancelled, keeps going while rows are still streaming in, and
 * stops when the playlist changes or gets queued. A row yt-dlp returns nothing for is marked
 * "Size unavailable" instead of retried forever.
 */
export function usePlaylistRowSizeFill(playlistQueued: boolean): void {
  const playlistUrl = useRuforgeStore((s) =>
    s.videoInfo?.isPlaylist ? s.videoInfoUrl : null,
  );
  const queuedRef = useRef(playlistQueued);
  queuedRef.current = playlistQueued;

  useEffect(() => {
    if (!playlistUrl) return;
    let cancelled = false;
    const attempted = new Set<string>();

    const stillCurrent = () => {
      const st = useRuforgeStore.getState();
      return (
        !cancelled &&
        !queuedRef.current &&
        st.videoInfoUrl === playlistUrl &&
        st.videoInfo?.isPlaylist === true
      );
    };

    void (async () => {
      while (stillCurrent()) {
        const st = useRuforgeStore.getState();
        const excluded = getPlaylistPreviewState().excluded;
        const batch: { id: string; url: string }[] = [];
        let heldBack = false;
        (st.videoInfo?.playlistItems ?? []).forEach((item, i) => {
          const id = item.id?.trim();
          const url = playlistItemWatchUrl(item);
          if (!id || !url || attempted.has(id) || rowHasSizes(item)) return;
          if (excluded.has(playlistItemKey(item, i + 1))) {
            heldBack = true;
            return;
          }
          if (batch.length < ROWS_PER_BATCH) batch.push({ id, url });
        });
        if (batch.length === 0) {
          // Cancelled rows stay pending so restoring one still gets its size.
          if (!getPlaylistPreviewState().listing && !heldBack) return;
          await sleep(LISTING_POLL_MS);
          continue;
        }
        batch.forEach((row) => attempted.add(row.id));
        const ids = batch.map((row) => row.id);

        let sizes;
        try {
          sizes = await fetchPlaylistRowSizes(
            batch.map((row) => row.url),
            ytdlpVideoFormatForMetadata(st.settings.preferredQuality),
            cookieContextFromSettings(st.settings),
          );
        } catch (e: unknown) {
          console.warn(`[RuForge] playlist size fill stopped: ${e}`);
          if (stillCurrent()) recordPlaylistSizeErrors(ids, SIZE_UNAVAILABLE);
          return;
        }
        if (!stillCurrent()) return;

        const byId = new Map(sizes.map((s) => [s.id, s]));
        const missing = ids.filter((id) => !byId.has(id));
        recordPlaylistSizeErrors(missing, SIZE_UNAVAILABLE);
        clearPlaylistSizeErrors(ids.filter((id) => byId.has(id)));
        if (sizes.length === 0) continue;

        const now = useRuforgeStore.getState();
        const info = now.videoInfo;
        if (!info?.playlistItems) return;
        now.setVideoInfo(
          {
            ...info,
            playlistItems: info.playlistItems.map((item) => {
              const size = item.id ? byId.get(item.id.trim()) : undefined;
              return size
                ? {
                    ...item,
                    fileSizeBytesAudio: size.fileSizeBytesAudio ?? null,
                    fileSizeBytesVideo: size.fileSizeBytesVideo ?? null,
                  }
                : item;
            }),
          },
          {
            sourceUrl: playlistUrl,
            preferredQuality: now.videoInfoPreferredQuality ?? undefined,
          },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistUrl]);
}
