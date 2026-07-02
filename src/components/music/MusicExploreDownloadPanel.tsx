import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Ban, Download, Loader, Loader2, X } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  countActivePlaylistDownloads,
  isActiveMusicExploreDownloadUi,
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
  isLikelyImageUrl,
  musicPlaylistKey,
  musicTrackKey,
  playlistFolderTitle,
  type MusicBrowseResult,
  type MusicPlaylistInfo,
  type MusicPlaylistPage,
  type MusicTrackInfo,
} from "@/lib/musicExploreTracks";
import type { MusicExploreShelfLink } from "@/lib/musicExplorePageContext";
import type { MusicExploreHarvestedTracklist } from "@/lib/musicExploreTracklistHarvest";
import {
  kickoffPlaylistDownloadSidecar,
  mergePlaylistSidecarMetadata,
  schedulePlaylistSidecarRootMetaBackfill,
  sidecarCoverNeedsHeal,
  sidecarMetadataFromHarvest,
  sidecarMetadataFromPlaylistPage,
  sidecarTracksFromMusicTrackInfo,
  type PlaylistSidecarMetadata,
} from "@/lib/playlistDownloadSidecar";
import {
  tryPlaylistPageFromHarvest,
  waitForCompleteHarvestPlaylist,
} from "@/lib/musicExploreTracklistHarvest";
import {
  MUSIC_EXPLORE_MAX_PLAYLIST_PAGES_PER_ACTION,
  throttleMusicExplorePageFetch,
} from "@/lib/ytdlpPageFetchThrottle";
import {
  getCachedMusicExplorePlaylist,
  patchCachedMusicExplorePlaylistItems,
  setCachedMusicExplorePlaylist,
} from "@/lib/musicExplorePlaylistCache";
import {
  MusicExploreDownloadCollapsed,
  type CollapsedCelebrate,
} from "./MusicExploreDownloadCollapsed";
import { cn } from "@/lib/utils";
import { useScrollEdgeState } from "@/hooks/useScrollEdgeState";

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
      /** Total items fetched from the backend so far (does not decrease when items are removed after completion). */
      fetchedCount: number;
      visibleCount: number;
      hasMore: boolean;
      total: number | null;
      loadingMore: boolean;
      sidecarMetadata?: PlaylistSidecarMetadata;
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
          "rf-music-tooltip-anchor shrink-0 w-5 h-5 rounded flex items-center justify-center transition-opacity disabled:opacity-40 outline-none focus:outline-none",
          downloading ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100",
        )}
        style={{ color: "var(--music-text-primary)" }}
        data-tooltip={downloading ? "Downloading" : "Download"}
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
  artistThumbnail,
  onClick,
}: {
  pl: MusicPlaylistInfo;
  index: number;
  artistThumbnail?: string | null;
  onClick: () => void;
}) {
  const thumbCandidates = useMemo(
    () =>
      [pl.thumbnail, artistThumbnail].filter(
        (u): u is string => typeof u === "string" && u.trim() !== "" && isLikelyImageUrl(u),
      ),
    [pl.thumbnail, artistThumbnail],
  );
  const [thumbIndex, setThumbIndex] = useState(0);
  useEffect(() => {
    setThumbIndex(0);
  }, [thumbCandidates]);
  const thumbSrc = thumbCandidates[thumbIndex] ?? null;

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
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded object-cover shrink-0"
          style={{ borderRadius: "var(--music-card-radius)" }}
          onError={() => setThumbIndex((i) => (i + 1 < thumbCandidates.length ? i + 1 : thumbCandidates.length))}
        />
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

const PANEL_LOAD_DEBOUNCE_MS = 500;

async function invokePlaylistItemsPage(
  url: string,
  offset: number,
  limit: number,
  browserCookies: string | null,
  cookieFile: string | null,
): Promise<MusicPlaylistPage> {
  await throttleMusicExplorePageFetch();
  return invoke<MusicPlaylistPage>("get_playlist_items_page", {
    url,
    offset,
    limit,
    browserCookies,
    cookieFile,
  });
}

function mergeShelfLinksIntoBrowse(
  result: MusicBrowseResult,
  shelfLinks: MusicExploreShelfLink[],
): MusicBrowseResult {
  if (shelfLinks.length === 0) return result;
  const seen = new Set(result.playlists.map((p) => p.url.trim()));
  const playlists = [...result.playlists];
  for (const link of shelfLinks) {
    const linkUrl = link.url.trim();
    if (!linkUrl || seen.has(linkUrl)) continue;
    seen.add(linkUrl);
    playlists.push({
      id: linkUrl,
      title: link.title.trim() || linkUrl,
      url: linkUrl,
      thumbnail: result.thumbnail,
      trackCount: null,
    });
  }
  return {
    ...result,
    playlists,
    browseKind: playlists.length > 0 ? null : result.browseKind,
  };
}

type Props = {
  /** The current browse URL (ignored in paste mode). */
  url: string;
  /** Visible album/playlist links from the YTM webview shelves. */
  shelfLinks?: MusicExploreShelfLink[];
  /** Album/playlist tracklist harvested from ytmusic-browse-response.data. */
  harvestedTracklist?: MusicExploreHarvestedTracklist | null;
  /** Current YTM page title (album/playlist name). */
  pageTitle?: string | null;
  /** Live webview page URLs used to decide whether null harvest may still arrive. */
  webviewHarvestUrls?: readonly string[];
  collapsed?: boolean;
  dockMinimized?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  /** Completion orb state (owned by MusicShell for all download sources). */
  celebrating?: CollapsedCelebrate | null;
};

/** Debounce before loading a pasted URL into the panel. */
const INITIAL_PLAYLIST_BATCH = 50;

export function MusicExploreDownloadPanel({
  url,
  shelfLinks = [],
  harvestedTracklist = null,
  pageTitle = null,
  webviewHarvestUrls = [],
  collapsed = false,
  dockMinimized = false,
  onClose,
  onMinimize,
  celebrating = null,
}: Props) {
  const settings = useRuforgeStore((s) => s.settings);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const internalVault = useRuforgeStore((s) => s.internalVault);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);

  const [phase, setPhase] = useState<Phase>(url ? { kind: "loading", url } : { kind: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const lastClickIndexRef = useRef<number | null>(null);
  const harvestedTracklistRef = useRef(harvestedTracklist);
  useEffect(() => {
    harvestedTracklistRef.current = harvestedTracklist;
  }, [harvestedTracklist]);
  const webviewHarvestUrlsRef = useRef(webviewHarvestUrls);
  useEffect(() => {
    webviewHarvestUrlsRef.current = webviewHarvestUrls;
  }, [webviewHarvestUrls]);

  const removeCompletedFromPlaylist = useCallback((completedUrls: string[]) => {
    if (completedUrls.length === 0) return;
    setPhase((p) => {
      if (p.kind !== "playlist") return p;
      const items = p.items.filter(
        (t) => !completedUrls.some((u) => youtubeUrlsMatch(t.url, u)),
      );
      patchCachedMusicExplorePlaylistItems(
        p.playlistUrl,
        items,
        p.hasMore,
        p.total,
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

  useEffect(() => {
    if (!celebrating || celebrating.kind !== "complete") return;
    const url = celebrating.url;
    const t = window.setTimeout(() => {
      removeCompletedFromPlaylist([url]);
    }, 2100);
    return () => window.clearTimeout(t);
  }, [celebrating?.url, celebrating?.kind, removeCompletedFromPlaylist]);

  const buildAudioOpts = useCallback(() => {
    const dir = resolveDownloadOutputDir(saveToInternal, outputDir, internalVault);
    const base = buildDownloadJobOptions(settings, dir);
    return patchDownloadJobOptionsForAudio(base, true, settings);
  }, [settings, outputDir, saveToInternal, internalVault]);

  const enqueueTracks = useCallback((
    tracks: MusicTrackInfo[],
    playlistTitle?: string,
    listUrl?: string,
    sidecarMetadata?: PlaylistSidecarMetadata,
  ) => {
    const opts = buildAudioOpts();
    const folderName = playlistTitle ? sanitizePlaylistFolderName(playlistTitle) : undefined;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      enqueueDownload(
        track.url,
        { ...opts, playlistOutputFolder: folderName, playlistIndex: i + 1 },
        {
          title: track.title,
          approval: "held",
          snapshot: {
            title: track.title,
            thumbnail: track.thumbnail?.trim() ?? "",
            duration: track.duration ?? 0,
            isPlaylist: false,
          },
        },
      );
    }
    if (folderName && listUrl?.trim() && tracks.length > 0) {
      void kickoffPlaylistDownloadSidecar({
        outputDir: opts.outputDir,
        folderName,
        listUrl: listUrl.trim(),
        title: playlistTitle?.trim() || folderName,
        tracks: sidecarTracksFromMusicTrackInfo(tracks),
        metadata: sidecarMetadata,
      }).catch(() => {
        /* sidecar is best-effort */
      });
      if (sidecarCoverNeedsHeal(sidecarMetadata?.coverUrl)) {
        schedulePlaylistSidecarRootMetaBackfill({
          outputDir: opts.outputDir,
          folderName,
          listUrl: listUrl.trim(),
          browserCookies: settings.browserContext ?? null,
          cookieFile: settings.cookieFile ?? null,
          known: sidecarMetadata,
        });
      }
    }
    releaseHeldDownloadJobs();
    pumpDownloadQueue();
  }, [buildAudioOpts, enqueueDownload, pumpDownloadQueue, releaseHeldDownloadJobs, settings.browserContext, settings.cookieFile]);

  const applyPlaylistPhase = useCallback((
    playlistTitle: string,
    playlistUrl: string,
    page: MusicPlaylistPage,
    fromCache = false,
  ) => {
    const sidecarMetadata = mergePlaylistSidecarMetadata(
      sidecarMetadataFromHarvest(playlistUrl, harvestedTracklist),
      sidecarMetadataFromPlaylistPage(page, playlistUrl),
    );
    const entry = {
      playlistTitle,
      playlistUrl,
      items: page.items,
      hasMore: page.hasMore,
      total: page.total,
    };
    if (!fromCache) {
      setCachedMusicExplorePlaylist(playlistUrl, entry);
    }
    setPhase({
      kind: "playlist",
      playlistTitle,
      playlistUrl,
      items: page.items,
      fetchedCount: page.items.length,
      visibleCount: page.items.length,
      hasMore: page.hasMore,
      total: page.total,
      loadingMore: false,
      sidecarMetadata,
    });
  }, [harvestedTracklist]);

  // Destructure only the settings fields that affect doLoad so unrelated setting changes
  // (theme, volume, etc.) don't trigger a panel reload via the [url, doLoad] effect.
  const { preferredQuality, browserContext, cookieFile } = settings;
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

    if (kind === "playlist" || isMusicYouTubePlaylistUrl(canonical)) {
      const playlistTitle = pageTitle?.trim() || playlistFolderTitle(null, canonical);
      const harvestedPage = await waitForCompleteHarvestPlaylist(
        () => harvestedTracklistRef.current,
        canonical,
        playlistTitle,
        ac.signal,
        () => webviewHarvestUrlsRef.current,
      );
      if (harvestedPage) {
        if (ac.signal.aborted) return;
        setSelected(new Set());
        lastClickIndexRef.current = null;
        applyPlaylistPhase(
          playlistFolderTitle(harvestedPage.title ?? pageTitle, canonical),
          canonical,
          harvestedPage,
        );
        return;
      }

      const cached = getCachedMusicExplorePlaylist(canonical);
      if (cached) {
        if (ac.signal.aborted) return;
        setSelected(new Set());
        lastClickIndexRef.current = null;
        applyPlaylistPhase(
          cached.playlistTitle,
          cached.playlistUrl,
          {
            items: cached.items,
            hasMore: cached.hasMore,
            total: cached.total,
          },
          true,
        );
        return;
      }
    }

    setPhase({ kind: "loading", url: canonical });
    setSelected(new Set());
    lastClickIndexRef.current = null;

    try {
      if (kind === "playlist" || isMusicYouTubePlaylistUrl(canonical)) {
        const page = await invokePlaylistItemsPage(
          canonical,
          0,
          INITIAL_PLAYLIST_BATCH,
          browserContext ?? null,
          cookieFile ?? null,
        );
        if (ac.signal.aborted) return;
        applyPlaylistPhase(
          playlistFolderTitle(page.title ?? pageTitle, canonical),
          canonical,
          page,
        );
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
          fetchedCount: 1,
          visibleCount: 1,
          hasMore: false,
          total: 1,
          loadingMore: false,
        });
        return;
      }

      if (kind === "browse" || isMusicYouTubeUrl(canonical)) {
        const harvestedBrowsePage = tryPlaylistPageFromHarvest(
          harvestedTracklist,
          canonical,
          pageTitle?.trim() || playlistFolderTitle(null, canonical),
        );
        if (harvestedBrowsePage) {
          if (ac.signal.aborted) return;
          applyPlaylistPhase(
            playlistFolderTitle(harvestedBrowsePage.title ?? pageTitle, canonical),
            canonical,
            harvestedBrowsePage,
          );
          return;
        }

        const result = mergeShelfLinksIntoBrowse(
          await invoke<MusicBrowseResult>("get_music_browse_info", {
            url: canonical,
            browserCookies: browserContext ?? null,
            cookieFile: cookieFile ?? null,
          }),
          shelfLinks,
        );
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPlaylistPhase, preferredQuality, browserContext, cookieFile, shelfLinks, harvestedTracklist, pageTitle]);

  const openPlaylist = useCallback(async (pl: MusicPlaylistInfo) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const playlistTitle = playlistFolderTitle(pl.title, pl.url);
    const harvestedPage = await waitForCompleteHarvestPlaylist(
      () => harvestedTracklistRef.current,
      pl.url,
      playlistTitle,
      ac.signal,
      () => webviewHarvestUrlsRef.current,
    );
    if (harvestedPage) {
      if (ac.signal.aborted) return;
      setSelected(new Set());
      lastClickIndexRef.current = null;
      applyPlaylistPhase(playlistTitle, pl.url, harvestedPage);
      return;
    }

    const cached = getCachedMusicExplorePlaylist(pl.url);
    if (cached) {
      if (ac.signal.aborted) return;
      setSelected(new Set());
      lastClickIndexRef.current = null;
      applyPlaylistPhase(
        cached.playlistTitle,
        cached.playlistUrl,
        {
          items: cached.items,
          hasMore: cached.hasMore,
          total: cached.total,
        },
        true,
      );
      return;
    }

    setPhase({ kind: "loading", url: pl.url });
    setSelected(new Set());
    lastClickIndexRef.current = null;

    try {
      const page = await invokePlaylistItemsPage(
        pl.url,
        0,
        INITIAL_PLAYLIST_BATCH,
        browserContext ?? null,
        cookieFile ?? null,
      );
      if (ac.signal.aborted) return;
      const title = playlistFolderTitle(page.title ?? pl.title, pl.url);
      applyPlaylistPhase(title, pl.url, page);
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ kind: "error", message: String(e) });
    }
  }, [applyPlaylistPhase, browserContext, cookieFile]);

  const loadAllRemaining = useCallback(async () => {
    if (phase.kind !== "playlist" || phase.loadingMore) return;
    const { playlistUrl, playlistTitle, fetchedCount, total: startTotal } = phase;
    setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: true } : p);
    try {
      // Use fetchedCount (not items.length) as the starting offset so that items
      // already downloaded and removed from the UI don't cause position gaps on the backend.
      const newItems: MusicTrackInfo[] = [];
      let hasMore = true;
      let total = startTotal;
      let pagesFetched = 0;
      while (hasMore && pagesFetched < MUSIC_EXPLORE_MAX_PLAYLIST_PAGES_PER_ACTION) {
        const page = await invokePlaylistItemsPage(
          playlistUrl,
          fetchedCount + newItems.length,
          100,
          browserContext ?? null,
          cookieFile ?? null,
        );
        pagesFetched += 1;
        newItems.push(...page.items);
        hasMore = page.hasMore;
        total = page.total ?? total;
        if (page.items.length === 0) break;
      }
      const allFetched = fetchedCount + newItems.length;
      setPhase((p) => {
        if (p.kind !== "playlist") return p;
        const allItems = [...p.items, ...newItems];
        // Write cache inside the functional update so p.items is always current
        setCachedMusicExplorePlaylist(playlistUrl, {
          playlistTitle,
          playlistUrl,
          items: allItems,
          hasMore: false,
          total,
        });
        return {
          ...p,
          items: allItems,
          fetchedCount: allFetched,
          visibleCount: allItems.length,
          hasMore: false,
          total,
          loadingMore: false,
        };
      });
    } catch {
      setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: false } : p);
    }
  }, [phase, browserContext, cookieFile]);

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

  useEffect(() => {
    if (!url.trim()) {
      abortRef.current?.abort();
      setPhase({ kind: "idle" });
      setSelected(new Set());
      lastClickIndexRef.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      void doLoad(url);
    }, PANEL_LOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [url, doLoad]);

  const selectedTracks =
    phase.kind === "playlist"
      ? phase.items.filter((t, i) => selected.has(musicTrackKey(t, i)))
      : [];

  const isLoading = phase.kind === "loading";

  const activeDownloadCount = useMemo(() => {
    if (phase.kind !== "playlist") return 0;
    return countActivePlaylistDownloads(downloadJobs, phase.items);
  }, [phase, downloadJobs]);

  const isRetrying = useMemo(() => {
    if (phase.kind !== "playlist") return false;
    const folder = sanitizePlaylistFolderName(phase.playlistTitle);
    if (!folder) return false;
    return downloadJobs.some(
      (j) =>
        j.options.playlistOutputFolder === folder &&
        (j.attemptCount ?? 1) > 1 &&
        (j.status === "queued" || j.status === "downloading"),
    );
  }, [phase, downloadJobs]);

  const totalActiveJobCount = useMemo(
    () => downloadJobs.filter(
      (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
    ).length,
    [downloadJobs],
  );

  const handleCancelAll = useCallback(() => {
    for (const job of downloadJobs) {
      if (job.status === "queued" || job.status === "downloading" || job.status === "paused") {
        void removeDownloadJob(job.id, { manual: true });
      }
    }
  }, [downloadJobs, removeDownloadJob]);

  const {
    scrollRef: contentScrollRef,
    edges: contentScrollEdges,
    onScroll: onContentScroll,
  } = useScrollEdgeState([phase, collapsed, dockMinimized]);

  if (collapsed) {
    if (dockMinimized) return null;
    const playlistItems = phase.kind === "playlist" ? phase.items : [];
    return (
      <div
        className="flex flex-col flex-1 min-h-0 w-full"
        style={{ background: "var(--music-surface)", color: "var(--music-text-primary)" }}
      >
        <MusicExploreDownloadCollapsed
          items={playlistItems}
          downloadJobs={downloadJobs}
          celebrating={celebrating}
          loading={phase.kind === "loading"}
          playlistBatch={
            (phase.kind === "playlist" && playlistItems.length > 1) ||
            (playlistItems.length === 0 && totalActiveJobCount > 1)
          }
          onMinimize={onMinimize}
          onCancelAll={totalActiveJobCount > 0 ? handleCancelAll : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 min-w-0 w-full"
      style={{ background: "var(--music-surface)", color: "var(--music-text-primary)" }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5"
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
              {isRetrying && (
                <motion.span
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1 text-[10px]"
                  style={{ color: "var(--music-text-muted)" }}
                >
                  <Loader2 size={10} className="animate-spin shrink-0" />
                  Retrying failed items…
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
              onClick={() => { enqueueTracks(selectedTracks, phase.playlistTitle, phase.playlistUrl, phase.sidecarMetadata); setSelected(new Set()); }}
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
              onClick={() => enqueueTracks(phase.items, phase.playlistTitle, phase.playlistUrl, phase.sidecarMetadata)}
              className="rf-music-tooltip-anchor flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border hover:bg-white/10 transition-colors"
              style={{ borderColor: "var(--music-border)", color: "var(--music-text-primary)" }}
              data-tooltip="Download all loaded tracks"
            >
              <Download size={10} />
              All
            </button>
          )}
          {totalActiveJobCount > 0 && (
            <button
              type="button"
              onClick={handleCancelAll}
              className="rf-music-tooltip-anchor w-6 h-6 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity rounded"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label="Stop all downloads"
              data-tooltip="Stop all"
            >
              <Ban size={12} />
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
      <div
        className="rf-scroll-edge-wrap flex-1 min-h-0"
        data-scroll-top={contentScrollEdges.top ? "true" : undefined}
        data-scroll-bottom={contentScrollEdges.bottom ? "true" : undefined}
      >
        <div
          ref={contentScrollRef}
          onScroll={onContentScroll}
          className="h-full overflow-y-auto rf-scrollbar px-2 py-1.5"
        >
        {phase.kind === "idle" && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <p className="text-[11px]" style={{ color: "var(--music-text-muted)" }}>
              Browse to a playlist or paste a link to get started.
            </p>
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
              <p className="text-[11px] py-4 text-center" style={{ color: "var(--music-text-muted)" }}>
                {phase.result.browseKind === "channel_tabs_only"
                  ? "Open the Albums or Browse tab for this artist in Explore, then Pick tracks again."
                  : "No albums or playlists found. Try the Browse tab or paste a playlist link."}
              </p>
            ) : (
              phase.result.playlists.map((pl, i) => (
                <PlaylistCard
                  key={musicPlaylistKey(pl, i)}
                  pl={pl}
                  index={i}
                  artistThumbnail={phase.result.thumbnail}
                  onClick={() => void openPlaylist(pl)}
                />
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
                    animDelay={Math.min(i * 0.025, 0.35)}
                    onRowClick={(shift) => handleRowClick(i, key, shift)}
                    onDownload={() => enqueueTracks([track], phase.playlistTitle, phase.playlistUrl, phase.sidecarMetadata)}
                  />
                );
              })}
            </AnimatePresence>

            {phase.hasMore && !phase.loadingMore && (
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
    </div>
  );
}
