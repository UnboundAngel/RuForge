import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Download, Loader, Loader2, X } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { DownloadJob } from "@/downloadQueue";
import {
  countActivePlaylistDownloads,
  isActiveMusicExploreDownloadUi,
  jobWasActive,
  musicExploreTrackDownloadUi,
  type MusicExploreTrackDownloadUi,
} from "@/lib/musicExploreDownloadStatus";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
  cookieContextFromSettings,
} from "@/downloadQueue";
import {
  sanitizePlaylistFolderName,
  isMusicYouTubePlaylistUrl,
  canonicalMusicYouTubeUrl,
  isMusicYouTubeUrl,
  classifyMusicExploreUrl,
  resolveMusicExplorePasteUrl,
  extractYouTubeVideoId,
  canonicalYouTubeWatchUrl,
  youtubeUrlsMatch,
} from "@/youtubeUrl";
import { fetchVideoInfoWithTimeout } from "@/downloadVideoInfoFetch";
import { ytdlpVideoFormatForMetadata } from "@/downloadFormat";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import {
  musicTrackKey,
  playlistFolderTitle,
  type MusicBrowseResult,
  type MusicPlaylistInfo,
  type MusicPlaylistPage,
  type MusicTrackInfo,
} from "@/lib/musicExploreTracks";
import {
  MusicExploreDownloadCollapsed,
  type CollapsedCelebrate,
} from "./MusicExploreDownloadCollapsed";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; url: string }
  | { kind: "error"; message: string }
  | { kind: "browse"; result: MusicBrowseResult; url: string }
  | {
      kind: "playlist";
      playlistTitle: string;
      playlistUrl: string;
      items: MusicTrackInfo[];
      visibleCount: number;
      hasMore: boolean;
      total: number | null;
      loadingMore: boolean;
    };

function TrackRow({
  track,
  index,
  selected,
  downloadUi,
  animDelay,
  onRowClick,
  onDownload,
}: {
  track: MusicTrackInfo;
  index: number;
  selected: boolean;
  downloadUi: MusicExploreTrackDownloadUi;
  animDelay: number;
  onRowClick: (shiftKey: boolean) => void;
  onDownload: () => void;
}) {
  const downloading = isActiveMusicExploreDownloadUi(downloadUi);
  const failed = downloadUi === "failed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.2 } }}
      transition={{ duration: 0.18, delay: animDelay, ease: "easeOut" }}
      role="button"
      tabIndex={-1}
      onClick={(e) => onRowClick(e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick(e.shiftKey);
        }
      }}
      className="rf-music-explore-track-row group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors outline-none focus:outline-none"
      style={{
        background: selected
          ? "rgb(255 0 51 / 0.14)"
          : downloading
            ? "rgb(255 0 51 / 0.08)"
            : "transparent",
        boxShadow: selected ? "inset 3px 0 0 var(--music-accent)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!selected && !downloading) {
          (e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected && !downloading) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      <span
        className="w-4 h-4 rounded border shrink-0 flex items-center justify-center pointer-events-none"
        style={{
          borderColor: selected ? "var(--music-accent)" : "var(--music-border)",
          background: selected ? "var(--music-accent)" : "transparent",
        }}
        aria-hidden
      >
        {selected && (
          <svg width="8" height="8" viewBox="0 0 12 12" fill="white">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {track.thumbnail ? (
        <img
          src={track.thumbnail}
          alt=""
          className="w-7 h-7 rounded object-cover shrink-0 pointer-events-none"
          style={{ borderRadius: "var(--music-card-radius)" }}
        />
      ) : (
        <div
          className="w-7 h-7 rounded shrink-0 flex items-center justify-center pointer-events-none"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <span className="text-[9px]">{index + 1}</span>
        </div>
      )}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className="text-[11px] font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{track.title}</div>
        {(track.artist || track.album) && (
          <div className="text-[9px] truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
            {[track.artist, track.album].filter(Boolean).join(" — ")}
          </div>
        )}
      </div>
      <div className="text-[9px] shrink-0 tabular-nums pointer-events-none" style={{ color: "var(--music-text-muted)" }}>
        {track.duration ? formatDuration(track.duration) : ""}
      </div>
      {failed && !downloading && (
        <span
          className="text-[8px] font-semibold shrink-0 pointer-events-none"
          style={{ color: "var(--music-accent)" }}
        >
          Failed
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDownload(); }}
        disabled={downloading}
        className={cn(
          "shrink-0 w-5 h-5 rounded flex items-center justify-center transition-opacity disabled:opacity-40 outline-none focus:outline-none",
          downloading ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100",
        )}
        style={{ color: "var(--music-text-primary)" }}
        title={downloading ? "Downloading" : "Download"}
      >
        {downloading ? (
          <Loader2 size={11} className="animate-spin" style={{ color: "var(--music-accent)" }} />
        ) : (
          <Download size={11} />
        )}
      </button>
    </motion.div>
  );
}

function PlaylistCard({
  pl,
  index,
  onClick,
}: {
  pl: MusicPlaylistInfo;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.045, ease: "easeOut" }}
      className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-left transition-colors"
      style={{ background: "var(--music-surface-raised)" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--music-surface-raised) 80%, white 20%)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)")}
    >
      {pl.thumbnail ? (
        <img src={pl.thumbnail} alt="" className="w-9 h-9 rounded object-cover shrink-0" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div className="w-9 h-9 rounded shrink-0 flex items-center justify-center" style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface)", color: "var(--music-text-muted)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{pl.title}</div>
        {pl.trackCount != null && (
          <div className="text-[10px] mt-0.5" style={{ color: "var(--music-text-muted)" }}>{pl.trackCount} songs</div>
        )}
      </div>
    </motion.button>
  );
}

