import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, MoreHorizontal, Shuffle } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import type { MediaFile } from "@/types";
import { primaryArtist } from "./musicArtist";
import { normalizeAlbumShelfKey } from "./musicShelfDedup";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { resolveLikedFiles } from "./musicLikedTracks";
import { MusicProfileView } from "./MusicProfileView";
import { LikedSongsCover } from "./LikedSongsCover";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";

type LibTab = "songs" | "albums" | "artists" | "liked" | "stats";

type SongRowProps = {
  file: MediaFile;
  index: number;
  isPlaying: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
};

function SongRow({ file, index, isPlaying, onClick, onContextMenu, menuOpen }: SongRowProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = file.artist ?? file.albumArtist ?? (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "");

  return (
    <div
      className="group/row flex items-center gap-3 px-4 py-2 rounded w-full transition-colors cursor-pointer"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      <div className="w-8 text-right text-sm shrink-0" style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-muted)" }}>
        <span className="group-hover/row:hidden">{isPlaying ? "♪" : index + 1}</span>
        <span className="hidden group-hover/row:inline"><Play size={14} fill="currentColor" /></span>
      </div>
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-11 h-11 rounded shrink-0 object-cover" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-11 h-11 rounded shrink-0 flex items-center justify-center"
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
      {file.album && (
        <div className="text-xs truncate w-40 shrink-0 hidden lg:block" style={{ color: "var(--music-text-muted)" }}>
          {file.album}
        </div>
      )}
      <div className="text-xs shrink-0 w-12 text-right" style={{ color: "var(--music-text-muted)" }}>
        {formatDuration(file.duration)}
      </div>
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

type AlbumRowProps = {
  album: string;
  artist: string;
  cover: string | null;
  trackCount: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

function AlbumRow({ album, artist, cover, trackCount, onClick, onContextMenu }: AlbumRowProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="group/album flex items-center gap-4 px-4 py-3 rounded w-full text-left transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-14 h-14 rounded shrink-0 object-cover" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-14 h-14 rounded shrink-0 flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface)", color: "var(--music-text-muted)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: "var(--music-text-primary)" }}>{album}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
          {artist && `${artist} · `}{trackCount} {trackCount === 1 ? "song" : "songs"}
        </div>
      </div>
      <span
        className="opacity-0 group-hover/album:opacity-100 transition-opacity"
        style={{ color: "var(--music-text-muted)" }}
      >
        <Play size={16} />
      </span>
    </button>
  );
}

