import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useRuforgeStore } from "./store/ruforgeStore";

/** Stop main and mini playback when deleting or replacing a library file. */
export async function releasePlaybackBeforeDelete(paths: string[]): Promise<void> {
  const pathSet = new Set(paths);
  const st = useRuforgeStore.getState();
  if (st.playingFile && pathSet.has(st.playingFile.path)) {
    st.stopPlayback();
    if (st.activeTab === "player") {
      st.setActiveTab("media");
    }
  }
  try {
    const mini = await WebviewWindow.getByLabel("mini");
    if (mini) {
      await emitTo("mini", "stop-playback", "main-app");
    }
  } catch {
    // Mini window may not exist.
  }
}
