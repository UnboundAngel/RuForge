import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Music, RefreshCw, Search, X } from "lucide-react";
import { bestCoverPath } from "@/mediaKind";
import { cn } from "@/lib/utils";
import type { MediaFile } from "@/types";
import { filterTracksByQuery, trackArtistLabel } from "./musicPlaylists";
import { recommendForPlaylist } from "./musicPlaylistRecommend";

type Props = {
  libraryTracks: MediaFile[];
  /** Songs already in the playlist; recommendations are drawn from these. */
  playlistTracks: MediaFile[];
  inPlaylist: (path: string) => boolean;
  onAdd: (file: MediaFile) => void;
  /** Empty playlists open straight into search, with library picks underneath. */
  prominent: boolean;
  /** Off while the header title is in edit mode so the rename input keeps focus. */
  autoFocus: boolean;
};

const RECOMMEND_COUNT = 10;
const EASE = [0.22, 1, 0.36, 1] as const;

const PILL =
  "rf-music-press flex items-center gap-2 h-8 px-4 rounded-full text-sm font-bold text-white/70 hover:text-white bg-white/[0.07] hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]";

/**
 * Spotify's block under a playlist: "Recommended" songs with Add and Refresh,
 * and a "Find more" search. Rows share the tracklist's padding so the columns line up.
 */
