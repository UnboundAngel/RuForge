import { useEffect, useRef } from "react";

import { ytdlpVideoFormatForMetadata } from "../../downloadFormat";
import { cookieContextFromSettings } from "../../downloadQueue";
import { fetchPlaylistRowSizes } from "../../downloadVideoInfoFetch";
import { useRuforgeStore } from "../../store/ruforgeStore";
import type { PlaylistItem } from "../../types";
import { playlistItemWatchUrl } from "../../youtubeUrl";

const ROWS_PER_BATCH = 5;

function rowHasSizes(item: PlaylistItem): boolean {
  return (
    (typeof item.fileSizeBytesVideo === "number" && item.fileSizeBytesVideo > 0) ||
    (typeof item.fileSizeBytesAudio === "number" && item.fileSizeBytesAudio > 0)
  );
}

/**
 * Playlist rows arrive without sizes so the list shows in seconds. This fills sizes top-down a few
 * rows at a time, and stops when the playlist changes, gets queued, or yt-dlp errors.
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
        const batch: { id: string; url: string }[] = [];
        for (const item of st.videoInfo?.playlistItems ?? []) {
          const id = item.id?.trim();
          const url = playlistItemWatchUrl(item);
          if (!id || !url || attempted.has(id) || rowHasSizes(item)) continue;
          batch.push({ id, url });
          if (batch.length === ROWS_PER_BATCH) break;
        }
        if (batch.length === 0) return;
        batch.forEach((row) => attempted.add(row.id));

        let sizes;
        try {
          sizes = await fetchPlaylistRowSizes(
            batch.map((row) => row.url),
            ytdlpVideoFormatForMetadata(st.settings.preferredQuality),
            cookieContextFromSettings(st.settings),
          );
        } catch (e: unknown) {
          console.warn(`[RuForge] playlist size fill stopped: ${e}`);
          return;
        }
        if (!stillCurrent() || sizes.length === 0) continue;

        const byId = new Map(sizes.map((s) => [s.id, s]));
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
