import { Icon } from "@iconify/react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AnimatedEmptyStage } from "@/components/ui/page-not-found";

type Props = {
  searchQuery: string;
  activeFilter: "all" | "relax" | "focus";
  onClear: () => void;
  onSearchYoutubeMusic?: (query: string) => void;
};

function EmptyActions({
  clearLabel,
  onClear,
  onSearchYoutubeMusic,
  searchQuery,
}: {
  clearLabel: string;
  onClear: () => void;
  onSearchYoutubeMusic?: (query: string) => void;
  searchQuery?: string;
}) {
  return (
    <div className="rf-music-search-empty-actions mt-8">
      <button
        type="button"
        className="rf-music-search-empty-btn rf-music-search-empty-btn--outline"
        onClick={onClear}
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{clearLabel}</span>
      </button>
      {searchQuery !== undefined && (
        <button
          type="button"
          className="rf-music-search-empty-btn rf-music-search-empty-btn--solid"
          disabled={!onSearchYoutubeMusic}
          onClick={() => onSearchYoutubeMusic?.(searchQuery)}
        >
          <Icon
            icon="material-symbols:youtube-music"
            width={16}
            height={16}
            aria-hidden
            className="rf-music-search-empty-ytm-icon"
          />
          <span>YouTube Music</span>
          <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function MusicHomeSearchEmpty({
  searchQuery,
  activeFilter,
  onClear,
  onSearchYoutubeMusic,
}: Props) {
  const trimmedQuery = searchQuery.trim();
  const hasSearch = trimmedQuery.length > 0;
  const hasFilter = activeFilter !== "all";

  if (hasSearch) {
    const clearLabel = hasFilter ? "Clear filters & search" : "Clear search";

    return (
      <div className="rf-music-search-empty">
        <AnimatedEmptyStage revealDelayMs={1200}>
          <p className="text-[clamp(1.25rem,3vw,2rem)] font-semibold text-black m-[1%]">
            No music found yet
          </p>
          <p
            className="text-[clamp(2.5rem,8vw,5rem)] font-bold text-black m-[1%] leading-none max-w-full truncate px-2"
            title={trimmedQuery}
          >
            {trimmedQuery}
          </p>
          <p className="text-[15px] w-full max-w-md text-center text-black/80 m-[1%] leading-relaxed">
            Nothing in your library matches this yet. Open YouTube Music to find it, then grab
            tracks from Explore.
          </p>
          <EmptyActions
            clearLabel={clearLabel}
            onClear={onClear}
            onSearchYoutubeMusic={onSearchYoutubeMusic}
            searchQuery={trimmedQuery}
          />
        </AnimatedEmptyStage>
      </div>
    );
  }

  return (
    <div className="rf-music-search-empty">
      <AnimatedEmptyStage revealDelayMs={900}>
        <p className="text-[clamp(1.25rem,3vw,2rem)] font-semibold text-black m-[1%]">
          No matches
        </p>
        <p className="text-[clamp(2rem,6vw,4rem)] font-bold text-black m-[1%] leading-none capitalize">
          {activeFilter}
        </p>
        <p className="text-[15px] w-full max-w-md text-center text-black/80 m-[1%] leading-relaxed">
          This mood filter didn&apos;t turn up anything. Try another chip or search above.
        </p>
        <EmptyActions clearLabel="Clear filters" onClear={onClear} />
      </AnimatedEmptyStage>
    </div>
  );
}
