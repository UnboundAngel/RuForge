import { useMemo, useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Shuffle, Play, ChevronLeft, MapPin, Music2, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { fileMatchesArtistKey, primaryArtist, rawArtistFromFile } from "./musicArtist";
import { buildMultiTrackAlbumGroups, resolveDisplayAlbum } from "./musicShelfDedup";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { MusicLikeButton } from "./MusicLikeButton";
import { MusicTrackIndexPlay } from "./MusicTrackIndexPlay";
import {
  ensureArtistMetaSidecar,
  readArtistMetaSidecar,
  type ArtistInfo,
} from "@/lib/musicMeta";
import {
  buildCoverAmbienceTheme,
  extractCoverBackdropFromPath,
  type CoverAmbienceTheme,
} from "@/prominentColor";

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
  coverFallback?: string | null;
  trackCount: number;
  year?: number | null;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

function AlbumCard({ album, cover, coverFallback = null, trackCount, year, onClick, onContextMenu }: AlbumCardProps) {
  const [coverSrc, setCoverSrc] = useState<string | null>(() => (cover ? convertFileSrc(cover) : null));

  useEffect(() => {
    setCoverSrc(cover ? convertFileSrc(cover) : null);
  }, [cover]);

  const handleCoverError = () => {
    if (coverFallback) {
      setCoverSrc(convertFileSrc(coverFallback));
    } else {
      setCoverSrc(null);
    }
  };
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
            onError={handleCoverError}
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
  rowHoverBg: string;
};

function SongRow({ file, index, isPlaying, onClick, onContextMenu, menuOpen, motionDelay, rowHoverBg }: SongRowProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const displayTitle = file.canonicalTitle || file.name;
  const displayAlbum = resolveDisplayAlbum(file);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: motionDelay }}
      className="group/row flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer"
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = rowHoverBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      <MusicTrackIndexPlay
        indexLabel={index + 1}
        isPlaying={isPlaying}
        iconSize={12}
        className="h-7 w-7"
        labelClassName="text-xs"
      />

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

function pickHeroCover(
  albums: { cover: string | null; coverFallback?: string | null; year?: number | null }[],
  tracks: MediaFile[],
): { primary: string | null; fallback: string | null } {
  const sorted = [...albums].sort((a, b) => {
    if (a.year && b.year) return b.year - a.year;
    if (a.year) return -1;
    if (b.year) return 1;
    return 0;
  });
  for (const album of sorted) {
    if (album.cover || album.coverFallback) {
      return {
        primary: album.cover,
        fallback: album.coverFallback ?? null,
      };
    }
  }
  for (const track of tracks) {
    const cover = bestCoverPath(track);
    if (cover) return { primary: cover, fallback: null };
  }
  return { primary: null, fallback: null };
}

// ---- Section header with left accent bar -----------------------------------

function SectionLabel({ children, mutedColor }: { children: React.ReactNode; mutedColor: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-[3px] h-4 rounded-full shrink-0" style={{ background: "var(--music-accent)" }} />
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: mutedColor }}>
        {children}
      </h2>
    </div>
  );
}

// ---- Main view -------------------------------------------------------------

type Props = {
  artistKey: string;
  onPlayFile: (file: MediaFile, playlist: MediaFile[], source: MusicQueueSource) => void;
  onOpenAlbum: (albumKey: string) => void;
  onBack: () => void;
};

