import { convertFileSrc } from "@tauri-apps/api/core";
import { MoreHorizontal, Music } from "lucide-react";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import { bestCoverPath } from "@/mediaKind";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { MusicLikeButton } from "./MusicLikeButton";
import { MusicTrackIndexPlay } from "./MusicTrackIndexPlay";
import { setMusicTrackDragData, trackArtistLabel } from "./musicPlaylists";

type Props = {
  file: MediaFile;
  index: number;
  isPlaying: boolean;
  menuOpen: boolean;
  dropIndicator: "above" | "below" | null;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onReorderStart: () => void;
  onReorderOver: (e: React.DragEvent) => void;
  onReorderDrop: () => void;
  onReorderEnd: () => void;
};

export function MusicPlaylistTrackRow({
  file,
  index,
  isPlaying,
  menuOpen,
  dropIndicator,
  onClick,
  onContextMenu,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
}: Props) {
  const cover = bestCoverPath(file);
  const artist = trackArtistLabel(file);
  const playback = useOptionalMainAudioPlayback();
  const showPause = isPlaying && playback != null && !playback.paused;

  return (
    <div
      draggable
      onDragStart={(e) => {
        setMusicTrackDragData(e, [file.path]);
        onReorderStart();
      }}
      onDragOver={onReorderOver}
      onDrop={(e) => {
        e.preventDefault();
        onReorderDrop();
      }}
      onDragEnd={onReorderEnd}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      className={cn(
        "group/row relative flex items-center gap-3 px-4 py-2 rounded w-full cursor-pointer transition-colors",
        "hover:bg-[var(--music-surface-raised)]",
        menuOpen && "bg-[var(--music-surface-raised)]",
      )}
    >
      {dropIndicator && (
        <span
          className={cn(
            "pointer-events-none absolute left-4 right-4 h-0.5 rounded-full",
            dropIndicator === "above" ? "top-0" : "bottom-0",
          )}
          style={{ background: "var(--music-accent)" }}
          aria-hidden
        />
      )}
      <MusicTrackIndexPlay indexLabel={index + 1} isPlaying={isPlaying} showPause={showPause} />
      {cover ? (
        <img
          src={convertFileSrc(cover)}
          alt=""
          draggable={false}
          className="w-11 h-11 shrink-0 object-cover rounded-[var(--music-card-radius)]"
        />
      ) : (
        <div className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[var(--music-card-radius)] bg-[var(--music-surface-raised)] text-[color:var(--music-text-muted)]">
          <Music size={16} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm font-bold truncate",
            isPlaying ? "text-[color:var(--music-accent)]" : "text-[color:var(--music-text-primary)]",
          )}
        >
          {file.name}
        </div>
        {artist && (
          <div className="text-xs truncate mt-0.5 text-[color:var(--music-text-secondary)]">{artist}</div>
        )}
      </div>
      <div className="text-xs shrink-0 w-12 text-right text-[color:var(--music-text-muted)]">
        {formatDuration(file.duration)}
      </div>
      <MusicLikeButton
        file={file}
        className={menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 shrink-0"}
        size={15}
      />
      <button
        type="button"
        className={cn(
          "shrink-0 w-7 h-7 flex items-center justify-center rounded-full border-0 bg-transparent transition-opacity duration-100 text-[color:var(--music-text-muted)]",
          menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e);
        }}
        aria-label="More options"
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
  );
}
