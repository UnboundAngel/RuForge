import {
  useToolsInstallStore,
  type ToolsInstallKind,
  type ToolsInstallTool,
} from "@/store/toolsInstallStore";
import { scheduleToolsIdle } from "./toolsInstallFlow";

type Stage = { kind: ToolsInstallKind; tool: ToolsInstallTool; ms: number };

// Download ffmpeg, download yt-dlp, then update yt-dlp, so both ring treatments can be checked.
const STAGES: Stage[] = [
  { kind: "download", tool: "ffmpeg", ms: 5000 },
  { kind: "download", tool: "yt-dlp", ms: 5000 },
  { kind: "update", tool: "yt-dlp", ms: 5000 },
];
const VERIFY_FROM = 0.85;

let timer: number | undefined;

export function stopToolsPreview(): void {
  window.clearInterval(timer);
  useToolsInstallStore.setState({
    previewing: false,
    phase: "idle",
    tool: null,
    fraction: 0,
    error: null,
  });
}

/** Debugging only: fakes the install and update flows so the rail ring can be seen with nothing missing. */
export function startToolsPreview(): void {
  stopToolsPreview();
  const startedAt = performance.now();
  const total = STAGES.reduce((sum, st) => sum + st.ms, 0);
  useToolsInstallStore.setState({ previewing: true, phase: "installing" });
  timer = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= total) {
      window.clearInterval(timer);
      const last = STAGES[STAGES.length - 1];
      useToolsInstallStore.setState({ phase: "done", kind: last.kind, tool: last.tool, fraction: 1 });
      scheduleToolsIdle();
      // Releases the real-event guard once the ring has faded.
      window.setTimeout(() => useToolsInstallStore.setState({ previewing: false }), 1400);
      return;
    }
    let offset = 0;
    for (const st of STAGES) {
      if (elapsed < offset + st.ms) {
        const fraction = (elapsed - offset) / st.ms;
        useToolsInstallStore.setState({
          phase: "installing",
          kind: st.kind,
          tool: st.tool,
          step: fraction > VERIFY_FROM ? "verifying" : "downloading",
          fraction,
        });
        return;
      }
      offset += st.ms;
    }
  }, 100);
}
