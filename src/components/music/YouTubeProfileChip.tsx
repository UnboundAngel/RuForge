import { useEffect, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";

type Props = {
  className?: string;
  size?: "sm" | "md";
  onClick?: () => void;
};

export function YouTubeProfileChip({ className, size = "md", onClick }: Props) {
  const profile = useRuforgeStore((s) => s.youtubeExplorerProfile);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile?.avatarUrl]);

  if (!profile) return null;

  const initial = profile.displayName.trim().charAt(0).toUpperCase() || "?";
  const dim = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  const showAvatar = Boolean(profile.avatarUrl) && !avatarLoadFailed;

  const inner = showAvatar ? (
    <img
      src={profile.avatarUrl!}
      alt=""
      className={`${dim} rounded-full object-cover border shadow-sm`}
      style={{ borderColor: "rgba(255, 255, 255, 0.15)" }}
      onError={() => setAvatarLoadFailed(true)}
    />
  ) : (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold shadow border select-none`}
      style={{
        background: "var(--music-accent, #ff0033)",
        color: "#ffffff",
        borderColor: "rgba(255, 255, 255, 0.15)",
      }}
    >
      {initial}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rf-music-tooltip-anchor ${className ?? ""}`}
        data-tooltip={`Open your profile · ${profile.displayName}`}
        aria-label={profile.displayName}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`rf-music-tooltip-anchor ${className ?? ""}`} data-tooltip={profile.displayName} aria-label={profile.displayName}>
      {inner}
    </div>
  );
}
