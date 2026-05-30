import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { MusicNav, type MusicView, musicFrameStyle, musicContentStyle } from "./MusicNav";
import { MusicHomeView } from "./MusicHomeView";
import { MusicExploreView } from "./MusicExploreView";
import { MusicLibraryView } from "./MusicLibraryView";
import { NowPlayingBar } from "./NowPlayingBar";
import { useMusicPlayback } from "./useMusicPlayback";
import { AudioHeroStage } from "@/components/player/AudioHeroStage";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import type { Chapter, MediaFile } from "@/types";
import { cn } from "@/lib/utils";

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
          className="text-base font-semibold text-white/90 text-center w-full"
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
  const [activeView, setActiveView] = useState<MusicView>("home");
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [chaptersCollapsed, setChaptersCollapsed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playback = useMusicPlayback(audioRef);

  const cycleNavMode = useRuforgeStore((s) => s.cycleNavMode);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const setFolderAudioPlaylist = useRuforgeStore((s) => s.setFolderAudioPlaylist);
  const setPlayingFile = useRuforgeStore((s) => s.setPlayingFile);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (playerExpanded) setChaptersCollapsed(false);
  }, [playerExpanded, playingFile?.path]);

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
        className="relative z-[3] flex flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-hidden"
        style={{
          gap: "var(--music-shell-gap)",
          paddingTop: "var(--music-shell-gap)",
          paddingLeft: "var(--music-shell-gap)",
          paddingRight: "var(--music-shell-gap)",
        }}
      >
        <div
          className="shrink-0 h-full transition-[width] duration-150 overflow-hidden"
          style={{ width: leftSlotWidth }}
        >
          <MusicNav
            activeView={activeView}
            onSelect={setActiveView}
            onBack={handleBack}
            collapsed={navCollapsed}
            onToggleCollapse={() => setNavCollapsed((c) => !c)}
            shellFrame={shellFrame}
          />
        </div>

        <div
          className={cn(
            "relative flex-1 overflow-hidden min-w-0 min-h-0",
            !playerExpanded && "rf-scrollbar overflow-y-auto",
          )}
          style={{
            ...musicContentStyle,
            background: playerExpanded ? "transparent" : "var(--music-surface)",
          }}
        >
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
            ) : activeView === "home" ? (
              <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                <MusicHomeView onPlayFile={handlePlayFile} />
              </motion.div>
            ) : activeView === "explore" ? (
              <motion.div key="explore" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                <MusicExploreView onPlayFile={handlePlayFile} />
              </motion.div>
            ) : (
              <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar">
                <MusicLibraryView onPlayFile={handlePlayFile} />
              </motion.div>
            )}
          </AnimatePresence>
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
