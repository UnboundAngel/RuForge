import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import type { MusicPlaylistPage, MusicTrackInfo } from "@/lib/musicExploreTracks";
import { throttleMusicExplorePageFetch } from "@/lib/ytdlpPageFetchThrottle";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { youtubeUrlsMatch } from "@/youtubeUrl";
import { useMusicLibraryTracks } from "./useMusicPlaylists";
import {
  type OutsideTrack,
  mergeOutsideRecommendations,
  musicRadioUrl,
  outsidePage,
  outsideRoundSlot,
  radioBackoffActive,
  radioSeeds,
  readCachedRadio,
  readPendingAdds,
  resolvePendingAdds,
  startRadioBackoff,
  writeCachedRadio,
  writePendingAdds,
} from "./musicOutsideRecommend";

/** Radio entries fetched per seed; later Refresh rounds page through them without refetching. */
const RADIO_FETCH_LIMIT = 25;

const inFlight = new Map<string, Promise<MusicTrackInfo[]>>();

function fetchRadio(seedId: string): Promise<MusicTrackInfo[]> {
  const cached = readCachedRadio(seedId);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(seedId);
  if (running) return running;
  const { settings } = useRuforgeStore.getState();
  const task = (async () => {
    await throttleMusicExplorePageFetch();
    const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
      url: musicRadioUrl(seedId),
      offset: 0,
      limit: RADIO_FETCH_LIMIT,
      browserCookies: settings.browserContext || null,
      cookieFile: settings.cookieFile || null,
    });
    writeCachedRadio(seedId, page.items);
    return page.items;
  })().finally(() => inFlight.delete(seedId));
  inFlight.set(seedId, task);
  return task;
}

/**
 * YouTube Music songs for a playlist's Recommended shelf. Nothing is fetched until `active`
 * (the shelf is on screen), one radio per Refresh round, cached for a day. Any failure starts
 * a backoff and the shelf quietly shows library songs only.
 */
export function useOutsideRecommendations({
  playlistTracks,
  library,
  round,
  count,
  active,
  exclude,
}: {
  playlistTracks: MediaFile[];
  library: MediaFile[];
  round: number;
  count: number;
  active: boolean;
  /** Songs hidden from recommendations. */
  exclude?: (track: OutsideTrack) => boolean;
}): { tracks: OutsideTrack[]; pool: OutsideTrack[]; loading: boolean; available: boolean } {
  const enabled = useRuforgeStore((s) => s.settings.suggestYoutubeMusicSongs !== false);
  const seeds = useMemo(() => radioSeeds(playlistTracks), [playlistTracks]);
  const { seedIndex, page } = outsideRoundSlot(round, seeds.length);
  const seedId = seeds[seedIndex] ?? null;

  const [radio, setRadio] = useState<{ seedId: string; items: MusicTrackInfo[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !active || !seedId) return;
    const cached = readCachedRadio(seedId);
    if (cached) {
      setRadio({ seedId, items: cached });
      return;
    }
    if (radioBackoffActive()) return;
    let cancelled = false;
    setLoading(true);
    fetchRadio(seedId)
      .then((items) => {
        if (!cancelled) setRadio({ seedId, items });
      })
      .catch(() => startRadioBackoff())
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, active, seedId]);

  const pool = useMemo(() => {
    if (!enabled || !radio || radio.seedId !== seedId) return [];
    const merged = mergeOutsideRecommendations(radio.items, library, radio.seedId);
    return exclude ? merged.filter((t) => !exclude(t)) : merged;
  }, [enabled, radio, seedId, library, exclude]);
  const tracks = useMemo(() => outsidePage(pool, page, count), [pool, page, count]);

  return { tracks, pool, loading: enabled && loading, available: enabled && seeds.length > 0 };
}

/**
 * YouTube Music songs like one song (its radio), minus what the library already has.
 * Resolves empty when the setting is off, YouTube Music is backing off, or the fetch fails.
 */
export async function fetchSimilarOutside(videoId: string, library: MediaFile[]): Promise<OutsideTrack[]> {
  if (useRuforgeStore.getState().settings.suggestYoutubeMusicSongs === false) return [];
  if (!readCachedRadio(videoId) && radioBackoffActive()) return [];
  try {
    return mergeOutsideRecommendations(await fetchRadio(videoId), library, videoId);
  } catch {
    startRadioBackoff();
    return [];
  }
}

/** Queues an audio download for an outside song and remembers to add it to the playlist when it lands. */
export function downloadOutsideTrackIntoPlaylist(track: OutsideTrack, playlistId: string): void {
  const s = useRuforgeStore.getState();
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  const opts = patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, dir), true, s.settings);
  s.enqueueDownload(track.url, opts, {
    title: track.title,
    snapshot: {
      title: track.title,
      thumbnail: track.thumbnail ?? "",
      duration: track.duration ?? 0,
      isPlaylist: false,
    },
    enqueueSource: "musicPlaylistAdd",
  });
  s.pumpDownloadQueue();
  const pending = readPendingAdds().filter((p) => !(p.videoId === track.videoId && p.playlistId === playlistId));
  pending.push({ videoId: track.videoId, playlistId, at: Date.now() });
  writePendingAdds(pending);
}

/** Download state of an outside song: null before it is queued, then a 0..100 percentage. */
export function useOutsideDownloadPercent(url: string): {
  queued: boolean;
  percent: number;
  failed: boolean;
  /** First line of the failure; music mode has no toast to show it. */
  error: string | null;
} {
  return useRuforgeStore(
    useShallow((s) => {
      const job = s.downloadJobs.find((j) => youtubeUrlsMatch(j.url, url));
      if (!job) return { queued: false, percent: 0, failed: false, error: null };
      const failed = job.status === "failed" || job.status === "timed_out";
      const percent = job.status === "completed" ? 100 : Math.max(0, Math.min(100, job.progress?.percentage ?? 0));
      const error = failed ? (job.error?.split("\n")[0].trim() || null) : null;
      return { queued: true, percent, failed, error };
    }),
  );
}

/**
 * Lives in the Music shell: whenever the library changes, adds finished outside downloads to the
 * playlists they were meant for, even if the playlist page was closed while they downloaded.
 */
export function useResolvePendingPlaylistAdds(library: MediaFile[]): void {
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  useEffect(() => {
    const pending = readPendingAdds();
    if (pending.length === 0) return;
    const { ready, waiting } = resolvePendingAdds(pending, library);
    if (ready.length === 0 && waiting.length === pending.length) return;
    for (const { add, path } of ready) addToVirtualPlaylist(add.playlistId, [path]);
    writePendingAdds(waiting);
  }, [library, addToVirtualPlaylist]);
}

/** Renders nothing; mounted once in the Music shell so its library subscription stays out of the shell's renders. */
export function PendingPlaylistAddsResolver(): null {
  useResolvePendingPlaylistAdds(useMusicLibraryTracks());
  return null;
}
