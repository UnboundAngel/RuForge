import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { appDataDir, join } from "@tauri-apps/api/path";
import { Webview } from "@tauri-apps/api/webview";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { MusicNav, musicFrameStyle, musicContentStyle } from "./MusicNav";
import { MusicHomeView } from "./MusicHomeView";
import { MusicExploreView } from "./MusicExploreView";
import { MusicLibraryView } from "./MusicLibraryView";
import { MusicArtistView } from "./MusicArtistView";
import { MusicAlbumView } from "./MusicAlbumView";
import { MusicExploreBottomBar } from "./MusicExploreBottomBar";
import { MusicExploreDownloadPanel } from "./MusicExploreDownloadPanel";
import { NowPlayingBar } from "./NowPlayingBar";
import { useMusicPlayback } from "./useMusicPlayback";
import { AudioHeroStage } from "@/components/player/AudioHeroStage";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { formatDuration } from "@/components/downloader/downloaderFormat";
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
import type { Chapter, MediaFile } from "@/types";
import { cn } from "@/lib/utils";

const MUSIC_EXPLORE_URL = "https://music.youtube.com";

/** Emitted by the music webview on every navigation; carries the new URL. */
const MUSIC_EXPLORE_URL_EVENT = "music-explore-url";

const sidebarEase = [0.4, 0, 0.2, 1] as const;
const SIDEBAR_FULL = "var(--music-sidebar-width)";
const SIDEBAR_COLLAPSED = "var(--music-sidebar-collapsed-width)";

type ChaptersSidebarProps = {
  chapters: Chapter[];
  currentTime: number;
  collapsed: boolean;
  shellFrame: boolean;
  onSeek: (t: number) => void;
  onToggleCollapse: () => void;
};

function ChaptersSidebar({
  chapters,
  currentTime,
  collapsed,
  shellFrame,
  onSeek,
  onToggleCollapse,
}: ChaptersSidebarProps) {
  let activeIdx = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (currentTime >= chapters[i].start_time) activeIdx = i;
  }

  return (
    <motion.aside
      className="h-full shrink-0 overflow-hidden flex justify-end"
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL }}
      transition={{ duration: 0.22, ease: sidebarEase }}
      style={shellFrame ? musicFrameStyle : musicContentStyle}
    >
      <div className="relative h-full w-[var(--music-sidebar-width)] shrink-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 flex flex-col overflow-hidden"
          initial={false}
          animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? 12 : 0 }}
          transition={{ duration: 0.2, ease: sidebarEase }}
          style={{ pointerEvents: collapsed ? "none" : "auto" }}
        >
          <div className="flex items-center justify-between px-4 h-12 shrink-0">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--music-text-muted)" }}
            >
              Chapters
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity shrink-0"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label="Collapse chapters"
            >
              <PanelRightClose size={16} />
            </button>
          </div>
          <div className="flex flex-col py-1 flex-1 min-h-0 overflow-x-hidden overflow-y-auto rf-scrollbar">
            {chapters.map((ch, i) => {
              const isActive = i === activeIdx;
              return (
              <button
                key={`${ch.start_time}-${ch.title}`}
                type="button"
                onClick={() => onSeek(ch.start_time)}
                data-active={isActive ? "true" : "false"}
                className="rf-music-chapter-row flex items-start gap-3 px-4 py-2.5 text-left min-w-0 w-full"
                style={{
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                }}
              >
                  <span
                    className="text-[10px] font-mono tabular-nums shrink-0 mt-0.5"
                    style={{ color: isActive ? "var(--music-accent)" : "var(--music-text-muted)" }}
                  >
                    {formatDuration(ch.start_time)}
                  </span>
                <div
                  className="flex-1 min-w-0"
                  data-chapter-title
                  data-active={isActive ? "true" : "false"}
                >
                    <HoverMarqueeText
                      text={ch.title}
                      layoutKey={i}
                      className="text-sm leading-snug"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex flex-col items-end py-3 gap-2 pr-3"
          initial={false}
          animate={{ opacity: collapsed ? 1 : 0 }}
          transition={{ duration: 0.2, ease: sidebarEase }}
          style={{ pointerEvents: collapsed ? "auto" : "none" }}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Expand chapters"
            title="Expand chapters"
          >
            <PanelRightOpen size={16} />
          </button>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none pointer-events-none"
            style={{ color: "var(--music-text-muted)" }}
            aria-hidden
          >
            Chapters
          </span>
        </motion.div>
      </div>
    </motion.aside>
  );
}

type ExpandedOverlayProps = {
  coverSrc: string | null;
  isPaused: boolean;
  isMuted: boolean;
};

function ExpandedOverlay({
  coverSrc,
  isPaused,
  isMuted,
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
  const [chaptersCollapsed, setChaptersCollapsed] = useState(false);
  const [currentMusicExploreUrl, setCurrentMusicExploreUrl] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"pick" | "paste">("pick");
  const [pasteUrl, setPasteUrl] = useState("");

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

  const isPasteMode = panelMode === "paste";
  const showExploreStrip = activeView === "explore" && !musicDetail && !playerExpanded;
  const showExplorePanel = activeView === "explore" && panelOpen;
  const exploreWebviewActive = showExploreStrip;

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (playerExpanded) setChaptersCollapsed(false);
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
  const showChaptersRail = !!playingFile && playback.hasChapters;
  const shellFrame = !!playingFile;

  const leftSlotWidth = navCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  return (
    <div
      className="relative flex flex-col flex-1 min-w-0 min-h-0 pt-10 overflow-hidden"
      style={{
        background: "var(--music-bg)",
        color: "var(--music-text-primary)",
      }}
    >
      <audio ref={audioRef} crossOrigin="anonymous" className="hidden" preload="auto" />

      <div
        className="relative z-[3] flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden"
        style={{
          gap: "var(--music-shell-gap)",
          paddingTop: "var(--music-shell-gap)",
          paddingLeft: "var(--music-shell-gap)",
          paddingRight: "var(--music-shell-gap)",
        }}
      >
        <div
          className="flex flex-1 min-h-0 min-w-0 overflow-hidden"
          style={{ gap: showExploreStrip ? 0 : "var(--music-shell-gap)" }}
        >
          {/* Sidebar: full column height (nav + boot bar band on Explore) */}
          <div
            className="shrink-0 h-full transition-[width] duration-150 overflow-hidden"
            style={{ width: leftSlotWidth }}
          >
            <MusicNav
              activeView={activeView}
              onSelect={setMusicView}
              onBack={handleBack}
              collapsed={navCollapsed}
              onToggleCollapse={() => {
                setNavCollapsed((c) => !c);
                resyncExploreWebview();
              }}
              shellFrame={shellFrame}
              sideColumn={showExploreStrip}
              panelSlot={
                showExplorePanel ? (
                  <MusicExploreDownloadPanel
                    url={isPasteMode ? pasteUrl : currentMusicExploreUrl}
                    pasteMode={isPasteMode}
                    onClose={closeExplorePanel}
                  />
                ) : undefined
              }
            />
          </div>

          {/* Content column: webview/views + Explore boot bar as one right panel */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <div
              className={cn(
                "relative flex flex-1 overflow-hidden min-w-0 min-h-0",
                !playerExpanded && "rf-scrollbar overflow-y-auto",
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

          {showChaptersRail && (
            <ChaptersSidebar
              chapters={chapters!}
              currentTime={playback.currentTime}
              collapsed={chaptersCollapsed}
              shellFrame={shellFrame}
              onSeek={playback.seek}
              onToggleCollapse={() => setChaptersCollapsed((c) => !c)}
            />
          )}
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
