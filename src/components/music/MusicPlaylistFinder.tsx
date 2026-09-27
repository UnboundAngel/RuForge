import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Music, RefreshCw, Search, X } from "lucide-react";
import { bestCoverPath } from "@/mediaKind";
import { cn } from "@/lib/utils";
import type { MediaFile } from "@/types";
import { filterTracksByQuery, trackArtistLabel } from "./musicPlaylists";
import { recommendForPlaylist } from "./musicPlaylistRecommend";
import { type OutsideTrack, fileVideoId } from "./musicOutsideRecommend";
import { usePinWhileListGrows } from "./usePinWhileListGrows";
import {
  FOLLOW_UP_COUNT,
  type ShelfItem,
  layoutShelf,
  shelfKey,
  shelfKeys,
  similarLibrarySongs,
} from "./musicShelfFollowUps";
import {
  currentHiddenMatcher,
  hideShelfArtist,
  hideShelfSong,
  makeHiddenMatcher,
  unhideArtist,
  unhideSong,
  useHiddenRecommendations,
} from "./musicHiddenRecommendations";
import { showMusicToast } from "./musicToast";
import { CardShelf, SectionTitle } from "./MusicRecommendedShelf";
import { MusicHiddenRecommendationsButton } from "./MusicHiddenRecommendationsButton";
import { fetchSimilarOutside, useOutsideRecommendations } from "./useMusicOutsideRecommendations";

