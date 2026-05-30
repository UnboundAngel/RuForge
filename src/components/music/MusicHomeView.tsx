import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import type { MediaFile } from "@/types";

type TrackCardProps = {
  file: MediaFile;
  onClick: () => void;
};

function TrackCard({ file, onClick }: TrackCardProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = file.artist ?? file.albumArtist ?? (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "");

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg p-2 text-left transition-colors group/track w-full"
      style={{ color: "var(--music-text-primary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-10 h-10 rounded object-cover shrink-0" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-10 h-10 rounded shrink-0 flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{file.name}</div>
        {artist && <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{artist}</div>}
      </div>
    </button>
  );
}

type AlbumCardProps = {
  album: string;
  artist: string;
  cover: string | null;
  onClick: () => void;
};

function AlbumCard({ album, artist, cover, onClick }: AlbumCardProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg p-3 text-left transition-colors"
      style={{ background: "var(--music-surface-raised)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--music-surface-raised) 80%, white 20%)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
    >
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-full aspect-square object-cover rounded" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-full aspect-square rounded flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface)", color: "var(--music-text-muted)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div>
        <div className="text-sm font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{album}</div>
        {artist && <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{artist}</div>}
      </div>
    </button>
  );
}

type Props = {
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
};

export function MusicHomeView({ onPlayFile }: Props) {
  const entries = useRuforgeStore((s) => s.entries);

  const tracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  const recentTracks = useMemo(
    () => [...tracks].sort((a, b) => b.created - a.created).slice(0, 12),
    [tracks],
  );

  const albums = useMemo(() => {
    const seen = new Map<string, { album: string; artist: string; cover: string | null; tracks: MediaFile[] }>();
    for (const t of tracks) {
      const albumName = t.album ?? "";
      if (!albumName) continue;
      const key = albumName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          album: albumName,
          artist: t.albumArtist ?? t.artist ?? "",
          cover: bestCoverPath(t),
          tracks: [],
        });
      }
      seen.get(key)!.tracks.push(t);
    }
    return [...seen.values()].slice(0, 12);
  }, [tracks]);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--music-text-muted)" }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <div className="text-center">
          <p className="text-base font-medium mb-1" style={{ color: "var(--music-text-secondary)" }}>No music in your library</p>
          <p className="text-sm">Download audio files using the Downloader tab, or add a folder in Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 overflow-y-auto h-full" style={{ scrollbarColor: "var(--music-border) transparent" }}>
      {/* Quick picks */}
      <section>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--music-text-primary)" }}>Quick picks</h2>
        <div className="grid grid-cols-2 gap-1">
          {recentTracks.slice(0, 8).map((file) => (
            <TrackCard key={file.path} file={file} onClick={() => onPlayFile(file, tracks)} />
          ))}
        </div>
      </section>

      {/* Albums */}
      {albums.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-4" style={{ color: "var(--music-text-primary)" }}>Albums</h2>
          <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
            {albums.slice(0, 8).map((a) => (
              <AlbumCard
                key={a.album}
                album={a.album}
                artist={a.artist}
                cover={a.cover}
                onClick={() => onPlayFile(a.tracks[0], a.tracks)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently added */}
      <section>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--music-text-primary)" }}>Recently added</h2>
        <div className="grid grid-cols-2 gap-1">
          {recentTracks.slice(8, 16).map((file) => (
            <TrackCard key={file.path} file={file} onClick={() => onPlayFile(file, tracks)} />
          ))}
        </div>
      </section>
    </div>
  );
}
