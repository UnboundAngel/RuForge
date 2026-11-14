import { useEffect, useMemo, useState } from "react";
import type { MediaFile } from "@/types";
import { fileVideoId, radioBackoffActive, startRadioBackoff } from "@/components/music/musicOutsideRecommend";
import { useTaggableFiles } from "@/components/library/useVideoCardActions";
import { isVideoWatched } from "@/playbackStorage";
import type { FeedVideo } from "@/components/library/youtubeFeed";
import { suggestVideos } from "./suggestions";
import { fetchRelatedVideos, interleaveSuggestions, type VideoSuggestion } from "./videoSuggestions";

const SEEDS_PER_ROUND = 2;
const SHELF_SIZE = 14;
const LOCAL_POOL = 24;

/**
 * Library picks mixed with YouTube's related videos for what the playlist already holds.
 * Refresh (`round`) moves on to other seeds and other library picks.
 */
export function useVideoSuggestions(items: readonly MediaFile[], round: number) {
  const library = useTaggableFiles();
  const [radios, setRadios] = useState<Record<string, FeedVideo[]>>({});
  const [loading, setLoading] = useState(false);

  const seeds = useMemo(() => {
    const ids: string[] = [];
    for (const f of items) {
      const id = fileVideoId(f);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [items]);
  const seedIds = useMemo(() => {
    if (seeds.length === 0) return [];
    const n = Math.min(SEEDS_PER_ROUND, seeds.length);
    return Array.from({ length: n }, (_, k) => seeds[(round * SEEDS_PER_ROUND + k) % seeds.length]);
  }, [seeds, round]);
  const seedKey = seedIds.join(",");

  useEffect(() => {
    if (!seedKey || radioBackoffActive()) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      for (const id of seedKey.split(",")) {
        try {
          const found = await fetchRelatedVideos(id);
          if (!cancelled) setRadios((prev) => ({ ...prev, [id]: found }));
        } catch {
          startRadioBackoff();
          break;
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [seedKey]);

  const owned = useMemo(() => {
    const ids = new Set<string>();
    for (const f of library) {
      const id = fileVideoId(f);
      if (id) ids.add(id);
    }
    return ids;
  }, [library]);

  const local = useMemo(() => {
    const all = suggestVideos(items, library, (f) => isVideoWatched(f.path, f.duration), LOCAL_POOL);
    const shift = all.length ? (round * 6) % all.length : 0;
    return [...all.slice(shift), ...all.slice(0, shift)].slice(0, SHELF_SIZE / 2);
  }, [items, library, round]);

  const outside = useMemo(() => {
    const seen = new Set<string>();
    const lists = seedIds.map((id) => radios[id] ?? []);
    const flat = interleaveSuggestions(lists[0] ?? [], lists[1] ?? []);
    return flat.filter((v) => !owned.has(v.videoId) && !seen.has(v.videoId) && seen.add(v.videoId));
  }, [seedIds, radios, owned]);

  const shelf = useMemo<VideoSuggestion[]>(() => {
    const l: VideoSuggestion[] = local.map((file) => ({ kind: "local", key: `l:${file.path}`, file }));
    const o: VideoSuggestion[] = outside.map((video) => ({ kind: "outside", key: `o:${video.videoId}`, video }));
    return interleaveSuggestions(l, o).slice(0, SHELF_SIZE);
  }, [local, outside]);

  const canRefresh = seeds.length > SEEDS_PER_ROUND || local.length >= SHELF_SIZE / 2;
  return { shelf, loading: loading && outside.length === 0, canRefresh, libraryCount: library.length };
}