export function MusicPlaylistFinder({ libraryTracks, playlistTracks, inPlaylist, onAdd, prominent, autoFocus }: Props) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [round, setRound] = useState(0);

  const recommended = useMemo(
    () => recommendForPlaylist(libraryTracks, playlistTracks, round, RECOMMEND_COUNT),
    [libraryTracks, playlistTracks, round],
  );
  // Refresh only helps when the library holds more candidates than one page shows.
  const canRefresh = libraryTracks.length - playlistTracks.length > RECOMMEND_COUNT;
  const results = useMemo(() => filterTracksByQuery(libraryTracks, query), [libraryTracks, query]);

  const searchOpen = prominent || searching;
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  if (libraryTracks.length === 0) return null;

  return (
    <section className={cn("@container px-6 pb-10", prominent ? "mt-2" : "mt-10")}>
      <div className={cn(!prominent && "border-t border-white/10 pt-8")}>
        <AnimatePresence mode="wait" initial={false}>
          {searchOpen ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <div className="flex items-start justify-between gap-4 px-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">Let's find something for your playlist</h2>
                {!prominent && (
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="rf-music-press rf-music-tooltip-anchor w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]"
                    aria-label="Back to recommendations"
                    data-tooltip="Back to recommendations"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              <label className="group/find mx-4 mt-4 flex items-center gap-2 h-10 max-w-[380px] px-3 rounded-md bg-white/[0.07] text-white/50 transition-[background-color,box-shadow] duration-200 hover:bg-white/[0.1] focus-within:bg-white/[0.1] focus-within:ring-2 focus-within:ring-[color:var(--music-accent)]">
                <Search
                  size={18}
                  className="shrink-0 transition-colors group-focus-within/find:text-[color:var(--music-accent)]"
                  aria-hidden
                />
                <input
                  value={query}
                  autoFocus={autoFocus || searching}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !prominent) closeSearch();
                  }}
                  placeholder="Search your library for songs"
                  aria-label="Search your library for songs"
                  className="min-w-0 flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder:text-white/50 caret-[color:var(--music-accent)]"
                />
                <AnimatePresence>
                  {query && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setQuery("")}
                      className="shrink-0 text-white/60 hover:text-white"
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </label>

              {query.trim() ? (
                results.length === 0 ? (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 mt-6 text-sm text-white/50">
                    Nothing in your library matches &ldquo;{query.trim()}
                    &rdquo;.
                  </motion.p>
                ) : (
                  <TrackList key={query.trim()} className="mt-4" tracks={results} inPlaylist={inPlaylist} onAdd={onAdd} />
                )
              ) : prominent && recommended.length > 0 ? (
                <div className="mt-8">
                  <SectionTitle title="Recommended" subtitle="Based on your library" />
                  <TrackList className="mt-3" tracks={recommended} inPlaylist={inPlaylist} onAdd={onAdd} />
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="recommended"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <div className="flex items-start justify-between gap-4">
                <SectionTitle title="Recommended" subtitle="Based on what's in this playlist" />
                <button type="button" onClick={() => setSearching(true)} className={cn(PILL, "mr-4 shrink-0")}>
                  <Search size={15} aria-hidden /> Find more
                </button>
              </div>
              {recommended.length > 0 ? (
                <>
                  <TrackList key={round} className="mt-3" tracks={recommended} inPlaylist={inPlaylist} onAdd={onAdd} />
                  {canRefresh && (
                    <div className="mt-4 flex justify-end px-4">
                      <button
                        type="button"
                        onClick={() => setRound((r) => r + 1)}
                        className="group/refresh rf-music-press flex items-center gap-2 h-8 px-3 rounded-full text-sm font-bold text-white/70 hover:text-white"
                      >
                        <RefreshCw
                          size={15}
                          className="transition-transform duration-500 group-hover/refresh:rotate-180 group-hover/refresh:text-[color:var(--music-accent)]"
                          aria-hidden
                        />
                        Refresh
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="px-4 mt-4 text-sm text-white/50">Every song in your library is already here.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 min-w-0">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/60">{subtitle}</p>
    </div>
  );
}

function TrackList({
  tracks,
  inPlaylist,
  onAdd,
  className,
}: {
  tracks: MediaFile[];
  inPlaylist: (path: string) => boolean;
  onAdd: (file: MediaFile) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <AnimatePresence initial={true}>
        {tracks.map((file, i) => (
          <FinderRow key={file.path} index={i} file={file} added={inPlaylist(file.path)} onAdd={() => onAdd(file)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FinderRow({ file, index, added, onAdd }: { file: MediaFile; index: number; added: boolean; onAdd: () => void }) {
  const cover = bestCoverPath(file);
  const artist = trackArtistLabel(file);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 56 }}
      animate={{
        opacity: 1,
        y: 0,
        height: 56,
        transition: {
          duration: 0.28,
          ease: EASE,
          delay: Math.min(index, 12) * 0.03,
        },
      }}
      // Collapse instead of a layout animation: adding a song grows the tracklist above, which shifts this whole section.
      exit={{
        opacity: 0,
        x: 24,
        height: 0,
        transition: { duration: 0.24, ease: EASE },
      }}
      className="group/row grid items-center gap-4 overflow-hidden px-4 rounded-md transition-colors hover:bg-white/[0.07] grid-cols-[minmax(0,4fr)_auto] @lg:grid-cols-[minmax(0,4fr)_minmax(0,2fr)_minmax(120px,1fr)] @3xl:grid-cols-[minmax(0,4fr)_minmax(0,2fr)_minmax(0,1.3fr)_minmax(120px,1fr)]"
    >
      <div className="flex items-center gap-3 min-w-0">
        {cover ? (
          <img src={convertFileSrc(cover)} alt="" className="w-10 h-10 shrink-0 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-white/[0.07] text-white/40">
            <Music size={16} />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-base truncate text-white">{file.name}</div>
          {artist && (
            <div className="text-sm truncate text-white/60 group-hover/row:text-white/80 transition-colors">{artist}</div>
          )}
        </div>
      </div>
      <div className="hidden @lg:block min-w-0 text-sm truncate text-white/60 group-hover/row:text-white/80 transition-colors">
        {file.album?.trim() || ""}
      </div>
      <div className="hidden @3xl:block" aria-hidden />
      <div className="flex justify-end">
        <AnimatePresence mode="wait" initial={false}>
          {added ? (
            <motion.span
              key="added"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-1 w-[76px] h-8 text-sm font-bold text-[color:var(--music-accent)]"
            >
              <Check size={15} strokeWidth={3} /> Added
            </motion.span>
          ) : (
            <motion.button
              key="add"
              type="button"
              exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
              onClick={onAdd}
              className="rf-music-press w-[76px] h-8 rounded-full text-sm font-bold border border-white/40 text-white hover:border-[color:var(--music-accent)] hover:bg-[color-mix(in_srgb,var(--music-accent)_18%,transparent)]"
              aria-label={`Add ${file.name} to this playlist`}
            >
              Add
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
