import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Disc3, Heart, Music2, Play } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { openExplorerForLogin } from "@/lib/openExplorerForLogin";
import { sanitizeYoutubeAvatarUrl } from "@/lib/youtubeAvatarUrl";
import {
  formatYoutubeHandleLabel,
  youtubeProfileHoverLabel,
} from "@/lib/youtubeProfileSession";
import { fileMatchesArtistKey, primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { LikedSongsCover } from "./LikedSongsCover";
import { resolveLikedFiles } from "./musicLikedTracks";
import { getRecentHistory, type PlayHistoryEntry } from "./musicPlayHistory";
import {
  SEVEN_DAYS_MS,
  formatListenDuration,
  getStatsSince,
  getTopArtists,
  getTopTracks,
  getTotalListenTimeSec,
  getTotalPlayCount,
  type ListenStat,
  type TopArtistStat,
} from "./musicListenStats";
import { musicQueueSource } from "./musicQueueSource";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-lg font-bold tracking-tight mb-4"
      style={{ color: "var(--music-text-primary)" }}
    >
      {children}
    </h2>
  );
}

function formatRelativePlayed(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type MediaLookup = {
  byPath: Map<string, MediaFile>;
  byIdentity: Map<string, MediaFile>;
  audioFiles: MediaFile[];
};

function useProfileMediaLookup(): MediaLookup {
  const entries = useRuforgeStore((s) => s.entries);
  return useMemo(() => {
    const audioFiles = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    const byPath = new Map<string, MediaFile>();
    const byIdentity = new Map<string, MediaFile>();
    for (const f of audioFiles) {
      byPath.set(f.path, f);
      byIdentity.set(musicTrackIdentityKey(f, primaryArtist), f);
    }
    return { byPath, byIdentity, audioFiles };
  }, [entries]);
}

function resolveStatFile(row: ListenStat | PlayHistoryEntry, lookup: MediaLookup): MediaFile | undefined {
  return lookup.byPath.get(row.path) ?? lookup.byIdentity.get(row.identityKey);
}

function coverForPath(path: string | null, lookup: MediaLookup): string | null {
  if (!path) return null;
  const file = lookup.byPath.get(path);
  return file ? bestCoverPath(file) : null;
}

type GlanceStatProps = {
  label: string;
  value: string;
  hint?: string;
  labelTone?: string;
  onClick?: () => void;
};

function GlanceStat({ label, value, hint, labelTone, onClick }: GlanceStatProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2.5 px-3 py-5 sm:px-4 sm:py-6 min-w-0 w-full",
        onClick && "transition-colors hover:bg-white/[0.04] cursor-pointer",
      )}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-[0.14em] leading-none"
        style={{ color: labelTone ?? "var(--music-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-2xl sm:text-[1.75rem] font-bold tabular-nums tracking-tight leading-none"
        style={{ color: "var(--music-text-primary)" }}
      >
        {value}
      </span>
      <span
        className="text-xs leading-snug min-h-[1rem] max-w-[10rem]"
        style={{ color: "var(--music-text-muted)" }}
      >
        {hint ?? "\u00a0"}
      </span>
    </Tag>
  );
}

function HorizontalScrollHint({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);

  return (
    <div className="relative">
      <div ref={scrollRef} className="flex gap-5 sm:gap-6 overflow-x-auto pb-2 rf-scrollbar">
        {children}
      </div>
      {overflows && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-14"
            style={{ background: "linear-gradient(to left, var(--music-bg), transparent)" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pr-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--music-text-muted)" }}
            aria-hidden
          >
            <span>More</span>
            <ChevronRight size={14} />
          </div>
        </>
      )}
    </div>
  );
}

type SpotlightTrackProps = {
  row: ListenStat;
  lookup: MediaLookup;
  onPlay: (file: MediaFile) => void;
  onContextMenu?: (e: React.MouseEvent, file: MediaFile) => void;
  menuOpen?: boolean;
};

