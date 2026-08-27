import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { History, PanelRightClose, PanelRightOpen } from "lucide-react";

import type { MediaFile } from "@/types";
import type { SponsorBlockSegment } from "@/sponsorBlock";
import type { Chapter } from "@/types";
import type { PlayHistoryEntry } from "./musicPlayHistory";
import { MusicQueueTab } from "./MusicQueueTab";
import { MusicHistoryTab } from "./MusicHistoryTab";
import { MusicSegmentsTab } from "./MusicSegmentsTab";
import { nextQueueRowIsEndless, resolveQueueSourceLabel } from "./musicQueueSource";
import { useRuforgeStore } from "@/store/ruforgeStore";

export type RightPanelTab = "queue" | "history" | "segments";

/** Clear custom scrollbar thumb (right 3px + 5px wide). */
const MINI_PANEL_RIGHT_INSET = "14px";
const MINI_HINT_MS = 2200;
/** Full-height edge band: wide enough to hit easily, stops before most content. */
const HOVER_ARM_RIGHT = "8px";
const HOVER_ARM_WIDTH = "40px";
const ZONE_HIT_PAD = 16;

type Props = {
  open: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (t: RightPanelTab) => void;
  shellFrame: boolean;
  playingFile: MediaFile | null;
  currentTime: number;
  duration: number;
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  manualQueue: string[];
  folderAudioPlaylist: MediaFile[];
  onSeek: (t: number) => void;
  onPlay: (file: MediaFile) => void;
  onPlayHistory?: (file: MediaFile) => void;
  historyEntries: PlayHistoryEntry[];
  chapters: Chapter[] | null;
  sbSegments: SponsorBlockSegment[];
  musicOnlySkip: boolean;
  onToggleMusicOnlySkip: () => void;
};

type MiniProps = {
  activeTab: RightPanelTab;
  onTabChange: (t: RightPanelTab) => void;
  showSegmentsTab: boolean;
  hintKey: number;
};

const PANEL_WIDTH = "var(--music-right-panel-width, 272px)";

type TabDef = { id: RightPanelTab; label: string; icon: ReactNode };

const QUEUE_TAB: TabDef = {
  id: "queue",
  label: "Queue",
  icon: <Icon icon="material-symbols:queue-music-rounded" width={19} height={19} aria-hidden />,
};

const HISTORY_TAB: TabDef = {
  id: "history",
  label: "Recent",
  icon: <History size={19} />,
};

const SEGMENTS_TAB: TabDef = {
  id: "segments",
  label: "Segments",
  icon: <Icon icon="tabler:line-dashed" width={19} height={19} aria-hidden />,
};

function tabItemsFor(showSegmentsTab: boolean): TabDef[] {
  return showSegmentsTab ? [QUEUE_TAB, HISTORY_TAB, SEGMENTS_TAB] : [QUEUE_TAB, HISTORY_TAB];
}

const miniPillStyle: CSSProperties = {
  borderRadius: "var(--music-panel-radius)",
  background: "var(--music-surface-raised)",
  border: "1px solid var(--music-border)",
  boxShadow:
    "0 10px 36px rgb(0 0 0 / 0.52), 0 0 0 1px rgb(255 255 255 / 0.05)",
};

