import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, Disc3, Music2, Play } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { fileMatchesArtistKey, primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { LikedSongsCover } from "./LikedSongsCover";
import {
  SEVEN_DAYS_MS,
  formatListenDuration,
  getStatsSince,
  getTopArtists,
  getTopArtistsSince,
  getTopTracks,
  getTopTracksSince,
  getTotalListenTimeSec,
  getTotalPlayCount,
  type ListenStat,
  type TopArtistStat,
} from "./musicListenStats";
import { musicQueueSource } from "./musicQueueSource";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicTrackIndexPlay } from "./MusicTrackIndexPlay";

const CONTENT_PAD = "px-8 sm:px-10";
const CONTENT_WIDTH = "max-w-4xl w-full mx-auto";

function StatsSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-lg sm:text-xl font-bold tracking-tight mb-4"
      style={{ color: "var(--music-text-primary)" }}
    >
      {children}
    </h2>
  );
}

function StatsHeroBackdrop({ covers }: { covers: string[] }) {
  if (covers.length === 0) return null;
  return (
    <div className="absolute inset-0 flex overflow-hidden" aria-hidden>
      {covers.map((c) => (
        <div key={c} className="flex-1 min-w-0">
          <img src={convertFileSrc(c)} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
        </div>
      ))}
    </div>
  );
}

type MediaLookup = {
  byPath: Map<string, MediaFile>;
  byIdentity: Map<string, MediaFile>;
  audioFiles: MediaFile[];
};

function useStatsMediaLookup(): MediaLookup {
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

function resolveStatFile(row: ListenStat, lookup: MediaLookup): MediaFile | undefined {
  return lookup.byPath.get(row.path) ?? lookup.byIdentity.get(row.identityKey);
}

function coverForStat(row: ListenStat, lookup: MediaLookup): string | null {
  const file = resolveStatFile(row, lookup);
  return file ? bestCoverPath(file) : null;
}

function artistTracks(artistKey: string, lookup: MediaLookup): MediaFile[] {
  return lookup.audioFiles.filter((f) => fileMatchesArtistKey(f, artistKey));
}

function statMetaLine(listenTimeSec: number, playCount: number): string {
  return `${formatListenDuration(listenTimeSec)}, ${playCount} ${playCount === 1 ? "play" : "plays"}`;
}

type TopTrackCardProps = {
  rank: number;
  row: ListenStat;
  lookup: MediaLookup;
  hero?: boolean;
  onPlay?: (file: MediaFile) => void;
  onOpen?: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, file: MediaFile) => void;
  menuOpen?: boolean;
};

function TopTrackCard({ rank, row, lookup, hero, onPlay, onOpen, onContextMenu, menuOpen }: TopTrackCardProps) {
  const file = resolveStatFile(row, lookup);
  const cover = coverForStat(row, lookup);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = row.artist.trim();
  const rankLabel = String(rank).padStart(2, "0");

  const handleClick = () => {
    if (file && onPlay) {
      onPlay(file);
      return;
    }
    if (file && onOpen) onOpen(file.path);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        if (!file || !onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, file);
      }}
      disabled={!file}
      className={cn(
        "group/top shrink-0 text-left flex flex-col gap-3 transition-transform duration-200",
        hero ? "w-[10rem] sm:w-[11.5rem]" : "w-[8rem] sm:w-[9rem]",
        file ? "cursor-pointer active:scale-[0.98]" : "cursor-default opacity-70",
        menuOpen && "ring-1 ring-white/20 rounded-[var(--r-media,18px)]",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-media,18px)]">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={hero ? 36 : 28} />
          </div>
        )}
        <span
          className="absolute left-2 top-2 text-[11px] font-bold tabular-nums tracking-tight px-1.5 py-0.5 rounded-md bg-black/72 backdrop-blur-sm text-white ring-1 ring-white/15 shadow-[0_1px_8px_rgba(0,0,0,0.55)]"
          style={rank === 1 ? { color: "var(--music-accent)" } : undefined}
        >
          {rankLabel}
        </span>
        {file && onPlay && (
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/75 via-black/35 to-transparent opacity-0 transition-opacity duration-200 group-hover/top:opacity-100 px-2 pb-3">
            <p className="text-[11px] font-semibold tabular-nums text-center leading-snug text-white/90">
              {statMetaLine(row.listenTimeSec, row.playCount)}
            </p>
          </div>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <p
          className={cn("font-bold truncate leading-tight", hero ? "text-sm" : "text-[13px]")}
          style={{ color: "var(--music-text-primary)" }}
        >
          {row.title || "Unknown"}
        </p>
        {artist ? (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
            {artist}
          </p>
        ) : null}
      </div>
    </button>
  );
}

