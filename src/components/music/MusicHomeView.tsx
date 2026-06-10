import { useMemo, useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, Search, X, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath, hasSquareCover } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { readFurthestPlaybackSec } from "@/playbackStorage";
import type { MediaFile } from "@/types";
import { MusicHomeSkeleton } from "./MusicHomeSkeleton";
import {
  dedupeMusicTracks,
  diversifyTracksByArtist,
  musicTrackIdentityKey,
  normalizeAlbumShelfKey,
} from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicHomeSearchEmpty } from "./MusicHomeSearchEmpty";
import { MusicHomeStatsStrip } from "./MusicHomeStatsStrip";
import { resolveLikedFiles } from "./musicLikedTracks";
import { LikedSongsCard } from "./LikedSongsCover";

type MusicHomeViewProps = {
  onPlayFile: (file: MediaFile, playlist?: MediaFile[]) => void;
  onOpenArtist: (artistKey: string) => void;
  onOpenAlbum: (artistKey: string, albumKey: string) => void;
  onSearchYoutubeMusic?: (query: string) => void;
};

/** Seeded shuffle: stable for the session based on a random seed frozen on first render. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type TrackCardProps = {
  file: MediaFile;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
};

/** Quick picks: neutral rows, uniform subtle gradient (not per-track color coding). */
function QuickPickRow({ file, onClick, onContextMenu, menuOpen }: TrackCardProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = file.artist ?? file.albumArtist ?? (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "Unknown Artist");

  return (
    <div
      className="group/row relative flex items-center gap-4 rounded-lg px-3 py-2.5 w-full min-h-[4.5rem] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99] cursor-pointer"
      style={{
        background: "linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.02) 100%)",
        color: "var(--music-text-primary)",
      }}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
    >
      <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-stone-950 transition-transform duration-200 group-hover/row:scale-[1.03]">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className="w-full h-full"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/50">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-200">
          <Play size={18} className="text-white fill-white" />
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1 pr-1">
        <div className="text-[15px] font-bold truncate leading-tight" style={{ color: "var(--music-text-primary)" }}>
          {file.name}
        </div>
        <div className="text-sm font-medium truncate leading-snug" style={{ color: "var(--music-text-secondary)" }}>
          {artist}
        </div>
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

type MusicCardProps = {
  title: string;
  subtitle: string;
  cover: string | null;
  isSquare: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

/** 
 * Beautiful vertical card for Albums / Tracks horizontal scroll shelves.
 * Simulates a physical vinyl record sliding out of the cover sleeve and spinning on hover.
 */
function MusicCard({ title, subtitle, cover, onClick, onContextMenu }: MusicCardProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="flex flex-col gap-3 text-left group/card shrink-0 w-36 md:w-40 transition-all duration-300 relative hover:z-25"
    >
      <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0 z-10">
        <div className="absolute top-0.5 bottom-0.5 right-0.5 aspect-square rounded-full bg-neutral-950 border border-neutral-800 transition-all duration-500 ease-out translate-x-0 group-hover/card:translate-x-6 group-hover/card:rotate-[180deg] z-0 flex items-center justify-center">
          <div className="absolute inset-2 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-4 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-6 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-8 rounded-full border border-neutral-900/60" />
          <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-900 border border-neutral-850 flex items-center justify-center relative">
            {coverSrc ? (
              <img src={coverSrc} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-neutral-800" />
            )}
            <div className="absolute w-2.5 h-2.5 rounded-full bg-black border border-stone-900 z-10" />
          </div>
        </div>

        <div className="relative z-10 w-full h-full rounded-xl overflow-hidden bg-stone-950 border border-white/5 transition-all duration-300 ease-out group-hover/card:-translate-x-2 group-hover/card:scale-[0.97] group-hover/card:rotate-[-2deg]">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="w-full h-full"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--music-text-muted)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.35 }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 z-20">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "var(--music-accent)" }}
            >
              <Play size={18} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-0.5 min-w-0 flex flex-col gap-0.5 z-20 relative">
        <div className="text-sm font-bold truncate leading-tight group-hover/card:text-[var(--music-accent)] transition-colors" style={{ color: "var(--music-text-primary)" }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs truncate leading-snug" style={{ color: "var(--music-text-secondary)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}

type ArtistPillProps = {
  artist: string;
  trackCount: number;
  cover: string | null;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

/** Circular artist avatars — profile-style, subtle hover only. */
function ArtistPill({ artist, trackCount, cover, onClick, onContextMenu }: ArtistPillProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="flex flex-col items-center gap-3 p-1.5 rounded-xl text-center shrink-0 w-24 md:w-28 group/artist"
    >
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full shrink-0 transition-transform duration-200 group-hover/artist:scale-105">
        <div className="relative w-full h-full rounded-full overflow-hidden shadow bg-transparent border border-white/10">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl font-bold select-none bg-[rgba(255,255,255,0.04)]"
              style={{ color: "var(--music-text-secondary)" }}
            >
              {artist.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover/artist:opacity-100 transition-opacity duration-200">
            <Play size={16} className="text-white fill-white" />
          </div>
        </div>
      </div>
      <div className="min-w-0 w-full flex flex-col gap-0.5">
        <div className="text-xs font-bold truncate transition-colors group-hover/artist:text-white" style={{ color: "var(--music-text-primary)" }}>
          {artist}
        </div>
        <div className="text-[10px]" style={{ color: "var(--music-text-muted)" }}>
          {trackCount} song{trackCount !== 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

interface ScrollShelfProps {
  title: string;
  children: React.ReactNode;
}

/** Premium horizontal scroll shelf with YTM-style paginating navigation arrows that dynamically calculate layout scroll boundaries */
function ScrollShelf({ title, children }: ScrollShelfProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = () => {
    const el = containerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
      setHasOverflow(el.scrollWidth > el.clientWidth);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      updateScrollState();
      el.addEventListener("scroll", updateScrollState, { passive: true });
      window.addEventListener("resize", updateScrollState);

      const observer = new MutationObserver(updateScrollState);
      observer.observe(el, { childList: true, subtree: true });

      return () => {
        el.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
        observer.disconnect();
      };
    }
  }, [children]);

  const scroll = (direction: "left" | "right") => {
    if (containerRef.current) {
      const amt = direction === "left" ? -450 : 450;
      containerRef.current.scrollBy({ left: amt, behavior: "smooth" });
    }
  };

  return (
    <section className="relative w-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {hasOverflow && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              style={{
                borderColor: canScrollLeft ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.05)",
                background: canScrollLeft ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: canScrollLeft ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)",
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              style={{
                borderColor: canScrollRight ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.05)",
                background: canScrollRight ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: canScrollRight ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)",
              }}
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="flex gap-5 overflow-x-auto pb-1 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </section>
  );
}

