import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { Home, Search, X } from "lucide-react";
import { RuForgeCaptureTrigger } from "@/components/dev-captures/RuForgeCaptureTrigger";
import { altKeyLabel, modKeyLabel } from "@/lib/shortcutLabels";
import { cn } from "@/lib/utils";
import { bestCoverPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MusicView } from "@/store/types";
import { MusicSearchSuggestions, type MusicSearchSuggestion } from "./MusicSearchSuggestions";
import { forgetMusicSearch, rememberMusicSearch, useMusicSearchHistory } from "./musicSearchHistory";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";
import { searchMusicLibrary } from "./musicLibrarySearch";
import type { PlayHistoryEntry } from "./musicPlayHistory";
import type { MediaFile } from "@/types";

/** material-symbols:youtube-music, inlined so it renders without the Iconify API. */
const YOUTUBE_MUSIC_ICON = {
  width: 24,
  height: 24,
  body: "<path fill=\"currentColor\" d=\"M12 22q-2.075 0-3.9-.788q-1.825-.787-3.175-2.137q-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175q1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138q1.35 1.35 2.137 3.175Q22 9.925 22 12t-.788 3.9q-.787 1.825-2.137 3.175q-1.35 1.35-3.175 2.137Q14.075 22 12 22Zm0-2.5q3.125 0 5.312-2.188Q19.5 15.125 19.5 12q0-3.125-2.188-5.312Q15.125 4.5 12 4.5q-3.125 0-5.312 2.188Q4.5 8.875 4.5 12q0 3.125 2.188 5.312Q8.875 19.5 12 19.5Zm0-1.5q-2.5 0-4.25-1.75T6 12q0-2.5 1.75-4.25T12 6q2.5 0 4.25 1.75T18 12q0 2.5-1.75 4.25T12 18Zm-2-2.5l5.5-3.5L10 8.5Z\"/>",
};

type RecentItem = Extract<MusicSearchSuggestion, { kind: "search" | "play" }>;

const MAX_RECENT_PLAYS = 8;
const MAX_SUGGESTIONS = 14;

const RED_HOVER = "hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]";

type Props = {
  activeView: MusicView;
  captureScreenLabel: string;
  onSelect: (view: MusicView) => void;
  /** Opens YouTube Music search results in Explore. */
  onSearchYoutubeMusic: (query: string) => void;
  /** Newest first. */
  recentPlays: PlayHistoryEntry[];
  onPlayFile: (file: MediaFile) => void;
};

/**
 * Spotify's top bar: Home button and a "What do you want to play?" pill in the titlebar band.
 * Centered like Spotify's. The Dynamic Island sits idle (hidden) on the music surface, so they don't collide.
 * Enter searches YouTube Music; the browse icon opens Explore.
 * App.tsx leaves a matching gap in the window drag strip.
 */