type Props = {
  /** Outside songs are downloaded into this playlist. */
  playlistId: string;
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
/** YouTube Music songs appended after the library cards. */
const OUTSIDE_COUNT = 6;
const EASE = [0.22, 1, 0.36, 1] as const;
const NO_FOLLOW_UPS: ReadonlyMap<string, ShelfItem[]> = new Map();
const NO_KEYS: ReadonlySet<string> = new Set();
/** Longest an added card waits on its YouTube Music radio before stepping aside. */
const FOLLOW_UP_HOLD_MS = 6000;

const localItem = (file: MediaFile): ShelfItem => ({ kind: "local", file });
const outsideItem = (track: OutsideTrack): ShelfItem => ({ kind: "outside", track });

const TEXT_ACTION =
  "rf-music-press-soft flex items-center gap-1.5 h-8 px-1 text-sm font-bold text-white/60 transition-colors hover:text-white";
const VIEW_FADE = { duration: 0.15, ease: "easeOut" } as const;

/**
 * Spotify's block under a playlist: "Recommended" songs with Add and Refresh,
 * and a "Find more" search. Rows share the tracklist's padding so the columns line up.
 */
export function MusicPlaylistFinder({
  playlistId,
  libraryTracks,
  playlistTracks,
  inPlaylist,
  onAdd,
  prominent,
  autoFocus,
}: Props) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [round, setRound] = useState(0);

  const hiddenState = useHiddenRecommendations();
  const isHidden = useMemo(() => makeHiddenMatcher(hiddenState), [hiddenState]);
  const isHiddenRef = useRef(isHidden);
  isHiddenRef.current = isHidden;
  const visibleLibrary = useCallback(
    (tracks: MediaFile[]) => tracks.filter((t) => !isHiddenRef.current(localItem(t))),
    [],
  );

  // Rank once per library change or Refresh, not per add or hide: either re-weights the ranking,
  // and re-ranking then would reshuffle every card. Those songs just drop out and a spare slides in.
  const playlistRef = useRef(playlistTracks);
  playlistRef.current = playlistTracks;
  const pool = useMemo(
    () => recommendForPlaylist(visibleLibrary(libraryTracks), playlistRef.current, round, RECOMMEND_COUNT * 2),
    [libraryTracks, round, visibleLibrary],
  );
  const recommended = useMemo(
    () => pool.filter((t) => !inPlaylist(t.path) && !isHidden(localItem(t))).slice(0, RECOMMEND_COUNT),
    [pool, inPlaylist, isHidden],
  );

  // YouTube Music is asked only once the shelf scrolls into view, and seeds follow the same
  // "rank per library change or Refresh" rule so adding a song doesn't refetch.
  const sectionRef = useRef<HTMLElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || onScreen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setOnScreen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onScreen, libraryTracks.length]);
  usePinWhileListGrows(sectionRef, playlistTracks.length);
  const hasPlaylistTracks = playlistTracks.length > 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seedTracks = useMemo(() => playlistRef.current, [libraryTracks, round, hasPlaylistTracks]);
  const excludeOutside = useCallback((t: OutsideTrack) => isHidden(outsideItem(t)), [isHidden]);
  const outside = useOutsideRecommendations({
    playlistTracks: seedTracks,
    library: libraryTracks,
    round,
    count: OUTSIDE_COUNT,
    active: onScreen && !prominent,
    exclude: excludeOutside,
  });

  // Refresh helps when the library holds more candidates than one page shows, or YouTube Music can deal more.
  const canRefresh = libraryTracks.length - playlistTracks.length > RECOMMEND_COUNT || outside.available;

  // The shelf holds still while you add: added cards keep their slot (so what they bring in lands
  // beside them) and YouTube Music's first deal stays put while its downloads land.
  // An add can rebuild the library list, and re-ranking then drops the added card and its follow-ups.
  const [localDealt, setLocalDealt] = useState<{ round: number; pool: MediaFile[] }>({ round: -1, pool: [] });
  useEffect(() => {
    if (pool.length > 0 && localDealt.round !== round) setLocalDealt({ round, pool });
  }, [pool, round, localDealt.round]);
  const localBase = useMemo(() => {
    const dealt = localDealt.round === round ? localDealt.pool : pool;
    const inLibrary = new Set(libraryTracks.map((t) => t.path));
    const out: MediaFile[] = [];
    let shown = 0;
    for (const t of dealt) {
      if (!inLibrary.has(t.path)) continue;
      if (shown >= RECOMMEND_COUNT) break;
      out.push(t);
      if (!inPlaylist(t.path)) shown++;
    }
    return out;
  }, [localDealt, round, pool, libraryTracks, inPlaylist]);
  const [outsideDealt, setOutsideDealt] = useState<{ round: number; tracks: OutsideTrack[] }>({ round: -1, tracks: [] });
  useEffect(() => {
    if (outside.tracks.length > 0 && outsideDealt.round !== round) setOutsideDealt({ round, tracks: outside.tracks });
  }, [outside.tracks, round, outsideDealt.round]);
  const outsideBase = !outside.available ? [] : outsideDealt.round === round ? outsideDealt.tracks : outside.tracks;
  const base = useMemo<ShelfItem[]>(
    () => [...localBase.map(localItem), ...outsideBase.map(outsideItem)],
    [localBase, outsideBase],
  );

  // Spotify: adding a card slips two similar songs in right behind it. Refresh starts over.
  const [followState, setFollowState] = useState<{ round: number; map: ReadonlyMap<string, ShelfItem[]> }>({
    round,
    map: NO_FOLLOW_UPS,
  });
  const followUps = followState.round === round ? followState.map : NO_FOLLOW_UPS;
  // An added card holds its slot while its similar songs load, so the swap happens once instead of in two jumps.
  const [holding, setHolding] = useState<ReadonlySet<string>>(() => new Set());
  const baseRef = useRef(base);
  baseRef.current = base;
  const roundRef = useRef(round);
  roundRef.current = round;
  /** `extra` caps how many new cards join the anchor; by default it fills up to FOLLOW_UP_COUNT. */
  const appendFollowUps = useCallback((anchor: string, items: ShelfItem[], forRound: number, extra?: number) => {
    if (roundRef.current !== forRound || items.length === 0) return;
    const hidden = currentHiddenMatcher();
    setFollowState((prev) => {
      const map = new Map(prev.round === forRound ? prev.map : NO_FOLLOW_UPS);
      const taken = shelfKeys(baseRef.current, map);
      const have = map.get(anchor) ?? [];
      const room = extra ?? FOLLOW_UP_COUNT - have.length;
      const fresh = items.filter((i) => !taken.has(shelfKey(i)) && !hidden(i)).slice(0, room);
      if (fresh.length === 0) return prev;
      map.set(anchor, [...have, ...fresh]);
      return { round: forRound, map };
    });
  }, []);

  const bringSimilar = (item: ShelfItem) => {
    const anchor = shelfKey(item);
    const forRound = round;
    const taken = shelfKeys(base, followUps);
    // Library songs by the same artist or album first; the song's YouTube Music radio tops up the rest.
    const local =
      item.kind === "local"
        ? similarLibrarySongs(item.file, visibleLibrary(libraryTracks), (path) => taken.has(path) || inPlaylist(path)).map(
            localItem,
          )
        : [];
    appendFollowUps(anchor, local, forRound);
    if (local.length >= FOLLOW_UP_COUNT || !playlistId) return;
    const videoId = item.kind === "local" ? fileVideoId(item.file) : item.track.videoId;
    if (!videoId) return;
    const holdKey = `${forRound}:${anchor}`;
    setHolding((prev) => new Set(prev).add(holdKey));
    const release = () =>
      setHolding((prev) => {
        if (!prev.has(holdKey)) return prev;
        const next = new Set(prev);
        next.delete(holdKey);
        return next;
      });
    // A slow radio must not pin the added card forever; late results still slide in when they come.
    const cap = window.setTimeout(release, FOLLOW_UP_HOLD_MS);
    void fetchSimilarOutside(videoId, libraryTracks).then((tracks) => {
      appendFollowUps(anchor, tracks.map(outsideItem), forRound);
      window.clearTimeout(cap);
      release();
    });
  };

  const ownedVideoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of libraryTracks) {
      const id = fileVideoId(t);
      if (id) ids.add(id);
    }
    return ids;
  }, [libraryTracks]);
  const shelfItems = useMemo(
    () =>
      layoutShelf(
        base,
        followUps,
        (item) =>
          isHidden(item) ||
          (!holding.has(`${round}:${shelfKey(item)}`) &&
            (item.kind === "local" ? inPlaylist(item.file.path) : ownedVideoIds.has(item.track.videoId))),
      ),
    [base, followUps, inPlaylist, ownedVideoIds, holding, round, isHidden],
  );

  // Hidden cards grow back in on Undo, while the spare that took their slot collapses.
  const [hiddenNow, setHiddenNow] = useState<{ round: number; keys: ReadonlySet<string> }>({ round, keys: NO_KEYS });
  const grownKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const items of followUps.values()) for (const i of items) keys.add(shelfKey(i));
    if (hiddenNow.round === round) for (const k of hiddenNow.keys) keys.add(k);
    return keys;
  }, [followUps, hiddenNow, round]);

  const hideCard = (item: ShelfItem, scope: "song" | "artist") => {
    const song = scope === "song" ? hideShelfSong(item) : null;
    const artist = scope === "artist" ? hideShelfArtist(item) : null;
    if (!song && !artist) return;
    const hidden = currentHiddenMatcher();
    const victims = shelfItems.filter(hidden);
    setHiddenNow((prev) => {
      const keys = new Set(prev.round === round ? prev.keys : NO_KEYS);
      for (const v of victims) keys.add(shelfKey(v));
      return { round, keys };
    });

    // The spare takes the hidden card's slot, so nothing else on the shelf moves.
    if (!prominent) {
      const taken = shelfKeys(base, followUps);
      const dealt = localDealt.round === round ? localDealt.pool : pool;
      const moreLocal = recommendForPlaylist(visibleLibrary(libraryTracks), playlistRef.current, round, RECOMMEND_COUNT * 4);
      const localSpares = [...dealt, ...moreLocal]
        .map(localItem)
        .filter((i) => i.kind === "local" && !taken.has(shelfKey(i)) && !inPlaylist(i.file.path) && !hidden(i));
      const outsideSpares = outside.pool
        .map(outsideItem)
        .filter((i) => i.kind === "outside" && !taken.has(shelfKey(i)) && !ownedVideoIds.has(i.track.videoId) && !hidden(i));
      for (const v of victims) {
        const spares = v.kind === "local" ? [...localSpares, ...outsideSpares] : [...outsideSpares, ...localSpares];
        appendFollowUps(shelfKey(v), spares, round, 1);
      }
    }

    if (song) {
      showMusicToast("Hidden from recommendations", "info", { label: "Undo", run: () => unhideSong(song.id) });
    } else if (artist) {
      showMusicToast(`Songs by ${artist.name} won't be recommended`, "info", {
        label: "Undo",
        run: () => unhideArtist(artist.key),
      });
    }
  };

  const hasShelf = shelfItems.length > 0 || outside.loading;
  const results = useMemo(() => filterTracksByQuery(libraryTracks, query), [libraryTracks, query]);

  const searchOpen = prominent || searching;
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  if (libraryTracks.length === 0) return null;

  return (
    <section ref={sectionRef} className={cn("@container px-4", prominent ? "mt-2 pb-10" : "mt-14 pb-3")}>
      <div className={cn(!prominent && "rf-music-shelf-shade rounded-[1.75rem] pt-7 px-2 pb-1")}>
        <AnimatePresence mode="wait" initial={false}>
          {searchOpen ? (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={VIEW_FADE}
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
                  <CardShelf
                    title="Recommended"
                    subtitle="Based on your library"
                    items={recommended.map(localItem)}
                    onAdd={onAdd}
                    onHide={hideCard}
                    actions={<MusicHiddenRecommendationsButton />}
                  />
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="recommended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={VIEW_FADE}
            >
              {hasShelf ? (
                <CardShelf
                  listKey={round}
                  title="Recommended"
                  subtitle="Based on what's in this playlist"
                  items={shelfItems}
                  grownKeys={grownKeys}
                  onAdd={(file) => {
                    onAdd(file);
                    bringSimilar(localItem(file));
                  }}
                  onOutsideAdd={(track) => bringSimilar(outsideItem(track))}
                  onHide={hideCard}
                  outsideLoading={outside.loading}
                  playlistId={playlistId}
                  actions={
                    <>
                      <MusicHiddenRecommendationsButton />
                      <button type="button" onClick={() => setSearching(true)} className={TEXT_ACTION}>
                        Find more
                      </button>
                    </>
                  }
                  footer={
                    canRefresh && (
                      <button
                        type="button"
                        onClick={() => setRound((r) => r + 1)}
                        className="rf-music-press-soft flex shrink-0 items-center gap-1 font-semibold text-white/60 transition-colors hover:text-white before:mr-1 before:content-['·'] before:text-white/40"
                        aria-label="Refresh recommendations"
                      >
                        {/* RefreshCw is symmetric at 180 degrees, so a half turn reads as a full refresh. */}
                        <motion.span
                          className="flex"
                          initial={false}
                          animate={{ rotate: round * 180 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          <RefreshCw size={13} aria-hidden />
                        </motion.span>
                        Refresh
                      </button>
                    )
                  }
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <SectionTitle title="Recommended" subtitle="Every song in your library is already here." />
                  <div className="mr-4 flex shrink-0 items-center gap-3">
                    <MusicHiddenRecommendationsButton />
                    <button type="button" onClick={() => setSearching(true)} className={TEXT_ACTION}>
                      Find more
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
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