export function MusicArtistView({ artistKey, onPlayFile, onOpenAlbum, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [ambience, setAmbience] = useState<CoverAmbienceTheme>(() => buildCoverAmbienceTheme(null));

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
    return groups.map((g) => {
      const paths = albumCoverPathWithFallback(g.tracks[0]!);
      return {
        key: g.albumKey,
        display: g.album,
        cover: paths.primary,
        coverFallback: paths.fallback,
        year: g.tracks.find((t) => t.year)?.year ?? null,
        tracks: g.tracks,
      };
    }).sort((a, b) => {
      if (a.year && b.year) return a.year - b.year;
      if (a.year) return -1;
      if (b.year) return 1;
      return a.display.localeCompare(b.display);
    });
  }, [tracks]);

  const heroPaths = useMemo(() => pickHeroCover(albums, tracks), [albums, tracks]);
  const [heroCoverSrc, setHeroCoverSrc] = useState<string | null>(null);
  const [heroAmbiencePath, setHeroAmbiencePath] = useState<string | null>(null);

  useEffect(() => {
    const path = heroPaths.primary ?? heroPaths.fallback;
    setHeroCoverSrc(path ? convertFileSrc(path) : null);
    setHeroAmbiencePath(path);
  }, [heroPaths.primary, heroPaths.fallback]);

  const handleHeroCoverError = () => {
    if (heroPaths.fallback && heroAmbiencePath === heroPaths.primary) {
      setHeroCoverSrc(convertFileSrc(heroPaths.fallback));
      setHeroAmbiencePath(heroPaths.fallback);
      return;
    }
    setHeroCoverSrc(null);
    setHeroAmbiencePath(null);
  };

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

  useEffect(() => {
    if (!heroAmbiencePath) {
      setAmbience(buildCoverAmbienceTheme(null));
      return;
    }
    let cancelled = false;
    void extractCoverBackdropFromPath(heroAmbiencePath).then((hex) => {
      if (!cancelled) setAmbience(buildCoverAmbienceTheme(hex));
    });
    return () => {
      cancelled = true;
    };
  }, [heroAmbiencePath]);

  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const artistSource = musicQueueSource("artist", displayName);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = buildSmartShuffleOrder({
      pool: tracks,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, shuffled, artistSource);
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

  const statsLine = [
    `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`,
    albums.length > 0 ? `${albums.length} ${albums.length === 1 ? "album" : "albums"}` : null,
    totalDuration > 0 ? formatDuration(totalDuration) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-y-auto rf-scrollbar"
      style={{ backgroundColor: ambience.canvasColor }}
    >
      <header
        className="relative w-full shrink-0 overflow-hidden"
        style={{ minHeight: 320, backgroundColor: ambience.canvasColor }}
      >
        {heroCoverSrc && (
          <div
            className="absolute inset-0 origin-center"
            style={{
              backgroundImage: `url(${heroCoverSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transform: "scale(1.12)",
            }}
            aria-hidden
          />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: ambience.headerScrim }}
        />

        <button
          type="button"
          onClick={onBack}
          className="absolute top-4 left-6 z-20 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-opacity opacity-90 hover:opacity-100"
          style={{ color: "#fff", background: "rgba(0, 0, 0, 0.42)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div className="relative z-10 flex min-h-[320px] items-end gap-6 px-8 pb-6 pt-16">
          {heroCoverSrc ? (
            <img
              src={heroCoverSrc}
              alt=""
              onError={handleHeroCoverError}
              className="h-44 w-44 shrink-0"
              style={{
                borderRadius: "var(--music-card-radius, 14px)",
                objectFit: "cover",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
              }}
            />
          ) : (
            <div
              className="flex h-44 w-44 shrink-0 items-center justify-center"
              style={{
                borderRadius: "var(--music-card-radius, 14px)",
                background: ambience.chipBg,
                color: ambience.onCanvasMuted,
              }}
            >
              <Disc3 size={48} />
            </div>
          )}

          <div className="min-w-0 flex-1 pb-1">
            {subtitle && (
              <p
                className="mb-1 text-xs font-medium uppercase tracking-widest"
                style={{ color: ambience.onCanvasMuted }}
              >
                {subtitle}
              </p>
            )}
            <h1
              className="font-bold leading-[1.05] tracking-tight"
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                color: ambience.onCanvasPrimary,
              }}
            >
              {displayName}
            </h1>
            <p className="mt-1.5 text-sm tabular-nums" style={{ color: ambience.onCanvasMuted }}>
              {statsLine}
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-10 shrink-0 px-8 pb-5 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onPlayFile(tracks[0], tracks, artistSource)}
            className="flex items-center gap-2 px-7 py-2.5 text-sm font-semibold transition-opacity hover:opacity-88"
            style={{
              background: ambience.onCanvasPrimary,
              color: ambience.canvasColor,
              borderRadius: "999px",
            }}
          >
            <Play size={15} fill="currentColor" /> Play
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-90"
            style={{ color: ambience.onCanvasPrimary, background: ambience.chipBg }}
            aria-label="Shuffle"
          >
            <Shuffle size={16} />
          </button>
        </div>

        {artistInfo && (artistInfo.genres.length > 0 || artistInfo.originCity) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            {artistInfo.genres.slice(0, 4).map((g) => (
              <span
                key={g}
                className="rounded-full px-2.5 py-1 text-xs capitalize"
                style={{ background: ambience.chipBg, color: ambience.onCanvasMuted }}
              >
                {g}
              </span>
            ))}
            {artistInfo.originCity && (
              <span className="flex items-center gap-1 text-xs" style={{ color: ambience.onCanvasMuted }}>
                <MapPin size={11} />
                {artistInfo.originCity}{artistInfo.country ? `, ${artistInfo.country}` : ""}
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* ---- Albums ---- */}
      {albums.length > 0 && (
        <section className="relative z-10 mb-8 w-full shrink-0 px-8">
          <SectionLabel mutedColor={ambience.onCanvasMuted}>Albums</SectionLabel>
          <div className="grid grid-cols-2 gap-3 pb-1 md:grid-cols-3 xl:grid-cols-4">
            {albums.map((a) => (
              <AlbumCard
                key={a.key}
                album={a.display}
                cover={a.cover}
                coverFallback={a.coverFallback}
                trackCount={a.tracks.length}
                year={a.year}
                onClick={() => onOpenAlbum(a.key)}
                onContextMenu={(e) => setMenu({
                  context: { kind: "album", artistKey, albumKey: a.key, displayName: a.display, artistName: displayName },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: a.tracks.length > 0
                    ? () => onPlayFile(a.tracks[0], a.tracks, musicQueueSource("album", a.display))
                    : undefined,
                })}
              />
            ))}
          </div>
        </section>
      )}

      <section className="relative z-10 mb-10 w-full px-6 pb-6">
        <div className="px-3 mb-2">
          <SectionLabel mutedColor={ambience.onCanvasMuted}>Songs</SectionLabel>
        </div>
        {tracks.map((file, i) => (
          <SongRow
            key={file.path}
            file={file}
            index={i}
            isPlaying={playingFile?.path === file.path}
            onClick={() => onPlayFile(file, tracks, artistSource)}
              menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
              onContextMenu={(e) => setMenu({
                context: { kind: "song", file },
                x: e.clientX,
                y: e.clientY,
                onPlay: () => onPlayFile(file, tracks, artistSource),
              })}
            motionDelay={Math.min(i * 0.035, 0.4)}
            rowHoverBg={ambience.rowHoverBg}
          />
        ))}
      </section>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
