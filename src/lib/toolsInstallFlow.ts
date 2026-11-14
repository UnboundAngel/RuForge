import { invoke } from "@tauri-apps/api/core";
import { useRuforgeStore, type RuforgeNotificationAction } from "@/store/ruforgeStore";
import {
  useToolsInstallStore,
  type ToolsInstallProgress,
  type ToolsStatus,
} from "@/store/toolsInstallStore";
import { JS_RUNTIME_MISSING_PREFIX, TOOLS_MISSING_PREFIX } from "@/types";
import { installDenoAndRetry } from "./denoInstallFlow";

const DONE_FADE_MS = 1100;

let doneTimer: number | undefined;

function errorText(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function refreshToolsStatus(): Promise<ToolsStatus | null> {
  try {
    const status = await invoke<ToolsStatus>("get_tools_status");
    useToolsInstallStore.setState({ status });
    return status;
  } catch (e) {
    console.error("[RuForge] get_tools_status failed", e);
    return null;
  }
}

function failInstall(message: string): void {
  window.clearTimeout(doneTimer);
  useToolsInstallStore.setState({ phase: "error", error: message });
  useRuforgeStore.getState().notify(message, "error", {
    label: "Retry",
    run: () => void installTools(),
  });
}

export function isToolsInstalling(): boolean {
  const s = useToolsInstallStore.getState();
  return s.phase === "installing" || s.status?.installing === true;
}

/** Starts the background install; progress arrives through `applyToolsProgress`. */
export async function installTools(): Promise<void> {
  if (isToolsInstalling() || useToolsInstallStore.getState().previewing) return;
  window.clearTimeout(doneTimer);
  useToolsInstallStore.setState({
    phase: "installing",
    kind: "download",
    tool: null,
    step: "downloading",
    fraction: 0,
    error: null,
  });
  try {
    await invoke("install_tools");
  } catch (e) {
    failInstall(errorText(e, "Could not start the tools download."));
  }
}

/** Lets the finished ring hold briefly, then fades it out. */
export function scheduleToolsIdle(): void {
  window.clearTimeout(doneTimer);
  doneTimer = window.setTimeout(() => {
    const s = useToolsInstallStore.getState();
    if (s.phase === "done") useToolsInstallStore.setState({ phase: "idle", tool: null });
  }, DONE_FADE_MS);
}

export function applyToolsProgress(p: ToolsInstallProgress): void {
  if (useToolsInstallStore.getState().previewing) return;
  if (p.phase === "error") {
    failInstall(p.error ?? "Could not download the tools.");
    return;
  }
  if (p.phase === "done") {
    useToolsInstallStore.setState({ phase: "done", kind: "download", fraction: 1, error: null });
    void refreshToolsStatus();
    useRuforgeStore.getState().notify("Download tools installed.");
    scheduleToolsIdle();
    return;
  }
  useToolsInstallStore.setState({
    phase: "installing",
    kind: "download",
    tool: p.tool === "ffmpeg" || p.tool === "yt-dlp" ? p.tool : null,
    step: p.phase === "verifying" || p.phase === "extracting" ? p.phase : "downloading",
    fraction: p.fraction,
    error: null,
  });
}

type SelfUpdatePayload = { phase: string; percent?: number | null };

/** Updater events for a tool that is already installed; ignored while the first-time download owns the ring. */
function applySelfUpdateProgress(tool: "yt-dlp" | "deno", kind: "download" | "update", p: SelfUpdatePayload): void {
  const s = useToolsInstallStore.getState();
  if (s.previewing) return;
  if (s.phase === "installing" && (s.kind === "download" && s.tool !== tool)) return;
  if (p.phase === "done") {
    useToolsInstallStore.setState({ phase: "done", kind, tool, fraction: 1 });
    scheduleToolsIdle();
    return;
  }
  window.clearTimeout(doneTimer);
  const step = p.phase === "verifying" || p.phase === "extracting" ? p.phase : "downloading";
  const fraction = typeof p.percent === "number" ? Math.min(1, Math.max(0, p.percent / 100)) : s.fraction;
  useToolsInstallStore.setState({ phase: "installing", kind, tool, step, fraction, error: null });
}

export function applyYtdlpUpdateProgress(p: SelfUpdatePayload): void {
  applySelfUpdateProgress("yt-dlp", "update", p);
}

export async function applyDenoProgress(p: SelfUpdatePayload): Promise<void> {
  const s = useToolsInstallStore.getState();
  let kind = s.tool === "deno" && s.phase === "installing" ? s.kind : null;
  if (!kind) {
    try {
      const deno = await invoke<{ present: boolean }>("get_deno_status");
      kind = deno.present ? "update" : "download";
    } catch {
      kind = "download";
    }
  }
  applySelfUpdateProgress("deno", kind, p);
}

/** Drops the machine prefixes so the notice reads as plain text. */
export function stripFailurePrefix(raw: string): string {
  return raw.replace(JS_RUNTIME_MISSING_PREFIX, "").replace(TOOLS_MISSING_PREFIX, "");
}

/** Action on a failed-download notice: Deno install, tools install, or the plain retry. */
export function failureNoticeAction(
  raw: string,
  retry: () => void,
): RuforgeNotificationAction | undefined {
  if (raw.startsWith(JS_RUNTIME_MISSING_PREFIX)) {
    return { label: "Install", run: () => void installDenoAndRetry() };
  }
  if (raw.startsWith(TOOLS_MISSING_PREFIX)) {
    return isToolsInstalling() ? undefined : { label: "Get tools", run: () => void installTools() };
  }
  return { label: "Retry", run: retry };
}
