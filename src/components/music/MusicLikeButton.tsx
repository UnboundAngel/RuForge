import { useMemo } from "react";
import { Heart } from "lucide-react";
import type { MediaFile } from "@/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { cn } from "@/lib/utils";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";

type Props = {
  file: MediaFile;
  className?: string;
  size?: number;
};

export function MusicLikeButton({ file, className, size = 16 }: Props) {
  const identityKey = useMemo(
    () => musicTrackIdentityKey(file, primaryArtist),
    [file],
  );
  const liked = useRuforgeStore((s) => s.musicLikedKeys.includes(identityKey));
  const toggleMusicLike = useRuforgeStore((s) => s.toggleMusicLike);

  return (
    <button
      type="button"
      className={cn(
        "shrink-0 flex items-center justify-center border-0 bg-transparent p-0 transition-opacity duration-100",
        className,
      )}
      style={{ color: liked ? "var(--music-accent)" : "var(--music-text-muted)" }}
      aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      aria-pressed={liked}
      onClick={(e) => {
        e.stopPropagation();
        toggleMusicLike(file);
      }}
    >
      <Heart size={size} fill={liked ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}
