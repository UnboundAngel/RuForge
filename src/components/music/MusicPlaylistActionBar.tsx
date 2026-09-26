import { useEffect, useRef, useState } from "react";
import {
  AlignJustify,
  Check,
  ListEnd,
  List,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Search,
  Shuffle,
  Trash2,
  X,
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

function anchorBelow(el: HTMLElement, align: "left" | "right"): Anchor {
  const r = el.getBoundingClientRect();
  return { x: align === "left" ? r.left : r.right - MUSIC_MENU_WIDTH, y: r.bottom + 6 };
}

const ICON_BTN =
  "w-10 h-10 flex items-center justify-center rounded-full text-white/60 transition-colors hover:text-white disabled:opacity-40 disabled:hover:text-white/60";

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
  const setSort = (sort: PlaylistSortKey) => {
    onPrefsChange({ ...prefs, sort, desc: sort === prefs.sort ? !prefs.desc : false });
    setSortAt(null);
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
          {searchOpen ? (
            <div className="flex items-center gap-2 h-8 w-56 rounded-md bg-white/[0.1] px-2 text-white/70">
              <Search size={16} className="shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onBlur={() => {
                  if (!query) setSearchOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onQueryChange("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search in playlist"
                aria-label="Search in playlist"
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onQueryChange("")}
                  className="shrink-0 text-white/60 hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 transition-colors hover:text-white hover:bg-white/[0.08]"
              aria-label="Search in playlist"
              title="Search in playlist"
            >
              <Search size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => setSortAt(sortAt ? null : anchorBelow(e.currentTarget, "right"))}
            className={cn(
              "flex items-center gap-2 h-8 px-2 text-sm text-white/70 transition-colors hover:text-white",
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
          <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.navigate}>
            {SORT_KEYS.map((key) => (
              <MusicMenuRow
                key={key}
                tone={MUSIC_MENU_TONES.navigate}
                icon={<span className="block w-[13px] text-center text-[10px]">{key === prefs.sort && key !== "custom" ? (prefs.desc ? "↓" : "↑") : ""}</span>}
                label={PLAYLIST_SORT_LABELS[key]}
                active={key === prefs.sort}
                onClick={() => setSort(key)}
                trailing={key === prefs.sort ? <Check size={14} className="shrink-0 text-[color:var(--music-accent)]" /> : undefined}
              />
            ))}
          </MusicMenuSection>
          <MusicMenuSection label="View as" tone={MUSIC_MENU_TONES.player}>
            {(["compact", "list"] as const).map((view) => (
              <MusicMenuRow
                key={view}
                tone={MUSIC_MENU_TONES.player}
                icon={view === "compact" ? <AlignJustify size={MUSIC_MENU_ICON_SIZE} /> : <List size={MUSIC_MENU_ICON_SIZE} />}
                label={view === "compact" ? "Compact" : "List"}
                active={prefs.view === view}
                onClick={() => {
                  onPrefsChange({ ...prefs, view });
                  setSortAt(null);
                }}
                trailing={prefs.view === view ? <Check size={14} className="shrink-0 text-[color:var(--music-accent)]" /> : undefined}
              />
            ))}
          </MusicMenuSection>
        </div>
      </MusicFloatingMenu>
    </div>
  );
}
