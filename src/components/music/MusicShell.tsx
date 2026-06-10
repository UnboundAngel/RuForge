import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { appDataDir, join } from "@tauri-apps/api/path";
import { Webview } from "@tauri-apps/api/webview";
import { MusicNav } from "./MusicNav";
import { MusicHomeView } from "./MusicHomeView";
import { MusicExploreView } from "./MusicExploreView";
import { MusicLibraryView } from "./MusicLibraryView";
import { MusicArtistView } from "./MusicArtistView";
import { MusicAlbumView } from "./MusicAlbumView";
import { MusicLikedView } from "./MusicLikedView";
import { MusicTrackView } from "./MusicTrackView";
import { MusicProfileView } from "./MusicProfileView";
import { MusicStatsView } from "./MusicStatsView";
import { MusicExploreBottomBar } from "./MusicExploreBottomBar";
import { MusicNavBackCell } from "./MusicNavBackCell";
import { MusicExploreDownloadPanel } from "./MusicExploreDownloadPanel";
import {
  ExploreDownloadDockChip,
  type CollapsedCelebrate,
} from "./MusicExploreDownloadCollapsed";
import { NowPlayingBar } from "./NowPlayingBar";
import { MusicStorageStrip } from "./MusicStorageStrip";
import { useMusicPlayback } from "./useMusicPlayback";
import { AudioHeroStage } from "@/components/player/AudioHeroStage";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import {
  ensureEmbeddedExplorerWebview,
  EXPLORER_PAUSE_MEDIA_SCRIPT,
  explorerForceNavigateScript,
  getEmbeddedExplorerWebview,
} from "@/explorerWebviewLifecycle";
import { youtubeMusicSearchUrl, extractYouTubeVideoId } from "@/youtubeUrl";
import {
  MUSIC_EXPLORE_INIT_SCRIPT,
  MUSIC_EXPLORE_NOW_PLAYING_EVENT,
  MUSIC_EXPLORE_NOW_PLAYING_INSTALL,
  MUSIC_EXPLORE_PAGE_CONTEXT_EVENT,
  MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL,
  MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
  MUSIC_EXPLORE_WEBVIEW_LABEL,
} from "@/explorerProfileScript";
import {
  classifyMusicExplorePageFromUrl,
  mergeMusicExplorePageContext,
  resolveExplorePanelUrl,
  type MusicExplorePageContext,
  type MusicExplorePageContextPayload,
} from "@/lib/musicExplorePageContext";
import {
  cancelAllMusicExploreAutoSave,
  scheduleMusicExploreAutoSave,
} from "@/lib/musicExploreAutoSave";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import {
  readExplorerHostBounds,
  explorerBoundsEqual,
  createExplorerBoundsRafScheduler,
  runExplorerLayoutTransitionFollowUp,
  type ExplorerBounds,
} from "@/explorerBoundsSync";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { MusicRightPanel, type RightPanelTab } from "./MusicRightPanel";
import { useSponsorBlockPlayback } from "@/hooks/useSponsorBlockPlayback";
import { getRecentHistory, type PlayHistoryEntry } from "./musicPlayHistory";
import { importLegacyListenDataIfNeeded } from "@/lib/musicListenLegacyImport";
import { refreshListenSnapshot } from "@/lib/musicListenSnapshot";
import { setPendingListenEndReason } from "@/lib/musicListenSession";
import { readMusicOnlySkip, writeMusicOnlySkip } from "./musicOnlySkipStorage";
import { debugLog } from "@/debug/debugLog";
import {
  onYoutubeAuthSurfaceEnter,
  onYoutubeAuthSurfaceLeave,
} from "@/lib/youtubeAuthSurface";
import { profileNeedsIdentityProbe } from "@/lib/youtubeProfileSession";
import {
  profileNeedsAvatarProbe,
  runMusicExploreProfileProbe,
} from "@/lib/youtubeProfileProbeRunner";

const MUSIC_EXPLORE_URL = "https://music.youtube.com";

/** Emitted by the music webview on every navigation; carries the new URL. */
const MUSIC_EXPLORE_URL_EVENT = "music-explore-url";

function logMusicExploreNavigation(
  source: string,
  detail: Record<string, unknown>,
): void {
  debugLog("music.explore-nav", "info", source, detail);
}

const sidebarEase = [0.4, 0, 0.2, 1] as const;
const SIDEBAR_FULL = "var(--music-sidebar-width)";
const SIDEBAR_COLLAPSED = "var(--music-sidebar-collapsed-width)";

type ExpandedOverlayProps = {
  coverSrc: string | null;
  isPaused: boolean;
  isMuted: boolean;
  onTogglePlay: () => void;
};

