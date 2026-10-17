import { ListMusic } from "lucide-react";
import { useImageFallback } from "@/components/ui/FallbackImg";
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
  /** Rendered at 128 px or less: local art uses cached thumbnails. */
  thumb?: boolean;
};

export function MusicPlaylistCover({ files, coverFile, src, className, iconSize = 40, radius, thumb }: Props) {
  const remote = useImageFallback(src);
  const icon = <ListMusic size={iconSize} strokeWidth={1.75} style={{ color: "var(--music-text-muted)" }} />;

  if (remote.src) {
    return (
      <div
        className={cn("overflow-hidden bg-white/[0.06]", className)}
        style={{ borderRadius: radius ?? "var(--music-card-radius, 14px)" }}
      >
        <img src={remote.src} alt="" draggable={false} onError={remote.onError} className="h-full w-full object-cover" />
      </div>
    );
  }

  return <LikedSongsCover files={coverFile ? [coverFile] : files} className={className} radius={radius} emptyIcon={icon} thumb={thumb} />;
}