type ArtistRowProps = {
  artist: string;
  trackCount: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

function ArtistRow({ artist, trackCount, onClick, onContextMenu }: ArtistRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="group/artist flex items-center gap-4 px-4 py-3 rounded w-full text-left transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <div
        className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-lg font-bold"
        style={{ background: "var(--music-surface-raised)", color: "var(--music-text-secondary)" }}
      >
        {artist.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: "var(--music-text-primary)" }}>{artist}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
          {trackCount} {trackCount === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}

type Props = {
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
  onOpenArtist: (artistKey: string) => void;
  onOpenAlbum: (artistKey: string, albumKey: string) => void;
};

export function MusicLibraryView({ onPlayFile, onOpenArtist, onOpenAlbum }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const [activeTab, setActiveTab] = useState<LibTab>("songs");
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const tracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.name.localeCompare(b.name)),
    [tracks],
  );

  const likedTracks = useMemo(
    () => resolveLikedFiles(tracks),
    [tracks, musicLikedKeys],
  );

  const albums = useMemo(() => {
    const map = new Map<string, { albumKey: string; artistKey: string; album: string; artist: string; cover: string | null; tracks: MediaFile[] }>();
    for (const t of tracks) {
      const albumName = (t.canonicalAlbum ?? t.album)?.trim() ?? "";
      if (!albumName) continue;
      const artistRaw = t.canonicalArtist?.trim() || t.albumArtist || t.artist || "";
      const artistKey = primaryArtist(artistRaw).toLowerCase();
      const albumKey = normalizeAlbumShelfKey(albumName);
      const key = `${artistKey}::${albumKey}`;
      if (!map.has(key)) {
        map.set(key, {
          albumKey,
          artistKey,
          album: albumName,
          artist: artistRaw,
          cover: bestCoverPath(t),
          tracks: [],
        });
      }
      map.get(key)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }, [tracks]);

  const artists = useMemo(() => {
    const map = new Map<string, { key: string; display: string; tracks: MediaFile[] }>();
    for (const t of tracks) {
      const raw = t.artist ?? t.albumArtist ?? "";
      if (!raw) continue;
      const key = primaryArtist(raw).toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, display: primaryArtist(raw) || raw, tracks: [] });
      }
      map.get(key)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => a.display.localeCompare(b.display));
  }, [tracks]);

  const tabs: { id: LibTab; label: string; count?: number }[] = [
    { id: "liked", label: "Liked Songs", count: likedTracks.length },
    { id: "stats", label: "Stats" },
    { id: "songs", label: "Songs" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div
        className="flex items-center gap-1 px-6 py-3 shrink-0"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
              activeTab === t.id
                ? "text-[color:var(--music-bg)]"
                : "text-[color:var(--music-text-secondary)] hover:text-[color:var(--music-text-primary)]",
            )}
            style={
              activeTab === t.id
                ? { background: "var(--music-text-primary)" }
                : undefined
            }
          >
            {t.label}
            {t.count != null && t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarColor: "var(--music-border) transparent" }}>
        {activeTab === "stats" && (
          <MusicProfileView />
        )}

        {activeTab === "liked" && (
          <div>
            {likedTracks.length === 0 ? (
              <p className="text-center py-12 text-sm px-6" style={{ color: "var(--music-text-muted)" }}>
                heart a track to build your liked songs playlist
              </p>
            ) : (
              <>
                <div className="flex items-end gap-5 px-6 pb-4 pt-2">
                  <LikedSongsCover files={likedTracks} className="w-28 h-28 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--music-text-muted)" }}>
                      Playlist
                    </p>
                    <h2 className="text-xl font-bold truncate" style={{ color: "var(--music-text-primary)" }}>
                      Liked Songs
                    </h2>
                    <p className="text-xs mt-1" style={{ color: "var(--music-text-muted)" }}>
                      {likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => onPlayFile(likedTracks[0]!, likedTracks)}
                        className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                        style={{ background: "var(--music-accent)", color: "#fff", borderRadius: 12 }}
                      >
                        <Play size={14} fill="currentColor" /> Play
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const shuffled = buildSmartShuffleOrder({
                            pool: likedTracks,
                            likedKeys: musicLikedKeys,
                            seed: Date.now() & 0xffffffff,
                          });
                          onPlayFile(shuffled[0]!, shuffled);
                        }}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors hover:bg-white/10"
                        style={{ borderColor: "var(--music-border)", color: "var(--music-text-primary)" }}
                      >
                        <Shuffle size={14} /> Shuffle
                      </button>
                    </div>
                  </div>
                </div>
                {likedTracks.map((file, i) => (
                  <SongRow
                    key={file.path}
                    file={file}
                    index={i}
                    isPlaying={playingFile?.path === file.path}
                    onClick={() => onPlayFile(file, likedTracks)}
                    menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                    onContextMenu={(e) => setMenu({
                      context: { kind: "song", file },
                      x: e.clientX,
                      y: e.clientY,
                      onPlay: () => onPlayFile(file, likedTracks),
                    })}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === "songs" && (
          <div>
            {sortedTracks.length === 0 && (
              <p className="text-center py-12 text-sm" style={{ color: "var(--music-text-muted)" }}>No songs found.</p>
            )}
            {sortedTracks.map((file, i) => (
              <SongRow
                key={file.path}
                file={file}
                index={i}
                isPlaying={playingFile?.path === file.path}
                onClick={() => onPlayFile(file, sortedTracks)}
                menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                onContextMenu={(e) => setMenu({
                  context: { kind: "song", file },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: () => onPlayFile(file, sortedTracks),
                })}
              />
            ))}
          </div>
        )}

        {activeTab === "albums" && (
          <div>
            {albums.length === 0 && (
              <p className="text-center py-12 text-sm" style={{ color: "var(--music-text-muted)" }}>
                No albums found. Download music with album tags to see them here.
              </p>
            )}
            {albums.map((a) => (
              <AlbumRow
                key={`${a.artistKey}::${a.albumKey}`}
                album={a.album}
                artist={a.artist}
                cover={a.cover}
                trackCount={a.tracks.length}
                onClick={() => onOpenAlbum(a.artistKey, a.albumKey)}
                onContextMenu={(e) => setMenu({
                  context: { kind: "album", artistKey: a.artistKey, albumKey: a.albumKey, displayName: a.album, artistName: a.artist },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: a.tracks.length > 0 ? () => onPlayFile(a.tracks[0], a.tracks) : undefined,
                })}
              />
            ))}
          </div>
        )}

        {activeTab === "artists" && (
          <div>
            {artists.length === 0 && (
              <p className="text-center py-12 text-sm" style={{ color: "var(--music-text-muted)" }}>
                No artist tags found. Files named &quot;Artist - Title&quot; will appear here.
              </p>
            )}
            {artists.map((a) => (
              <ArtistRow
                key={a.key}
                artist={a.display}
                trackCount={a.tracks.length}
                onClick={() => onOpenArtist(a.key)}
                onContextMenu={(e) => setMenu({
                  context: { kind: "artist", artistKey: a.key, displayName: a.display },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: a.tracks.length > 0 ? () => onPlayFile(a.tracks[0], a.tracks) : undefined,
                })}
              />
            ))}
          </div>
        )}
      </div>
      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