export function MusicHomeView({
  onPlayFile,
  onOpenArtist,
  onOpenAlbum,
  onSearchYoutubeMusic,
}: MusicHomeViewProps) {
  const entries = useRuforgeStore((s) => s.entries);
  const galleryLoading = useRuforgeStore((s) => s.galleryLoading);
  const openMusicStats = useRuforgeStore((s) => s.openMusicStats);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const sessionSeedRef = useRef(Math.floor(Math.random() * 0xffffffff));

  const [activeFilter, setActiveFilter] = useState<"all" | "relax" | "focus">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const tracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  // Filter & search tracks in real-time
  const filteredTracks = useMemo(() => {
    let result = tracks;

    // 1. Filter by category chip
    if (activeFilter !== "all") {
      result = result.filter((t) => {
        const name = t.name.toLowerCase();
        const artist = (t.artist ?? t.albumArtist ?? "").toLowerCase();
        const album = (t.album ?? "").toLowerCase();
        
        if (activeFilter === "relax") {
          const relaxWords = ["lofi", "chill", "sleep", "relax", "dream", "ambient", "simple", "calm", "soft"];
          return relaxWords.some(w => name.includes(w) || artist.includes(w) || album.includes(w));
        }
        if (activeFilter === "focus") {
          const focusWords = ["jazz", "ambience", "study", "work", "beats", "homework", "coffee shop", "focus", "piano", "instrumental"];
          return focusWords.some(w => name.includes(w) || artist.includes(w) || album.includes(w));
        }
        return true;
      });
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => {
        const name = t.name.toLowerCase();
        const artist = (t.artist ?? t.albumArtist ?? "").toLowerCase();
        const album = (t.album ?? "").toLowerCase();
        return name.includes(q) || artist.includes(q) || album.includes(q);
      });
    }

    return result;
  }, [tracks, activeFilter, searchQuery]);

  // Recently added: group by album (one card per album), fall back to loose tracks.
  // This prevents a downloaded playlist from flooding the shelf with individual tracks.
  const recentlyAdded = useMemo(() => {
    type RecentItem =
      | { kind: "album"; albumKey: string; artistKey: string; album: string; artist: string; cover: string | null; isSquare: boolean; newestDate: number; tracks: MediaFile[] }
      | { kind: "track"; file: MediaFile };

    const albumMap = new Map<string, Extract<RecentItem, { kind: "album" }>>();
    const looseTracks: MediaFile[] = [];
    const seenLoose = new Set<string>();

    for (const t of filteredTracks) {
      const tAlbum = (t.canonicalAlbum ?? t.album)?.trim();
      if (tAlbum) {
        const artistRaw = t.canonicalArtist?.trim() || t.albumArtist || t.artist || "";
        const albumKey = normalizeAlbumShelfKey(tAlbum);
        const key = `${primaryArtist(artistRaw).toLowerCase()}::${albumKey}`;
        if (!albumMap.has(key)) {
          albumMap.set(key, {
            kind: "album",
            albumKey,
            artistKey: primaryArtist(artistRaw).toLowerCase(),
            album: tAlbum,
            artist: primaryArtist(artistRaw) || artistRaw,
            cover: bestCoverPath(t),
            isSquare: hasSquareCover(t),
            newestDate: t.created,
            tracks: [],
          });
        }
        const entry = albumMap.get(key)!;
        entry.tracks.push(t);
        if (t.created > entry.newestDate) {
          entry.newestDate = t.created;
          const c = bestCoverPath(t);
          if (c) entry.cover = c;
        }
      } else {
        const looseKey = musicTrackIdentityKey(t, primaryArtist);
        if (seenLoose.has(looseKey)) continue;
        seenLoose.add(looseKey);
        looseTracks.push(t);
      }
    }

    const sortedAlbums = [...albumMap.values()].sort((a, b) => b.newestDate - a.newestDate);
    const sortedLoose = looseTracks.sort((a, b) => b.created - a.created);

    const items: RecentItem[] = [];
    for (const a of sortedAlbums) items.push(a);
    for (const t of sortedLoose) items.push({ kind: "track", file: t });

    const artistKeyFor = (item: RecentItem): string =>
      item.kind === "album"
        ? item.artistKey
        : primaryArtist(item.file.artist ?? item.file.albumArtist ?? "").toLowerCase();

    const counts = new Map<string, number>();
    const picked: RecentItem[] = [];
    const pickedKeys = new Set<string>();

    for (const item of items) {
      if (picked.length >= 12) break;
      const ak = artistKeyFor(item);
      const n = counts.get(ak) ?? 0;
      if (n >= 2) continue;
      counts.set(ak, n + 1);
      picked.push(item);
      pickedKeys.add(item.kind === "album" ? `album:${item.artistKey}::${item.albumKey}` : item.file.path);
    }

    if (picked.length < 12) {
      for (const item of items) {
        if (picked.length >= 12) break;
        const id = item.kind === "album" ? `album:${item.artistKey}::${item.albumKey}` : item.file.path;
        if (pickedKeys.has(id)) continue;
        picked.push(item);
        pickedKeys.add(id);
      }
    }

    return picked;
  }, [filteredTracks]);

  const likedTracks = useMemo(
    () => resolveLikedFiles(filteredTracks),
    [filteredTracks, musicLikedKeys],
  );

  // Quick picks: most-listened first, then seeded shuffle fallback.
  const quickPicks = useMemo(() => {
    const withHistory = filteredTracks
      .map((t) => ({
        file: t,
        secs: readFurthestPlaybackSec(t.path),
      }))
      .filter((x) => x.secs > 30)
      .sort((a, b) => b.secs - a.secs)
      .map((x) => x.file);

    const pool =
      withHistory.length >= 6
        ? withHistory
        : (() => {
            const playedPaths = new Set(withHistory.map((f) => f.path));
            const rest = seededShuffle(
              filteredTracks.filter((f) => !playedPaths.has(f.path)),
              sessionSeedRef.current,
            );
            return [...withHistory, ...rest];
          })();

    return diversifyTracksByArtist(
      dedupeMusicTracks(pool, primaryArtist),
      2,
      12,
      primaryArtist,
    );
  }, [filteredTracks]);

  // Quick picks columns: split 12 items into 3 columns (up to 4 rows per column)
  const quickPicksColumns = useMemo(() => {
    const cols = [];
    const size = 4;
    for (let i = 0; i < quickPicks.length; i += size) {
      cols.push(quickPicks.slice(i, i + size));
    }
    return cols;
  }, [quickPicks]);

  // Rediscover: random older items (bottom half by created date), different seed.
  const rediscover = useMemo(() => {
    const unique = dedupeMusicTracks(filteredTracks, primaryArtist);
    if (unique.length < 6) return [];
    const sorted = [...unique].sort((a, b) => a.created - b.created);
    const older = sorted.slice(0, Math.ceil(sorted.length / 2));
    const shuffled = seededShuffle(older, sessionSeedRef.current ^ 0xdeadbeef);
    return diversifyTracksByArtist(shuffled, 1, 12, primaryArtist);
  }, [filteredTracks]);

  // Albums: dedup by (primaryArtistKey + albumKey). Display artist is the primary artist only.
  const albums = useMemo(() => {
    const seen = new Map<string, { albumKey: string; artistKey: string; album: string; artist: string; cover: string | null; isSquare: boolean; tracks: MediaFile[] }>();
    for (const t of filteredTracks) {
      const albumName = (t.canonicalAlbum ?? t.album)?.trim() ?? "";
      if (!albumName) continue;
      const artistRaw = t.canonicalArtist?.trim() || t.albumArtist || t.artist || "";
      const primary = primaryArtist(artistRaw);
      const albumKey = normalizeAlbumShelfKey(albumName);
      const key = `${primary.toLowerCase()}::${albumKey}`;
      if (!seen.has(key)) {
        seen.set(key, {
          albumKey,
          artistKey: primary.toLowerCase(),
          album: albumName,
          artist: primary || artistRaw,
          cover: bestCoverPath(t),
          isSquare: hasSquareCover(t),
          tracks: [],
        });
      }
      seen.get(key)!.tracks.push(t);
    }
    return [...seen.values()].slice(0, 12);
  }, [filteredTracks]);

  // Artists: group by PRIMARY artist only so "Juice WRLD, Trippie Redd" and
  // "Juice WRLD" both map to "Juice WRLD" rather than creating separate entries.
  const artists = useMemo(() => {
    const map = new Map<string, { key: string; display: string; trackCount: number; cover: string | null }>();
    for (const t of filteredTracks) {
      const raw = t.artist ?? t.albumArtist ?? "";
      if (!raw) continue;
      const primary = primaryArtist(raw);
      const key = primary.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, display: primary, trackCount: 0, cover: bestCoverPath(t) });
      }
      map.get(key)!.trackCount++;
    }
    return [...map.values()].sort((a, b) => b.trackCount - a.trackCount).slice(0, 12);
  }, [filteredTracks]);

  if (galleryLoading && tracks.length === 0) {
    return <MusicHomeSkeleton />;
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--music-text-muted)" }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <div className="text-center">
          <p className="text-base font-medium mb-1" style={{ color: "var(--music-text-secondary)" }}>No music in your library</p>
          <p className="text-sm">Use the Explore tab to download music, or add a folder in Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full overflow-y-auto overflow-x-hidden rf-scrollbar min-h-0"
      style={{ scrollbarColor: "var(--music-border) transparent", background: "var(--music-surface)" }}
    >
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 pl-8 pr-8 bg-transparent min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          {(["all", "relax", "focus"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className="px-4.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border border-transparent"
              style={{
                background: activeFilter === filter ? "var(--music-text-primary)" : "rgba(255, 255, 255, 0.08)",
                color: activeFilter === filter ? "var(--music-bg)" : "var(--music-text-secondary)",
              }}
              onMouseEnter={(e) => {
                if (activeFilter !== filter) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
                  e.currentTarget.style.color = "var(--music-text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeFilter !== filter) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.color = "var(--music-text-secondary)";
                }
              }}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex justify-center px-2">
          <div
            className="relative w-full max-w-md rounded-full overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs, albums, artists"
              className="w-full pl-10 pr-9 py-2 text-xs md:text-sm rounded-full outline-none border-0 bg-transparent placeholder:text-white/50"
              style={{ color: "var(--music-text-primary)" }}
            />
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              size={15}
              style={{ color: "var(--music-text-secondary)" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--music-text-secondary)] hover:text-white transition-colors flex items-center justify-center"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

      </header>

      {filteredTracks.length === 0 ? (
          <MusicHomeSearchEmpty
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            onClear={() => {
              setActiveFilter("all");
              setSearchQuery("");
            }}
            onSearchYoutubeMusic={onSearchYoutubeMusic}
          />
        ) : (
          <div className="flex flex-col gap-12 pl-12 pr-12 pt-8 pb-16 max-w-[1300px] mx-auto w-full">
            {activeFilter === "all" && !searchQuery && (
              <MusicHomeStatsStrip onSeeAll={openMusicStats} />
            )}

            {/* Quick picks — most listened or suggested */}
            {quickPicks.length > 0 && (
              <section>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
                    Quick picks
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                  {quickPicksColumns.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-3">
                      {col.map((file) => (
                        <QuickPickRow
                          key={file.path}
                          file={file}
                          onClick={() => onPlayFile(file, quickPicks)}
                          menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                          onContextMenu={(e) => setMenu({
                            context: { kind: "song", file },
                            x: e.clientX,
                            y: e.clientY,
                            onPlay: () => onPlayFile(file, quickPicks),
                          })}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <AnimatePresence initial={false}>
              {likedTracks.length > 0 && activeFilter === "all" && !searchQuery && (
                <motion.section
                  key="home-liked-songs"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-end justify-between mb-4 gap-4">
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
                      Liked Songs
                    </h2>
                    <button
                      type="button"
                      onClick={openMusicLiked}
                      className="text-xs font-medium shrink-0 hover:underline"
                      style={{ color: "var(--music-text-secondary)" }}
                    >
                      See all
                    </button>
                  </div>
                  <LikedSongsCard files={likedTracks} onClick={openMusicLiked} />
                </motion.section>
              )}
            </AnimatePresence>

            {/* Artists circular scroll shelf */}
            {artists.length > 0 && (
              <ScrollShelf title="Artists">
                {artists.map((a) => (
                  <ArtistPill
                    key={a.key}
                    artist={a.display}
                    trackCount={a.trackCount}
                    cover={a.cover}
                    onClick={() => onOpenArtist(a.key)}
                    onContextMenu={(e) => {
                      const artistTracks = filteredTracks.filter(
                        (t) => primaryArtist(t.artist ?? t.albumArtist ?? "").toLowerCase() === a.key,
                      );
                      setMenu({
                        context: { kind: "artist", artistKey: a.key, displayName: a.display },
                        x: e.clientX,
                        y: e.clientY,
                        onPlay: artistTracks.length > 0 ? () => onPlayFile(artistTracks[0], artistTracks) : undefined,
                      });
                    }}
                  />
                ))}
              </ScrollShelf>
            )}

            {/* Albums horizontal pageable scroll shelf */}
            {albums.length > 0 && (
              <ScrollShelf title="Albums">
                {albums.map((a) => (
                  <MusicCard
                    key={`${a.artistKey}::${a.albumKey}`}
                    title={a.album}
                    subtitle={a.artist}
                    cover={a.cover}
                    isSquare={a.isSquare}
                    onClick={() => onOpenAlbum(a.artistKey, a.albumKey)}
                    onContextMenu={(e) => setMenu({
                      context: { kind: "album", artistKey: a.artistKey, albumKey: a.albumKey, displayName: a.album, artistName: a.artist },
                      x: e.clientX,
                      y: e.clientY,
                      onPlay: a.tracks.length > 0 ? () => onPlayFile(a.tracks[0], a.tracks) : undefined,
                    })}
                  />
                ))}
              </ScrollShelf>
            )}

            {/* Recently added: albums grouped (one card per album), loose tracks as fallback */}
            {recentlyAdded.length > 0 && (
              <ScrollShelf title="Recently added">
                {recentlyAdded.map((item) => {
                  if (item.kind === "album") {
                    return (
                      <MusicCard
                        key={`${item.artistKey}::${item.albumKey}`}
                        title={item.album}
                        subtitle={item.artist}
                        cover={item.cover}
                        isSquare={item.isSquare}
                        onClick={() => onOpenAlbum(item.artistKey, item.albumKey)}
                        onContextMenu={(e) => setMenu({
                          context: { kind: "album", artistKey: item.artistKey, albumKey: item.albumKey, displayName: item.album, artistName: item.artist },
                          x: e.clientX,
                          y: e.clientY,
                          onPlay: item.tracks.length > 0 ? () => onPlayFile(item.tracks[0], item.tracks) : undefined,
                        })}
                      />
                    );
                  }
                  const { file } = item;
                  const artist = file.artist ?? file.albumArtist ?? (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "Unknown Artist");
                  return (
                    <MusicCard
                      key={file.path}
                      title={file.name}
                      subtitle={artist}
                      cover={bestCoverPath(file)}
                      isSquare={hasSquareCover(file)}
                      onClick={() => onPlayFile(file, [file])}
                      onContextMenu={(e) => setMenu({
                        context: { kind: "song", file },
                        x: e.clientX,
                        y: e.clientY,
                        onPlay: () => onPlayFile(file, [file]),
                      })}
                    />
                  );
                })}
              </ScrollShelf>
            )}

            {/* Rediscover horizontal pageable scroll shelf */}
            {rediscover.length > 0 && (
              <ScrollShelf title="Rediscover">
                {rediscover.map((file) => {
                  const artist = file.artist ?? file.albumArtist ?? (file.name.includes(" - ") ? file.name.split(" - ")[0].trim() : "Unknown Artist");
                  return (
                    <MusicCard
                      key={file.path}
                      title={file.name}
                      subtitle={artist}
                      cover={bestCoverPath(file)}
                      isSquare={hasSquareCover(file)}
                      onClick={() => onPlayFile(file, rediscover)}
                      onContextMenu={(e) => setMenu({
                        context: { kind: "song", file },
                        x: e.clientX,
                        y: e.clientY,
                        onPlay: () => onPlayFile(file, rediscover),
                      })}
                    />
                  );
                })}
              </ScrollShelf>
            )}
          </div>
        )}
      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
