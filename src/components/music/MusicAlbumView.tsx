import { useMemo, useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Shuffle, Play, ChevronLeft } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import { isAudioOnlyPath } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { artistKeyFromFile, primaryArtist, rawArtistFromFile } from "./musicArtist";
import { albumKeyFromFile, resolveDisplayAlbum } from "./musicShelfDedup";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { MusicLikeButton } from "./MusicLikeButton";
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
  const trackNum = file.trackNo ?? index + 1;
  const playback = useOptionalMainAudioPlayback();
  const showPauseOnHover = isPlaying && playback != null && !playback.paused;
  return (
    <div
      className="group/row flex items-center gap-4 px-4 py-2.5 rounded w-full transition-colors cursor-pointer"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      <MusicTrackIndexPlay
        indexLabel={trackNum}
        isPlaying={isPlaying}
        showPause={showPauseOnHover}
        iconSize={12}
        className="h-6 w-6"
        labelClassName="text-xs"
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-primary)" }}
        >
          {file.name}
        </div>
        {file.artist && (
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{file.artist}</div>
        )}
      </div>
      <div className="text-xs shrink-0 w-12 text-right" style={{ color: "var(--music-text-muted)" }}>
        {formatDuration(file.duration)}
      </div>
      <MusicLikeButton
        file={file}
        size={15}
        className={menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 shrink-0"}
      />
      {onContextMenu && (
        <button
          type="button"
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border-0 bg-transparent transition-opacity duration-100 ${menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
          style={{ color: "var(--music-text-muted)" }}
          onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
          aria-label="More options"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

type Props = {
  artistKey: string;
  albumKey: string;
  onPlayFile: (file: MediaFile, playlist: MediaFile[], source: MusicQueueSource) => void;
  onOpenArtist: (artistKey: string) => void;
  onBack: () => void;
};

export function MusicAlbumView({ artistKey, albumKey, onPlayFile, onOpenArtist, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const tracks = useMemo(() => {
    const all = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    const albumTracks = all.filter((t) => {
      if (artistKeyFromFile(t) !== artistKey.trim().toLowerCase()) return false;
      return albumKeyFromFile(t) === albumKey.trim().toLowerCase();
    });
    return albumTracks.sort((a, b) => {
      const na = a.trackNo ?? 9999;
      const nb = b.trackNo ?? 9999;
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name);
    });
  }, [entries, albumKey]);

  const displayAlbum = useMemo(() => {
    const first = tracks[0];
    return first ? resolveDisplayAlbum(first) || albumKey : albumKey;
  }, [tracks, albumKey]);
  const displayArtist = useMemo(() => {
    const first = tracks[0];
    if (first) {
      const raw = rawArtistFromFile(first);
      return raw ? primaryArtist(raw) : artistKey;
    }
    return artistKey;
  }, [tracks, artistKey]);

  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  useEffect(() => {
    const paths = tracks[0]
      ? albumCoverPathWithFallback(tracks[0])
      : { primary: null, fallback: null };
    setCoverSrc(paths.primary ? convertFileSrc(paths.primary) : null);
  }, [tracks]);
  const handleCoverError = () => {
    const fallback = tracks[0] ? albumCoverPathWithFallback(tracks[0]).fallback : null;
    if (fallback) {
      setCoverSrc(convertFileSrc(fallback));
    } else {
      setCoverSrc(null);
    }
  };
  const totalDuration = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);

  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);

  const albumSource = musicQueueSource("album", displayAlbum);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = buildSmartShuffleOrder({
      pool: tracks,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, shuffled, albumSource);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar">
      {/* Header */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ minHeight: 180 }}
      >
        {coverSrc && (
          <img
            src={coverSrc}
            alt=""
            onError={handleCoverError}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ filter: "blur(40px) brightness(0.35)", transform: "scale(1.15)" }}
          />
        )}
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
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              onError={handleCoverError}
              className="w-32 h-32 rounded-lg shrink-0"
              style={{
                borderRadius: "var(--music-card-radius)",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              className="w-32 h-32 rounded-lg shrink-0 flex items-center justify-center"
              style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--music-text-muted)" }}>Album</p>
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--music-text-primary)" }}>{displayAlbum}</h1>
            <button
              type="button"
              onClick={() => onOpenArtist(artistKey)}
              className="text-sm mt-0.5 hover:underline transition-opacity hover:opacity-80"
              style={{ color: "var(--music-text-secondary)" }}
            >
              {displayArtist}
            </button>
            <p className="text-xs mt-1" style={{ color: "var(--music-text-muted)" }}>
              {tracks.length} {tracks.length === 1 ? "song" : "songs"}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0">
        <button
          type="button"
          onClick={() => onPlayFile(tracks[0], tracks, albumSource)}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--music-accent)", color: "#fff" }}
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

      {/* Tracklist */}
      <section className="px-1 pb-4">
        {tracks.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "var(--music-text-muted)" }}>No tracks found.</p>
        ) : (
          tracks.map((file, i) => (
            <TrackRow
              key={file.path}
              file={file}
              index={i}
              isPlaying={playingFile?.path === file.path}
              onClick={() => onPlayFile(file, tracks, albumSource)}
              menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
              onContextMenu={(e) => setMenu({
                context: { kind: "song", file },
                x: e.clientX,
                y: e.clientY,
                onPlay: () => onPlayFile(file, tracks, albumSource),
              })}
            />
          ))
        )}
      </section>
      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
