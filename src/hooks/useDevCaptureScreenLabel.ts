import {
  devCaptureContextLabel,
  devCaptureMusicContextLabel,
} from "@/lib/devCaptureScreenLabel";
import { useRuforgeStore } from "@/store/ruforgeStore";

export function useDevCaptureScreenLabel(): string {
  const navMode = useRuforgeStore((s) => s.navMode);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const musicView = useRuforgeStore((s) => s.musicView);

  if (navMode === "music") {
    return devCaptureMusicContextLabel(musicView);
  }
  return devCaptureContextLabel(activeTab);
}
