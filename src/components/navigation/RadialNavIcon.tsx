import { Icon } from "@iconify/react";
import { Home, Compass, Library, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RadialNavIconId =
  | "download"
  | "videos"
  | "explorer"
  | "settings"
  | "movie-download"
  | "movie-videos"
  | "movie-explorer"
  | "movie-settings"
  | "music-home"
  | "music-explore"
  | "music-library"
  | "music-settings";

type IconKind = "iconify" | "lucide";

type IconSpec = {
  kind: IconKind;
  icon?: string;
  lucide?: LucideIcon;
};

const ICON: Record<RadialNavIconId, IconSpec> = {
  download: { kind: "iconify", icon: "material-symbols:download-rounded" },
  videos: { kind: "iconify", icon: "material-symbols:play-circle-rounded" },
  explorer: { kind: "iconify", icon: "material-symbols:youtube-searched-for-rounded" },
  settings: { kind: "iconify", icon: "material-symbols:settings-rounded" },
  "movie-download": { kind: "iconify", icon: "material-symbols:download-rounded" },
  "movie-videos": { kind: "iconify", icon: "material-symbols:movie-rounded" },
  "movie-explorer": { kind: "iconify", icon: "material-symbols:theaters-rounded" },
  "movie-settings": { kind: "iconify", icon: "material-symbols:tune-rounded" },
  "music-home": { kind: "lucide", lucide: Home },
  "music-explore": { kind: "lucide", lucide: Compass },
  "music-library": { kind: "lucide", lucide: Library },
  "music-settings": { kind: "lucide", lucide: Settings },
};

type RadialNavIconProps = {
  id: RadialNavIconId;
  size?: number;
  className?: string;
};

export function RadialNavIcon({ id, size = 22, className }: RadialNavIconProps) {
  const spec = ICON[id];

  if (spec.kind === "lucide" && spec.lucide) {
    const Lucide = spec.lucide;
    return (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        <Lucide size={size} strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <Icon icon={spec.icon!} width={size} height={size} />
    </span>
  );
}
