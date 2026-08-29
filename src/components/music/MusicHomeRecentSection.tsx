import { useMemo, useState } from "react";
import { Clock, Play } from "lucide-react";
import type { MediaFile } from "@/types";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { buildRecentAddedFeed, buildRecentAddedGroups } from "@/lib/musicRecentGroups";
import { MUSIC_ALBUM_SHELF_GAP_RECENT_PX } from "@/lib/musicAlbumShelfLayout";
import { formatRelativePlayed } from "@/lib/musicRelativeTime";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";
import type { PlayHistoryEntry } from "./musicPlayHistory";
import { MusicAlbumCard } from "./MusicAlbumCard";
import { MusicAlbumShelf } from "./MusicAlbumShelf";
import { MusicQuickPickRow } from "./MusicQuickPickRow";
import { MusicRecentPlaylistCard } from "./MusicRecentPlaylistCard";
import type { MusicRowContextMenuState } from "./MusicRowContextMenu";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";

type RecentTab = "added" | "listened";

type Props = {
  tracks: MediaFile[];
  historyEntries: PlayHistoryEntry[];
  quickPicks: MediaFile[];
  onPlayFile: (file: MediaFile, playlist?: MediaFile[], source?: MusicQueueSource | null) => void;
  onOpenAlbum: (artistKey: string, albumKey: string) => void;
  onPlayQuickPicks: () => void;
  setMenu: (menu: MusicRowContextMenuState | null) => void;
  menu: MusicRowContextMenuState | null;
};

function resolveHistoryFile(
  entry: PlayHistoryEntry,
  byPath: Map<string, MediaFile>,
  byIdentity: Map<string, MediaFile>,
): MediaFile | undefined {
  return byPath.get(entry.path) ?? byIdentity.get(entry.identityKey);
}

/** MediaFile.created is Unix seconds; relative formatter expects ms. */
function formatAddedAt(createdSec: number): string {
  return formatRelativePlayed(createdSec * 1000);
}

