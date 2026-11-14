import {
  ArrowDownToLine,
  Bell,
  BellRing,
  Compass,
  Keyboard,
  LayoutGrid,
  ListVideo,
  Music,
  Palette,
  PanelTop,
  PictureInPicture2,
  Repeat,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { setNotificationPopoverOpen, setNotificationTab } from "@/notifications/notificationCenterStore";
import { useRuforgeStore } from "@/store/ruforgeStore";

export type AreaClip = { src: string; poster: string };
export type Area = { Icon: LucideIcon; go?: () => void; cta?: string; clip?: AreaClip };

function toLibrary(): void {
  const s = useRuforgeStore.getState();
  s.setNavMode("default");
  s.setActiveTab("media");
}

function toPlaylists(): void {
  toLibrary();
  useRuforgeStore.getState().setGalleryFilter("playlists");
}

/**
 * Keyed by the lowercased `**Area**` label in release notes. Unknown areas get a plain tile.
 * Add `clip: { src, poster }` (assets in `src/assets/whats-new/`) to give a tile a preview view.
 */
export const AREAS: Record<string, Area> = {
  library: { Icon: LayoutGrid, go: toLibrary, cta: "Open library" },
  playlists: {
    Icon: ListVideo,
    go: toPlaylists,
    cta: "Open playlists",
  },
  suggested: {
    Icon: Compass,
    go: toPlaylists,
    cta: "Open playlists",
  },
  follow: {
    Icon: BellRing,
    go: () => {
      setNotificationTab("channels");
      setNotificationPopoverOpen(true);
    },
    cta: "Manage channels",
  },
  notifications: {
    Icon: Bell,
    go: () => {
      setNotificationTab("feed");
      setNotificationPopoverOpen(true);
    },
    cta: "Open notifications",
  },
  music: { Icon: Music, go: () => useRuforgeStore.getState().setNavMode("music"), cta: "Open Music" },
  downloads: {
    Icon: ArrowDownToLine,
    go: () => {
      useRuforgeStore.getState().setNavMode("default");
      useRuforgeStore.getState().openDownloader();
    },
    cta: "Open downloader",
  },
  shortcuts: {
    Icon: Keyboard,
    go: () => {
      const s = useRuforgeStore.getState();
      s.setSettingsTab("shortcuts");
      s.openSettings();
    },
    cta: "Open shortcuts",
  },
  appearance: {
    Icon: Palette,
    go: () => {
      const s = useRuforgeStore.getState();
      s.setSettingsTab("appearance");
      s.openSettings();
    },
    cta: "Open Appearance",
  },
  "mini player": { Icon: PictureInPicture2 },
  island: { Icon: PanelTop },
  playback: { Icon: Repeat, go: toPlaylists, cta: "Open playlists" },
  player: { Icon: Repeat, go: toPlaylists, cta: "Open playlists" },
  settings: { Icon: Settings2, go: () => useRuforgeStore.getState().openSettings(), cta: "Open Settings" },
};

export const FALLBACK_AREA: Area = { Icon: Sparkles };

// Relative glob so a missing or empty folder is just no clips.
const clipVideos = import.meta.glob("../../assets/whats-new/*.mp4", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const clipPosters = import.meta.glob("../../assets/whats-new/*-poster.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function folderClip(key: string): AreaClip | undefined {
  const slug = key.replace(/\s+/g, "-");
  const src = clipVideos[`../../assets/whats-new/${slug}.mp4`];
  const poster = clipPosters[`../../assets/whats-new/${slug}-poster.webp`];
  return src && poster ? { src, poster } : undefined;
}

// Explicit clips win; otherwise a dropped-in <key>.mp4 + <key>-poster.webp attaches itself.
for (const [key, area] of Object.entries(AREAS)) {
  area.clip ??= folderClip(key);
}