function SpotlightTrack({ row, lookup, onPlay, onContextMenu, menuOpen }: SpotlightTrackProps) {
  const file = resolveStatFile(row, lookup);
  const cover = file ? bestCoverPath(file) : null;
  const coverSrc = cover ? convertFileSrc(cover) : null;

  return (
    <button
      type="button"
      disabled={!file}
      onClick={() => file && onPlay(file)}
      onContextMenu={(e) => {
        if (!file || !onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, file);
      }}
      className={cn(
        "group/spot flex flex-col gap-3 text-left shrink-0 w-[8.5rem] sm:w-[9.5rem]",
        file && "cursor-pointer active:scale-[0.98] transition-transform duration-200",
        menuOpen && "ring-1 ring-white/20 rounded-[var(--r-media,16px)]",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-media,16px)]">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={28} />
          </div>
        )}
        {file && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover/spot:opacity-100">
            <Play size={14} fill="white" className="text-white" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--music-accent)" }}>
          Top track
        </p>
        <p className="text-xs font-semibold truncate" style={{ color: "var(--music-text-primary)" }}>
          {row.title || "Unknown"}
        </p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {formatListenDuration(row.listenTimeSec)}, {row.playCount} plays
        </p>
      </div>
    </button>
  );
}

type SpotlightArtistProps = {
  row: TopArtistStat;
  lookup: MediaLookup;
  onOpen: (key: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
};

function SpotlightArtist({ row, lookup, onOpen, onContextMenu, menuOpen }: SpotlightArtistProps) {
  const tracks = lookup.audioFiles.filter((f) => fileMatchesArtistKey(f, row.artistKey));

  return (
    <button
      type="button"
      onClick={() => onOpen(row.artistKey)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      className={cn(
        "group/spot flex flex-col items-center gap-3 shrink-0 w-[8.5rem] sm:w-[9.5rem] text-center cursor-pointer active:scale-[0.98] transition-transform duration-200",
        menuOpen && "ring-1 ring-white/20 rounded-2xl",
      )}
    >
      <div className="relative w-[5.25rem] h-[5.25rem] sm:w-[5.75rem] sm:h-[5.75rem] rounded-full overflow-hidden">
        {tracks.length > 0 ? (
          <LikedSongsCover files={tracks} className="w-full h-full" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Disc3 size={24} />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--music-accent)" }}>
          Top artist
        </p>
        <p className="text-xs font-semibold truncate" style={{ color: "var(--music-text-primary)" }}>
          {row.display}
        </p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {formatListenDuration(row.listenTimeSec)}, {row.playCount} plays
        </p>
      </div>
    </button>
  );
}

type RecentChipProps = {
  entry: PlayHistoryEntry;
  lookup: MediaLookup;
  onPlay: (file: MediaFile) => void;
  onContextMenu?: (e: React.MouseEvent, file: MediaFile) => void;
  menuOpen?: boolean;
};

function RecentChip({ entry, lookup, onPlay, onContextMenu, menuOpen }: RecentChipProps) {
  const file = resolveStatFile(entry, lookup);
  const cover = file ? bestCoverPath(file) : null;
  const coverSrc = cover ? convertFileSrc(cover) : null;

  return (
    <button
      type="button"
      disabled={!file}
      onClick={() => file && onPlay(file)}
      onContextMenu={(e) => {
        if (!file || !onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, file);
      }}
      className={cn(
        "group/recent shrink-0 flex flex-col gap-2.5 w-[6.25rem] sm:w-[6.75rem] text-left",
        file && "cursor-pointer active:scale-[0.98] transition-transform duration-200",
        menuOpen && "ring-1 ring-white/20 rounded-[14px]",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[14px]">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={20} />
          </div>
        )}
        {file && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 group-hover/recent:opacity-100">
            <Play size={12} fill="white" className="text-white" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold truncate leading-tight" style={{ color: "var(--music-text-primary)" }}>
          {entry.title || "Unknown"}
        </p>
        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {formatRelativePlayed(entry.playedAt)}
        </p>
      </div>
    </button>
  );
}

type Props = {
  onBack?: () => void;
};

export function MusicProfileView({ onBack }: Props) {
  const profile = useRuforgeStore((s) => s.youtubeExplorerProfile);
  const sessionStatus = useRuforgeStore((s) => s.youtubeSessionStatus);
  const openMusicStats = useRuforgeStore((s) => s.openMusicStats);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const playMusicQueue = useRuforgeStore((s) => s.playMusicQueue);
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const lookup = useProfileMediaLookup();
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(() => {
    void tick;
    void playingPath;
    const week = getStatsSince(SEVEN_DAYS_MS);
    const likedFiles = resolveLikedFiles(lookup.audioFiles);
    return {
      allTimeListenSec: getTotalListenTimeSec(),
      allTimePlays: getTotalPlayCount(),
      week,
      topTrack: getTopTracks(1)[0] ?? null,
      topArtist: getTopArtists(1)[0] ?? null,
      recent: getRecentHistory().slice(0, 10),
      likedCount: likedFiles.length,
      libraryCount: lookup.audioFiles.length,
      likedFiles,
    };
  }, [lookup, playingPath, tick]);

  const avatarUrl = profile ? sanitizeYoutubeAvatarUrl(profile.avatarUrl) : null;
  const handleLabel = formatYoutubeHandleLabel(profile) ?? youtubeProfileHoverLabel(profile);
  const displayName = profile?.displayName?.trim() || "Your profile";
  const signedIn = sessionStatus === "signed-in" && !!profile;

  const heroCover = useMemo(() => {
    if (avatarUrl) return null;
    const top = snapshot.topTrack;
    if (top) return coverForPath(top.path, lookup);
    const liked = snapshot.likedFiles[0];
    return liked ? bestCoverPath(liked) : null;
  }, [avatarUrl, lookup, snapshot.likedFiles, snapshot.topTrack]);

  const playFile = (file: MediaFile) => {
    playMusicQueue(file, [file], musicQueueSource("track", file.name));
  };

  const likedSource = musicQueueSource("liked", "Liked Songs");
  const weekHint = snapshot.week.listenTimeSec > 0
    ? `${formatListenDuration(snapshot.week.listenTimeSec)} this week`
    : undefined;

  const openLikedFromProfile = () => openMusicLiked({ backTo: "profile" });

  const openSongMenu = (file: MediaFile, e: React.MouseEvent, playlist?: MediaFile[]) => {
    const list = playlist ?? [file];
    setMenu({
      context: { kind: "song", file },
      x: e.clientX,
      y: e.clientY,
      onPlay: () => playMusicQueue(file, list, musicQueueSource("track", file.name)),
    });
  };

  const openArtistMenu = (
    artistKey: string,
    displayName: string,
    e: React.MouseEvent,
    tracks: MediaFile[],
  ) => {
    setMenu({
      context: { kind: "artist", artistKey, displayName },
      x: e.clientX,
      y: e.clientY,
      onPlay: tracks.length > 0
        ? () => playMusicQueue(tracks[0]!, tracks, musicQueueSource("artist", displayName))
        : undefined,
    });
  };

  const accent = "var(--music-accent)";

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar" style={{ background: "var(--music-bg)" }}>
      <div className="relative shrink-0 overflow-hidden" style={{ minHeight: "240px" }}>
        {avatarUrl ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${avatarUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(14px) brightness(0.28)",
              transform: "scale(1.1)",
            }}
            aria-hidden
          />
        ) : heroCover ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${convertFileSrc(heroCover)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(14px) brightness(0.28)",
              transform: "scale(1.1)",
            }}
            aria-hidden
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #2a1018 0%, var(--music-bg) 100%)" }}
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 10%, rgba(14,10,10,0.88) 70%, var(--music-bg) 100%)" }}
        />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-3 left-3 z-20 flex items-center gap-1 text-sm transition-opacity opacity-70 hover:opacity-100"
            style={{ color: "var(--music-text-primary)" }}
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div className="relative z-10 flex flex-col items-center px-6 pt-14 pb-6 text-center">
          <div
            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shrink-0"
            style={{ boxShadow: "0 0 0 3px color-mix(in srgb, var(--music-accent) 35%, transparent)" }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-2xl font-bold"
                style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h1
            className="mt-4 font-bold tracking-tight leading-tight max-w-md"
            style={{ fontSize: "clamp(1.35rem, 3vw, 1.75rem)", color: "var(--music-text-primary)" }}
          >
            {signedIn ? displayName : "Local listener"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--music-text-secondary)" }}>
            {signedIn ? handleLabel : "Sign in to sync YouTube Music downloads"}
          </p>
          {!signedIn && (
            <button
              type="button"
              onClick={openExplorerForLogin}
              className="mt-3 px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--music-accent)", color: "#fff", borderRadius: "var(--r-cta, 12px)" }}
            >
              Sign in with YouTube
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-12 px-8 sm:px-10 pb-14 max-w-4xl w-full mx-auto">
        <section
          className="rounded-[20px] overflow-hidden"
          style={{ background: "color-mix(in srgb, var(--music-surface) 88%, transparent)" }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/10">
            <GlanceStat
              label="Listened"
              value={formatListenDuration(snapshot.allTimeListenSec)}
              hint={weekHint}
            />
            <GlanceStat
              label="Plays"
              value={snapshot.allTimePlays.toLocaleString()}
              hint={snapshot.week.playCount > 0 ? `${snapshot.week.playCount} this week` : undefined}
            />
            <GlanceStat
              label="Liked"
              value={String(snapshot.likedCount)}
              labelTone={snapshot.likedCount > 0 ? accent : undefined}
              onClick={snapshot.likedCount > 0 ? openLikedFromProfile : undefined}
            />
            <GlanceStat
              label="In library"
              value={String(snapshot.libraryCount)}
            />
          </div>
        </section>

        {(snapshot.topTrack || snapshot.topArtist) && (
          <section>
            <SectionLabel>Your highlights</SectionLabel>
            <HorizontalScrollHint>
              {snapshot.topTrack && (() => {
                const topFile = resolveStatFile(snapshot.topTrack, lookup);
                return (
                  <SpotlightTrack
                    row={snapshot.topTrack}
                    lookup={lookup}
                    onPlay={playFile}
                    menuOpen={!!topFile && menu?.context.kind === "song" && menu.context.file.path === topFile.path}
                    onContextMenu={(e, file) => openSongMenu(file, e)}
                  />
                );
              })()}
              {snapshot.topArtist && (
                <SpotlightArtist
                  row={snapshot.topArtist}
                  lookup={lookup}
                  onOpen={openMusicArtist}
                  menuOpen={menu?.context.kind === "artist" && menu.context.artistKey === snapshot.topArtist.artistKey}
                  onContextMenu={(e) => {
                    const tracks = lookup.audioFiles.filter((f) => fileMatchesArtistKey(f, snapshot.topArtist!.artistKey));
                    openArtistMenu(snapshot.topArtist!.artistKey, snapshot.topArtist!.display, e, tracks);
                  }}
                />
              )}
            </HorizontalScrollHint>
          </section>
        )}

        {snapshot.likedCount > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-1">
              <SectionLabel>Liked songs</SectionLabel>
              <button
                type="button"
                onClick={openLikedFromProfile}
                className="flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-80 -mt-3 shrink-0"
                style={{ color: "var(--music-accent)" }}
              >
                Open playlist
              </button>
            </div>
            <button
              type="button"
              onClick={openLikedFromProfile}
              onContextMenu={(e) => {
                e.preventDefault();
                const files = snapshot.likedFiles;
                if (files.length === 0) return;
                setMenu({
                  context: { kind: "song", file: files[0]! },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: () => playMusicQueue(files[0]!, files, likedSource),
                });
              }}
              className="flex items-center gap-5 w-full text-left transition-opacity hover:opacity-90 rounded-[18px] px-4 py-4"
              style={{ background: "color-mix(in srgb, var(--music-surface) 88%, transparent)" }}
            >
              <div className="w-[4.5rem] h-[4.5rem] shrink-0 overflow-hidden rounded-[16px]">
                <LikedSongsCover files={snapshot.likedFiles} className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--music-text-primary)" }}>
                  <Heart size={14} fill="var(--music-accent)" stroke="var(--music-accent)" />
                  {snapshot.likedCount} {snapshot.likedCount === 1 ? "track" : "tracks"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--music-text-muted)" }}>
                  Saved on this device
                </p>
              </div>
            </button>
          </section>
        )}

        {snapshot.recent.length > 0 && (
          <section>
            <SectionLabel>Recently played</SectionLabel>
            <HorizontalScrollHint>
              {snapshot.recent.map((entry) => {
                const file = resolveStatFile(entry, lookup);
                return (
                  <RecentChip
                    key={entry.identityKey}
                    entry={entry}
                    lookup={lookup}
                    onPlay={playFile}
                    menuOpen={!!file && menu?.context.kind === "song" && menu.context.file.path === file.path}
                    onContextMenu={(e, f) => openSongMenu(f, e)}
                  />
                );
              })}
            </HorizontalScrollHint>
          </section>
        )}

        <section className="pt-1">
          <button
            type="button"
            onClick={() => openMusicStats({ backTo: "profile" })}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--music-accent)" }}
          >
            Open full stats
          </button>
        </section>
      </div>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
