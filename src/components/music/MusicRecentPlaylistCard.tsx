import { ListMusic, MoreHorizontal, Play } from "lucide-react";
import type { MediaFile } from "@/types";
import { LikedSongsCover } from "./LikedSongsCover";

type Props = {
  title: string;
  tracks: MediaFile[];
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function MusicRecentPlaylistCard({ title, tracks, onClick, onContextMenu }: Props) {
  const count = tracks.length;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      className="group/pl relative overflow-hidden flex items-center gap-5 px-3 py-3.5 rounded-2xl text-left transition-all duration-300 w-full hover:bg-white/[0.04] active:scale-[0.995]"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover/pl:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 55%, transparent 100%)",
        }}
      />

      <div className="relative w-[4.5rem] h-[4.5rem] shrink-0 overflow-hidden rounded-[1.25rem] transition-transform duration-300 group-hover/pl:scale-105">
        <LikedSongsCover files={tracks} className="w-full h-full" />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/pl:opacity-100 flex items-center justify-center transition-opacity duration-300 rounded-[1.25rem]">
          <Play size={26} className="text-white fill-white ml-0.5" />
        </div>
      </div>

      <div className="flex-grow min-w-0 z-10">
        <h3
          className="text-[17px] font-semibold tracking-tight truncate group-hover/pl:text-white transition-colors"
          style={{ color: "var(--music-text-primary)" }}
        >
          {title}
        </h3>
        <div
          className="flex items-center flex-wrap text-[13px] font-medium mt-1 gap-2"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{
              color: "rgba(74, 222, 128, 0.95)",
              background: "rgba(74, 222, 128, 0.1)",
            }}
          >
            <ListMusic className="w-3.5 h-3.5" />
            Downloaded
          </span>
          <span className="opacity-50 text-[10px]">●</span>
          <span>
            {count} song{count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 z-10 opacity-0 group-hover/pl:opacity-100 translate-x-2 group-hover/pl:translate-x-0 transition-all duration-300 pr-1 shrink-0">
        <span
          className="p-2.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.1)", color: "var(--music-text-primary)" }}
        >
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </span>
        {onContextMenu && (
          <span
            className="p-2.5 rounded-full hidden sm:inline-flex"
            style={{ color: "var(--music-text-muted)" }}
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e);
            }}
          >
            <MoreHorizontal className="w-5 h-5" />
          </span>
        )}
      </div>
    </button>
  );
}