type CompactTrackRowProps = {
  rank: number;
  row: ListenStat;
  lookup: MediaLookup;
  onPlay?: (file: MediaFile) => void;
  onOpen?: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, file: MediaFile) => void;
  menuOpen?: boolean;
};

function CompactTrackRow({ rank, row, lookup, onPlay, onOpen, onContextMenu, menuOpen }: CompactTrackRowProps) {
  const file = resolveStatFile(row, lookup);
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const cover = coverForStat(row, lookup);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const artist = row.artist.trim();
  const isPlaying = !!file && playingPath === file.path;

  const handleClick = () => {
    if (file && onPlay) {
      onPlay(file);
      return;
    }
    if (file && onOpen) onOpen(file.path);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        if (!file || !onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, file);
      }}
      disabled={!file}
      className={cn(
        "group/row flex w-full items-center gap-3 min-w-0 text-left py-2 px-1 rounded-xl transition-colors",
        file ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-default opacity-70",
        menuOpen && "bg-white/[0.06]",
        isPlaying && "bg-white/[0.04]",
      )}
    >
      <MusicTrackIndexPlay
        indexLabel={rank}
        isPlaying={isPlaying}
        iconSize={12}
        labelClassName="text-[11px] font-bold"
      />
      <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-[12px]">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={16} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-primary)" }}>
          {row.title || "Unknown"}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--music-text-muted)" }}>
          {artist ? `${artist}, ` : ""}
          {statMetaLine(row.listenTimeSec, row.playCount)}
        </p>
      </div>
    </button>
  );
}

type ArtistTileProps = {
  rank: number;
  row: TopArtistStat;
  lookup: MediaLookup;
  onOpen?: (artistKey: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
};

function ArtistTile({ rank, row, lookup, onOpen, onContextMenu, menuOpen }: ArtistTileProps) {
  const tracks = artistTracks(row.artistKey, lookup);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(row.artistKey)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      disabled={!onOpen}
      className={cn(
        "group/artist shrink-0 flex flex-col items-center gap-3 w-[6rem] sm:w-[6.75rem] text-center",
        onOpen && "cursor-pointer active:scale-[0.98] transition-transform duration-200",
        !onOpen && "cursor-default",
        menuOpen && "ring-1 ring-white/20 rounded-2xl",
      )}
    >
      <div className="relative w-[5rem] h-[5rem] sm:w-[5.25rem] sm:h-[5.25rem] rounded-full overflow-hidden transition-transform duration-200 group-hover/artist:scale-105">
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
        {onOpen && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 group-hover/artist:opacity-100">
            <Play size={14} fill="white" className="text-white" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full px-0.5">
        <p className="text-[11px] font-bold tabular-nums mb-0.5" style={{ color: rank <= 3 ? "var(--music-accent)" : "var(--music-text-muted)" }}>
          #{rank}
        </p>
        <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--music-text-primary)" }}>
          {row.display}
        </p>
        <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--music-text-muted)" }}>
          {statMetaLine(row.listenTimeSec, row.playCount)}
        </p>
      </div>
    </button>
  );
}

type Props = {
  onBack?: () => void;
};

