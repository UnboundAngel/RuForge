import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, Disc3, Heart, Music2, Play } from "lucide-react";
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
  onClick?: () => void;
};

function GlanceStat({ label, value, onClick }: GlanceStatProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 min-w-0 text-left",
        onClick && "transition-opacity hover:opacity-80 cursor-pointer",
      )}
    >
      <span
        className="text-lg sm:text-xl font-bold tabular-nums tracking-tight leading-none"
        style={{ color: "var(--music-text-primary)" }}
      >
        {value}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
        {label}
      </span>
    </Tag>
  );
}

type SpotlightTrackProps = {
  row: ListenStat;
  lookup: MediaLookup;
  onPlay: (file: MediaFile) => void;
};

function SpotlightTrack({ row, lookup, onPlay }: SpotlightTrackProps) {
  const file = resolveStatFile(row, lookup);
  const cover = file ? bestCoverPath(file) : null;
  const coverSrc = cover ? convertFileSrc(cover) : null;

  return (
    <button
      type="button"
      disabled={!file}
      onClick={() => file && onPlay(file)}
      className={cn(
        "group/spot flex flex-col gap-2.5 text-left shrink-0 w-[7.5rem] sm:w-[8.25rem]",
        file && "cursor-pointer active:scale-[0.98] transition-transform duration-200",
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
};

function SpotlightArtist({ row, lookup, onOpen }: SpotlightArtistProps) {
  const tracks = lookup.audioFiles.filter((f) => fileMatchesArtistKey(f, row.artistKey));

  return (
    <button
      type="button"
      onClick={() => onOpen(row.artistKey)}
      className="group/spot flex flex-col items-center gap-2.5 shrink-0 w-[7.5rem] sm:w-[8.25rem] text-center cursor-pointer active:scale-[0.98] transition-transform duration-200"
    >
      <div className="relative w-[4.75rem] h-[4.75rem] sm:w-20 sm:h-20 rounded-full overflow-hidden">
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
};

function RecentChip({ entry, lookup, onPlay }: RecentChipProps) {
  const file = resolveStatFile(entry, lookup);
  const cover = file ? bestCoverPath(file) : null;
  const coverSrc = cover ? convertFileSrc(cover) : null;

  return (
    <button
      type="button"
      disabled={!file}
      onClick={() => file && onPlay(file)}
      className={cn(
        "group/recent shrink-0 flex flex-col gap-2 w-[5.5rem] text-left",
        file && "cursor-pointer active:scale-[0.98] transition-transform duration-200",
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
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const openMusicStats = useRuforgeStore((s) => s.openMusicStats);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openAuthorizeCleanupModal = useRuforgeStore((s) => s.openAuthorizeCleanupModal);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const setPlayingFile = useRuforgeStore((s) => s.setPlayingFile);
  const setFolderAudioPlaylist = useRuforgeStore((s) => s.setFolderAudioPlaylist);
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const lookup = useProfileMediaLookup();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

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
    setFolderAudioPlaylist([file]);
    setPlayingFile(file);
  };

  const usedGB = storageStats ? storageStats.total_bytes / (1024 * 1024 * 1024) : 0;
  const storagePct = saveToInternal && limitGB > 0
    ? Math.min((usedGB / limitGB) * 100, 100)
    : 0;
  const storageFull = saveToInternal && usedGB >= limitGB;

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

      <div className="flex flex-col gap-9 px-6 pb-10 max-w-3xl w-full mx-auto">
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
            <GlanceStat label="Listened" value={formatListenDuration(snapshot.allTimeListenSec)} />
            <GlanceStat label="Plays" value={snapshot.allTimePlays.toLocaleString()} />
            <GlanceStat
              label="Liked"
              value={String(snapshot.likedCount)}
              onClick={snapshot.likedCount > 0 ? openMusicLiked : undefined}
            />
            <GlanceStat label="In library" value={String(snapshot.libraryCount)} />
          </div>
          {snapshot.week.listenTimeSec > 0 && (
            <p className="text-xs mt-4" style={{ color: "var(--music-text-muted)" }}>
              This week: {formatListenDuration(snapshot.week.listenTimeSec)}, {snapshot.week.playCount} plays
            </p>
          )}
        </section>

        {(snapshot.topTrack || snapshot.topArtist) && (
          <section>
            <SectionLabel>Your highlights</SectionLabel>
            <div className="flex gap-6 overflow-x-auto pb-1 rf-scrollbar">
              {snapshot.topTrack && (
                <SpotlightTrack row={snapshot.topTrack} lookup={lookup} onPlay={playFile} />
              )}
              {snapshot.topArtist && (
                <SpotlightArtist row={snapshot.topArtist} lookup={lookup} onOpen={openMusicArtist} />
              )}
            </div>
          </section>
        )}

        {snapshot.likedCount > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Liked songs</SectionLabel>
              <button
                type="button"
                onClick={openMusicLiked}
                className="flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-80 -mt-3 shrink-0"
                style={{ color: "var(--music-accent)" }}
              >
                Open playlist
              </button>
            </div>
            <button
              type="button"
              onClick={openMusicLiked}
              className="flex items-center gap-4 w-full text-left transition-opacity hover:opacity-90"
            >
              <div className="w-16 h-16 shrink-0 overflow-hidden rounded-[14px]">
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
            <div className="flex gap-4 overflow-x-auto pb-1 rf-scrollbar">
              {snapshot.recent.map((entry) => (
                <RecentChip key={entry.identityKey} entry={entry} lookup={lookup} onPlay={playFile} />
              ))}
            </div>
          </section>
        )}

        {storageStats && (
          <section>
            <SectionLabel>Library storage</SectionLabel>
            <button
              type="button"
              onClick={() => saveToInternal && void openAuthorizeCleanupModal()}
              disabled={!saveToInternal}
              className={cn(
                "flex flex-col gap-2 w-full text-left",
                saveToInternal && "cursor-pointer transition-opacity hover:opacity-90",
                !saveToInternal && "cursor-default",
              )}
            >
              {saveToInternal ? (
                <>
                  <div
                    className="h-1 rounded-full overflow-hidden w-full"
                    style={{ background: "color-mix(in srgb, var(--music-text-muted) 18%, transparent)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${storagePct}%`,
                        background: storageFull
                          ? "var(--music-accent)"
                          : "color-mix(in srgb, var(--music-text-muted) 55%, transparent)",
                      }}
                    />
                  </div>
                  <p className="text-xs tabular-nums" style={{ color: "var(--music-text-secondary)" }}>
                    {usedGB.toFixed(1)} / {limitGB} GB used, {storageStats.file_count.toLocaleString()} files
                  </p>
                </>
              ) : (
                <p className="text-xs" style={{ color: "var(--music-text-secondary)" }}>
                  {usedGB.toFixed(1)} GB, {storageStats.file_count.toLocaleString()} files in your library folder
                </p>
              )}
            </button>
          </section>
        )}

        <section className="pt-1">
          <button
            type="button"
            onClick={openMusicStats}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--music-accent)" }}
          >
            Open full stats
          </button>
        </section>
      </div>
    </div>
  );
}
