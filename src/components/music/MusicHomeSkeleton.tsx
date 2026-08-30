function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ background: "rgba(255,255,255,0.08)" }}
      aria-hidden
    />
  );
}

function QuickPickRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg px-3 py-2.5 min-h-[4.5rem]">
      <Shimmer className="w-16 h-16 shrink-0 rounded-md" />
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <Shimmer className="h-4 w-[72%]" />
        <Shimmer className="h-3 w-[45%]" />
      </div>
    </div>
  );
}

function ArtistPillSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 shrink-0 w-24">
      <Shimmer className="w-20 h-20 rounded-full" />
      <Shimmer className="h-3 w-16" />
    </div>
  );
}

function AlbumCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 shrink-0 w-36 md:w-40">
      <Shimmer className="w-32 h-32 md:w-36 md:h-36 rounded-lg" />
      <Shimmer className="h-4 w-28" />
      <Shimmer className="h-3 w-20" />
    </div>
  );
}

/** Placeholder layout matching MusicHomeView shelves while gallery scan runs. */
export function MusicHomeSkeleton() {
  return (
    <div
      className="relative w-full h-full overflow-y-auto overflow-x-hidden rf-scrollbar min-h-0"
      style={{ background: "var(--music-surface)" }}
      aria-busy
      aria-label="Loading library"
    >
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between pl-8 pr-8 bg-transparent">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        <Shimmer className="h-9 w-full max-w-md rounded-full" />
        <Shimmer className="w-9 h-9 rounded-full shrink-0" />
      </header>

      <div className="flex flex-col gap-12 px-6 sm:px-8 lg:px-12 pt-8 pb-16 w-full min-w-0">
        <section className="w-full min-w-0">
          <Shimmer className="h-8 w-36 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <QuickPickRowSkeleton key={i} />
            ))}
          </div>
        </section>

        <section>
          <Shimmer className="h-7 w-24 mb-4" />
          <div className="flex gap-6 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <ArtistPillSkeleton key={i} />
            ))}
          </div>
        </section>

        <section>
          <Shimmer className="h-7 w-28 mb-4" />
          <div className="flex gap-6 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <AlbumCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
