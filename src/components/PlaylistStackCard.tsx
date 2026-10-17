import { ListVideo } from "lucide-react";
import type { PlaylistCollection } from "../types";
import { localImageSrc } from "@/lib/localImageSrc";
import { playlistCardKey } from "@/lib/playlistCardKey";
import { PlaylistEmptyThumb } from "./PlaylistEmptyThumb";

export const PlaylistStackCard = ({
  playlist,
  onClick,
  onContextMenu,
}: {
  playlist: PlaylistCollection;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) => {
  const mainThumbnail =
    playlist.stackThumbnailPath ||
    playlist.items[0]?.thumbnailPath ||
    playlist.items[0]?.ruforgePosterPath;
  const countLabel =
    playlist.itemCount === 0
      ? "No videos"
      : `${playlist.itemCount} video${playlist.itemCount === 1 ? "" : "s"}`;

  return (
    <div
      className="group cursor-pointer flex flex-col gap-2.5"
      data-playlist-card={playlistCardKey(playlist.title)}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div data-squish-cover className="rf-art-clip relative aspect-video bg-[color:var(--rf-field)] transition-transform duration-150 ease-out [--rf-art-r:var(--r-media,16px)]">
        {mainThumbnail ? (
          <img
            src={localImageSrc(mainThumbnail)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-200 group-hover:brightness-110"
          />
        ) : (
          <PlaylistEmptyThumb className="absolute inset-0" />
        )}

        {/* YouTube-style right count strip */}
        <div className="absolute inset-y-0 right-0 w-[28%] min-w-[4.5rem] bg-black/70 flex flex-col items-center justify-center gap-1.5 px-2">
          <ListVideo size={18} strokeWidth={2} className="text-white" />
          <span className="text-[11px] font-semibold text-white text-center leading-tight">
            {countLabel}
          </span>
        </div>
      </div>

      <div className="px-0.5 min-w-0">
        <h3 className="text-[13px] font-bold text-stone-100 leading-snug truncate">
          {playlist.title.replace(/_/g, " ")}
        </h3>
        <p className="mt-0.5 text-[11px] font-medium text-stone-500 truncate">Playlist</p>
        <p className="mt-0.5 text-[11px] font-medium text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity">
          View full playlist
        </p>
      </div>
    </div>
  );
};