export function MusicStatsView({ onBack }: Props) {
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const playMusicQueue = useRuforgeStore((s) => s.playMusicQueue);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openMusicSong = useRuforgeStore((s) => s.openMusicSong);
  const lookup = useStatsMediaLookup();
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
    return {
      allTime: {
        listenTimeSec: getTotalListenTimeSec(),
        playCount: getTotalPlayCount(),
      },
      week,
      topTracks: getTopTracks(10),
      topArtists: getTopArtists(10),
      weekTracks: getTopTracksSince(10, SEVEN_DAYS_MS),
      weekArtists: getTopArtistsSince(10, SEVEN_DAYS_MS),
    };
  }, [playingPath, tick]);

  const heroCovers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of snapshot.topTracks) {
      const cover = coverForStat(row, lookup);
      if (!cover || seen.has(cover)) continue;
      seen.add(cover);
      out.push(cover);
      if (out.length >= 3) break;
    }
    return out;
  }, [snapshot.topTracks, lookup]);

  const statsSource = musicQueueSource("stats", "Stats");

  const playStatFile = (file: MediaFile) => {
    playMusicQueue(file, [file], statsSource);
  };

  const playStatPlaylist = (rows: ListenStat[]) => {
    const files = rows
      .map((r) => resolveStatFile(r, lookup))
      .filter((f): f is MediaFile => !!f);
    if (files.length === 0) return;
    playMusicQueue(files[0]!, files, statsSource);
  };

  const openSongMenu = (file: MediaFile, e: React.MouseEvent, playlist?: ListenStat[]) => {
    const files = playlist
      ? playlist.map((r) => resolveStatFile(r, lookup)).filter((f): f is MediaFile => !!f)
      : [file];
    setMenu({
      context: { kind: "song", file },
      x: e.clientX,
      y: e.clientY,
      onPlay: () => playMusicQueue(file, files.length > 0 ? files : [file], statsSource),
    });
  };

  const openArtistMenu = (
    artistKey: string,
    displayName: string,
    e: React.MouseEvent,
  ) => {
    const tracks = artistTracks(artistKey, lookup);
    setMenu({
      context: { kind: "artist", artistKey, displayName },
      x: e.clientX,
      y: e.clientY,
      onPlay: tracks.length > 0
        ? () => playMusicQueue(tracks[0]!, tracks, statsSource)
        : undefined,
    });
  };

  const isSongMenuOpen = (file: MediaFile | undefined) =>
    !!file && menu?.context.kind === "song" && menu.context.file.path === file.path;

  const hasAnyStats =
    snapshot.allTime.listenTimeSec > 0
    || snapshot.allTime.playCount > 0
    || snapshot.topTracks.length > 0;

  const showWeekLists =
    snapshot.week.listenTimeSec > 0
    && (snapshot.weekTracks.length > 0 || snapshot.weekArtists.length > 0);

  if (!hasAnyStats) {
    return (
      <div className="flex flex-col h-full">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-6 py-3 shrink-0 text-sm transition-opacity opacity-60 hover:opacity-100"
            style={{ color: "var(--music-text-secondary)" }}
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm" style={{ color: "var(--music-text-muted)" }}>
            nothing tracked yet. play a song and your stats will show up here.
          </p>
        </div>
      </div>
    );
  }

  const topThree = snapshot.topTracks.slice(0, 3);
  const restTracks = snapshot.topTracks.slice(3);

  const heroSummaryParts = [
    `${formatListenDuration(snapshot.allTime.listenTimeSec)} listened, ${snapshot.allTime.playCount.toLocaleString()} plays all time`,
  ];
  if (snapshot.week.listenTimeSec > 0) {
    heroSummaryParts.push(`${formatListenDuration(snapshot.week.listenTimeSec)} this week`);
  }
  const heroSummary = heroSummaryParts.join(". ");

  const heroInsight = useMemo(() => {
    const topTrack = snapshot.topTracks[0];
    const topArtist = snapshot.topArtists[0];
    if (topTrack?.title && topArtist?.display) {
      return `${topTrack.title} and ${topArtist.display} lead your rotation on this device.`;
    }
    if (topTrack?.title) {
      return `${topTrack.title} is your most played track here.`;
    }
    if (topArtist?.display) {
      return `${topArtist.display} is your most played artist here.`;
    }
    return "Rankings from listen history in your local library.";
  }, [snapshot.topArtists, snapshot.topTracks]);

  const handleBack = () => {
    if (musicDetail?.kind === "stats" && musicDetail.backTo === "profile") {
      useRuforgeStore.setState({ musicDetail: { kind: "profile" } });
      return;
    }
    onBack?.();
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar" style={{ background: "var(--music-bg)" }}>
      <div className="relative shrink-0 overflow-hidden" style={{ minHeight: "200px" }}>
        {heroCovers.length > 0 ? (
          <div
            className="absolute inset-0"
            style={{ filter: "blur(11px) brightness(0.28)", transform: "scale(1.06)" }}
          >
            <StatsHeroBackdrop covers={heroCovers} />
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #2a1018 0%, var(--music-bg) 100%)" }}
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 15%, rgba(14,10,10,0.82) 72%, var(--music-bg) 100%)" }}
        />
        {onBack && (
          <button
            type="button"
            onClick={handleBack}
            className="absolute top-3 left-3 z-20 flex items-center gap-1 text-sm transition-opacity opacity-70 hover:opacity-100"
            style={{ color: "var(--music-text-primary)" }}
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div className={`relative z-10 flex flex-col justify-end pt-16 pb-6 min-h-[200px] ${CONTENT_WIDTH} ${CONTENT_PAD}`}>
          <h1
            className="font-bold leading-none tracking-tight"
            style={{
              fontSize: "clamp(2rem, 5vw, 2.75rem)",
              color: "var(--music-text-primary)",
            }}
          >
            Listening stats
          </h1>
          <p
            className="text-sm font-medium mt-2.5 max-w-xl leading-relaxed"
            style={{ color: "var(--music-text-secondary)" }}
          >
            {heroInsight}
          </p>
          <p
            className="text-xs mt-2 max-w-xl leading-relaxed tabular-nums"
            style={{ color: "var(--music-text-muted)" }}
          >
            {heroSummary}
          </p>
        </div>
      </div>

      <div className={`flex flex-col gap-12 pb-14 ${CONTENT_WIDTH} ${CONTENT_PAD}`}>
        {topThree.length > 0 && (
          <section>
            <StatsSectionTitle>All-time top tracks</StatsSectionTitle>
            <div className="flex items-end gap-5 sm:gap-6 overflow-x-auto pb-2 rf-scrollbar">
              {topThree.map((row, i) => {
                const file = resolveStatFile(row, lookup);
                return (
                  <TopTrackCard
                    key={row.identityKey}
                    rank={i + 1}
                    row={row}
                    lookup={lookup}
                    hero={i === 0}
                    onPlay={playStatFile}
                    onOpen={openMusicSong}
                    menuOpen={isSongMenuOpen(file)}
                    onContextMenu={(e, f) => openSongMenu(f, e, topThree)}
                  />
                );
              })}
            </div>
            {restTracks.length > 0 && (
              <div className="mt-6 flex gap-4 sm:gap-5 overflow-x-auto pb-2 rf-scrollbar">
                {restTracks.map((row, i) => {
                  const file = resolveStatFile(row, lookup);
                  return (
                    <TopTrackCard
                      key={row.identityKey}
                      rank={i + 4}
                      row={row}
                      lookup={lookup}
                      onPlay={playStatFile}
                      onOpen={openMusicSong}
                      menuOpen={isSongMenuOpen(file)}
                      onContextMenu={(e, f) => openSongMenu(f, e, snapshot.topTracks)}
                    />
                  );
                })}
              </div>
            )}
            {topThree.length >= 2 && (
              <button
                type="button"
                onClick={() => playStatPlaylist(topThree)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: "var(--music-accent)",
                  color: "#fff",
                  borderRadius: "var(--r-cta, 12px)",
                }}
              >
                <Play size={14} fill="currentColor" />
                Play top {topThree.length}
              </button>
            )}
          </section>
        )}

        {snapshot.topArtists.length > 0 && (
          <section>
            <StatsSectionTitle>All-time top artists</StatsSectionTitle>
            <div className="flex gap-6 sm:gap-7 overflow-x-auto pb-2 rf-scrollbar">
              {snapshot.topArtists.map((row, i) => (
                <ArtistTile
                  key={row.artistKey}
                  rank={i + 1}
                  row={row}
                  lookup={lookup}
                  onOpen={openMusicArtist}
                  menuOpen={menu?.context.kind === "artist" && menu.context.artistKey === row.artistKey}
                  onContextMenu={(e) => openArtistMenu(row.artistKey, row.display, e)}
                />
              ))}
            </div>
          </section>
        )}

        {showWeekLists && (
          <>
            {snapshot.weekTracks.length > 0 && (
              <section>
                <StatsSectionTitle>Top tracks this week</StatsSectionTitle>
                <div className="flex flex-col gap-0.5">
                  {snapshot.weekTracks.map((row, i) => {
                    const file = resolveStatFile(row, lookup);
                    return (
                      <CompactTrackRow
                        key={row.identityKey}
                        rank={i + 1}
                        row={row}
                        lookup={lookup}
                        onPlay={playStatFile}
                        onOpen={openMusicSong}
                        menuOpen={isSongMenuOpen(file)}
                        onContextMenu={(e, f) => openSongMenu(f, e, snapshot.weekTracks)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {snapshot.weekArtists.length > 0 && (
              <section>
                <StatsSectionTitle>Top artists this week</StatsSectionTitle>
                <div className="flex gap-6 sm:gap-7 overflow-x-auto pb-2 rf-scrollbar">
                  {snapshot.weekArtists.map((row, i) => (
                    <ArtistTile
                      key={row.artistKey}
                      rank={i + 1}
                      row={row}
                      lookup={lookup}
                      onOpen={openMusicArtist}
                      menuOpen={menu?.context.kind === "artist" && menu.context.artistKey === row.artistKey}
                      onContextMenu={(e) => openArtistMenu(row.artistKey, row.display, e)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
