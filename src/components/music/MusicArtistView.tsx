import { useMemo, useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Shuffle, Play, ChevronLeft, MapPin, Music2, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { fileMatchesArtistKey, primaryArtist, rawArtistFromFile } from "./musicArtist";
import { buildMultiTrackAlbumGroups } from "./musicShelfDedup";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicLikeButton } from "./MusicLikeButton";
import {
  ensureArtistMetaSidecar,
  readArtistMetaSidecar,
  type ArtistInfo,
} from "@/lib/musicMeta";

const artistInfoInFlight = new Map<string, Promise<ArtistInfo | null>>();

function normalizeArtistInfoKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function artistInfoKeysFor(artistKey: string, displayName: string): string[] {
  const keys = [normalizeArtistInfoKey(artistKey), normalizeArtistInfoKey(displayName)].filter(Boolean);
  return [...new Set(keys)];
}

// ---- Vinyl album card -------------------------------------------------------

type AlbumCardProps = {
  album: string;
  cover: string | null;
  trackCount: number;
  year?: number | null;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

function AlbumCard({ album, cover, trackCount, year, onClick, onContextMenu }: AlbumCardProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const metaLabel = `${trackCount} ${trackCount === 1 ? "song" : "songs"}`;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="group/album flex min-w-0 flex-col rounded-2xl p-2 text-left transition-colors"
      style={{ background: "var(--music-surface)" }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full transition-transform duration-200 group-hover/album:scale-[1.04]"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Disc3 size={44} />
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
          style={{
            background: "linear-gradient(to top, rgba(8,6,6,0.88) 0%, rgba(8,6,6,0.42) 55%, rgba(8,6,6,0) 100%)",
          }}
        />
        {year ? (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(8,6,6,0.72)", color: "var(--music-text-primary)" }}
          >
            {year}
          </span>
        ) : null}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span
            className="rounded-full px-2 py-1 text-[11px] font-medium"
            style={{ background: "rgba(8,6,6,0.76)", color: "var(--music-text-muted)" }}
          >
            {metaLabel}
          </span>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--music-accent)" }}
            aria-hidden
          />
        </div>
      </div>

      <div className="px-1.5 pb-1 pt-2">
        <div
          className="truncate text-sm font-semibold leading-snug"
          style={{ color: "var(--music-text-primary)" }}
        >
          {album}
        </div>
        <div
          className="mt-0.5 text-[11px] uppercase tracking-widest"
          style={{ color: "var(--music-text-muted)" }}
        >
          Album
        </div>
      </div>
    </button>
  );
}

function readArtistInfoInFlight(artistKey: string, displayName: string): Promise<ArtistInfo | null> | undefined {
  const keys = artistInfoKeysFor(artistKey, displayName);
  for (const key of keys) {
    const inFlight = artistInfoInFlight.get(key);
    if (inFlight) return inFlight;
  }
  return undefined;
}

function linkArtistInfoInFlight(
  artistKey: string,
  displayName: string,
  request: Promise<ArtistInfo | null>,
): void {
  const keys = artistInfoKeysFor(artistKey, displayName);
  for (const key of keys) {
    artistInfoInFlight.set(key, request);
  }
}

function unlinkArtistInfoInFlight(
  artistKey: string,
  displayName: string,
  request: Promise<ArtistInfo | null>,
): void {
  const keys = artistInfoKeysFor(artistKey, displayName);
  for (const key of keys) {
    if (artistInfoInFlight.get(key) === request) {
      artistInfoInFlight.delete(key);
    }
  }
}

async function loadArtistInfoFromSidecar(displayName: string): Promise<ArtistInfo | null> {
  const cached = await readArtistMetaSidecar(displayName);
  if (cached) return cached;
  await ensureArtistMetaSidecar(displayName, false);
  return readArtistMetaSidecar(displayName);
}

// ---- Song row --------------------------------------------------------------

type SongRowProps = {
  file: MediaFile;
  index: number;
  isPlaying: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
  motionDelay: number;
};

