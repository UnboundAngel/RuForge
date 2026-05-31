import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Shuffle, Play, ChevronLeft } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath, hasSquareCover } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";

type AlbumCardProps = {
  album: string;
  cover: string | null;
  isSquare: boolean;
  trackCount: number;
  onClick: () => void;
};

function AlbumCard({ album, cover, isSquare, trackCount, onClick }: AlbumCardProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg p-3 text-left w-36 shrink-0 transition-colors"
      style={{ background: "var(--music-surface-raised)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--music-surface-raised) 80%, white 20%)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
    >
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          className="w-full aspect-square rounded"
          style={{
            borderRadius: "var(--music-card-radius)",
            objectFit: isSquare ? "cover" : "contain",
            background: isSquare ? undefined : "var(--music-surface)",
          }}
        />
      ) : (
        <div
          className="w-full aspect-square rounded flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface)", color: "var(--music-text-muted)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div>
        <div className="text-sm font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{album}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
          {trackCount} {trackCount === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}

type SongRowProps = {
  file: MediaFile;
  index: number;
  isPlaying: boolean;
  onClick: () => void;
};

function SongRow({ file, index, isPlaying, onClick }: SongRowProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const square = hasSquareCover(file);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/row flex items-center gap-3 px-4 py-2 rounded w-full text-left transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <div className="w-6 text-right text-xs shrink-0" style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-muted)" }}>
        <span className="group-hover/row:hidden">{isPlaying ? "♪" : index + 1}</span>
        <span className="hidden group-hover/row:inline"><Play size={12} fill="currentColor" /></span>
      </div>
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          className="w-9 h-9 rounded shrink-0"
          style={{
            borderRadius: "var(--music-card-radius)",
            objectFit: square ? "cover" : "contain",
            background: square ? undefined : "var(--music-surface)",
          }}
        />
      ) : (
        <div
          className="w-9 h-9 rounded shrink-0 flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-primary)" }}>
          {file.name}
        </div>
        {file.album && (
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{file.album}</div>
        )}
      </div>
      <div className="text-xs shrink-0 w-12 text-right" style={{ color: "var(--music-text-muted)" }}>
        {formatDuration(file.duration)}
      </div>
    </button>
  );
}

type Props = {
  artistKey: string;
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
  onOpenAlbum: (albumKey: string) => void;
  onBack: () => void;
};

export function MusicArtistView({ artistKey, onPlayFile, onOpenAlbum, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);

  const tracks = useMemo(() => {
    const all = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    return all.filter((t) => {
      const a = (t.artist ?? t.albumArtist ?? "").trim().toLowerCase();
      return a === artistKey.toLowerCase();
    });
  }, [entries, artistKey]);

  const displayName = useMemo(() => {
    const first = tracks[0];
    return first ? (first.artist ?? first.albumArtist ?? artistKey) : artistKey;
  }, [tracks, artistKey]);

  const heroCover = useMemo(() => bestCoverPath(tracks[0] ?? {}), [tracks]);
  const heroCoverSrc = heroCover ? convertFileSrc(heroCover) : null;

  const albums = useMemo(() => {
    const map = new Map<string, { key: string; display: string; cover: string | null; isSquare: boolean; tracks: MediaFile[] }>();
    for (const t of tracks) {
      const rawAlbum = t.album ?? "";
      if (!rawAlbum) continue;
      const key = rawAlbum.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, display: rawAlbum, cover: bestCoverPath(t), isSquare: hasSquareCover(t), tracks: [] });
      }
      map.get(key)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => a.display.localeCompare(b.display));
  }, [tracks]);

  const totalDuration = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    onPlayFile(shuffled[0], shuffled);
  };

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 shrink-0 text-sm opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center justify-center flex-1" style={{ color: "var(--music-text-muted)" }}>
          No tracks found for this artist.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar">
      {/* Hero */}
      <div className="relative shrink-0 h-52 overflow-hidden">
        {heroCoverSrc && (
          <img
            src={heroCoverSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(32px) brightness(0.45)", transform: "scale(1.1)" }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 40%, var(--music-surface) 100%)" }}
        />
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity z-10"
          style={{ color: "var(--music-text-primary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="absolute bottom-4 left-5 z-10">
          <h1 className="text-2xl font-bold" style={{ color: "var(--music-text-primary)" }}>{displayName}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--music-text-secondary)" }}>
            {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            {albums.length > 0 && ` · ${albums.length} ${albums.length === 1 ? "album" : "albums"}`}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 px-5 py-4 shrink-0">
        <button
          type="button"
          onClick={() => onPlayFile(tracks[0], tracks)}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--music-accent)", color: "#fff" }}
        >
          <Play size={15} fill="currentColor" /> Play
        </button>
        <button
          type="button"
          onClick={handleShuffle}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold border transition-colors hover:bg-white/10"
          style={{ borderColor: "var(--music-border)", color: "var(--music-text-primary)" }}
        >
          <Shuffle size={15} /> Shuffle
        </button>
      </div>

      {/* Albums */}
      {albums.length > 0 && (
        <section className="px-5 mb-6">
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--music-text-muted)" }}
          >
            Albums
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {albums.map((a) => (
              <AlbumCard
                key={a.key}
                album={a.display}
                cover={a.cover}
                isSquare={a.isSquare}
                trackCount={a.tracks.length}
                onClick={() => onOpenAlbum(a.key)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Songs */}
      <section className="px-1 pb-4">
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-2 px-4"
          style={{ color: "var(--music-text-muted)" }}
        >
          Songs
        </h2>
        {tracks.map((file, i) => (
          <SongRow
            key={file.path}
            file={file}
            index={i}
            isPlaying={playingFile?.path === file.path}
            onClick={() => onPlayFile(file, tracks)}
          />
        ))}
      </section>
    </div>
  );
}
