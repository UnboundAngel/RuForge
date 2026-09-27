import { useState } from "react";
import { ListMusic } from "lucide-react";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { LikedSongsCover } from "./LikedSongsCover";

type Props = {
  files: MediaFile[];
  /** Track the user picked as cover; otherwise a mosaic of the first distinct album arts. */
  coverFile?: MediaFile | null;
  /** Remote art for playlists whose songs aren't on disk yet. */
  src?: string | null;
  className?: string;
  iconSize?: number;
  radius?: string;
};

export function MusicPlaylistCover({ files, coverFile, src, className, iconSize = 40, radius }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const icon = <ListMusic size={iconSize} strokeWidth={1.75} style={{ color: "var(--music-text-muted)" }} />;

  if (src && broken !== src) {
    return (
      <div
        className={cn("overflow-hidden bg-white/[0.06]", className)}
        style={{ borderRadius: radius ?? "var(--music-card-radius, 14px)" }}
      >
        <img src={src} alt="" draggable={false} onError={() => setBroken(src)} className="h-full w-full object-cover" />
      </div>
    );
  }

  return <LikedSongsCover files={coverFile ? [coverFile] : files} className={className} radius={radius} emptyIcon={icon} />;
}
