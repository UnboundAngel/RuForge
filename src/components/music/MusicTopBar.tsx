import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Home, Search, X } from "lucide-react";
import { RuForgeCaptureTrigger } from "@/components/dev-captures/RuForgeCaptureTrigger";
import { cn } from "@/lib/utils";
import type { MusicView } from "@/store/types";

/** material-symbols:youtube-music, inlined so it renders without the Iconify API. */
const YOUTUBE_MUSIC_ICON = {
  width: 24,
  height: 24,
  body: "<path fill=\"currentColor\" d=\"M12 22q-2.075 0-3.9-.788q-1.825-.787-3.175-2.137q-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175q1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138q1.35 1.35 2.137 3.175Q22 9.925 22 12t-.788 3.9q-.787 1.825-2.137 3.175q-1.35 1.35-3.175 2.137Q14.075 22 12 22Zm0-2.5q3.125 0 5.312-2.188Q19.5 15.125 19.5 12q0-3.125-2.188-5.312Q15.125 4.5 12 4.5q-3.125 0-5.312 2.188Q4.5 8.875 4.5 12q0 3.125 2.188 5.312Q8.875 19.5 12 19.5Zm0-1.5q-2.5 0-4.25-1.75T6 12q0-2.5 1.75-4.25T12 6q2.5 0 4.25 1.75T18 12q0 2.5-1.75 4.25T12 18Zm-2-2.5l5.5-3.5L10 8.5Z\"/>",
};

type Props = {
  activeView: MusicView;
  captureScreenLabel: string;
  onSelect: (view: MusicView) => void;
  /** Opens YouTube Music search results in Explore. */
  onSearchYoutubeMusic: (query: string) => void;
};

/**
 * Spotify's top bar: Home button and a "What do you want to play?" pill in the titlebar band.
 * Spotify centers it; RuForge's Dynamic Island owns the center, so the group docks just left of it.
 * Enter searches YouTube Music; the browse icon opens Explore.
 * App.tsx leaves a matching gap in the window drag strip.
 */
export function MusicTopBar({ activeView, captureScreenLabel, onSelect, onSearchYoutubeMusic }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    onSearchYoutubeMusic(q);
    inputRef.current?.blur();
  };

  const homeActive = activeView === "home";
  const exploreActive = activeView === "explore";

  return (
    <div className="absolute inset-x-0 top-0 z-[60] h-[var(--rf-titlebar-h)] pointer-events-none">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto">
        <span className="rf-music-tooltip-anchor inline-flex" data-tooltip="RuForge Music">
          <RuForgeCaptureTrigger screenLabel={captureScreenLabel} imgClassName="h-7 w-7 rounded-md object-cover" />
        </span>
      </div>

      <div
        className="absolute top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto"
        style={{ right: `calc(50% + ${MUSIC_TOP_BAR_ISLAND_CLEARANCE_PX}px)` }}
      >
        <button
          type="button"
          onClick={() => onSelect("home")}
          className={cn(
            "rf-music-tooltip-anchor w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white/[0.07] transition-[transform,background-color,color] hover:scale-105 hover:bg-white/[0.12]",
            homeActive ? "text-white" : "text-white/60 hover:text-white",
          )}
          aria-label="Home (Alt+1)"
          aria-current={homeActive ? "page" : undefined}
          data-tooltip="Home (Alt+1)"
        >
          <Home size={20} fill={homeActive ? "currentColor" : "none"} />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="group/search flex items-center h-10 w-[min(420px,32vw)] rounded-full bg-white/[0.07] text-white/60 transition-colors hover:bg-white/[0.1] focus-within:bg-white/[0.1] focus-within:ring-2 focus-within:ring-white/80"
        >
          <button
            type="submit"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-colors hover:text-white"
            aria-label="Search YouTube Music"
            tabIndex={-1}
          >
            <Search size={20} />
          </button>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                inputRef.current?.blur();
              }
            }}
            placeholder="What do you want to play?"
            aria-label="Search YouTube Music (Ctrl+K)"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="w-8 h-8 shrink-0 flex items-center justify-center text-white/60 hover:text-white"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <span className="h-6 w-px shrink-0 bg-white/20" aria-hidden />
          <button
            type="button"
            onClick={() => onSelect("explore")}
            className={cn(
              "rf-music-tooltip-anchor w-11 h-10 shrink-0 flex items-center justify-center rounded-r-full transition-colors hover:text-white",
              exploreActive && "text-white",
            )}
            aria-label="Explore YouTube Music (Alt+2)"
            aria-current={exploreActive ? "page" : undefined}
            data-tooltip="Explore YouTube Music (Alt+2)"
          >
            <Icon icon={YOUTUBE_MUSIC_ICON} width={22} height={22} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Space kept between the bar's right edge and the window center (the idle Dynamic Island). */
export const MUSIC_TOP_BAR_ISLAND_CLEARANCE_PX = 76;
/** Widest the Home + search group gets (40px Home, 8px gap, 420px pill), plus slack. */
export const MUSIC_TOP_BAR_MAX_WIDTH_PX = 476;