function SongRow({ file, index, isPlaying, onClick, onContextMenu, menuOpen, motionDelay }: SongRowProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const displayTitle = file.canonicalTitle || file.name;
  const displayAlbum = file.canonicalAlbum || file.album;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: motionDelay }}
      className="group/row flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      {/* Track index / playing indicator */}
      <div
        className="w-7 text-right shrink-0 select-none"
        style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-muted)" }}
      >
        <span className="group-hover/row:hidden text-xs tabular-nums">
          {isPlaying ? "♪" : index + 1}
        </span>
        <span className="hidden group-hover/row:flex justify-end">
          <Play size={12} fill="currentColor" />
        </span>
      </div>

      {/* Album thumbnail — always cover-crop, never letterbox */}
      <div
        className="w-10 h-10 shrink-0 overflow-hidden"
        style={{ borderRadius: "var(--music-card-radius, 10px)" }}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className="w-full h-full"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={14} />
          </div>
        )}
      </div>

      {/* Title + album name */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate leading-snug"
          style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-primary)" }}
        >
          {displayTitle}
        </div>
        {displayAlbum && (
          <div className="text-xs truncate mt-px" style={{ color: "var(--music-text-muted)" }}>
            {displayAlbum}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="text-xs shrink-0 tabular-nums w-10 text-right" style={{ color: "var(--music-text-muted)" }}>
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
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border-0 bg-transparent transition-opacity duration-100 ${menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-60"}`}
          style={{ color: "var(--music-text-muted)" }}
          onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
          aria-label="More options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/>
          </svg>
        </button>
      )}
    </motion.div>
  );
}

// ---- Hero mosaic backdrop --------------------------------------------------

function ArtistHeroMosaic({ covers }: { covers: string[] }) {
  if (covers.length === 0) return null;
  return (
    <div className="absolute inset-0 flex overflow-hidden" aria-hidden>
      {covers.map((c, i) => (
        <div key={i} className="flex-1 min-w-0">
          <img src={convertFileSrc(c)} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
        </div>
      ))}
    </div>
  );
}

// ---- Section header with left accent bar -----------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-[3px] h-4 rounded-full shrink-0" style={{ background: "var(--music-accent)" }} />
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
        {children}
      </h2>
    </div>
  );
}

// ---- Main view -------------------------------------------------------------

type Props = {
  artistKey: string;
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
  onOpenAlbum: (albumKey: string) => void;
  onBack: () => void;
};

