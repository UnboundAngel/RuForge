import { useMemo, useState } from "react";
import { LazyThumb } from "./LazyThumb";
import type { CompanionItem } from "../types";
import { fmtDuration } from "../types";

type Props = {
  items: CompanionItem[];
  activeId: string | null;
  onPlay: (item: CompanionItem, playlist: CompanionItem[]) => void;
};

type AlbumGroup = {
  album: string;
  artist: string;
  tracks: CompanionItem[];
  coverItem: CompanionItem | null;
};

type ArtistGroup = {
  key: string;
  display: string;
  tracks: CompanionItem[];
};

function buildAlbums(tracks: CompanionItem[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    if (!track.album) continue;
    const key = `${(track.artist ?? "").toLowerCase()}::${track.album.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        album: track.album,
        artist: track.artist ?? "",
        tracks: [],
        coverItem: track.hasThumb ? track : null,
      });
    }
    const group = map.get(key)!;
    group.tracks.push(track);
    if (!group.coverItem && track.hasThumb) group.coverItem = track;
  }
  return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
}

function buildArtists(tracks: CompanionItem[]): ArtistGroup[] {
  const map = new Map<string, ArtistGroup>();
  for (const track of tracks) {
    const raw = track.artist ?? "";
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!map.has(key)) map.set(key, { key, display: raw, tracks: [] });
    map.get(key)!.tracks.push(track);
  }
  return [...map.values()].sort((a, b) => a.display.localeCompare(b.display));
}

export function LibraryView({ items, activeId, onPlay }: Props) {
  const [albumDetail, setAlbumDetail] = useState<AlbumGroup | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistGroup | null>(null);

  const sortedTracks = useMemo(
    () => [...items].sort((a, b) => a.title.localeCompare(b.title)),
    [items],
  );
  const quickPicks = useMemo(() => sortedTracks.slice(0, 12), [sortedTracks]);
  const likedTracks = useMemo(() => sortedTracks.slice(0, 4), [sortedTracks]);
  const albums = useMemo(() => buildAlbums(items), [items]);
  const artists = useMemo(() => buildArtists(items), [items]);

  if (albumDetail) {
    return (
      <DetailView
        title={albumDetail.album}
        subtitle={[albumDetail.artist, `${albumDetail.tracks.length} songs`].filter(Boolean).join(" - ")}
        coverItem={albumDetail.coverItem}
        tracks={albumDetail.tracks}
        activeId={activeId}
        onBack={() => setAlbumDetail(null)}
        onPlay={onPlay}
      />
    );
  }

  if (artistDetail) {
    const coverItem = artistDetail.tracks.find((track) => track.hasThumb) ?? artistDetail.tracks[0] ?? null;
    return (
      <DetailView
        title={artistDetail.display}
        subtitle={`${artistDetail.tracks.length} songs`}
        coverItem={coverItem}
        tracks={artistDetail.tracks}
        activeId={activeId}
        onBack={() => setArtistDetail(null)}
        onPlay={onPlay}
      />
    );
  }

  return (
    <div className="music-home-view">
      <div className="content-scroll music-home-scroll">
        {sortedTracks.length === 0 && <div className="empty-state">No songs found</div>}

        {quickPicks.length > 0 && (
          <section className="music-section">
            <h2 className="music-section-title">Quick picks</h2>
            <div className="quick-picks-grid">
              {quickPicks.map((item) => (
                <QuickPickCard
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  onClick={() => onPlay(item, sortedTracks)}
                />
              ))}
            </div>
          </section>
        )}

        {likedTracks.length > 0 && (
          <section className="music-section">
            <div className="music-section-heading">
              <h2 className="music-section-title">Liked Songs</h2>
              <span>{likedTracks.length} songs</span>
            </div>
            <button
              type="button"
              className="liked-songs-card"
              onClick={() => onPlay(likedTracks[0]!, likedTracks)}
            >
              <div className="liked-cover-stack">
                {likedTracks.map((item) => (
                  <LazyThumb key={item.id} id={item.id} hasThumb={item.hasThumb} className="liked-cover-tile">
                    <span className="song-thumb-placeholder">
                      <MusicIcon size={14} />
                    </span>
                  </LazyThumb>
                ))}
              </div>
              <div className="liked-copy">
                <div className="liked-title">Liked Songs</div>
                <div className="liked-meta">{likedTracks.length} songs</div>
              </div>
            </button>
          </section>
        )}

        {artists.length > 0 && (
          <section className="music-section">
            <h2 className="music-section-title">Artists</h2>
            <div className="artist-shelf">
              {artists.slice(0, 14).map((artist) => (
                <ArtistTile
                  key={artist.key}
                  artist={artist}
                  onClick={() => setArtistDetail(artist)}
                />
              ))}
            </div>
          </section>
        )}

        {albums.length > 0 && (
          <section className="music-section">
            <h2 className="music-section-title">Albums</h2>
            <div className="album-shelf">
              {albums.slice(0, 14).map((album) => (
                <AlbumTile
                  key={`${album.artist}::${album.album}`}
                  album={album}
                  onClick={() => setAlbumDetail(album)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="music-section local-files-section">
          <h2 className="music-section-title">Local Files</h2>
          <div className="local-files-list">
            {sortedTracks.map((item, index) => (
              <SongRow
                key={item.id}
                item={item}
                index={index}
                isActive={item.id === activeId}
                onClick={() => onPlay(item, sortedTracks)}
                showAlbum
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailView({
  title,
  subtitle,
  coverItem,
  tracks,
  activeId,
  onBack,
  onPlay,
}: {
  title: string;
  subtitle: string;
  coverItem: CompanionItem | null;
  tracks: CompanionItem[];
  activeId: string | null;
  onBack: () => void;
  onPlay: (item: CompanionItem, playlist: CompanionItem[]) => void;
}) {
  return (
    <div className="music-home-view">
      <div className="content-scroll music-home-scroll">
        <button type="button" className="detail-back" onClick={onBack}>
          <ChevronLeftIcon /> Back
        </button>
        <div className="music-detail-hero">
          {coverItem ? (
            <LazyThumb id={coverItem.id} hasThumb={coverItem.hasThumb} className="music-detail-art">
              <span className="song-thumb-placeholder">
                <MusicIcon size={28} />
              </span>
            </LazyThumb>
          ) : (
            <div className="music-detail-art">
              <MusicIcon size={28} />
            </div>
          )}
          <div className="music-detail-copy">
            <span>Library</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="local-files-list">
          {tracks.map((item, index) => (
            <SongRow
              key={item.id}
              item={item}
              index={index}
              isActive={item.id === activeId}
              onClick={() => onPlay(item, tracks)}
              showAlbum={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickPickCard({
  item,
  active,
  onClick,
}: {
  item: CompanionItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`quick-pick-card ${active ? "active" : ""}`}
      onClick={() => {
        if (item.playable) onClick();
      }}
      title={item.title}
    >
      <LazyThumb id={item.id} hasThumb={item.hasThumb} className="quick-pick-art">
        <span className="song-thumb-placeholder">
          <MusicIcon size={16} />
        </span>
      </LazyThumb>
      <span className="quick-pick-copy">
        <span className="quick-pick-title">{item.title}</span>
        <span className="quick-pick-subtitle">{item.artist || item.album || item.container || "Local file"}</span>
      </span>
    </button>
  );
}

function ArtistTile({ artist, onClick }: { artist: ArtistGroup; onClick: () => void }) {
  const cover = artist.tracks.find((track) => track.hasThumb) ?? artist.tracks[0] ?? null;
  return (
    <button type="button" className="artist-tile" onClick={onClick} title={artist.display}>
      {cover ? (
        <LazyThumb id={cover.id} hasThumb={cover.hasThumb} className="artist-tile-art">
          <span>{artist.display.charAt(0).toUpperCase()}</span>
        </LazyThumb>
      ) : (
        <span className="artist-tile-art">{artist.display.charAt(0).toUpperCase()}</span>
      )}
      <span className="artist-tile-name">{artist.display}</span>
      <span className="artist-tile-meta">{artist.tracks.length} songs</span>
    </button>
  );
}

function AlbumTile({ album, onClick }: { album: AlbumGroup; onClick: () => void }) {
  return (
    <button type="button" className="album-tile" onClick={onClick} title={album.album}>
      {album.coverItem ? (
        <LazyThumb id={album.coverItem.id} hasThumb={album.coverItem.hasThumb} className="album-tile-art">
          <span className="song-thumb-placeholder">
            <MusicIcon size={20} />
          </span>
        </LazyThumb>
      ) : (
        <span className="album-tile-art">
          <MusicIcon size={20} />
        </span>
      )}
      <span className="album-tile-title">{album.album}</span>
      {album.artist && <span className="album-tile-artist">{album.artist}</span>}
    </button>
  );
}

function SongRow({
  item,
  index,
  isActive,
  onClick,
  showAlbum,
}: {
  item: CompanionItem;
  index: number;
  isActive: boolean;
  onClick: () => void;
  showAlbum?: boolean;
}) {
  return (
    <button
      type="button"
      className={`song-row ${isActive ? "active" : ""} ${!item.playable ? "unsupported" : ""}`}
      onClick={() => {
        if (item.playable) onClick();
      }}
      disabled={!item.playable}
      title={item.title}
    >
      <div className="song-index">
        <span className="song-index-num">{isActive ? "♪" : index + 1}</span>
        <span className="song-index-play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>

      <LazyThumb id={item.id} hasThumb={item.hasThumb} className="song-thumb">
        <span className="song-thumb-placeholder">
          <MusicIcon size={16} />
        </span>
      </LazyThumb>

      <div className="song-text">
        <div className="song-title">{item.title}</div>
        {item.artist && <div className="song-artist">{item.artist}</div>}
      </div>

      {showAlbum && item.album && <div className="song-album">{item.album}</div>}

      {item.durationSecs != null && item.durationSecs > 0 && (
        <div className="song-duration">{fmtDuration(item.durationSecs)}</div>
      )}
    </button>
  );
}

function MusicIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
