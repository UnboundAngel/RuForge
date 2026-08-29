import {
  devCaptureContextLabel,
  devCaptureMusicContextLabel,
} from "@/lib/devCaptureScreenLabel";
import { useRuforgeStore } from "@/store/ruforgeStore";

export function useDevCaptureScreenLabel(): string {
  const navMode = useRuforgeStore((s) => s.navMode);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const musicView = useRuforgeStore((s) => s.musicView);
  const downloaderOpen = useRuforgeStore((s) => s.downloaderOpen);

  if (navMode === "music") {
    return devCaptureMusicContextLabel(musicView);
  }
  if (downloaderOpen) return "downloader";
  return devCaptureContextLabel(activeTab);
}
