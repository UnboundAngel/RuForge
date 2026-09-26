import { ListMusic } from "lucide-react";
import type { MediaFile } from "@/types";
import { LikedSongsCover } from "./LikedSongsCover";

type Props = {
  files: MediaFile[];
  /** Track the user picked as cover; otherwise a mosaic of the first distinct album arts. */
  coverFile?: MediaFile | null;
  className?: string;
  iconSize?: number;
  radius?: string;
};

export function MusicPlaylistCover({ files, coverFile, className, iconSize = 40, radius }: Props) {
  return (
    <LikedSongsCover
      files={coverFile ? [coverFile] : files}
      className={className}
      radius={radius}
      emptyIcon={
        <ListMusic size={iconSize} strokeWidth={1.75} style={{ color: "var(--music-text-muted)" }} />
      }
    />
  );
}
