import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlignJustify,
  ArrowUp,
  CalendarPlus,
  Check,
  Disc3,
  ListEnd,
  List,
  ListOrdered,
  MicVocal,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Search,
  Shuffle,
  Timer,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MUSIC_MENU_WIDTH,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import {
  PLAYLIST_SORT_LABELS,
  type PlaylistSortKey,
  type PlaylistViewPrefs,
} from "./musicPlaylistSort";

type Props = {
  title: string;
  empty: boolean;
  playing: boolean;
  shuffleOn: boolean;
  prefs: PlaylistViewPrefs;
  query: string;
  onPlay: () => void;
  onToggleShuffle: () => void;
  onAddToQueue: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPrefsChange: (prefs: PlaylistViewPrefs) => void;
  onQueryChange: (query: string) => void;
};

type Anchor = { x: number; y: number };

const SORT_KEYS: PlaylistSortKey[] = ["custom", "title", "artist", "album", "added", "duration"];

const SORT_ICONS: Record<PlaylistSortKey, LucideIcon> = {
  custom: ListOrdered,
  title: Type,
  artist: MicVocal,
  album: Disc3,
  added: CalendarPlus,
  duration: Timer,
};

const MARK_SPRING = { type: "spring", stiffness: 520, damping: 34 } as const;

function anchorBelow(el: HTMLElement, align: "left" | "right"): Anchor {
  const r = el.getBoundingClientRect();
  return { x: align === "left" ? r.left : r.right - MUSIC_MENU_WIDTH, y: r.bottom + 6 };
}

const ICON_BTN =
  "rf-music-press w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-40 disabled:hover:text-white/60";

