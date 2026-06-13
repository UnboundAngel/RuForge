import { useRuforgeStore } from "./store/ruforgeStore";
import { closeVideoMiniWindow } from "./lib/mainPlaybackClaim";

/** Stop main and mini playback when deleting or replacing a library file. */
export async function releasePlaybackBeforeDelete(paths: string[]): Promise<void> {
  const pathSet = new Set(paths);
  const st = useRuforgeStore.getState();
  const playingMatches = st.playingFile && pathSet.has(st.playingFile.path);
  const handoffMatches =
    st.activityHandoff?.file && pathSet.has(st.activityHandoff.file.path);

  if (playingMatches || handoffMatches) {
    st.stopPlayback();
    if (st.activeTab === "player") {
      st.setActiveTab("media");
    }
  }

  await closeVideoMiniWindow();
}