function ExpandedOverlay({
  coverSrc,
  isPaused,
  isMuted,
  onTogglePlay,
}: ExpandedOverlayProps) {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const artist = playingFile?.artist ?? playingFile?.albumArtist
    ?? (playingFile?.name.includes(" - ") ? playingFile.name.split(" - ")[0].trim() : "");

  return (
    <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
      <AudioHeroStage
        coverSrc={coverSrc}
        audioEl={null}
        connectKey={playingFile?.path ?? ""}
        isPaused={isPaused}
        isMuted={isMuted}
        layer="foreground"
        onTogglePlay={onTogglePlay}
      />
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 z-20 px-6 max-w-lg mx-auto w-full">
        <MarqueeText
          text={playingFile?.name ?? ""}
          className="text-base font-semibold text-white/90 w-full"
          centered
        />
        {artist && (
          <div className="text-sm text-white/55 text-center w-full truncate">{artist}</div>
        )}
        {playingFile?.album && (
          <div className="text-xs text-white/35 text-center w-full truncate">{playingFile.album}</div>
        )}
      </div>
    </div>
  );
}

export function MusicShell() {
  const activeView = useRuforgeStore((s) => s.musicView);
  const setMusicView = useRuforgeStore((s) => s.setMusicView);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [currentMusicExploreUrl, setCurrentMusicExploreUrl] = useState("");
  const [musicExplorePageContext, setMusicExplorePageContext] = useState<MusicExplorePageContext>(
    () => classifyMusicExplorePageFromUrl(""),
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"pick" | "paste">("pick");
  const [pasteUrl, setPasteUrl] = useState("");
  const [dockMinimized, setDockMinimized] = useState(false);
  const [dockCelebrating, setDockCelebrating] = useState<CollapsedCelebrate | null>(null);
  const [dockPanelSession, setDockPanelSession] = useState(false);

  // Right panel state
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("queue");
  const [musicOnlySkip, setMusicOnlySkipState] = useState(() => readMusicOnlySkip());
  const [historyEntries, setHistoryEntries] = useState<PlayHistoryEntry[]>(() => getRecentHistory());

  const toggleMusicOnlySkip = useCallback(() => {
    setMusicOnlySkipState((prev) => {
      writeMusicOnlySkip(!prev);
      return !prev;
    });
  }, []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playback = useMusicPlayback(audioRef);

  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const musicExploreWebviewRef = useRef<Webview | null>(null);
  const musicExploreCreatingRef = useRef(false);
  const musicExploreLastBoundsRef = useRef<ExplorerBounds | null>(null);
  const musicExploreScheduleRef = useRef<(() => void) | null>(null);
  const musicExploreNavigatePendingRef = useRef<string | null>(null);
  const runPendingMusicExploreNavigateRef = useRef<() => Promise<void>>(async () => {});
  const prevExploreWebviewActiveRef = useRef(false);
  /** Session-level dedup: videoIds already auto-queued this session. */
  const autoQueuedVideoIdsRef = useRef<Set<string>>(new Set());

  runPendingMusicExploreNavigateRef.current = async () => {
    const url = musicExploreNavigatePendingRef.current;
    if (!url) return;
    const wv =
      musicExploreWebviewRef.current
      ?? (await getEmbeddedExplorerWebview(MUSIC_EXPLORE_WEBVIEW_LABEL));
    if (!wv) return;
    try {
      await invoke("eval_in_webview", {
        label: MUSIC_EXPLORE_WEBVIEW_LABEL,
        script: explorerForceNavigateScript(url),
      });
      musicExploreNavigatePendingRef.current = null;
    } catch {
      /* webview hidden or still attaching */
    }
  };

  const assignWebviewHostRef = useCallback((el: HTMLDivElement | null) => {
    webviewHostRef.current = el;
    if (el) {
      musicExploreLastBoundsRef.current = null;
      musicExploreScheduleRef.current?.();
      runExplorerLayoutTransitionFollowUp(
        musicExploreScheduleRef.current ?? (() => {}),
        400,
      );
    }
  }, []);

  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const prevAutoQueueJobsRef = useRef(downloadJobs);
  const cycleNavMode = useRuforgeStore((s) => s.cycleNavMode);
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openMusicAlbum = useRuforgeStore((s) => s.openMusicAlbum);
  const closeMusicDetail = useRuforgeStore((s) => s.closeMusicDetail);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const setFolderAudioPlaylist = useRuforgeStore((s) => s.setFolderAudioPlaylist);
  const setPlayingFile = useRuforgeStore((s) => s.setPlayingFile);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const settings = useRuforgeStore((s) => s.settings);
  const folderAudioPlaylist = useRuforgeStore((s) => s.folderAudioPlaylist);
  const handlePlayFolderNeighbor = useRuforgeStore((s) => s.handlePlayFolderNeighbor);
  const sbPlayback = useSponsorBlockPlayback({
    file: playingFile ?? ({ path: "", sourceId: null } as unknown as MediaFile),
    currentTime: playback.currentTime,
    enabled: !!playingFile && settings.sponsorBlockEnabled,
    settings,
    seekTo: playback.seek,
    onManualSkip: () => {},
    onAppearance: () => {},
    onDemoteUndo: () => {},
  });

  // Music-only skip: auto-seek past music_offtopic segments when toggle is on
  const musicOnlySkippedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!musicOnlySkip) return;
    if (!playingFile) return;
    const ct = playback.currentTime;
    for (const seg of sbPlayback.segments) {
      if (seg.category !== "music_offtopic") continue;
      if (seg.actionType !== "skip") continue;
      const [start, end] = seg.segment;
      if (ct >= start && ct < end - 0.25) {
        const key = seg.UUID || `${start}-${end}`;
        if (musicOnlySkippedRef.current.has(key)) continue;
        musicOnlySkippedRef.current.add(key);
        playback.seek(end);
        return;
      }
    }
  }, [musicOnlySkip, playback.currentTime, sbPlayback.segments, playingFile, playback.seek]);

  // Reset music-only-skip seen-set when track changes
  useEffect(() => {
    musicOnlySkippedRef.current.clear();
  }, [playingFile?.path]);

  // Refresh history tab when playback changes (snapshot updated by listen session).
  useEffect(() => {
    if (!playingFile) return;
    void refreshListenSnapshot().then(() => setHistoryEntries(getRecentHistory()));
  }, [playingFile?.path]);

  useEffect(() => {
    void importLegacyListenDataIfNeeded().then(() => refreshListenSnapshot());
  }, []);

  const isPasteMode = panelMode === "paste";
  const showExploreStrip = activeView === "explore" && !musicDetail && !playerExpanded;
  const showExplorePanel = activeView === "explore" && panelOpen;
  const exploreWebviewActive = showExploreStrip;

  useEffect(() => {
    logMusicExploreNavigation("shell-state", {
      activeView,
      exploreWebviewActive,
      showExploreStrip,
      musicDetail: musicDetail ? musicDetail.kind : null,
      playerExpanded,
      currentUrl: currentMusicExploreUrl,
      kind: musicExplorePageContext.kind,
      pageTitle: musicExplorePageContext.pageTitle,
      actionUrl: musicExplorePageContext.actionUrl,
      canDownloadPlaylist: musicExplorePageContext.canDownloadPlaylist,
      hint: musicExplorePageContext.hint,
    });
  }, [
    activeView,
    exploreWebviewActive,
    showExploreStrip,
    musicDetail,
    playerExpanded,
    currentMusicExploreUrl,
    musicExplorePageContext,
  ]);
  const hasActiveDownloadJobs = downloadJobs.some(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  );
  const explorePanelDockMode = dockMinimized || !showExplorePanel;

  useEffect(() => {
    if (explorePanelDockMode && hasActiveDownloadJobs) {
      setDockPanelSession(true);
      return;
    }
    if (!hasActiveDownloadJobs && !dockCelebrating && dockPanelSession) {
      const t = window.setTimeout(() => setDockPanelSession(false), 2400);
      return () => window.clearTimeout(t);
    }
  }, [
    explorePanelDockMode,
    hasActiveDownloadJobs,
    dockCelebrating,
    dockPanelSession,
  ]);

  const keepExplorePanelMounted =
    showExplorePanel ||
    hasActiveDownloadJobs ||
    dockCelebrating != null ||
    (explorePanelDockMode && dockPanelSession);
  const showDownloadDockChip =
    dockCelebrating != null ||
    hasActiveDownloadJobs ||
    explorePanelDockMode;

  const showMusicStorageStrip =
    !playingFile
    && !showExploreStrip
    && !playerExpanded
    && !hasActiveDownloadJobs
    && dockCelebrating == null;

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (playerExpanded && rightPanelTab === "segments") setRightPanelTab("queue");
  }, [playerExpanded, playingFile?.path]);

  const resyncExploreWebview = useCallback(() => {
    musicExploreLastBoundsRef.current = null;
    const schedule = musicExploreScheduleRef.current;
    if (!schedule) return;
    schedule();
    runExplorerLayoutTransitionFollowUp(schedule, 400);
  }, []);

  const closeExplorePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelMode("pick");
    setPasteUrl("");
    setDockMinimized(false);
    resyncExploreWebview();
  }, [resyncExploreWebview]);

  // Freeze the panel URL when it is hidden so navigation in the webview does not trigger
  // unnecessary doLoad calls inside MusicExploreDownloadPanel while it is off-screen.
  const panelUrlRef = useRef(
    resolveExplorePanelUrl(pasteUrl, musicExplorePageContext, currentMusicExploreUrl),
  );
  const currentPanelUrl = resolveExplorePanelUrl(
    pasteUrl,
    musicExplorePageContext,
    currentMusicExploreUrl,
  );
  if (showExplorePanel) panelUrlRef.current = currentPanelUrl;
  const explorePanelUrl = showExplorePanel ? currentPanelUrl : panelUrlRef.current;
  const webviewHarvestUrls = [
    currentMusicExploreUrl,
    musicExplorePageContext.url,
    musicExplorePageContext.actionUrl,
    musicExplorePageContext.browseTargetUrl,
  ].filter((u): u is string => Boolean(u?.trim()));

  useEffect(() => {
    void getEmbeddedExplorerWebview(MUSIC_EXPLORE_WEBVIEW_LABEL).then((webview) => {
      if (webview) musicExploreWebviewRef.current = webview;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let unlistenFn: (() => void) | undefined;
    void listen<string>(MUSIC_EXPLORE_URL_EVENT, (ev) => {
      if (!alive) return;
      const url = ev.payload ?? "";
      logMusicExploreNavigation("webview-url", { url });
      setCurrentMusicExploreUrl(url);
      // Only seed a URL-based context when the URL actually changed; the richer
      // page-context event (which carries kind/playlistUrl/pageTitle) takes precedence
      // and must not be overwritten when both events arrive for the same URL.
      setMusicExplorePageContext((prev) => {
        if (prev.url === url) {
          logMusicExploreNavigation("webview-url-context-unchanged", {
            url,
            kind: prev.kind,
            actionUrl: prev.actionUrl,
          });
          return prev;
        }
        const next = classifyMusicExplorePageFromUrl(url);
        logMusicExploreNavigation("webview-url-classified", {
          url,
          kind: next.kind,
          actionUrl: next.actionUrl,
          canDownloadPlaylist: next.canDownloadPlaylist,
          canPickTracks: next.canPickTracks,
        });
        return next;
      });
    }).then((fn) => {
      if (!alive) {
        fn();
        return;
      }
      unlistenFn = fn;
    });
    return () => {
      alive = false;
      unlistenFn?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let unlistenFn: (() => void) | undefined;
    void listen<MusicExplorePageContextPayload>(MUSIC_EXPLORE_PAGE_CONTEXT_EVENT, (ev) => {
      if (!alive) return;
      const payload = ev.payload;
      if (!payload?.url) {
        logMusicExploreNavigation("webview-page-context-empty", { payload });
        return;
      }
      logMusicExploreNavigation("webview-page-context", { payload });
      setCurrentMusicExploreUrl(payload.url);
      const merged = mergeMusicExplorePageContext(payload.url, payload);
      logMusicExploreNavigation("webview-page-context-merged", {
        url: merged.url,
        kind: merged.kind,
        pageTitle: merged.pageTitle,
        actionUrl: merged.actionUrl,
        canDownloadPlaylist: merged.canDownloadPlaylist,
        canPickTracks: merged.canPickTracks,
        hint: merged.hint,
      });
      setMusicExplorePageContext(merged);
    }).then((fn) => {
      if (!alive) {
        fn();
        return;
      }
      unlistenFn = fn;
    });
    return () => {
      alive = false;
      unlistenFn?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let unlistenFn: (() => void) | undefined;
    void listen<{ videoId: string; title?: string | null }>(
      MUSIC_EXPLORE_NOW_PLAYING_EVENT,
      (ev) => {
        if (!alive) return;
        const { videoId, title } = ev.payload ?? {};
        if (!videoId) return;

        const store = useRuforgeStore.getState();
        if (store.settings.autoDownloadPlayingSongs === false) return;

        if (autoQueuedVideoIdsRef.current.has(videoId)) return;

        scheduleMusicExploreAutoSave({ videoId, title }, (payload) => {
          if (!alive) return;
          if (autoQueuedVideoIdsRef.current.has(payload.videoId)) return;
          autoQueuedVideoIdsRef.current.add(payload.videoId);

          const s = useRuforgeStore.getState();
          const watchUrl = `https://www.youtube.com/watch?v=${payload.videoId}`;
          const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir);
          const base = buildDownloadJobOptions(s.settings, dir);
          const opts = patchDownloadJobOptionsForAudio(base, true, s.settings);

          s.enqueueDownload(
            watchUrl,
            opts,
            { title: payload.title ?? undefined, approval: "auto" },
          );
          s.releaseHeldDownloadJobs();
          s.pumpDownloadQueue();
          setDockMinimized(false);
          setDockPanelSession(true);
        });
      },
    ).then((fn) => {
      if (!alive) {
        fn();
        return;
      }
      unlistenFn = fn;
    });
    return () => {
      alive = false;
      cancelAllMusicExploreAutoSave();
      unlistenFn?.();
    };
  }, []);

  // Prune autoQueuedVideoIdsRef when a job is removed so the same song can be re-downloaded.
  useEffect(() => {
    const prev = prevAutoQueueJobsRef.current;
    prevAutoQueueJobsRef.current = downloadJobs;
    for (const job of prev) {
      if (!downloadJobs.some((j) => j.id === job.id)) {
        const videoId = extractYouTubeVideoId(job.url);
        if (videoId) autoQueuedVideoIdsRef.current.delete(videoId);
      }
    }
  }, [downloadJobs]);

  const handlePasteUrlReady = useCallback((url: string) => {
    setPasteUrl(url);
    setPanelMode("pick");
    setPanelOpen(true);
    setNavCollapsed(false);
  }, []);

  useEffect(() => {
    if (activeView !== "explore") {
      setPanelOpen(false);
      setPanelMode("pick");
      setPasteUrl("");
    }
  }, [activeView]);

  const musicExploreProbeOnceRef = useRef(false);

  useEffect(() => {
    const was = prevExploreWebviewActiveRef.current;
    prevExploreWebviewActiveRef.current = exploreWebviewActive;
    if (!was && exploreWebviewActive) {
      onYoutubeAuthSurfaceEnter();
    }
    if (was && !exploreWebviewActive) {
      onYoutubeAuthSurfaceLeave();
    }
  }, [exploreWebviewActive]);

  useEffect(() => {
    if (!exploreWebviewActive) {
      musicExploreProbeOnceRef.current = false;
      return;
    }
    if (musicExploreProbeOnceRef.current) return;
    const { youtubeExplorerProfile, youtubeSessionStatus } =
      useRuforgeStore.getState();
    if (
      !profileNeedsAvatarProbe()
      && !profileNeedsIdentityProbe(youtubeExplorerProfile, youtubeSessionStatus)
    ) {
      return;
    }
    musicExploreProbeOnceRef.current = true;
    const t = window.setTimeout(() => {
      void runMusicExploreProfileProbe("music-explore-open");
    }, 1500);
    return () => clearTimeout(t);
  }, [exploreWebviewActive]);

  useEffect(() => {
    if (!exploreWebviewActive) return;
    musicExploreLastBoundsRef.current = null;
    const schedule = musicExploreScheduleRef.current;
    if (!schedule) return;
    schedule();
    runExplorerLayoutTransitionFollowUp(schedule, 400);
  }, [exploreWebviewActive]);

  useEffect(() => {
    if (!exploreWebviewActive) return;
    let cancelled = false;
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      frames += 1;
      if (webviewHostRef.current) {
        musicExploreLastBoundsRef.current = null;
        musicExploreScheduleRef.current?.();
        return;
      }
      if (frames < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [exploreWebviewActive]);

  useEffect(() => {
    if (!exploreWebviewActive) return;
    resyncExploreWebview();
  }, [musicDetail, playerExpanded, panelOpen, panelMode, navCollapsed, exploreWebviewActive, resyncExploreWebview]);

  // Deps: exploreWebviewActive only. Layout churn schedules via musicExploreScheduleRef.
  useEffect(() => {
    let active = true;
    const wasActive = prevExploreWebviewActiveRef.current;
    prevExploreWebviewActiveRef.current = exploreWebviewActive;

    const pauseMedia = async () => {
      if (!active) return;
      try {
        await invoke("eval_in_webview", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          script: EXPLORER_PAUSE_MEDIA_SCRIPT,
        });
      } catch { /* not mounted */ }
    };

    const injectMusicExploreBridge = async () => {
      try {
        await invoke("eval_in_webview", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          script: MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL,
        });
        await invoke("eval_in_webview", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          script: MUSIC_EXPLORE_NOW_PLAYING_INSTALL,
        });
        logMusicExploreNavigation("webview-bridge-injected", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          note: "Uses __TAURI_INTERNALS__.invoke — events should now reach main window",
        });
      } catch (e) {
        logMusicExploreNavigation("webview-bridge-inject-failed", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };

    const applyMusicExploreBounds = async (bounds: ExplorerBounds) => {
      if (!musicExploreWebviewRef.current) {
        if (musicExploreCreatingRef.current) return;
        musicExploreCreatingRef.current = true;
        try {
          const dataDir = await appDataDir();
          const explorerDataPath = await join(dataDir, "explorer-data");
          const extraBrowserArgs = await invoke<string | null>(
            "get_hardware_acceleration_browser_args",
          );
          const appWindow = getCurrentWindow();
          const pendingStartUrl = musicExploreNavigatePendingRef.current;
          const webview = await ensureEmbeddedExplorerWebview({
            window: appWindow,
            label: MUSIC_EXPLORE_WEBVIEW_LABEL,
            url: pendingStartUrl ?? MUSIC_EXPLORE_URL,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            dataDirectory: explorerDataPath,
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            additionalBrowserArgs: extraBrowserArgs,
          });
          if (!active) return;
          musicExploreWebviewRef.current = webview;
          if (pendingStartUrl) {
            musicExploreNavigatePendingRef.current = null;
          }
          try {
            await invoke("eval_in_webview", {
              label: MUSIC_EXPLORE_WEBVIEW_LABEL,
              script: MUSIC_EXPLORE_INIT_SCRIPT,
            });
            await invoke("eval_in_webview", {
              label: MUSIC_EXPLORE_WEBVIEW_LABEL,
              script: MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
            });
            await injectMusicExploreBridge();
          } catch { /* bridge injected lazily */ }
        } catch (e) {
          musicExploreLastBoundsRef.current = null;
          debugLog("music.webview", "error", "Music explore webview error", e);
          musicExploreScheduleRef.current?.();
          return;
        } finally {
          musicExploreCreatingRef.current = false;
        }
      }

      const wv = musicExploreWebviewRef.current;
      if (!wv || !active) return;
      await wv.show();
      await Promise.all([
        wv.setPosition(new LogicalPosition(bounds.x, bounds.y)),
        wv.setSize(new LogicalSize(bounds.width, bounds.height)),
      ]);
      await injectMusicExploreBridge();
    };

    const syncWebview = async () => {
      if (!active) return;

      if (!exploreWebviewActive) {
        musicExploreLastBoundsRef.current = null;
        if (wasActive) {
          await pauseMedia();
        }
        const wv = musicExploreWebviewRef.current;
        if (wv) {
          try {
            await wv.hide();
          } catch { /* ok */ }
        }
        return;
      }

      const host = webviewHostRef.current;
      if (!host) return;

      const bounds = readExplorerHostBounds(host);
      if (!bounds) return;
      const pendingNavigate = musicExploreNavigatePendingRef.current;
      if (
        !pendingNavigate
        && explorerBoundsEqual(bounds, musicExploreLastBoundsRef.current)
      ) {
        return;
      }
      musicExploreLastBoundsRef.current = bounds;

      try {
        await applyMusicExploreBounds(bounds);
        if (musicExploreNavigatePendingRef.current) {
          await runPendingMusicExploreNavigateRef.current();
        }
      } catch (e) {
        musicExploreLastBoundsRef.current = null;
        debugLog("music.webview", "error", "Music explore bounds sync failed", e);
      }
    };

    const { schedule, cancel } = createExplorerBoundsRafScheduler(() => {
      void syncWebview();
    });
    musicExploreScheduleRef.current = schedule;
    schedule();

    window.addEventListener("resize", schedule);

    let resizeObserver: ResizeObserver | undefined;
    const attachResizeObserver = () => {
      const el = webviewHostRef.current;
      if (!el || !exploreWebviewActive) return;
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(el);
    };
    attachResizeObserver();
    const resizeObserverRaf = requestAnimationFrame(attachResizeObserver);

    let unlistenWindowResize: (() => void) | undefined;
    void getCurrentWindow().onResized(schedule).then((unlisten) => {
      if (!active) {
        unlisten();
        return;
      }
      unlistenWindowResize = unlisten;
    });

    return () => {
      active = false;
      musicExploreCreatingRef.current = false;
      musicExploreScheduleRef.current = null;
      cancel();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(resizeObserverRaf);
      resizeObserver?.disconnect();
      unlistenWindowResize?.();
    };
  }, [exploreWebviewActive]);

  const handlePlayFile = useCallback((file: MediaFile, playlist?: MediaFile[]) => {
    setPendingListenEndReason("manual_switch");
    setFolderAudioPlaylist(playlist ?? []);
    setPlayingFile(file);
  }, [setFolderAudioPlaylist, setPlayingFile]);

  const handleBack = useCallback(() => {
    cycleNavMode();
  }, [cycleNavMode]);

  const handleToggleExpand = useCallback(() => {
    setPlayerExpanded((prev) => !prev);
  }, []);

  const handleReloadExplore = useCallback(async () => {
    try {
      await invoke("eval_in_webview", {
        label: MUSIC_EXPLORE_WEBVIEW_LABEL,
        script: `(function(){try{location.reload();}catch(e){}})();`,
      });
    } catch {
      /* webview not mounted */
    }
  }, []);

  const schedulePendingMusicExploreNavigate = useCallback(() => {
    void runPendingMusicExploreNavigateRef.current();
    runExplorerLayoutTransitionFollowUp(
      () => { void runPendingMusicExploreNavigateRef.current(); },
      400,
    );
    runExplorerLayoutTransitionFollowUp(
      () => { void runPendingMusicExploreNavigateRef.current(); },
      900,
    );
  }, []);

  const handleSearchYoutubeMusic = useCallback(
    (query: string) => {
      const url = youtubeMusicSearchUrl(query);
      if (!url) return;
      musicExploreNavigatePendingRef.current = url;
      musicExploreLastBoundsRef.current = null;
      setMusicView("explore");
      resyncExploreWebview();
      schedulePendingMusicExploreNavigate();
    },
    [setMusicView, resyncExploreWebview, schedulePendingMusicExploreNavigate],
  );

  useEffect(() => {
    if (activeView !== "explore" || !exploreWebviewActive) return;
    if (!musicExploreNavigatePendingRef.current) return;
    schedulePendingMusicExploreNavigate();
  }, [activeView, exploreWebviewActive, schedulePendingMusicExploreNavigate]);

  const coverPath = playingFile ? bestCoverPath(playingFile) : null;
  const coverSrc = coverPath ? convertFileSrc(coverPath) : null;
  const chapters = playingFile?.chapters ?? null;
  const hasChaptersForPanel = !!(chapters && chapters.length >= 2);
  const hasSbSegmentsForPanel = sbPlayback.segments.some((s) => s.actionType === "skip");
  const showSegmentsTab = hasChaptersForPanel || hasSbSegmentsForPanel;
  const shellBlack = playerExpanded;

  const leftSlotWidth = navCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target;
      if (
        el instanceof HTMLInputElement
        || el instanceof HTMLTextAreaElement
        || (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.ctrlKey && !e.altKey && !e.metaKey && key === "b") {
        e.preventDefault();
        e.stopPropagation();
        setNavCollapsed((c) => !c);
        resyncExploreWebview();
        return;
      }

      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      if (key === "1") {
        e.preventDefault();
        e.stopPropagation();
        setMusicView("home");
        return;
      }
      if (key === "2") {
        e.preventDefault();
        e.stopPropagation();
        setMusicView("explore");
        return;
      }
      if (key === "3") {
        e.preventDefault();
        e.stopPropagation();
        setMusicView("library");
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [resyncExploreWebview, setMusicView]);

  return (
    <div
      className="relative flex flex-col flex-1 min-w-0 min-h-0 pt-10 overflow-hidden"
      data-music-player-expanded={shellBlack ? "true" : undefined}
      style={{
        background: shellBlack ? "#000000" : "var(--music-shell-chrome)",
        color: "var(--music-text-primary)",
      }}
    >
      <audio ref={audioRef} crossOrigin="anonymous" className="hidden" preload="auto" />

      <div
        className="relative z-[3] flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden"
        style={{
          paddingTop: "var(--music-shell-gap)",
          paddingLeft: "var(--music-shell-gap)",
          paddingRight: "var(--music-shell-gap)",
        }}
      >
        {/* Main row: sidebar + content + chapters. No gap when Explore strip active. */}
        <div
          className="flex flex-1 min-h-0 min-w-0 basis-0 overflow-hidden"
          style={{ gap: showExploreStrip ? 0 : "var(--music-shell-gap)" }}
        >
          {/* Left L-column: nav + Back share one surface; bottom row aligns with Explore boot bar. */}
          <div
            className="flex flex-col shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out"
            style={{
              width: leftSlotWidth,
              background: shellBlack ? "var(--music-bg)" : "var(--music-surface)",
              borderRadius: "var(--music-panel-radius) 0 0 var(--music-panel-radius)",
            }}
          >
            <div className="flex-1 min-h-0 basis-0 overflow-hidden">
              <MusicNav
                activeView={activeView}
                onSelect={setMusicView}
                collapsed={navCollapsed}
                onToggleCollapse={() => {
                  setNavCollapsed((c) => !c);
                  resyncExploreWebview();
                }}
                shellFrame={shellBlack}
                sideColumn
                inLeftStack
                footerSlot={
                  showDownloadDockChip ? (
                    <ExploreDownloadDockChip
                      downloadJobs={downloadJobs}
                      celebrating={dockCelebrating}
                      navCollapsed={navCollapsed}
                      onClick={() => {
                        setDockMinimized(false);
                        if (activeView !== "explore") setMusicView("explore");
                        if (!panelOpen) setPanelOpen(true);
                      }}
                    />
                  ) : undefined
                }
                panelSlot={
                  keepExplorePanelMounted ? (
                    <div className={cn("flex flex-1 min-h-0 flex-col", !showExplorePanel && "hidden")}>
                      <MusicExploreDownloadPanel
                        url={explorePanelUrl}
                        shelfLinks={musicExplorePageContext.shelfLinks}
                        harvestedTracklist={musicExplorePageContext.harvestedTracklist}
                        pageTitle={musicExplorePageContext.pageTitle}
                        webviewHarvestUrls={webviewHarvestUrls}
                        collapsed={navCollapsed}
                        dockMinimized={explorePanelDockMode}
                        onClose={closeExplorePanel}
                        onMinimize={() => setDockMinimized(true)}
                        onCelebratingChange={setDockCelebrating}
                      />
                    </div>
                  ) : undefined
                }
              />
            </div>
            <MusicNavBackCell
              collapsed={navCollapsed}
              shellBlack={shellBlack}
              inLeftStack
              onBack={handleBack}
            />
          </div>

          {/* Right: main panel + Explore boot bar (bottom row aligns with Back on the left). */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 basis-0 overflow-hidden">
            <div
              className={cn(
                "relative flex-1 min-h-0 basis-0 overflow-hidden min-w-0",
                !playerExpanded && activeView !== "explore" && "rf-scrollbar overflow-y-auto",
              )}
              style={{
                background: playerExpanded ? "transparent" : "var(--music-surface)",
                borderRadius: showExploreStrip
                  ? "0 var(--music-panel-radius) 0 0"
                  : "var(--music-panel-radius)",
              }}
            >
              <div ref={assignWebviewHostRef} className="absolute inset-0 z-0" />
              <div className="relative z-[1] min-h-0 min-w-0 h-full w-full">
                <AnimatePresence>
                  {playerExpanded && playingFile && (
                    <motion.div
                      key="expanded-bg"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 z-[1] pointer-events-none overflow-hidden"
                      style={{ borderRadius: "var(--music-panel-radius)" }}
                    >
                      <AudioHeroStage
                        coverSrc={coverSrc}
                        audioEl={null}
                        connectKey={playingFile.path}
                        isPaused={playback.paused}
                        isMuted={isMuted}
                        layer="background"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {playerExpanded ? (
                    <ExpandedOverlay
                      key="expanded"
                      coverSrc={coverSrc}
                      isPaused={playback.paused}
                      isMuted={isMuted}
                      onTogglePlay={playback.togglePlay}
                    />
                  ) : musicDetail?.kind === "artist" ? (
                    <motion.div key={`artist-${musicDetail.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <MusicArtistView
                        artistKey={musicDetail.key}
                        onPlayFile={handlePlayFile}
                        onOpenAlbum={(albumKey) => openMusicAlbum(musicDetail.key, albumKey)}
                        onBack={closeMusicDetail}
                      />
                    </motion.div>
                  ) : musicDetail?.kind === "album" ? (
                    <motion.div key={`album-${musicDetail.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <MusicAlbumView
                        artistKey={musicDetail.artistKey}
                        albumKey={musicDetail.key}
                        onPlayFile={handlePlayFile}
                        onOpenArtist={openMusicArtist}
                        onBack={closeMusicDetail}
                      />
                    </motion.div>
                  ) : musicDetail?.kind === "liked" ? (
                    <motion.div key="liked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <MusicLikedView
                        onPlayFile={handlePlayFile}
                        onBack={closeMusicDetail}
                      />
                    </motion.div>
                  ) : musicDetail?.kind === "song" ? (
                    <motion.div key={`song-${musicDetail.path}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <MusicTrackView
                        path={musicDetail.path}
                        onPlayFile={handlePlayFile}
                        onOpenArtist={openMusicArtist}
                        onOpenAlbum={openMusicAlbum}
                        onBack={closeMusicDetail}
                      />
                    </motion.div>
                  ) : musicDetail?.kind === "profile" ? (
                    <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                      <MusicProfileView onBack={closeMusicDetail} />
                    </motion.div>
                  ) : musicDetail?.kind === "stats" ? (
                    <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                      <MusicStatsView onBack={closeMusicDetail} />
                    </motion.div>
                  ) : activeView === "home" ? (
                    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-hidden">
                      <MusicHomeView
                        onPlayFile={handlePlayFile}
                        onOpenArtist={openMusicArtist}
                        onOpenAlbum={openMusicAlbum}
                        onSearchYoutubeMusic={handleSearchYoutubeMusic}
                      />
                    </motion.div>
                  ) : activeView === "explore" ? (
                    <motion.div key="explore" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 pointer-events-none">
                      <MusicExploreView />
                    </motion.div>
                  ) : (
                    <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                      <MusicLibraryView
                        onPlayFile={handlePlayFile}
                        onOpenArtist={openMusicArtist}
                        onOpenAlbum={openMusicAlbum}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {showExploreStrip && (
              <MusicExploreBottomBar
                shellBlack={shellBlack}
                currentUrl={currentMusicExploreUrl}
                pageContext={musicExplorePageContext}
                pasteMode={isPasteMode}
                onPickTracks={() => {
                  setPasteUrl("");
                  setPanelMode("pick");
                  setPanelOpen(true);
                }}
                onActivatePaste={() => {
                  setPanelMode("paste");
                  setPasteUrl("");
                  setPanelOpen(false);
                  setNavCollapsed(false);
                }}
                onDeactivatePaste={() => {
                  setPanelMode("pick");
                  setPasteUrl("");
                  setPanelOpen(false);
                  setDockMinimized(false);
                  resyncExploreWebview();
                }}
                onPasteUrlReady={handlePasteUrlReady}
                onReload={() => void handleReloadExplore()}
              />
            )}
          </div>

          {showSegmentsTab && !rightPanelOpen && rightPanelTab !== "segments" ? null : null}
          <MusicRightPanel
            open={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            activeTab={rightPanelTab}
            onTabChange={(t) => {
              setRightPanelTab(t);
              if (!rightPanelOpen) setRightPanelOpen(true);
            }}
            shellFrame={shellBlack}
            playingFile={playingFile}
            currentTime={playback.currentTime}
            duration={playback.duration}
            effectivePlaylist={playback.effectivePlaylist}
            playlistIndex={playback.playlistIndex}
            manualQueue={playback.manualQueue}
            folderAudioPlaylist={folderAudioPlaylist}
            onSeek={playback.seek}
            onPlay={(file) => handlePlayFolderNeighbor(file)}
            historyEntries={historyEntries}
            chapters={chapters}
            sbSegments={sbPlayback.segments}
            musicOnlySkip={musicOnlySkip}
            onToggleMusicOnlySkip={toggleMusicOnlySkip}
          />
        </div>
      </div>

      <motion.div
        className="relative z-[50] shrink-0"
        initial={false}
        animate={{
          height: playingFile
            ? "var(--music-nowplaying-height)"
            : showMusicStorageStrip
              ? "var(--music-storage-strip-height)"
              : "var(--music-bottom-idle)",
        }}
        transition={{ duration: 0.28, ease: sidebarEase }}
      >
        <AnimatePresence mode="wait">
          {playingFile ? (
            <motion.div
              key="nowplaying"
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <NowPlayingBar
                paused={playback.paused}
                currentTime={playback.currentTime}
                duration={playback.duration}
                expanded={playerExpanded}
                playbackSpeed={playback.playbackSpeed}
                hasChapters={playback.hasChapters}
                hasPrevInQueue={playback.hasPrevInQueue}
                hasNextInQueue={playback.hasNextInQueue}
                isDraggingRef={playback.isDraggingRef}
                onTogglePlay={playback.togglePlay}
                onSkipPrev={playback.skipPrev}
                onSkipNext={playback.skipNext}
                onSkipBySeconds={playback.skipBySeconds}
                onJumpPrevChapter={playback.jumpPrevChapter}
                onJumpNextChapter={playback.jumpNextChapter}
                onSetPlaybackSpeed={playback.setPlaybackSpeed}
                onSeek={playback.seek}
                onPauseForScrub={playback.pauseForScrub}
                onResumeAfterScrub={playback.resumeAfterScrub}
                onToggleExpand={handleToggleExpand}
                rightPanelOpen={rightPanelOpen}
                onToggleRightPanel={() => setRightPanelOpen((p) => !p)}
              />
            </motion.div>
          ) : showMusicStorageStrip ? (
            <motion.div
              key="storage"
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MusicStorageStrip />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
