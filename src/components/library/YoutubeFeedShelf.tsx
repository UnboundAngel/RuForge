import { useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { openExplorerForLogin } from "@/lib/openExplorerForLogin";
import { FeedVideoCard } from "./FeedVideoCard";
import { loadMoreYoutubeFeed, loadYoutubeFeed, useYoutubeFeed, useYoutubeFeedAvailability } from "./useYoutubeFeed";
import { feedWithoutLibrary } from "./youtubeFeed";

const COLLAPSED_ROWS = 2;
const ROWS_PER_SHOW_MORE = 3;

function ShelfSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3" aria-hidden>
          <div className="aspect-video rounded-[var(--r-media,16px)] bg-white/[0.05] animate-pulse" />
          <div className="space-y-2 px-0.5">
            <div className="h-3.5 w-4/5 rounded bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-pulse" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The user's YouTube home feed inside the library, minus what they already have. A tonal panel
 * so it never reads as part of the downloaded grid around it.
 */
export function YoutubeFeedShelf({
  columns,
  gridClass,
  gridStyle,
  libraryIds,
}: {
  columns: number;
  gridClass: string;
  gridStyle: React.CSSProperties;
  libraryIds: ReadonlySet<string>;
}) {
  const { signedIn, sessionPending } = useYoutubeFeedAvailability();
  const feed = useYoutubeFeed(true);
  const [rows, setRows] = useState(COLLAPSED_ROWS);
  const items = useMemo(() => feedWithoutLibrary(feed.items, libraryIds), [feed.items, libraryIds]);
  const visible = items.slice(0, rows * columns);
  const canShowMore = items.length > visible.length || feed.hasMore;
  const expanded = rows > COLLAPSED_ROWS;

  const showMore = () => {
    const next = rows + ROWS_PER_SHOW_MORE;
    setRows(next);
    if (items.length < next * columns) void loadMoreYoutubeFeed();
  };

  let body: React.ReactNode;
  if (!signedIn) {
    body = sessionPending ? (
      <div className={gridClass} style={gridStyle}>
        <ShelfSkeleton count={columns} />
      </div>
    ) : (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-sm font-medium text-stone-400">
          sign into YouTube and your feed shows up right here, ready to preview and grab.
        </p>
        <button
          type="button"
          onClick={() => openExplorerForLogin()}
          className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-[12px] font-bold text-stone-900 transition-transform active:scale-95"
        >
          Sign in to YouTube
        </button>
      </div>
    );
  } else if (!feed.loaded || (feed.loading && items.length === 0)) {
    body = (
      <div className={gridClass} style={gridStyle}>
        <ShelfSkeleton count={columns * COLLAPSED_ROWS} />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <p className="py-2 text-sm font-medium text-stone-400">
        {feed.error ? "couldn't reach your feed, try refreshing in a bit" : "you've grabbed everything we found. refresh for more"}
      </p>
    );
  } else {
    body = (
      <div className={gridClass} style={gridStyle}>
        {visible.map((video) => (
          <FeedVideoCard key={video.videoId} video={video} />
        ))}
        {feed.loading && expanded ? <ShelfSkeleton count={columns} /> : null}
      </div>
    );
  }

  return (
    <section className="-mx-4 rounded-[28px] bg-white/[0.035] px-4 pb-4 pt-5 xl:-mx-6 xl:px-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-stone-50">From your YouTube feed</h2>
          <p className="mt-1 text-[13px] font-medium text-stone-500">Preview anything, download what you like.</p>
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={() => {
              setRows(COLLAPSED_ROWS);
              void loadYoutubeFeed({ force: true });
            }}
            disabled={feed.loading}
            data-tooltip="New picks"
            aria-label="Refresh feed"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-stone-300 transition-[transform,background-color] hover:bg-white/[0.1] active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={15} strokeWidth={2.5} className={cn(feed.loading && "animate-spin")} />
          </button>
        ) : null}
      </div>

      {body}

      {signedIn && items.length > 0 && (canShowMore || expanded) ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={canShowMore ? showMore : () => setRows(COLLAPSED_ROWS)}
            disabled={feed.loading && canShowMore && items.length <= visible.length}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-4 py-2 text-[12px] font-bold text-stone-200 transition-[transform,background-color] hover:bg-white/[0.1] active:scale-95"
          >
            {feed.loading && expanded ? <Loader2 size={14} className="animate-spin" /> : null}
            {canShowMore ? "Show more" : "Show less"}
            <ChevronDown size={14} strokeWidth={2.5} className={cn("transition-transform", !canShowMore && "rotate-180")} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
