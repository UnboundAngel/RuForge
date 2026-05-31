import { motion } from "framer-motion";

import { PanelRightClose, PanelRightOpen } from "lucide-react";



import type { MediaFile } from "@/types";

import type { SponsorBlockSegment } from "@/sponsorBlock";

import type { Chapter } from "@/types";

import type { PlayHistoryEntry } from "./musicPlayHistory";

import { MusicQueueTab } from "./MusicQueueTab";

import { MusicHistoryTab } from "./MusicHistoryTab";

import { MusicSegmentsTab } from "./MusicSegmentsTab";

import { resolveQueueSourceLabel } from "./musicQueueSource";



export type RightPanelTab = "queue" | "history" | "segments";



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



  historyEntries: PlayHistoryEntry[];



  chapters: Chapter[] | null;

  sbSegments: SponsorBlockSegment[];

  musicOnlySkip: boolean;

  onToggleMusicOnlySkip: () => void;

};



const PANEL_WIDTH = "var(--music-right-panel-width, 280px)";



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

  historyEntries,

  chapters,

  sbSegments,

  musicOnlySkip,

  onToggleMusicOnlySkip,

}: Props) {

  const hasChapters = !!(chapters && chapters.length >= 2);

  const hasSbSegments = sbSegments.some((s) => s.actionType === "skip");

  const showSegmentsTab = hasChapters || hasSbSegments;



  const queueSource = resolveQueueSourceLabel(playingFile, folderAudioPlaylist);



  const panelStyle: React.CSSProperties = shellFrame

    ? {

        background: "var(--music-bg)",

      }

    : {

        background: "var(--music-surface)",

      };



  return (

    <motion.aside

      className="rf-music-right-panel h-full shrink-0 overflow-hidden flex flex-col"

      data-shell-frame={shellFrame ? "true" : "false"}

      initial={false}

      animate={{ width: open ? PANEL_WIDTH : "0px" }}

      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}

      style={panelStyle}

    >

      <div

        className="relative h-full flex flex-col overflow-hidden"

        style={{ width: "var(--music-right-panel-width, 280px)" }}

      >

        <div className="shrink-0 flex items-center justify-between px-4 h-11 gap-1">

          <div className="flex items-center gap-4 overflow-hidden min-w-0">

            <TabButton

              active={activeTab === "queue"}

              onClick={() => onTabChange("queue")}

              label="Queue"

            />

            <TabButton

              active={activeTab === "history"}

              onClick={() => onTabChange("history")}

              label="Recently played"

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

            className="shrink-0 w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100 rounded-full hover:bg-white/5"

            style={{ color: "var(--music-text-secondary)" }}

            aria-label="Close panel"

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
              onPlay={onPlay}
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
      className="rf-music-panel-tab shrink-0 py-2 text-[13px] font-bold whitespace-nowrap"
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

      className="w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100"

      style={{ color: "var(--music-text-secondary)" }}

      aria-label={open ? "Close right panel" : "Open right panel"}

      title={open ? "Close right panel" : "Open right panel"}

    >

      {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}

    </button>

  );

}


