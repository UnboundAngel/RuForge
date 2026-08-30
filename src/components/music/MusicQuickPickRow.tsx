import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Clock, MoreHorizontal } from "lucide-react";
import type { MediaFile } from "@/types";
import { bestCoverPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import { PlayPauseMorphIcon } from "@/components/ui/PlayPauseMorphIcon";
import { HoverMarqueeText } from "./HoverMarqueeText";

type Props = {
  file: MediaFile;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
  metaLabel?: string;
  variant?: "gradient" | "glass";
};

function artistLabel(file: MediaFile): string {
  return (
    file.artist ??
    file.albumArtist ??
    (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "Unknown Artist")
  );
}

export function MusicQuickPickRow({
  file,
  onClick,
  onContextMenu,
  menuOpen,
  metaLabel,
  variant = "gradient",
}: Props) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = artistLabel(file);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const playback = useOptionalMainAudioPlayback();
  const isActive = playingFile?.path === file.path;
  const showPauseOnHover = isActive && playback != null && !playback.paused;
  const [hovered, setHovered] = useState(false);
  const hoverIconSize = variant === "glass" ? 22 : 18;

  const rowClass =
    variant === "glass"
      ? "group/row relative flex items-center gap-4 rounded-2xl p-3 w-full min-w-0 min-h-[3.75rem] cursor-pointer transition-all duration-300 hover:bg-white/[0.06] active:scale-[0.99]"
      : "group/row relative flex items-center gap-4 rounded-lg px-3 py-2.5 w-full min-w-0 min-h-[4.5rem] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99] cursor-pointer";

  const rowStyle =
    variant === "glass"
      ? undefined
      : {
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.02) 100%)",
          color: "var(--music-text-primary)",
        };

  return (
    <div
      className={rowClass}
      style={rowStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
    >
      <div
        className={`relative shrink-0 overflow-hidden bg-stone-950 transition-transform duration-200 group-hover/row:scale-[1.03] ${
          variant === "glass" ? "w-14 h-14 rounded-xl shadow-lg" : "w-16 h-16 rounded-md"
        }`}
      >
        {coverSrc ? (
          <img src={coverSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/50">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 ${
            variant === "glass" ? "backdrop-blur-[2px]" : ""
          }`}
        >
          <PlayPauseMorphIcon
            playing={showPauseOnHover}
            size={hoverIconSize}
            className={showPauseOnHover ? "text-white" : "text-white ml-0.5"}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5 pr-1 overflow-hidden">
        <HoverMarqueeText
          text={file.name}
          active={hovered}
          layoutKey={`${file.path}:qp-row-title`}
          className={
            variant === "glass"
              ? "text-sm font-semibold leading-tight text-[var(--music-text-primary)]"
              : "text-[15px] font-bold leading-tight text-[var(--music-text-primary)]"
          }
        />
        <div
          className={`leading-snug min-w-0 ${
            variant === "glass" ? "text-[13px] font-medium" : "text-sm font-medium"
          }`}
          style={{ color: "var(--music-text-secondary)" }}
        >
          {metaLabel ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 min-w-0">
              <span className="truncate">{artist}</span>
              <span
                className="flex items-center gap-1.5 shrink-0 whitespace-nowrap tabular-nums"
                style={{ color: "var(--music-text-muted)" }}
              >
                <Clock className="w-3 h-3 shrink-0" />
                {metaLabel}
              </span>
            </div>
          ) : (
            <div className="truncate">{artist}</div>
          )}
        </div>
      </div>
      {onContextMenu && (
        <button
          type="button"
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border-0 bg-transparent transition-opacity duration-100 ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
          }`}
          style={{ color: "var(--music-text-muted)" }}
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
          aria-label="More options"
        >
          <MoreHorizontal size={variant === "glass" ? 18 : 15} />
        </button>
      )}
    </div>
  );
}