type Props = {
  /** The current browse URL (ignored in paste mode). */
  url: string;
  pasteMode?: boolean;
  collapsed?: boolean;
  dockMinimized?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  /** Synced for dock chip success ring when panel UI is minimized away. */
  onCelebratingChange?: (track: CollapsedCelebrate | null) => void;
};

const COLLAPSED_CELEBRATE_MS = 1400;

export function MusicExploreDownloadPanel({
  url,
  pasteMode = false,
  collapsed = false,
  dockMinimized = false,
  onClose,
  onMinimize,
  onCelebratingChange,
}: Props) {
  const settings = useRuforgeStore((s) => s.settings);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);

  const [phase, setPhase] = useState<Phase>(url ? { kind: "loading", url } : { kind: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const lastClickIndexRef = useRef<number | null>(null);
  const prevDownloadJobsRef = useRef<DownloadJob[]>(downloadJobs);
  const pendingCelebrationsRef = useRef<CollapsedCelebrate[]>([]);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [celebrating, setCelebrating] = useState<CollapsedCelebrate | null>(null);

  const removeCompletedFromPlaylist = useCallback((completedUrls: string[]) => {
    if (completedUrls.length === 0) return;
    setPhase((p) => {
      if (p.kind !== "playlist") return p;
      const items = p.items.filter(
        (t) => !completedUrls.some((u) => youtubeUrlsMatch(t.url, u)),
      );
      return {
        ...p,
        items,
        visibleCount: Math.min(p.visibleCount, items.length),
      };
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const url of completedUrls) {
        for (const k of prev) {
          if (k === url || youtubeUrlsMatch(k, url)) next.delete(k);
        }
      }
      return next;
    });
  }, []);

  const processNextCelebration = useCallback(() => {
    if (celebrateTimerRef.current) return;
    const next = pendingCelebrationsRef.current.shift();
    if (!next) {
      setCelebrating(null);
      return;
    }
    setCelebrating(next);
    celebrateTimerRef.current = setTimeout(() => {
      celebrateTimerRef.current = null;
      removeCompletedFromPlaylist([next.url]);
      setCelebrating(null);
      processNextCelebration();
    }, COLLAPSED_CELEBRATE_MS);
  }, [removeCompletedFromPlaylist]);

  const enqueueCelebrations = useCallback(
    (tracks: CollapsedCelebrate[]) => {
      if (tracks.length === 0) return;
      pendingCelebrationsRef.current.push(...tracks);
      if (!celebrateTimerRef.current) {
        processNextCelebration();
      }
    },
    [processNextCelebration],
  );

  useEffect(() => {
    onCelebratingChange?.(celebrating);
  }, [celebrating, onCelebratingChange]);

  useEffect(() => {
    return () => {
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      onCelebratingChange?.(null);
    };
  }, [onCelebratingChange]);

  const buildAudioOpts = useCallback(() => {
    const dir = resolveDownloadOutputDir(saveToInternal, outputDir);
    const base = buildDownloadJobOptions(settings, dir);
    return patchDownloadJobOptionsForAudio(base, true, settings);
  }, [settings, outputDir, saveToInternal]);

  const enqueueTracks = useCallback((tracks: MusicTrackInfo[], playlistTitle?: string) => {
    const opts = buildAudioOpts();
    const folderName = playlistTitle ? sanitizePlaylistFolderName(playlistTitle) : undefined;
    for (let i = 0; i < tracks.length; i++) {
      enqueueDownload(
        tracks[i].url,
        { ...opts, playlistOutputFolder: folderName, playlistIndex: i + 1 },
        { title: tracks[i].title, approval: "held" },
      );
    }
    releaseHeldDownloadJobs();
    pumpDownloadQueue();
  }, [buildAudioOpts, enqueueDownload, releaseHeldDownloadJobs, pumpDownloadQueue]);

  const doLoad = useCallback(async (rawUrl: string) => {
    const canonical =
      resolveMusicExplorePasteUrl(rawUrl) ??
      canonicalMusicYouTubeUrl(rawUrl) ??
      rawUrl.trim();
    if (!canonical) return;

    const kind = classifyMusicExploreUrl(canonical) ?? classifyMusicExploreUrl(rawUrl);
    if (!kind) {
      setPhase({
        kind: "error",
        message: "Paste a music.youtube.com artist, album, playlist, or track URL.",
      });
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase({ kind: "loading", url: canonical });
    setSelected(new Set());
    lastClickIndexRef.current = null;

    try {
      if (kind === "playlist" || isMusicYouTubePlaylistUrl(canonical)) {
        const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
          url: canonical, offset: 0, limit: 15,
        });
        if (ac.signal.aborted) return;
        setPhase({
          kind: "playlist",
          playlistTitle: playlistFolderTitle(page.title, canonical),
          playlistUrl: canonical,
          items: page.items,
          visibleCount: 0,
          hasMore: page.hasMore,
          total: page.total,
          loadingMore: false,
        });
        // Stagger reveal: increment visibleCount one by one
        for (let i = 0; i <= page.items.length; i++) {
          if (ac.signal.aborted) return;
          const count = i;
          setPhase((p) =>
            p.kind === "playlist" ? { ...p, visibleCount: count } : p,
          );
          if (i < page.items.length) await sleep(40);
        }
        return;
      }

      if (kind === "watch") {
        const watchUrl = canonicalYouTubeWatchUrl(canonical) ?? canonical;
        const videoId = extractYouTubeVideoId(watchUrl);
        if (!videoId) {
          setPhase({ kind: "error", message: "Could not read a track id from that URL." });
          return;
        }

        let track: MusicTrackInfo = {
          id: videoId,
          title: videoId,
          url: watchUrl,
          duration: null,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          artist: null,
          album: null,
        };

        try {
          const videoFormat = ytdlpVideoFormatForMetadata(settings.preferredQuality);
          const info = await fetchVideoInfoWithTimeout(watchUrl, videoFormat, true, {
            ...cookieContextFromSettings(settings),
          });
          if (ac.signal.aborted) return;
          track = {
            id: videoId,
            title: info.title?.trim() || videoId,
            url: watchUrl,
            duration: info.duration > 0 ? info.duration : null,
            thumbnail: info.thumbnail || track.thumbnail,
            artist: info.uploader || info.channel || null,
            album: null,
          };
        } catch {
          if (ac.signal.aborted) return;
        }

        setPhase({
          kind: "playlist",
          playlistTitle: track.title,
          playlistUrl: watchUrl,
          items: [track],
          visibleCount: 1,
          hasMore: false,
          total: 1,
          loadingMore: false,
        });
        return;
      }

      if (kind === "browse" || isMusicYouTubeUrl(canonical)) {
        const result = await invoke<MusicBrowseResult>("get_music_browse_info", { url: canonical });
        if (ac.signal.aborted) return;
        setPhase({ kind: "browse", result, url: canonical });
        return;
      }

      setPhase({
        kind: "error",
        message: "Paste a music.youtube.com artist, album, playlist, or track URL.",
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ kind: "error", message: String(e) });
    }
  }, [settings]);

  const openPlaylist = useCallback(async (pl: MusicPlaylistInfo) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase({ kind: "loading", url: pl.url });
    setSelected(new Set());
    lastClickIndexRef.current = null;

    try {
      const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
        url: pl.url, offset: 0, limit: 15,
      });
      if (ac.signal.aborted) return;
      const title = playlistFolderTitle(page.title ?? pl.title, pl.url);
      setPhase({
        kind: "playlist",
        playlistTitle: title,
        playlistUrl: pl.url,
        items: page.items,
        visibleCount: 0,
        hasMore: page.hasMore,
        total: page.total,
        loadingMore: false,
      });
      for (let i = 0; i <= page.items.length; i++) {
        if (ac.signal.aborted) return;
        const count = i;
        setPhase((p) => p.kind === "playlist" ? { ...p, visibleCount: count } : p);
        if (i < page.items.length) await sleep(40);
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ kind: "error", message: String(e) });
    }
  }, []);

  const loadAllRemaining = useCallback(async () => {
    if (phase.kind !== "playlist" || phase.loadingMore) return;
    const { playlistUrl, items } = phase;
    setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: true } : p);
    try {
      let allItems = [...items];
      let hasMore = true;
      let total = phase.total;
      while (hasMore) {
        const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
          url: playlistUrl, offset: allItems.length, limit: 100,
        });
        allItems = [...allItems, ...page.items];
        hasMore = page.hasMore;
        total = page.total ?? total;
        if (page.items.length === 0) break;
      }
      const prevLen = items.length;
      setPhase((p) => p.kind === "playlist" ? {
        ...p, items: allItems, visibleCount: prevLen, hasMore: false, total, loadingMore: false,
      } : p);
      for (let i = prevLen; i <= allItems.length; i++) {
        const count = i;
        setPhase((p) => p.kind === "playlist" ? { ...p, visibleCount: count } : p);
        if (i < allItems.length) await sleep(25);
      }
    } catch {
      setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: false } : p);
    }
  }, [phase]);

  const handleRowClick = useCallback((index: number, key: string, shiftKey: boolean) => {
    if (phase.kind !== "playlist") return;
    if (shiftKey && lastClickIndexRef.current !== null) {
      const anchor = lastClickIndexRef.current;
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      const rangeKeys: string[] = [];
      for (let i = start; i <= end; i++) {
        rangeKeys.push(musicTrackKey(phase.items[i], i));
      }
      setSelected((prev) => {
        const allInRangeSelected = rangeKeys.every((k) => prev.has(k));
        const next = new Set(prev);
        if (allInRangeSelected) {
          for (const k of rangeKeys) next.delete(k);
        } else {
          for (const k of rangeKeys) next.add(k);
        }
        return next;
      });
      lastClickIndexRef.current = index;
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    lastClickIndexRef.current = index;
  }, [phase]);

  useLayoutEffect(() => {
    const prev = prevDownloadJobsRef.current;
    prevDownloadJobsRef.current = downloadJobs;

    if (phase.kind !== "playlist") return;

    const completedUrls: string[] = [];
    const completedTracks: CollapsedCelebrate[] = [];
    for (const track of phase.items) {
      const trackUrl = track.url;
      const hadActive = prev.some(
        (j) => youtubeUrlsMatch(j.url, trackUrl) && jobWasActive(j),
      );
      const hasActive = downloadJobs.some(
        (j) => youtubeUrlsMatch(j.url, trackUrl) && jobWasActive(j),
      );
      const hasFailed = downloadJobs.some(
        (j) => youtubeUrlsMatch(j.url, trackUrl) && j.status === "failed",
      );
      if (hadActive && !hasActive && !hasFailed) {
        completedUrls.push(trackUrl);
        completedTracks.push({
          url: trackUrl,
          title: track.title,
          thumbnail: track.thumbnail,
        });
      }
    }

    if (completedUrls.length === 0) return;

    if (collapsed || dockMinimized) {
      enqueueCelebrations(completedTracks);
      return;
    }

    removeCompletedFromPlaylist(completedUrls);
  }, [
    downloadJobs,
    phase,
    collapsed,
    dockMinimized,
    enqueueCelebrations,
    removeCompletedFromPlaylist,
  ]);

  useEffect(() => {
    if (pasteMode && !url.trim()) {
      abortRef.current?.abort();
      setPhase({ kind: "idle" });
      setSelected(new Set());
      lastClickIndexRef.current = null;
      return;
    }
    if (!url.trim()) return;
    void doLoad(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pasteMode]);

  const selectedTracks =
    phase.kind === "playlist"
      ? phase.items.filter((t, i) => selected.has(musicTrackKey(t, i)))
      : [];

  const isLoading = phase.kind === "loading";

  const activeDownloadCount = useMemo(() => {
    if (phase.kind !== "playlist") return 0;
    return countActivePlaylistDownloads(downloadJobs, phase.items);
  }, [phase, downloadJobs]);

  if (collapsed) {
    if (dockMinimized) return null;
    const playlistItems = phase.kind === "playlist" ? phase.items : [];
    return (
      <div
        className="flex flex-col flex-1 min-h-0 h-full justify-end overflow-hidden"
        style={{ background: "var(--music-surface)", color: "var(--music-text-primary)" }}
      >
        <MusicExploreDownloadCollapsed
          items={playlistItems}
          downloadJobs={downloadJobs}
          celebrating={celebrating}
          loading={phase.kind === "loading" || phase.kind === "idle"}
          playlistBatch={phase.kind === "playlist" && playlistItems.length > 1}
          onMinimize={onMinimize}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-0"
      style={{ background: "var(--music-surface)", color: "var(--music-text-primary)" }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--music-border)" }}
      >
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader size={13} className="animate-spin shrink-0" style={{ color: "var(--music-accent)" }} />
              <span className="text-[11px] truncate" style={{ color: "var(--music-text-muted)" }}>
                Fetching...
              </span>
            </div>
          ) : phase.kind === "playlist" ? (
            <div className="flex flex-col min-w-0 gap-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-semibold truncate">{phase.playlistTitle}</span>
                {phase.total != null && (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--music-text-muted)" }}>
                    ({phase.items.length}/{phase.total})
                  </span>
                )}
              </div>
              {activeDownloadCount > 0 && (
                <motion.span
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: "var(--music-accent)" }}
                >
                  <Loader2 size={10} className="animate-spin shrink-0" />
                  Downloading {activeDownloadCount}…
                </motion.span>
              )}
            </div>
          ) : phase.kind === "browse" ? (
            <span className="text-[11px] font-semibold truncate">{phase.result.title || "Pick a playlist"}</span>
          ) : (
            <span className="text-[11px] font-semibold" style={{ color: "var(--music-text-secondary)" }}>
              Paste link
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {phase.kind === "playlist" && selectedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => { enqueueTracks(selectedTracks, phase.playlistTitle); setSelected(new Set()); }}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
              style={{ background: "var(--music-accent)", color: "#fff" }}
            >
              <Download size={10} />
              {selectedTracks.length}
            </button>
          )}
          {phase.kind === "playlist" && selectedTracks.length === 0 && (
            <button
              type="button"
              onClick={() => enqueueTracks(phase.items, phase.playlistTitle)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border hover:bg-white/10 transition-colors"
              style={{ borderColor: "var(--music-border)", color: "var(--music-text-primary)" }}
              title="Download all loaded tracks"
            >
              <Download size={10} />
              All
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity rounded"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto rf-scrollbar px-2 py-1.5">
        {phase.kind === "idle" && (
          <div className="flex items-center justify-center h-full">
            <Loader size={16} className="animate-spin" style={{ color: "var(--music-accent)" }} />
          </div>
        )}

        {phase.kind === "loading" && (
          <div className="flex items-center justify-center h-full">
            <Loader size={20} className="animate-spin" style={{ color: "var(--music-accent)" }} />
          </div>
        )}

        {phase.kind === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <p className="text-[11px]" style={{ color: "var(--music-text-muted)" }}>{phase.message}</p>
          </div>
        )}

        {phase.kind === "browse" && (
          <div className="flex flex-col gap-1.5">
            {phase.result.playlists.length === 0 ? (
              <p className="text-[11px] py-4 text-center" style={{ color: "var(--music-text-muted)" }}>No playlists found.</p>
            ) : (
              phase.result.playlists.map((pl, i) => (
                <PlaylistCard key={pl.id || pl.url} pl={pl} index={i} onClick={() => void openPlaylist(pl)} />
              ))
            )}
          </div>
        )}

        {phase.kind === "playlist" && (
          <>
            <AnimatePresence initial={false} mode="popLayout">
              {phase.items.slice(0, phase.visibleCount).map((track, i) => {
                const key = musicTrackKey(track, i);
                const downloadUi = musicExploreTrackDownloadUi(downloadJobs, track.url);
                return (
                  <TrackRow
                    key={key}
                    track={track}
                    index={i}
                    selected={selected.has(key)}
                    downloadUi={downloadUi}
                    animDelay={0}
                    onRowClick={(shift) => handleRowClick(i, key, shift)}
                    onDownload={() => enqueueTracks([track], phase.playlistTitle)}
                  />
                );
              })}
            </AnimatePresence>

            {phase.visibleCount < phase.items.length && (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <Loader size={12} className="animate-spin" style={{ color: "var(--music-accent)" }} />
                <span className="text-[10px]" style={{ color: "var(--music-text-muted)" }}>
                  Loading tracks...
                </span>
              </div>
            )}

            {phase.visibleCount >= phase.items.length && phase.hasMore && !phase.loadingMore && (
              <button
                type="button"
                onClick={() => void loadAllRemaining()}
                className="w-full mt-1 py-2 rounded-lg text-[11px] font-medium border hover:bg-white/8 transition-colors"
                style={{ borderColor: "var(--music-border)", color: "var(--music-text-secondary)" }}
              >
                Load all remaining
              </button>
            )}

            {phase.loadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader size={16} className="animate-spin" style={{ color: "var(--music-accent)" }} />
              </div>
            )}

            {!phase.hasMore && phase.items.length > 0 && phase.visibleCount >= phase.items.length && (
              <p className="text-center text-[10px] py-2" style={{ color: "var(--music-text-muted)" }}>
                {phase.items.length} track{phase.items.length !== 1 ? "s" : ""}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
