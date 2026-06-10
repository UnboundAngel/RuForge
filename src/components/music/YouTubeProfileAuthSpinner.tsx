import { Loader2 } from "lucide-react";

type Props = {
  size?: "sm" | "md";
};

export function YouTubeProfileAuthSpinner({ size = "md" }: Props) {
  const icon = size === "sm" ? 14 : 16;

  return (
    <div
      className="rf-yt-profile-pill__avatar-wrap rf-yt-profile-auth-spinner"
      aria-label="Checking YouTube sign-in"
      role="status"
    >
      <Loader2
        size={icon}
        className="animate-spin shrink-0"
        style={{ color: "var(--music-accent, #ff0033)" }}
        aria-hidden
      />
    </div>
  );
}
