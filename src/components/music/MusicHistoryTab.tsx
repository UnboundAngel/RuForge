import { useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MoreHorizontal } from "lucide-react";

import type { MediaFile } from "@/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import type { PlayHistoryEntry } from "./musicPlayHistory";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";

function primaryArtist(raw: string) {
  return raw.split(/,|&|feat\.|ft\.|x /i)[0]?.trim() ?? raw;
}

type HistoryToggle = "recent" | "most-played";

type Props = {
  playingFile: MediaFile | null;
  entries: PlayHistoryEntry[];
  onPlay: (file: MediaFile) => void;
};

export function MusicHistoryTab({ playingFile, entries, onPlay }: Props) {
  const [toggle, setToggle] = useState<HistoryToggle>("recent");
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const allFiles = useRuforgeStore((s) => s.entries);

  const resolveFile = useCallback(
    (path: string): MediaFile | null => {
      for (const e of allFiles) {
        if (e.kind === "playlist") {
          const found = e.items.find((f) => f.path === path);
          if (found) return found;
        } else if (e.path === path) {
          return e;
        }
      }
      return null;
    },
    [allFiles],
  );

  const sorted = toggle === "recent"
    ? [...entries].sort((a, b) => b.playedAt - a.playedAt)
    : [...entries].sort((a, b) => b.playCount - a.playCount || b.playedAt - a.playedAt);

  const playingIdentity = playingFile
    ? musicTrackIdentityKey(playingFile, primaryArtist)
    : null;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] px-6 gap-6 text-center select-none py-12">
        <div
          className="rf-music-panel-empty-art w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-transform hover:scale-105 duration-300"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          🦉
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-bold text-white/90">
            Nothing played yet
          </p>
          <p className="text-[12px]" style={{ color: "var(--music-text-muted)" }}>
            Your listening history shows up here
          </p>
        </div>
        <ExploreButton />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toggle */}
        <div className="shrink-0 flex items-center gap-1 px-3 py-2">
          <ToggleBtn active={toggle === "recent"} onClick={() => setToggle("recent")}>
            Recent
          </ToggleBtn>
          <ToggleBtn active={toggle === "most-played"} onClick={() => setToggle("most-played")}>
            Most played
          </ToggleBtn>
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto rf-scrollbar flex flex-col gap-0.5 py-2">
          {sorted.map((entry) => {
            const file = resolveFile(entry.path);
            const isPlaying = entry.identityKey === playingIdentity;
            return (
              <HistoryRow
                key={entry.identityKey}
                entry={entry}
                file={file}
                active={isPlaying}
                menuOpen={menu?.context.kind === "song" && menu.context.file.path === file?.path}
                showCount={toggle === "most-played"}
                onPlay={() => file && onPlay(file)}
                onContextMenu={(x, y) => {
                  if (!file) return;
                  setMenu({ context: { kind: "song", file }, x, y });
                }}
              />
            );
          })}
        </div>
      </div>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className="rf-music-history-toggle px-4 py-1.5 rounded-full text-xs font-bold border-0 cursor-pointer"
      style={{ outline: "none" }}
    >
      {children}
    </button>
  );
}

function HistoryRow({
  entry,
  file,
  active,
  showCount,
  menuOpen,
  onPlay,
  onContextMenu,
}: {
  entry: PlayHistoryEntry;
  file: MediaFile | null;
  active: boolean;
  showCount: boolean;
  menuOpen: boolean;
  onPlay: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const coverPath = file ? bestCoverPath(file) : null;
  const coverSrc = coverPath ? convertFileSrc(coverPath) : null;

  return (
    <div
      className="group relative flex items-center gap-3 px-3 py-2 cursor-pointer rf-music-right-row select-none"
      data-active={active ? "true" : "false"}
      onClick={onPlay}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <div className="relative shrink-0 w-10 h-10 overflow-hidden bg-stone-950">
        {coverSrc ? (
          <img src={coverSrc} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600 text-lg">♪</div>
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
          className="rf-music-right-row-title text-[12px] font-semibold truncate"
        >
          {entry.title || file?.name || (entry.path.split("/").pop() ?? "")}
        </span>
        <span className="text-[11px] truncate mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {entry.artist || "Unknown artist"}
        </span>
      </div>
      {showCount && (
        <span className="text-[11px] shrink-0 tabular-nums px-1.5" style={{ color: "var(--music-text-muted)" }}>
          {entry.playCount}×
        </span>
      )}
      <button
        type="button"
        className={`rf-music-row-menu shrink-0 w-6 h-6 flex items-center justify-center rounded ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        style={{ color: "var(--music-text-muted)" }}
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e.clientX, e.clientY);
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
      className="px-6 py-2.5 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 duration-200 cursor-pointer"
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
