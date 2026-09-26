import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Music, Plus, RefreshCw, Search, X } from "lucide-react";
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

  // Rank once per library change or Refresh, not per add: adding a song re-weights the ranking,
  // and re-ranking then would reshuffle every card. Added songs just drop out and a spare slides in.
  const playlistRef = useRef(playlistTracks);
  playlistRef.current = playlistTracks;
  const pool = useMemo(
    () => recommendForPlaylist(libraryTracks, playlistRef.current, round, RECOMMEND_COUNT * 2),
    [libraryTracks, round],
  );
  const recommended = useMemo(
    () => pool.filter((t) => !inPlaylist(t.path)).slice(0, RECOMMEND_COUNT),
    [pool, inPlaylist],
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
                  <CardShelf title="Recommended" subtitle="Based on your library" tracks={recommended} onAdd={onAdd} />
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
              {recommended.length > 0 ? (
                <CardShelf
                  listKey={round}
                  title="Recommended"
                  subtitle="Based on what's in this playlist"
                  tracks={recommended}
                  onAdd={onAdd}
                  actions={
                    <>
                      {canRefresh && (
                        <button
                          type="button"
                          onClick={() => setRound((r) => r + 1)}
                          className="rf-music-press rf-music-tooltip-anchor w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]"
                          aria-label="Refresh recommendations"
                          data-tooltip="Refresh"
                        >
                          {/* One turn per click: the motion confirms the list changed. */}
                          <motion.span
                            className="flex"
                            initial={false}
                            animate={{ rotate: round * 360 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <RefreshCw size={16} aria-hidden />
                          </motion.span>
                        </button>
                      )}
                      <button type="button" onClick={() => setSearching(true)} className={PILL}>
                        <Search size={15} aria-hidden /> Find more
                      </button>
                    </>
                  }
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <SectionTitle title="Recommended" subtitle="Every song in your library is already here." />
                  <button type="button" onClick={() => setSearching(true)} className={cn(PILL, "mr-4 shrink-0")}>
                    <Search size={15} aria-hidden /> Find more
                  </button>
                </div>
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

const CARD_W = 168;
const CARD_GAP = 12;
const SCROLL_BTN =
  "rf-music-press w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.07] text-white/80 hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)] disabled:opacity-30 disabled:pointer-events-none";

/** Recommendations as a horizontal row of cover cards, paged with the arrows or a trackpad swipe. */
function CardShelf({
  title,
  subtitle,
  tracks,
  onAdd,
  actions,
  listKey,
}: {
  title: string;
  subtitle: string;
  tracks: MediaFile[];
  onAdd: (file: MediaFile) => void;
  actions?: React.ReactNode;
  /** Changing it re-deals the cards (Refresh) while the header, and its buttons, stay mounted. */
  listKey?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // Cards collapse over 240ms when added; re-check once they settle.
    const t = window.setTimeout(sync, 300);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [tracks]);

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(CARD_W + CARD_GAP, Math.floor(el.clientWidth / (CARD_W + CARD_GAP)) * (CARD_W + CARD_GAP));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  // Fade whichever edge still has cards behind it.
  const mask = `linear-gradient(to right, ${edges.left ? "transparent, black 48px" : "black"}, ${edges.right ? "black calc(100% - 48px), transparent" : "black"})`;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 pr-4">
        <SectionTitle title={title} subtitle={subtitle} />
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {(edges.left || edges.right) && (
            <>
              <button type="button" onClick={() => page(-1)} disabled={!edges.left} className={SCROLL_BTN} aria-label="Scroll left">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => page(1)} disabled={!edges.right} className={SCROLL_BTN} aria-label="Scroll right">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        key={listKey}
        ref={scrollRef}
        className="mt-4 flex overflow-x-auto scroll-smooth px-1 pb-2"
        style={{ scrollbarWidth: "none", maskImage: mask, WebkitMaskImage: mask }}
      >
        <AnimatePresence initial={true}>
          {tracks.map((file, i) => (
            <FinderCard key={file.path} index={i} file={file} onAdd={() => onAdd(file)} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FinderCard({ file, index, onAdd }: { file: MediaFile; index: number; onAdd: () => void }) {
  const cover = bestCoverPath(file);
  const artist = trackArtistLabel(file);
  const [added, setAdded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, width: CARD_W + CARD_GAP }}
      animate={{
        opacity: 1,
        y: 0,
        width: CARD_W + CARD_GAP,
        transition: { duration: 0.3, ease: EASE, delay: Math.min(index, 8) * 0.04 },
      }}
      // Shrink the slot so the cards to the right slide over and close the gap.
      exit={{ opacity: 0, scale: 0.85, width: 0, transition: { duration: 0.24, ease: EASE, delay: 0.25 } }}
      className="shrink-0 overflow-hidden"
      style={{ paddingRight: CARD_GAP }}
    >
      <div
        className="group/card w-[168px] p-2 rounded-lg transition-colors duration-200 hover:bg-white/[0.07]"
        title={artist ? `${file.name} · ${artist}` : file.name}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {cover ? (
            <img
              src={convertFileSrc(cover)}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <Music size={40} />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (added) return;
              setAdded(true);
              onAdd();
            }}
            className={cn(
              "rf-music-press rf-music-tooltip-anchor absolute bottom-2 right-2 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--music-accent)] text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
              "transition-[opacity,translate,scale] duration-200 hover:scale-105",
              added
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
            )}
            aria-label={`Add ${file.name} to this playlist`}
            data-tooltip={added ? "Added" : "Add to playlist"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={added ? "added" : "add"}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
                className="flex"
              >
                {added ? <Check size={20} strokeWidth={3} /> : <Plus size={22} strokeWidth={2.75} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <div className="mt-2 min-w-0">
          <div className="truncate text-sm font-bold text-white">{file.name}</div>
          <div className="truncate text-xs text-white/60 transition-colors group-hover/card:text-white/80">
            {artist || file.album?.trim() || "Unknown artist"}
          </div>
        </div>
      </div>
    </motion.div>
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
