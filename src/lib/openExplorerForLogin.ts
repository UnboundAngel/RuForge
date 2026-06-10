import { scheduleExplorerProfileProbeAfterShow } from "@/lib/youtubeProfileProbeRunner";
import { useRuforgeStore } from "@/store/ruforgeStore";

/** Switch to the main Explorer tab so the user can sign into YouTube (shared cookie jar). */
export function openExplorerForLogin(): void {
  const { navMode, setNavMode, setActiveTab } = useRuforgeStore.getState();
  if (navMode === "music") {
    setNavMode("default");
  }
  setActiveTab("explorer");
  scheduleExplorerProfileProbeAfterShow("login-nav");
}
