import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { ChannelVideosStatus } from "./useChannelVideos";
import { loadChannelVideos } from "./useChannelVideos";

function LoadingRow({ columns, gridClass }: { columns: number; gridClass: string }) {
  return (
    <div className={gridClass} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-busy>
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="aspect-video animate-pulse rounded-[var(--r-media,16px)] bg-[color:var(--rf-well-raised)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--rf-well-raised)]" />
        </div>
      ))}
    </div>
  );
}

/** Uploads come from YouTube, so they get loading, error and caught-up states; `children` is the loaded list. */
export function CreatorUploadsState({
  channelId,
  status,
  count,
  columns,
  gridClass,
  children,
}: {
  channelId: string;
  status: ChannelVideosStatus;
  count: number;
  columns: number;
  gridClass: string;
  children: ReactNode;
}) {
  if (count > 0) return <>{children}</>;
  if (status === "loading") return <LoadingRow columns={columns} gridClass={gridClass} />;
  if (status === "error") {
    return (
      <div className="flex items-center gap-3 text-sm text-stone-400">
        Couldn't load uploads from YouTube.
        <button
          type="button"
          onClick={() => void loadChannelVideos(channelId, { force: true })}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 transition-colors duration-150 hover:text-stone-200"
        >
          <RotateCcw size={12} strokeWidth={2.5} />
          Retry
        </button>
      </div>
    );
  }
  return <p className="text-sm text-stone-400">you've already got everything they uploaded lately.</p>;
}
