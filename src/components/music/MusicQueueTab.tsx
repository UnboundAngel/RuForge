import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, MoreHorizontal } from "lucide-react";

import type { MediaFile } from "@/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicLikeButton } from "./MusicLikeButton";
import {
  buildCombinedQueuePaths,
  manualQueueFromCombinedReorder,
} from "./musicQueueReorder";
import { queueNextSectionLabel } from "./musicQueueSource";

const MAX_NEXT_UP = 50;

type Props = {
  playingFile: MediaFile | null;
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  manualQueue: string[];
  queueSource: string | null;
  onPlay: (file: MediaFile) => void;
};

export function MusicQueueTab({
  playingFile,
  effectivePlaylist,
  playlistIndex,
  manualQueue,
  queueSource,
  onPlay,
}: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const setManualQueueOrder = useRuforgeStore((s) => s.setManualQueueOrder);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [queueScrolled, setQueueScrolled] = useState(false);
  const [queueDragging, setQueueDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!queueDragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [queueDragging]);

  const allFiles = useMemo(() => {
    const out: MediaFile[] = [];
    for (const e of entries) {
      if (e.kind === "playlist") {
        for (const f of e.items) out.push(f);
      } else {
        out.push(e);
      }
    }
    return out;
  }, [entries]);

  const pathToFile = useCallback(
    (path: string) => allFiles.find((f) => f.path === path) ?? null,
    [allFiles],
  );

  const nextUpPaths = useMemo(
    () =>
      effectivePlaylist
        .slice(playlistIndex + 1, playlistIndex + 1 + MAX_NEXT_UP)
        .map((f) => f.path),
    [effectivePlaylist, playlistIndex],
  );

  const combinedPaths = useMemo(
    () => buildCombinedQueuePaths(manualQueue, nextUpPaths),
    [manualQueue, nextUpPaths],
  );

  const nextSectionLabel = queueNextSectionLabel(queueSource);

  const isEmpty =
    !playingFile && combinedPaths.length === 0;

  const handleScroll = () => {
    const el = scrollRef.current;
    setQueueScrolled((el?.scrollTop ?? 0) > 4);
  };

  const handleReorder = (reordered: string[]) => {
    setManualQueueOrder(manualQueueFromCombinedReorder(reordered));
  };

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] px-6 gap-6 text-center select-none py-12">
        <div
          className="rf-music-panel-empty-art w-20 h-20 rounded-full flex items-center justify-center text-3xl"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          🦉
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-bold text-white/90">
            Nothing in your queue
          </p>
          <p className="text-[12px]" style={{ color: "var(--music-text-muted)" }}>
            Download or pick music in Explore
          </p>
        </div>
        <ExploreButton />
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex flex-col h-full min-h-0 overflow-y-auto rf-scrollbar"
        onScroll={handleScroll}
      >
        {playingFile && (
          <div
            className="rf-music-queue-sticky shrink-0 z-10"
            data-scrolled={queueScrolled ? "true" : "false"}
          >
            <SectionLabel>Now playing</SectionLabel>
            <TrackRow
              file={playingFile}
              active
              draggable={false}
              menuOpen={menu?.context.kind === "song" && menu.context.file.path === playingFile.path}
              onPlay={onPlay}
              onContextMenu={(f, x, y) => setMenu({ context: { kind: "song", file: f }, x, y })}
            />
          </div>
        )}

        {combinedPaths.length > 0 && (
          <div className="pb-2">
            <SectionLabel>{nextSectionLabel}</SectionLabel>
            <Reorder.Group
              axis="y"
              layoutScroll
              initial={false}
              values={combinedPaths}
              onReorder={handleReorder}
              className="rf-music-queue-reorder flex flex-col"
              data-dragging={queueDragging ? "true" : "false"}
            >
              {combinedPaths.map((path) => {
                const file = pathToFile(path);
                if (!file) return null;
                return (
                  <QueueReorderRow
                    key={path}
                    path={path}
                    file={file}
                    active={playingFile?.path === path}
                    menuOpen={menu?.context.kind === "song" && menu.context.file.path === path}
                    onPlay={onPlay}
                    onContextMenu={(f, x, y) => setMenu({ context: { kind: "song", file: f }, x, y })}
                    onDragActiveChange={setQueueDragging}
                  />
                );
              })}
            </Reorder.Group>
          </div>
        )}
      </div>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}

