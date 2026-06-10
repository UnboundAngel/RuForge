import { useEffect, useState } from "react";
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
  const authSurfaceActive = isYoutubeAuthSurfaceActive(navMode, activeTab, musicView);

  const [imageFailed, setImageFailed] = useState(false);
  const [fallbackAvatarUrl, setFallbackAvatarUrl] = useState<string | null>(null);

  const liveAvatarUrl = profile
    ? sanitizeYoutubeAvatarUrl(profile.avatarUrl)
    : null;
  const avatarUrl = liveAvatarUrl ?? fallbackAvatarUrl;
  const hasPhoto = !!avatarUrl && !imageFailed;
  const hoverLabel = youtubeProfileHoverLabel(profile);

  useEffect(() => {
    setImageFailed(false);
    setFallbackAvatarUrl(null);
  }, [liveAvatarUrl]);

  if (hasPhoto) {
    const displayName = profile?.displayName ?? "YouTube";
    return (
      <div
        className={cn("rf-yt-profile-pill-wrap flex justify-end shrink-0", className)}
      >
        <div
          className={cn(
            "rf-yt-profile-pill rf-yt-profile-pill--avatar-only",
            size === "md" && "rf-yt-profile-pill--md",
          )}
          tabIndex={0}
          role="img"
          aria-label={`Signed in as ${displayName}`}
        >
          <div className="rf-yt-profile-pill__avatar-wrap">
            <img
              key={avatarUrl}
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              className="rf-yt-profile-pill__avatar"
              onError={() => {
                const cache = readYoutubeProfileCache();
                const cachedUrl = cache?.avatarUrl
                  ? sanitizeYoutubeAvatarUrl(cache.avatarUrl)
                  : null;
                if (cachedUrl && cachedUrl !== avatarUrl) {
                  setFallbackAvatarUrl(cachedUrl);
                  return;
                }
                setImageFailed(true);
              }}
            />
          </div>
          <div className="rf-yt-profile-pill__label-wrap">
            <span className="rf-yt-profile-pill__label">{hoverLabel}</span>
          </div>
        </div>
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