export function MusicHomeRecentSection({
  tracks,
  historyEntries,
  quickPicks,
  onPlayFile,
  onOpenAlbum,
  onPlayQuickPicks,
  setMenu,
  menu,
}: Props) {
  const [activeTab, setActiveTab] = useState<RecentTab>("added");
  const [isAnimating, setIsAnimating] = useState(false);

  const added = useMemo(() => buildRecentAddedGroups(tracks), [tracks]);
  const addedFeed = useMemo(() => buildRecentAddedFeed(added), [added]);

  const lookup = useMemo(() => {
    const byPath = new Map<string, MediaFile>();
    const byIdentity = new Map<string, MediaFile>();
    for (const f of tracks) {
      byPath.set(f.path, f);
      byIdentity.set(musicTrackIdentityKey(f, primaryArtist), f);
    }
    return { byPath, byIdentity };
  }, [tracks]);

  const listened = useMemo(() => {
    const out: { file: MediaFile; playedAt: number }[] = [];
    const seen = new Set<string>();
    for (const entry of historyEntries) {
      const file = resolveHistoryFile(entry, lookup.byPath, lookup.byIdentity);
      if (!file) continue;
      const key = musicTrackIdentityKey(file, primaryArtist);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file, playedAt: entry.playedAt });
      if (out.length >= 12) break;
    }
    return out;
  }, [historyEntries, lookup]);

  const hasAddedContent = addedFeed.length > 0 || added.albums.length > 0;

  const switchTab = (tab: RecentTab) => {
    if (tab === activeTab) return;
    setIsAnimating(true);
    window.setTimeout(() => {
      setActiveTab(tab);
      setIsAnimating(false);
    }, 180);
  };

  return (
    <section className="mt-2">
      <div
        className="relative overflow-hidden rounded-[1.75rem] px-5 py-7 sm:px-7 sm:py-10 pt-8"
        style={{
          background:
            "linear-gradient(180deg, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0.52) 28%, rgba(0, 0, 0, 0.22) 52%, rgba(0, 0, 0, 0.06) 78%, transparent 100%)",
        }}
      >
        <div className="flex items-baseline gap-6 sm:gap-8 mb-8">
          <button
            type="button"
            onClick={() => switchTab("added")}
            className={`text-2xl tracking-tight transition-all duration-300 ease-out ${
              activeTab === "added"
                ? "font-bold scale-100"
                : "font-medium scale-95 hover:opacity-90"
            }`}
            style={{
              color: activeTab === "added" ? "var(--music-text-primary)" : "var(--music-text-muted)",
            }}
          >
            Recently added
          </button>
          <button
            type="button"
            onClick={() => switchTab("listened")}
            className={`text-2xl tracking-tight transition-all duration-300 ease-out ${
              activeTab === "listened"
                ? "font-bold scale-100"
                : "font-medium scale-95 hover:opacity-90"
            }`}
            style={{
              color: activeTab === "listened" ? "var(--music-text-primary)" : "var(--music-text-muted)",
            }}
          >
            Recently listened
          </button>
        </div>

        <div
          className={`min-h-[12rem] transition-all duration-200 ease-out motion-reduce:transition-none ${
            isAnimating ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100"
          }`}
        >
          {activeTab === "added" && (
            <div className="flex flex-col gap-10">
              {!hasAddedContent && (
                <p className="text-sm px-2" style={{ color: "var(--music-text-muted)" }}>
                  Nothing new in your library yet.
                </p>
              )}

              {addedFeed.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {addedFeed.map((item) => {
                    if (item.kind === "playlist") {
                      const pl = item.group;
                      return (
                        <MusicRecentPlaylistCard
                          key={`pl:${pl.folderKey}`}
                          title={pl.title}
                          tracks={pl.tracks}
                          onClick={() => onPlayFile(
                            pl.tracks[0]!,
                            pl.tracks,
                            musicQueueSource("playlist", pl.title),
                          )}
                          onContextMenu={(e) =>
                            setMenu({
                              context: { kind: "song", file: pl.tracks[0]! },
                              x: e.clientX,
                              y: e.clientY,
                              onPlay: () => onPlayFile(
                                pl.tracks[0]!,
                                pl.tracks,
                                musicQueueSource("playlist", pl.title),
                              ),
                            })
                          }
                        />
                      );
                    }

                    const file = item.file;
                    return (
                      <MusicRecentPlaylistCard
                        key={`song:${file.path}`}
                        title={file.name}
                        tracks={[file]}
                        metaLabel={formatAddedAt(file.created)}
                        onClick={() => onPlayFile(
                          file,
                          [file],
                          musicQueueSource("track", file.name),
                        )}
                        onContextMenu={(e) =>
                          setMenu({
                            context: { kind: "song", file },
                            x: e.clientX,
                            y: e.clientY,
                            onPlay: () => onPlayFile(
                              file,
                              [file],
                              musicQueueSource("track", file.name),
                            ),
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}

              {added.albums.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-5 px-2">
                    <h3
                      className="text-sm font-semibold tracking-widest uppercase shrink-0"
                      style={{ color: "var(--music-text-muted)" }}
                    >
                      Albums
                    </h3>
                    <div
                      className="h-px flex-grow rounded-full min-w-8"
                      style={{ background: "rgba(255, 255, 255, 0.06)" }}
                    />
                  </div>
                  <MusicAlbumShelf
                    items={added.albums}
                    gap={MUSIC_ALBUM_SHELF_GAP_RECENT_PX}
                    keyFn={(a) => `${a.artistKey}::${a.albumKey}`}
                    renderItem={(a) => {
                      const paths = albumCoverPathWithFallback(a.tracks[0]!);
                      return (
                      <MusicAlbumCard
                        title={a.album}
                        subtitle={a.artist}
                        cover={paths.primary}
                        coverFallback={paths.fallback}
                        onClick={() => onOpenAlbum(a.artistKey, a.albumKey)}
                        onContextMenu={(e) =>
                          setMenu({
                            context: {
                              kind: "album",
                              artistKey: a.artistKey,
                              albumKey: a.albumKey,
                              displayName: a.album,
                              artistName: a.artist,
                            },
                            x: e.clientX,
                            y: e.clientY,
                            onPlay:
                              a.tracks.length > 0
                                ? () => onPlayFile(
                                    a.tracks[0]!,
                                    a.tracks,
                                    musicQueueSource("album", a.album),
                                  )
                                : undefined,
                          })
                        }
                      />
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "listened" && (
            <div>
              {listened.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                  {listened.map(({ file, playedAt }) => (
                    <MusicQuickPickRow
                      key={file.path}
                      file={file}
                      variant="glass"
                      metaLabel={formatRelativePlayed(playedAt)}
                      menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                      onClick={() => onPlayFile(
                        file,
                        listened.map((x) => x.file),
                        musicQueueSource("recent", "Recently listened"),
                      )}
                      onContextMenu={(e) =>
                        setMenu({
                          context: { kind: "song", file },
                          x: e.clientX,
                          y: e.clientY,
                          onPlay: () => onPlayFile(
                            file,
                            listened.map((x) => x.file),
                            musicQueueSource("recent", "Recently listened"),
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <div
                    className="w-20 h-20 mb-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <Clock className="w-9 h-9" style={{ color: "var(--music-text-muted)", opacity: 0.5 }} />
                  </div>
                  <p className="text-lg font-medium tracking-tight" style={{ color: "var(--music-text-secondary)" }}>
                    Quiet around here.
                  </p>
                  <p className="text-sm mt-2 mb-6" style={{ color: "var(--music-text-muted)" }}>
                    You have not played anything recently.
                  </p>
                  {quickPicks.length > 0 && (
                    <button
                      type="button"
                      onClick={onPlayQuickPicks}
                      className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full transition-transform duration-200 hover:scale-105 active:scale-[0.98]"
                      style={{
                        background: "var(--music-text-primary)",
                        color: "var(--music-bg)",
                      }}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Play Quick picks
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
