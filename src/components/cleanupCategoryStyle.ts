import { AudioLines, Film, Radio, type LucideIcon } from "lucide-react";
import type { CleanupCategory } from "../cleanupCandidates";

/**
 * Each category wears its mode's palette: Music is RuForge Music red, Videos the library sand gold.
 * The pinned column header takes the same fill so the tab and header read as one piece.
 */
export const CLEANUP_CATEGORY_STYLE: Record<
  CleanupCategory,
  {
    icon: LucideIcon;
    noun: [string, string];
    bg: string;
    seam: string;
    text: string;
    muted: string;
    hover: string;
  }
> = {
  music: {
    icon: AudioLines,
    noun: ["track", "tracks"],
    bg: "bg-[#ff0033]",
    seam: "text-[#ff0033]",
    text: "text-white",
    muted: "text-white/70",
    hover: "hover:text-white",
  },
  videos: {
    icon: Film,
    noun: ["video", "videos"],
    bg: "bg-[color:var(--accent)]",
    seam: "text-[color:var(--accent)]",
    text: "text-[#1c1512]",
    muted: "text-[#1c1512]/60",
    hover: "hover:text-[#1c1512]",
  },
  livestreams: {
    icon: Radio,
    noun: ["stream", "streams"],
    bg: "bg-violet-300",
    seam: "text-violet-300",
    text: "text-[#1a1420]",
    muted: "text-[#1a1420]/60",
    hover: "hover:text-[#1a1420]",
  },
};