/** Hover popup on the main column edge; no layout width when minimized. */
export function MusicRightPanelMini({
  activeTab,
  onTabChange,
  showSegmentsTab,
  hintKey,
}: MiniProps) {
  const [hovered, setHovered] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const armRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current !== null) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const pointerInsideZone = useCallback((clientX: number, clientY: number) => {
    const rects = [pillRef.current, armRef.current, dockRef.current]
      .filter((el): el is HTMLDivElement => el != null)
      .map((el) => el.getBoundingClientRect());
    return rects.some((r) =>
      clientX >= r.left - ZONE_HIT_PAD
      && clientX <= r.right + ZONE_HIT_PAD
      && clientY >= r.top - ZONE_HIT_PAD
      && clientY <= r.bottom + ZONE_HIT_PAD,
    );
  }, []);

  useEffect(() => {
    if (hintKey <= 0) return;
    clearHintTimer();
    setHintVisible(true);
    hintTimerRef.current = setTimeout(() => {
      setHintVisible(false);
      hintTimerRef.current = null;
    }, MINI_HINT_MS);
    return clearHintTimer;
  }, [hintKey, clearHintTimer]);

  useEffect(() => {
    if (!hovered) return;
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerInsideZone(e.clientX, e.clientY)) {
        setHovered(false);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [hovered, pointerInsideZone]);

  const showPill = hovered || hintVisible;
  const tabItems = tabItemsFor(showSegmentsTab);

  return (
    <div
      className="rf-music-right-panel-mini pointer-events-none absolute inset-y-0 right-0 z-[45]"
      aria-hidden={!showPill}
    >
      <div
        ref={armRef}
        className="pointer-events-auto absolute top-2 bottom-2"
        style={{ right: HOVER_ARM_RIGHT, width: HOVER_ARM_WIDTH }}
        onPointerEnter={() => setHovered(true)}
        aria-hidden
      />

      <div
        ref={dockRef}
        className="pointer-events-auto absolute top-2"
        style={{
          right: MINI_PANEL_RIGHT_INSET,
          width: "var(--music-sidebar-collapsed-width)",
          height: "min(16rem, calc(100% - 1rem))",
        }}
        onPointerEnter={() => setHovered(true)}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute top-2 flex flex-col items-end"
        style={{ right: MINI_PANEL_RIGHT_INSET }}
      >
        <motion.div
          ref={pillRef}
          className="flex flex-col overflow-hidden"
          initial={false}
          animate={{
            opacity: showPill ? 1 : 0,
            x: showPill ? 0 : 10,
          }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onPointerEnter={() => setHovered(true)}
          style={{
            ...miniPillStyle,
            pointerEvents: showPill ? "auto" : "none",
          }}
        >
          <div className="flex justify-center shrink-0 h-11 items-center px-2 pt-0.5">
            <button
              type="button"
              onClick={() => onTabChange(activeTab)}
              className="rf-music-tooltip-anchor w-8 h-8 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label="Expand panel"
              data-tooltip="Expand panel"
            >
              <PanelRightOpen size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-0.5 py-2 px-1.5 items-center pb-2.5">
            {tabItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  data-active={active ? "true" : "false"}
                  className="rf-music-nav-item rf-music-tooltip-anchor relative flex items-center justify-center w-10 h-10 p-0 text-sm font-medium"
                  data-tooltip={item.label}
                >
                  <span data-nav-icon className="inline-flex w-5 h-5 items-center justify-center shrink-0">
                    {item.icon}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function MusicRightPanel({
  open,
  onClose,
  activeTab,
  onTabChange,
  shellFrame,
  playingFile,
  currentTime,
  duration,
  effectivePlaylist,
  playlistIndex,
  manualQueue,
  folderAudioPlaylist,
  onSeek,
  onPlay,
  onPlayHistory,
  historyEntries,
  chapters,
  sbSegments,
  musicOnlySkip,
  onToggleMusicOnlySkip,
}: Props) {
  if (!open) return null;

  const hasChapters = !!(chapters && chapters.length >= 2);
  const hasSbSegments = sbSegments.some((s) => s.actionType === "skip");
  const showSegmentsTab = hasChapters || hasSbSegments;

  const musicEndlessFromIndex = useRuforgeStore((s) => s.musicEndlessFromIndex);
  const musicQueueSource = useRuforgeStore((s) => s.musicQueueSource);
  const nextRowIsEndless = nextQueueRowIsEndless({
    manualQueueLength: manualQueue.length,
    playlistIndex,
    effectivePlaylist,
    folderAudioPlaylist,
    endlessFromIndex: musicEndlessFromIndex,
  });
  const queueSource = resolveQueueSourceLabel(musicQueueSource, nextRowIsEndless);

  const panelBg = shellFrame ? "var(--music-bg)" : "var(--music-surface)";

  return (
    <motion.aside
      className="rf-music-right-panel h-full shrink-0 min-h-0 flex flex-col overflow-hidden"
      data-shell-frame={shellFrame ? "true" : "false"}
      data-open="true"
      initial={false}
      animate={{ width: PANEL_WIDTH }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: panelBg,
        borderRadius: "0 var(--music-panel-radius) var(--music-panel-radius) 0",
      }}
    >
      <div
        className="relative h-full flex flex-col overflow-hidden min-w-0"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="shrink-0 flex items-center justify-between px-3 h-10 gap-2">
          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
            <TabButton
              active={activeTab === "queue"}
              onClick={() => onTabChange("queue")}
              label="Queue"
            />
            <TabButton
              active={activeTab === "history"}
              onClick={() => onTabChange("history")}
              label="Recent"
            />
            {showSegmentsTab && (
              <TabButton
                active={activeTab === "segments"}
                onClick={() => onTabChange("segments")}
                label="Segments"
              />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rf-music-tooltip-anchor shrink-0 w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Minimize panel"
            data-tooltip="Minimize panel"
          >
            <PanelRightClose size={15} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <TabPanel active={activeTab === "queue"}>
            <MusicQueueTab
              playingFile={playingFile}
              effectivePlaylist={effectivePlaylist}
              playlistIndex={playlistIndex}
              manualQueue={manualQueue}
              queueSource={queueSource}
              onPlay={onPlay}
            />
          </TabPanel>
          <TabPanel active={activeTab === "history"}>
            <MusicHistoryTab
              playingFile={playingFile}
              entries={historyEntries}
              onPlay={onPlayHistory ?? onPlay}
            />
          </TabPanel>
          {showSegmentsTab && (
            <TabPanel active={activeTab === "segments"}>
              <MusicSegmentsTab
                currentTime={currentTime}
                duration={duration}
                chapters={chapters}
                sbSegments={sbSegments}
                musicOnlySkip={musicOnlySkip}
                onToggleMusicOnlySkip={onToggleMusicOnlySkip}
                onSeek={onSeek}
              />
            </TabPanel>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function TabPanel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col min-h-0"
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={{
        pointerEvents: active ? "auto" : "none",
        visibility: active ? "visible" : "hidden",
      }}
      aria-hidden={!active}
    >
      {children}
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className="rf-music-panel-tab shrink-0 py-2 text-[12px] font-bold whitespace-nowrap"
    >
      {label}
    </button>
  );
}

export function MusicRightPanelToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rf-music-tooltip-anchor w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100"
      style={{ color: "var(--music-text-secondary)" }}
      aria-label={open ? "Minimize panel" : "Expand panel"}
      data-tooltip={open ? "Minimize panel" : "Expand panel"}
    >
      {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
    </button>
  );
}
