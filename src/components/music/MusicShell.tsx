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
import { MusicTrackView } from "./MusicTrackView";
import { MusicExploreBottomBar } from "./MusicExploreBottomBar";
import { MusicNavBackCell } from "./MusicNavBackCell";
import { MusicExploreDownloadPanel } from "./MusicExploreDownloadPanel";
import {
  ExploreDownloadDockChip,
  type CollapsedCelebrate,
} from "./MusicExploreDownloadCollapsed";
import { NowPlayingBar } from "./NowPlayingBar";
import { useMusicPlayback } from "./useMusicPlayback";
import { AudioHeroStage } from "@/components/player/AudioHeroStage";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import {
  ensureEmbeddedExplorerWebview,
  EXPLORER_PAUSE_MEDIA_SCRIPT,
  getEmbeddedExplorerWebview,
} from "@/explorerWebviewLifecycle";
import {
  MUSIC_EXPLORE_INIT_SCRIPT,
  MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
  MUSIC_EXPLORE_WEBVIEW_LABEL,
} from "@/explorerProfileScript";
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
import { recordPlay, getRecentHistory, type PlayHistoryEntry } from "./musicPlayHistory";
import { readMusicOnlySkip, writeMusicOnlySkip } from "./musicOnlySkipStorage";

const MUSIC_EXPLORE_URL = "https://music.youtube.com";

/** Emitted by the music webview on every navigation; carries the new URL. */
const MUSIC_EXPLORE_URL_EVENT = "music-explore-url";

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"pick" | "paste">("pick");
  const [pasteUrl, setPasteUrl] = useState("");
  const [dockMinimized, setDockMinimized] = useState(false);
  const [dockCelebrating, setDockCelebrating] = useState<CollapsedCelebrate | null>(null);

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
  const prevExploreWebviewActiveRef = useRef(false);

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

  // Record play history whenever the playing file changes
  useEffect(() => {
    if (!playingFile) return;
    recordPlay(playingFile);
    setHistoryEntries(getRecentHistory());
  }, [playingFile?.path]);

  const isPasteMode = panelMode === "paste";
  const showExploreStrip = activeView === "explore" && !musicDetail && !playerExpanded;
  const showExplorePanel = activeView === "explore" && panelOpen;
  const exploreWebviewActive = showExploreStrip;

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
      setCurrentMusicExploreUrl(ev.payload ?? "");
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
    if (activeView !== "explore") {
      setPanelOpen(false);
      setPanelMode("pick");
      setPasteUrl("");
    }
  }, [activeView]);

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
          const webview = await ensureEmbeddedExplorerWebview({
            window: appWindow,
            label: MUSIC_EXPLORE_WEBVIEW_LABEL,
            url: MUSIC_EXPLORE_URL,
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
          try {
            await invoke("eval_in_webview", {
              label: MUSIC_EXPLORE_WEBVIEW_LABEL,
              script: MUSIC_EXPLORE_INIT_SCRIPT,
            });
            await invoke("eval_in_webview", {
              label: MUSIC_EXPLORE_WEBVIEW_LABEL,
              script: MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
            });
          } catch { /* bridge injected lazily */ }
        } catch (e) {
          musicExploreLastBoundsRef.current = null;
          console.error("[RuForge] Music explore webview error", e);
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
      if (explorerBoundsEqual(bounds, musicExploreLastBoundsRef.current)) return;
      musicExploreLastBoundsRef.current = bounds;

      try {
        await applyMusicExploreBounds(bounds);
      } catch (e) {
        musicExploreLastBoundsRef.current = null;
        console.error("[RuForge] Music explore bounds sync failed", e);
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

  const handlePlayFile = useCallback((file: MediaFile, playlist: MediaFile[]) => {
    setFolderAudioPlaylist(playlist);
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
                  dockMinimized ? (
                    <ExploreDownloadDockChip
                      downloadJobs={downloadJobs}
                      celebrating={dockCelebrating}
                      onClick={() => {
                        setDockMinimized(false);
                        if (!panelOpen) setPanelOpen(true);
                      }}
                    />
                  ) : undefined
                }
                panelSlot={
                  showExplorePanel ? (
                    <MusicExploreDownloadPanel
                      url={isPasteMode ? pasteUrl : currentMusicExploreUrl}
                      pasteMode={isPasteMode}
                      collapsed={navCollapsed}
                      dockMinimized={dockMinimized}
                      onClose={closeExplorePanel}
                      onMinimize={() => setDockMinimized(true)}
                      onCelebratingChange={setDockCelebrating}
                    />
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
                  ) : activeView === "home" ? (
                    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-hidden">
                      <MusicHomeView
                        onPlayFile={handlePlayFile}
                        onOpenArtist={openMusicArtist}
                        onOpenAlbum={openMusicAlbum}
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
                pasteMode={isPasteMode}
                onPickTracks={() => {
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
                onPasteUrlReady={(url) => {
                  setPasteUrl(url);
                  setPanelOpen(true);
                }}
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
            : "var(--music-bottom-idle)",
        }}
        transition={{ duration: 0.28, ease: sidebarEase }}
      >
        <AnimatePresence>
          {playingFile && (
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
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