export function MusicArtistView({ artistKey, onPlayFile, onOpenAlbum, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);

  const tracks = useMemo(() => {
    const all = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    return all.filter((t) => fileMatchesArtistKey(t, artistKey));
  }, [entries, artistKey]);

  const displayName = useMemo(() => {
    const first = tracks[0];
    if (first) {
      const raw = rawArtistFromFile(first);
      return raw ? primaryArtist(raw) : artistKey;
    }
    return artistKey;
  }, [tracks, artistKey]);

  const albums = useMemo(() => {
    const groups = buildMultiTrackAlbumGroups(tracks, primaryArtist);
    return groups.map((g) => ({
      key: g.albumKey,
      display: g.album,
      cover: bestCoverPath(g.tracks[0]!),
      year: g.tracks.find((t) => t.year)?.year ?? null,
      tracks: g.tracks,
    })).sort((a, b) => {
      if (a.year && b.year) return a.year - b.year;
      if (a.year) return -1;
      if (b.year) return 1;
      return a.display.localeCompare(b.display);
    });
  }, [tracks]);

  // Mosaic: up to 3 distinct album covers.
  const mosaicCovers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of albums) {
      if (!a.cover || seen.has(a.cover)) continue;
      seen.add(a.cover);
      out.push(a.cover);
      if (out.length >= 3) break;
    }
    if (out.length === 0) {
      for (const t of tracks) {
        const c = bestCoverPath(t);
        if (c && !seen.has(c)) { seen.add(c); out.push(c); }
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [albums, tracks]);

  const totalDuration = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);

  // Read sidecar first, fetch/write once on miss, then read.
  useEffect(() => {
    if (!displayName) return;
    let cancelled = false;

    const existing = readArtistInfoInFlight(artistKey, displayName);
    if (existing) {
      existing.then((info) => {
        if (!cancelled) setArtistInfo(info);
      });
      return () => {
        cancelled = true;
      };
    }

    let request: Promise<ArtistInfo | null>;
    request = loadArtistInfoFromSidecar(displayName)
      .catch(() => null)
      .finally(() => {
        unlinkArtistInfoInFlight(artistKey, displayName, request);
      });
    linkArtistInfoInFlight(artistKey, displayName, request);
    request.then((info) => {
      if (!cancelled) setArtistInfo(info);
    });

    return () => {
      cancelled = true;
    };
  }, [artistKey, displayName]);

  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = buildSmartShuffleOrder({
      pool: tracks,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, shuffled);
  };

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-3 shrink-0 text-sm transition-opacity opacity-60 hover:opacity-100"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center justify-center flex-1 text-sm" style={{ color: "var(--music-text-muted)" }}>
          no tracks found for this artist
        </div>
      </div>
    );
  }

  const subtitle = artistInfo?.disambiguation
    ?? (artistInfo?.artistType === "Group" ? "Group" : null);

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar" style={{ background: "var(--music-bg)" }}>

      {/* ---- Hero ---- */}
      <div className="relative shrink-0 overflow-hidden" style={{ height: "228px" }}>
        {mosaicCovers.length > 0 ? (
          <div
            className="absolute inset-0"
            style={{ filter: "blur(9px) brightness(0.28)", transform: "scale(1.06)" }}
          >
            <ArtistHeroMosaic covers={mosaicCovers} />
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #221717 0%, #0e0a0a 100%)" }}
          />
        )}

        {/* Gradient fade from backdrop into surface */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 20%, rgba(14,10,10,0.82) 70%, var(--music-bg) 100%)" }}
        />

        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 z-20 flex items-center gap-1 text-sm transition-opacity opacity-70 hover:opacity-100"
          style={{ color: "var(--music-text-primary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        {/* Artist name + subtitle at hero bottom */}
        <div className="absolute bottom-5 left-5 z-10 pointer-events-none">
          {subtitle && (
            <p
              className="text-xs uppercase tracking-widest mb-1.5 font-medium"
              style={{ color: "var(--music-text-muted)" }}
            >
              {subtitle}
            </p>
          )}
          <h1
            className="font-bold leading-none"
            style={{
              fontSize: "clamp(2rem, 5vw, 2.75rem)",
              color: "var(--music-text-primary)",
              textShadow: "0 2px 16px rgba(0,0,0,0.6)",
            }}
          >
            {displayName}
          </h1>
          <p className="text-xs mt-2" style={{ color: "var(--music-text-muted)" }}>
            {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            {albums.length > 0 && ` · ${albums.length} ${albums.length === 1 ? "album" : "albums"}`}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </p>
        </div>
      </div>

      {/* ---- Controls + artist meta ---- */}
      <div className="flex flex-col gap-3 px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPlayFile(tracks[0], tracks)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "var(--music-accent)", color: "#fff", borderRadius: "12px" }}
          >
            <Play size={14} fill="currentColor" /> Play
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors hover:bg-white/10"
            style={{ border: "1px solid var(--music-border)", color: "var(--music-text-primary)" }}
          >
            <Shuffle size={14} /> Shuffle
          </button>
        </div>

        {/* Genre chips + origin — instant from cache on revisit */}
        {artistInfo && (artistInfo.genres.length > 0 || artistInfo.originCity) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center gap-2"
          >
            {artistInfo.genres.slice(0, 4).map((g) => (
              <span
                key={g}
                className="text-xs px-2.5 py-1 rounded-full capitalize"
                style={{ background: "var(--music-surface-raised)", color: "var(--music-text-secondary)" }}
              >
                {g}
              </span>
            ))}
            {artistInfo.originCity && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--music-text-muted)" }}>
                <MapPin size={11} />
                {artistInfo.originCity}{artistInfo.country ? `, ${artistInfo.country}` : ""}
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* ---- Albums ---- */}
      {albums.length > 0 && (
        <section className="px-5 mb-5 shrink-0">
          <SectionLabel>Albums</SectionLabel>
          <div className="grid grid-cols-2 gap-3 pb-1 md:grid-cols-3 xl:grid-cols-4">
            {albums.map((a) => (
              <AlbumCard
                key={a.key}
                album={a.display}
                cover={a.cover}
                trackCount={a.tracks.length}
                year={a.year}
                onClick={() => onOpenAlbum(a.key)}
                onContextMenu={(e) => setMenu({
                  context: { kind: "album", artistKey, albumKey: a.key, displayName: a.display, artistName: displayName },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: a.tracks.length > 0 ? () => onPlayFile(a.tracks[0], a.tracks) : undefined,
                })}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Songs ---- */}
      <section className="px-1 pb-6">
        <div className="px-4 mb-2">
          <SectionLabel>Songs</SectionLabel>
        </div>
        {tracks.map((file, i) => (
          <SongRow
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
            motionDelay={Math.min(i * 0.035, 0.4)}
          />
        ))}
      </section>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