export function MusicPlaylistActionBar({
  title,
  empty,
  playing,
  shuffleOn,
  prefs,
  query,
  onPlay,
  onToggleShuffle,
  onAddToQueue,
  onRename,
  onDelete,
  onPrefsChange,
  onQueryChange,
}: Props) {
  const [moreAt, setMoreAt] = useState<Anchor | null>(null);
  const [sortAt, setSortAt] = useState<Anchor | null>(null);
  const [searchOpen, setSearchOpen] = useState(query.length > 0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const pick = (fn: () => void) => () => {
    fn();
    setMoreAt(null);
  };
  // The menu stays open on pick, like Spotify's, so the check can slide to the new row.
  const setSort = (sort: PlaylistSortKey) => {
    onPrefsChange({ ...prefs, sort, desc: sort === prefs.sort ? !prefs.desc : false });
  };
  const closeSearch = () => {
    onQueryChange("");
    setSearchOpen(false);
  };

  return (
    <div className="flex items-center gap-5 px-6 py-5">
      {!empty && (
        <>
          <button
            type="button"
            onClick={onPlay}
            className="w-14 h-14 shrink-0 flex items-center justify-center rounded-full bg-[var(--music-accent)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 active:scale-95"
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          >
            {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={onToggleShuffle}
            className={cn(ICON_BTN, "relative", shuffleOn && "text-[color:var(--music-accent)] hover:text-[color:var(--music-accent)]")}
            aria-label={shuffleOn ? "Disable shuffle" : "Enable shuffle"}
            aria-pressed={shuffleOn}
            title={shuffleOn ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle size={26} />
            {shuffleOn && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--music-accent)]" />
            )}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={(e) => setMoreAt(moreAt ? null : anchorBelow(e.currentTarget, "left"))}
        className={cn(ICON_BTN, moreAt && "text-white")}
        aria-label={`More options for ${title}`}
        title={`More options for ${title}`}
      >
        <MoreHorizontal size={28} />
      </button>

      {!empty && (
        <div className="ml-auto flex items-center gap-2">
          {/* Grows out of the icon, like Spotify's "Search in playlist". */}
          <div
            className={cn(
              "group/psearch flex items-center h-8 rounded-md overflow-hidden transition-[width,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              searchOpen
                ? "w-56 bg-white/[0.1] focus-within:ring-2 focus-within:ring-[color:var(--music-accent)]"
                : "w-8",
            )}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                if (searchOpen) e.preventDefault();
              }}
              onClick={() => (searchOpen ? searchRef.current?.focus() : setSearchOpen(true))}
              tabIndex={searchOpen ? -1 : 0}
              className={cn(
                "rf-music-press rf-music-tooltip-anchor w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-white/60 hover:text-white",
                "group-focus-within/psearch:text-[color:var(--music-accent)]",
                !searchOpen && "hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]",
              )}
              aria-label="Search in playlist"
              data-tooltip={searchOpen ? undefined : "Search in playlist"}
            >
              <Search size={searchOpen ? 16 : 18} className="transition-[width,height] duration-300" />
            </button>
            <input
              ref={searchRef}
              value={query}
              tabIndex={searchOpen ? 0 : -1}
              onChange={(e) => onQueryChange(e.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search in playlist"
              aria-label="Search in playlist"
              aria-hidden={!searchOpen}
              className={cn(
                "min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none caret-[color:var(--music-accent)] transition-opacity duration-200",
                searchOpen ? "opacity-100 delay-100" : "opacity-0 pointer-events-none",
              )}
            />
            <AnimatePresence>
              {searchOpen && query && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.15 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onQueryChange("")}
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-white/60 hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={(e) => setSortAt(sortAt ? null : anchorBelow(e.currentTarget, "right"))}
            className={cn(
              "rf-music-press-soft flex items-center gap-2 h-8 px-2 rounded-full text-sm text-white/70 hover:text-white",
              sortAt && "text-white",
            )}
          >
            {PLAYLIST_SORT_LABELS[prefs.sort]}
            {prefs.view === "compact" ? <AlignJustify size={16} /> : <List size={16} />}
          </button>
        </div>
      )}

      <MusicFloatingMenu
        open={moreAt != null}
        x={moreAt?.x ?? 0}
        y={moreAt?.y ?? 0}
        onClose={() => setMoreAt(null)}
        ariaLabel={`${title} options`}
      >
        <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.queue}
            icon={<ListEnd size={MUSIC_MENU_ICON_SIZE} />}
            label="Add to queue"
            onClick={empty ? undefined : pick(onAddToQueue)}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            icon={<Pencil size={MUSIC_MENU_ICON_SIZE} />}
            label="Rename"
            onClick={pick(onRename)}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            icon={<Trash2 size={MUSIC_MENU_ICON_SIZE} />}
            label="Delete"
            onClick={pick(onDelete)}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>

      <MusicFloatingMenu
        open={sortAt != null}
        x={sortAt?.x ?? 0}
        y={sortAt?.y ?? 0}
        onClose={() => setSortAt(null)}
        ariaLabel="Sort and view"
      >
        <div className="flex flex-col gap-1">
          <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.playback}>
            {SORT_KEYS.map((key) => {
              const SortIcon = SORT_ICONS[key];
              const active = key === prefs.sort;
              return (
                <MusicMenuRow
                  key={key}
                  tone={MUSIC_MENU_TONES.playback}
                  icon={<SortIcon size={MUSIC_MENU_ICON_SIZE} />}
                  label={PLAYLIST_SORT_LABELS[key]}
                  active={active}
                  onClick={() => setSort(key)}
                  trailing={
                    active ? <MenuMark layoutId="playlist-sort-mark" desc={key === "custom" && !prefs.desc ? null : prefs.desc} /> : undefined
                  }
                />
              );
            })}
          </MusicMenuSection>
          <MusicMenuSection label="View as" tone={MUSIC_MENU_TONES.playback}>
            {(["compact", "list"] as const).map((view) => (
              <MusicMenuRow
                key={view}
                tone={MUSIC_MENU_TONES.playback}
                icon={view === "compact" ? <AlignJustify size={MUSIC_MENU_ICON_SIZE} /> : <List size={MUSIC_MENU_ICON_SIZE} />}
                label={view === "compact" ? "Compact" : "List"}
                active={prefs.view === view}
                onClick={() => onPrefsChange({ ...prefs, view })}
                trailing={prefs.view === view ? <MenuMark layoutId="playlist-view-mark" desc={null} /> : undefined}
              />
            ))}
          </MusicMenuSection>
        </div>
      </MusicFloatingMenu>
    </div>
  );
}

/**
 * The red check on the active row. It pops in when the menu opens and slides to the
 * new row on a pick (shared layoutId); the arrow flips when the direction does.
 */
function MenuMark({ layoutId, desc }: { layoutId: string; desc: boolean | null }) {
  return (
    <motion.span
      layoutId={layoutId}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={MARK_SPRING}
      className="flex items-center gap-1 shrink-0 text-[color:var(--music-accent)]"
    >
      {desc != null && (
        <motion.span
          initial={false}
          animate={{ rotate: desc ? 180 : 0 }}
          transition={MARK_SPRING}
          className="flex"
        >
          <ArrowUp size={12} strokeWidth={2.5} />
        </motion.span>
      )}
      <Check size={14} strokeWidth={3} />
    </motion.span>
  );
}
