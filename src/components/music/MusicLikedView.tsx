import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Shuffle, Play, ChevronLeft, MoreHorizontal } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { resolveLikedFiles } from "./musicLikedTracks";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { LikedSongsCover } from "./LikedSongsCover";
import { MusicLikeButton } from "./MusicLikeButton";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicTrackIndexPlay } from "./MusicTrackIndexPlay";

type TrackRowProps = {
  file: MediaFile;
  index: number;
  isPlaying: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
};

function TrackRow({ file, index, isPlaying, onClick, onContextMenu, menuOpen }: TrackRowProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = file.artist ?? file.albumArtist ?? "";

  return (
    <div
      className="group/row flex items-center gap-3 px-4 py-2 rounded w-full transition-colors cursor-pointer"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      <MusicTrackIndexPlay indexLabel={index + 1} isPlaying={isPlaying} />
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-11 h-11 shrink-0 object-cover" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-11 h-11 shrink-0 flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-bold truncate"
          style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-primary)" }}
        >
          {file.name}
        </div>
        {artist && (
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{artist}</div>
        )}
      </div>
      <div className="text-xs shrink-0 w-12 text-right" style={{ color: "var(--music-text-muted)" }}>
        {formatDuration(file.duration)}
      </div>
      <MusicLikeButton
        file={file}
        className={menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 shrink-0"}
        size={15}
      />
      {onContextMenu && (
        <button
          type="button"
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border-0 bg-transparent transition-opacity duration-100 ${menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
          style={{ color: "var(--music-text-muted)" }}
          onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
          aria-label="More options"
        >
          <MoreHorizontal size={15} />
        </button>
      )}
    </div>
  );
}

type Props = {
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
  onBack: () => void;
};

export function MusicLikedView({ onPlayFile, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const tracks = useMemo(() => {
    const all = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    return resolveLikedFiles(all);
  }, [entries, musicLikedKeys]);

  const totalDuration = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = buildSmartShuffleOrder({
      pool: tracks,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, shuffled);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar">
      <div className="relative shrink-0 overflow-hidden" style={{ minHeight: 180 }}>
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ filter: "blur(40px) brightness(0.35)", transform: "scale(1.15)" }}
        >
          <LikedSongsCover files={tracks} className="w-full h-full min-h-[180px]" />
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 30%, var(--music-surface) 100%)" }}
        />
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: "var(--music-text-primary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div className="relative z-10 flex items-end gap-5 px-5 pb-5 pt-12 pointer-events-none [&_button]:pointer-events-auto">
          <LikedSongsCover files={tracks} className="w-32 h-32 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--music-text-muted)" }}>
              Playlist
            </p>
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--music-text-primary)" }}>
              Liked Songs
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--music-text-muted)" }}>
              {tracks.length} {tracks.length === 1 ? "song" : "songs"}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 shrink-0">
        <button
          type="button"
          onClick={() => tracks[0] && onPlayFile(tracks[0], tracks)}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--music-accent)", color: "#fff", borderRadius: 12 }}
          disabled={tracks.length === 0}
        >
          <Play size={15} fill="currentColor" /> Play
        </button>
        <button
          type="button"
          onClick={handleShuffle}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold border transition-colors hover:bg-white/10"
          style={{ borderColor: "var(--music-border)", color: "var(--music-text-primary)" }}
          disabled={tracks.length === 0}
        >
          <Shuffle size={15} /> Shuffle
        </button>
      </div>

      <section className="px-1 pb-4">
        {tracks.length === 0 ? (
          <p className="text-center py-8 text-sm px-6" style={{ color: "var(--music-text-muted)" }}>
            heart a track to build your liked songs playlist
          </p>
        ) : (
          tracks.map((file, i) => (
            <TrackRow
              key={file.path}
              file={file}
              index={i}
              isPlaying={playingFile?.path === file.path}
              onClick={() => onPlayFile(file, tracks)}
              menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
              onContextMenu={(e) => setMenu({
                context: { kind: "song", file },
                x: e.clientX,
                y: e.clientY,
                onPlay: () => onPlayFile(file, tracks),
              })}
            />
          ))
        )}
      </section>
      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