function QueueReorderRow({
  path,
  file,
  active,
  menuOpen,
  onPlay,
  onContextMenu,
  onDragActiveChange,
}: {
  path: string;
  file: MediaFile;
  active: boolean;
  menuOpen: boolean;
  onPlay: (f: MediaFile) => void;
  onContextMenu: (f: MediaFile, x: number, y: number) => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  const dragControls = useDragControls();
  const suppressPlayClickRef = useRef(false);

  const handlePlay = useCallback(
    (f: MediaFile) => {
      if (suppressPlayClickRef.current) {
        suppressPlayClickRef.current = false;
        return;
      }
      onPlay(f);
    },
    [onPlay],
  );

  return (
    <Reorder.Item
      value={path}
      dragListener={false}
      dragControls={dragControls}
      initial={false}
      className="list-none"
      style={{ position: "relative", zIndex: 0 }}
      transition={{ layout: { duration: 0 } }}
      whileDrag={{ zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}
      dragTransition={{ power: 0.15, timeConstant: 100 }}
      onDragStart={() => {
        suppressPlayClickRef.current = true;
        onDragActiveChange(true);
      }}
      onDragEnd={() => onDragActiveChange(false)}
    >
      <TrackRow
        file={file}
        active={active}
        draggable
        dragControls={dragControls}
        menuOpen={menuOpen}
        onPlay={handlePlay}
        onContextMenu={onContextMenu}
        onRowPointerDown={(e) => {
          if (!(e.target as Element).closest(".rf-music-queue-grip")) {
            suppressPlayClickRef.current = false;
          }
        }}
      />
    </Reorder.Item>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-4 pt-3 pb-1 text-[11px] font-bold select-none"
      style={{ color: "var(--music-text-primary)" }}
    >
      {children}
    </p>
  );
}

function TrackRow({
  file,
  active,
  draggable,
  dragControls,
  menuOpen,
  onPlay,
  onContextMenu,
  onRowPointerDown,
}: {
  file: MediaFile;
  active: boolean;
  draggable: boolean;
  dragControls?: ReturnType<typeof useDragControls>;
  menuOpen: boolean;
  onPlay: (f: MediaFile) => void;
  onContextMenu: (f: MediaFile, x: number, y: number) => void;
  onRowPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const coverPath = bestCoverPath(file);
  const coverSrc = coverPath ? convertFileSrc(coverPath) : null;

  return (
    <div
      className="group relative flex items-center gap-2.5 px-3 py-2 cursor-pointer rf-music-right-row select-none"
      data-active={active ? "true" : "false"}
      onPointerDown={onRowPointerDown}
      onClick={() => onPlay(file)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(file, e.clientX, e.clientY);
      }}
    >
      {draggable && dragControls && (
        <button
          type="button"
          className="rf-music-queue-grip shrink-0 w-5 self-stretch flex items-center justify-center border-0 bg-transparent p-0"
          style={{ color: "var(--music-text-muted)" }}
          aria-label="Reorder"
          onPointerDown={(e) => {
            e.preventDefault();
            dragControls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} strokeWidth={2} />
        </button>
      )}
      <div className="relative shrink-0 w-10 h-10 overflow-hidden bg-stone-950">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600 text-lg">
            ♪
          </div>
        )}
        {active && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <svg viewBox="0 0 10 12" className="w-2.5 h-2.5 fill-current text-white">
              <path d="M0 0 L10 6 L0 12 Z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span
          data-active={active ? "true" : "false"}
          className="rf-music-right-row-title text-[13px] font-medium truncate"
        >
          {file.name}
        </span>
        <span
          className="text-[11px] truncate mt-0.5"
          style={{ color: "var(--music-text-muted)" }}
        >
          {file.artist ?? file.albumArtist ?? "Unknown artist"}
        </span>
      </div>
      <MusicLikeButton
        file={file}
        className={menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
        size={15}
      />
      <button
        type="button"
        className={`rf-music-row-menu shrink-0 w-6 h-6 flex items-center justify-center rounded ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        style={{ color: "var(--music-text-muted)" }}
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(file, e.clientX, e.clientY);
        }}
        aria-label="More options"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function ExploreButton() {
  const setMusicView = useRuforgeStore((s) => s.setMusicView);
  return (
    <button
      type="button"
      onClick={() => setMusicView("explore")}
      className="px-6 py-2.5 rounded-full text-xs font-bold cursor-pointer"
      style={{
        background: "var(--music-accent)",
        color: "#fff",
        outline: "none",
        border: "none",
      }}
    >
      Go to Explore
    </button>
  );
}