export function MusicTopBar({
  activeView,
  captureScreenLabel,
  onSelect,
  onSearchYoutubeMusic,
  recentPlays,
  onPlayFile,
}: Props) {
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useMusicSearchHistory();
  const tracks = useMusicLibraryTracks();
  const playlists = useMusicPlaylistRecords();
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const openMusicAlbum = useRuforgeStore((s) => s.openMusicAlbum);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);

  const libraryHits = useMemo(
    () => (focused ? searchMusicLibrary(query, tracks, playlists) : []),
    [focused, query, tracks, playlists],
  );

  const suggestions = useMemo((): MusicSearchSuggestion[] => {
    if (!focused) return [];
    const needle = query.trim().toLowerCase();
    const songPaths = new Set(libraryHits.flatMap((h) => (h.kind === "song" ? [h.file.path] : [])));
    const searches: RecentItem[] = history
      .filter((h) => !needle || h.query.toLowerCase().includes(needle))
      .map((h) => {
        const lower = h.query.toLowerCase();
        const hit = tracks.find((t) => t.name.toLowerCase().includes(lower));
        return { kind: "search", key: `s:${h.query}`, query: h.query, thumb: hit ? bestCoverPath(hit) : null, at: h.at };
      });
    const byPath = new Map(tracks.map((t) => [t.path, t]));
    const plays: RecentItem[] = [];
    for (const e of recentPlays) {
      if (plays.length >= MAX_RECENT_PLAYS) break;
      const file = byPath.get(e.path);
      if (!file || songPaths.has(e.path)) continue;
      if (needle && !`${e.title} ${e.artist}`.toLowerCase().includes(needle)) continue;
      plays.push({ kind: "play", key: `p:${e.path}`, file, title: e.title, artist: e.artist, thumb: bestCoverPath(file), at: e.playedAt });
    }
    const recent = [...searches, ...plays].sort((a, b) => b.at - a.at);
    if (!needle) return recent.slice(0, MAX_SUGGESTIONS);
    const youtube: MusicSearchSuggestion = { kind: "youtube", key: "yt", query: query.trim() };
    return [youtube, ...libraryHits, ...recent].slice(0, MAX_SUGGESTIONS);
  }, [focused, query, history, tracks, recentPlays, libraryHits]);
  const open = suggestions.length > 0;

  // Highlight what a bare Enter will do: the best library match, else the YouTube Music row.
  useEffect(() => {
    setActiveIndex(query.trim() ? (libraryHits.length > 0 ? 1 : 0) : -1);
  }, [query, focused, libraryHits.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const pick = (item: MusicSearchSuggestion) => {
    if (item.kind === "search") {
      setQuery(item.query);
      return;
    }
    const typed = query.trim();
    if (typed) rememberMusicSearch(typed);
    switch (item.kind) {
      case "youtube":
        onSearchYoutubeMusic(item.query);
        break;
      case "play":
      case "song":
        onPlayFile(item.file);
        break;
      case "playlist":
        openMusicPlaylist(item.id);
        break;
      case "album":
        openMusicAlbum(item.artistKey, item.albumKey);
        break;
      case "artist":
        openMusicArtist(item.artistKey);
        break;
    }
    if (item.kind !== "youtube") setQuery("");
    inputRef.current?.blur();
  };

  const homeActive = activeView === "home" && !musicDetail;
  const exploreActive = activeView === "explore";

  return (
    <div className="absolute inset-x-0 top-0 z-[60] h-[var(--rf-titlebar-h)] pointer-events-none">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto">
        <span className="rf-music-tooltip-anchor inline-flex" data-tooltip="RuForge Music">
          <RuForgeCaptureTrigger screenLabel={captureScreenLabel} imgClassName="h-7 w-7 rounded-md object-cover" />
        </span>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => onSelect("home")}
          className={cn(
            "rf-music-tooltip-anchor rf-music-press w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-white/[0.08] transition-colors duration-200",
            homeActive
              ? "text-[color:var(--music-accent)]"
              : cn("text-white/60 hover:text-white", RED_HOVER),
          )}
          aria-label={`Home (${altKeyLabel()}+1)`}
          aria-current={homeActive ? "page" : undefined}
          data-tooltip={`Home (${altKeyLabel()}+1)`}
        >
          <Home size={18} strokeWidth={homeActive ? 2.5 : 2} />
        </button>

        <div className="relative h-9 w-[min(420px,32vw)]">
          <AnimatePresence>
            {open && (
              <MusicSearchSuggestions
                items={suggestions}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onPick={pick}
                onRemoveSearch={forgetMusicSearch}
              />
            )}
          </AnimatePresence>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
              if (active) pick(active);
            }}
            className={cn(
              "relative flex h-9 items-center rounded-full border text-white/80 transition-colors duration-200",
              focused
                ? "border-white/[0.16] bg-white/[0.12]"
                : "border-transparent bg-white/[0.08] hover:bg-white/[0.11]",
            )}
          >
            <button
              type="submit"
              className="rf-music-press w-10 h-9 shrink-0 flex items-center justify-center rounded-full hover:text-white"
              aria-label="Search YouTube Music"
              tabIndex={-1}
            >
              <Search size={18} />
            </button>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  inputRef.current?.blur();
                } else if (e.key === "ArrowDown" && open) {
                  e.preventDefault();
                  setActiveIndex((i) => (i + 1) % suggestions.length);
                } else if (e.key === "ArrowUp" && open) {
                  e.preventDefault();
                  setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
                }
              }}
              placeholder="What do you want to play?"
              aria-label={`Search YouTube Music (${modKeyLabel()}+K)`}
              aria-expanded={open}
              aria-autocomplete="list"
              role="combobox"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 outline-none caret-[color:var(--music-accent)]"
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="rf-music-press w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect("explore")}
              className="rf-music-tooltip-anchor rf-music-press mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.1] pl-2 pr-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.16]"
              aria-label={`Explore YouTube Music (${altKeyLabel()}+2)`}
              aria-current={exploreActive ? "page" : undefined}
              data-tooltip={`Explore YouTube Music (${altKeyLabel()}+2)`}
            >
              <Icon
                icon={YOUTUBE_MUSIC_ICON}
                width={18}
                height={18}
                className={exploreActive ? "text-[color:var(--music-accent)]" : undefined}
                aria-hidden
              />
              Explore
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Half the widest Home + search group (36px Home, 8px gap, 420px pill), plus slack. App.tsx's drag strips stop here. */
export const MUSIC_TOP_BAR_HALF_WIDTH_PX = 240;
