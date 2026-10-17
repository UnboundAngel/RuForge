import { useMemo } from "react";
import { useImageFallback } from "@/components/ui/FallbackImg";
import { isYoutubeAuthSurfaceActive } from "@/lib/youtubeAuthSurface";
import {
  readYoutubeProfileCache,
  youtubeProfileHoverLabel,
} from "@/lib/youtubeProfileSession";
import { sanitizeYoutubeAvatarUrl } from "@/lib/youtubeAvatarUrl";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { YouTubeLoginPill } from "./YouTubeLoginPill";
import { YouTubeProfileAuthSpinner } from "./YouTubeProfileAuthSpinner";

type Props = {
  className?: string;
  size?: "sm" | "md";
};

export function YouTubeProfileChip({ className, size = "md" }: Props) {
  const profile = useRuforgeStore((s) => s.youtubeExplorerProfile);
  const navMode = useRuforgeStore((s) => s.navMode);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const musicView = useRuforgeStore((s) => s.musicView);
  const openProfilePage = useRuforgeStore((s) => s.openProfilePage);
  const authSurfaceActive = isYoutubeAuthSurfaceActive(navMode, activeTab, musicView);

  const liveAvatarUrl = profile
    ? sanitizeYoutubeAvatarUrl(profile.avatarUrl)
    : null;
  const cachedAvatarUrl = useMemo(() => {
    if (!liveAvatarUrl) return null;
    const cached = readYoutubeProfileCache()?.avatarUrl;
    return cached ? sanitizeYoutubeAvatarUrl(cached) : null;
  }, [liveAvatarUrl]);
  // The cached avatar only stands in for a live one that failed to load, never for a signed-out profile.
  const avatar = useImageFallback(liveAvatarUrl ? [liveAvatarUrl, cachedAvatarUrl] : null);
  const avatarUrl = avatar.src;
  const hasPhoto = !!avatarUrl;
  const hoverLabel = youtubeProfileHoverLabel(profile);

  if (hasPhoto) {
    const displayName = profile?.displayName ?? "YouTube";
    return (
      <div
        className={cn("rf-yt-profile-pill-wrap flex justify-end shrink-0", className)}
      >
        <button
          type="button"
          onClick={openProfilePage}
          className={cn(
            "rf-yt-profile-pill rf-yt-profile-pill--avatar-only",
            size === "md" && "rf-yt-profile-pill--md",
          )}
          aria-label={`Signed in as ${displayName}. Open profile.`}
        >
          <div className="rf-yt-profile-pill__avatar-wrap">
            <img
              key={avatarUrl}
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              className="rf-yt-profile-pill__avatar"
              onError={avatar.onError}
            />
          </div>
          <div className="rf-yt-profile-pill__label-wrap">
            <span className="rf-yt-profile-pill__label">{hoverLabel}</span>
          </div>
        </button>
      </div>
    );
  }

  if (authSurfaceActive) {
    return (
      <div
        className={cn("rf-yt-profile-pill-wrap flex justify-end shrink-0", className)}
      >
        <div
          className={cn(
            "rf-yt-profile-pill rf-yt-profile-pill--avatar-only",
            size === "md" && "rf-yt-profile-pill--md",
          )}
        >
          <YouTubeProfileAuthSpinner size={size} />
        </div>
      </div>
    );
  }

  return <YouTubeLoginPill className={className} size={size} />;
}
